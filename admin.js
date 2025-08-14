// admin.js - Complete admin functionality for multi-user Firebase dashboard
class AdminManager {
    constructor(authManager, dashboardManager) {
        this.auth = authManager;
        this.dashboard = dashboardManager;
        this.db = null;
        this.users = {};
        this.deviceStats = {};
    }

    async initialize() {
        if (!this.auth.isAdmin) {
            console.warn('❌ Admin functions not available - user is not an admin');
            return;
        }

        this.db = firebase.database();
        console.log('✅ Admin manager initialized');
        
        // Load admin data
        await this.loadSystemStats();
        await this.loadAllUsers();
        
        // Set up real-time listeners
        this.setupAdminListeners();
    }

    // =================== USER MANAGEMENT ===================
    async createUser(email, password, role = 'user') {
        if (!this.auth.isAdmin) {
            throw new Error('Unauthorized: Admin access required');
        }

        try {
            console.log(`👑 Admin creating user: ${email} with role: ${role}`);
            
            // Create user account using Firebase Auth
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Add user to database with role
            const userData = {
                email: email,
                role: role,
                created: Date.now(),
                createdBy: this.auth.getCurrentUser().uid,
                lastLogin: null,
                status: 'active',
                deviceCount: 0
            };

            await this.db.ref(`users/${user.uid}`).set(userData);

            // If creating admin, add to admins node
            if (role === 'admin') {
                await this.db.ref(`admins/${user.uid}`).set({
                    email: email,
                    role: 'admin',
                    created: Date.now(),
                    createdBy: this.auth.getCurrentUser().uid
                });
            }

            console.log(`✅ User created successfully: ${email} (${role})`);
            
            // Refresh user list
            await this.loadAllUsers();
            
            return { 
                success: true, 
                user: user,
                message: `User ${email} created successfully as ${role}`
            };
            
        } catch (error) {
            console.error('❌ User creation failed:', error);
            
            let errorMessage = 'Failed to create user';
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = 'Email address is already in use';
            } else if (error.code === 'auth/weak-password') {
                errorMessage = 'Password is too weak (minimum 6 characters)';
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = 'Invalid email address';
            }
            
            return { 
                success: false, 
                error: errorMessage,
                details: error.message
            };
        }
    }

    async loadAllUsers() {
        if (!this.auth.isAdmin) return;

        try {
            const usersSnapshot = await this.db.ref('users').once('value');
            const adminsSnapshot = await this.db.ref('admins').once('value');
            
            const usersData = usersSnapshot.val() || {};
            const adminsData = adminsSnapshot.val() || {};
            
            // Combine user data with admin status
            this.users = {};
            
            // Process regular users
            for (const uid in usersData) {
                this.users[uid] = {
                    ...usersData[uid],
                    uid: uid,
                    isAdmin: !!adminsData[uid]
                };
            }
            
            // Process admin-only accounts (might not be in users node)
            for (const uid in adminsData) {
                if (!this.users[uid]) {
                    this.users[uid] = {
                        ...adminsData[uid],
                        uid: uid,
                        isAdmin: true,
                        role: 'admin'
                    };
                }
            }
            
            console.log(`📊 Loaded ${Object.keys(this.users).length} users`);
            this.updateUserTable();
            
        } catch (error) {
            console.error('❌ Failed to load users:', error);
        }
    }

    async updateUserRole(uid, newRole) {
        if (!this.auth.isAdmin) {
            throw new Error('Unauthorized: Admin access required');
        }

        try {
            console.log(`👑 Admin updating user ${uid} role to: ${newRole}`);
            
            // Update user role in users node
            await this.db.ref(`users/${uid}/role`).set(newRole);
            await this.db.ref(`users/${uid}/lastModified`).set(Date.now());
            await this.db.ref(`users/${uid}/modifiedBy`).set(this.auth.getCurrentUser().uid);
            
            // Handle admin role assignment
            if (newRole === 'admin') {
                // Add to admins node
                const userData = this.users[uid];
                await this.db.ref(`admins/${uid}`).set({
                    email: userData.email,
                    role: 'admin',
                    created: Date.now(),
                    promotedBy: this.auth.getCurrentUser().uid
                });
            } else {
                // Remove from admins node if demoting from admin
                await this.db.ref(`admins/${uid}`).remove();
            }
            
            console.log(`✅ User role updated successfully`);
            await this.loadAllUsers();
            
            return { success: true, message: `User role updated to ${newRole}` };
            
        } catch (error) {
            console.error('❌ Failed to update user role:', error);
            return { success: false, error: error.message };
        }
    }

    async deleteUser(uid) {
        if (!this.auth.isAdmin) {
            throw new Error('Unauthorized: Admin access required');
        }

        try {
            console.log(`👑 Admin deleting user: ${uid}`);
            
            // Remove from users node
            await this.db.ref(`users/${uid}`).remove();
            
            // Remove from admins node if exists
            await this.db.ref(`admins/${uid}`).remove();
            
            // Note: Firebase Auth user deletion requires Admin SDK on server
            // For client-side, we can only remove from database
            
            console.log(`✅ User deleted from database`);
            await this.loadAllUsers();
            
            return { 
                success: true, 
                message: 'User removed from database. Note: Firebase Auth account still exists.' 
            };
            
        } catch (error) {
            console.error('❌ Failed to delete user:', error);
            return { success: false, error: error.message };
        }
    }

    // =================== SYSTEM STATISTICS ===================
    async loadSystemStats() {
        if (!this.auth.isAdmin) return;

        try {
            // Load device statistics
            const devicesSnapshot = await this.db.ref('devices').once('value');
            const devicesData = devicesSnapshot.val() || {};
            
            this.deviceStats = {
                totalDevices: Object.keys(devicesData).length,
                onlineDevices: 0,
                offlineDevices: 0,
                devicesByOwner: {},
                recentActivity: []
            };
            
            const now = Date.now() / 1000;
            
            // Analyze device statistics
            for (const deviceId in devicesData) {
                const device = devicesData[deviceId];
                const isOnline = device.data && (now - device.data.timestamp) < 120;
                
                if (isOnline) {
                    this.deviceStats.onlineDevices++;
                } else {
                    this.deviceStats.offlineDevices++;
                }
                
                // Count devices by owner
                const owner = device.owner_email || 'unknown';
                this.deviceStats.devicesByOwner[owner] = (this.deviceStats.devicesByOwner[owner] || 0) + 1;
                
                // Track recent activity
                if (device.data && device.data.timestamp) {
                    this.deviceStats.recentActivity.push({
                        deviceId: deviceId,
                        deviceName: device.name,
                        owner: owner,
                        lastSeen: device.data.timestamp,
                        status: isOnline ? 'online' : 'offline'
                    });
                }
            }
            
            // Sort recent activity by timestamp
            this.deviceStats.recentActivity.sort((a, b) => b.lastSeen - a.lastSeen);
            this.deviceStats.recentActivity = this.deviceStats.recentActivity.slice(0, 10); // Keep top 10
            
            console.log('📊 System statistics loaded');
            this.updateSystemStatsDisplay();
            
        } catch (error) {
            console.error('❌ Failed to load system stats:', error);
        }
    }

    // =================== UI UPDATE METHODS ===================
    updateUserTable() {
        const userTableContainer = document.getElementById('adminUserTable');
        if (!userTableContainer) return;

        const userCount = Object.keys(this.users).length;
        const adminCount = Object.values(this.users).filter(user => user.isAdmin).length;

        userTableContainer.innerHTML = `
            <div class="admin-stats-row">
                <div class="stat-card">
                    <div class="stat-number">${userCount}</div>
                    <div class="stat-label">Total Users</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${adminCount}</div>
                    <div class="stat-label">Administrators</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number">${userCount - adminCount}</div>
                    <div class="stat-label">Regular Users</div>
                </div>
            </div>
            
            <div class="users-table-container">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Created</th>
                            <th>Devices</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.values(this.users).map(user => this.createUserRow(user)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    createUserRow(user) {
        const userDeviceCount = this.deviceStats.devicesByOwner[user.email] || 0;
        const createdDate = user.created ? new Date(user.created).toLocaleDateString() : 'Unknown';
        const isCurrentUser = user.uid === this.auth.getCurrentUser().uid;
        
        return `
            <tr class="user-row ${user.isAdmin ? 'admin-user' : ''}">
                <td>
                    <div class="user-info">
                        <div class="user-email">${user.email}</div>
                        <div class="user-uid">${user.uid}</div>
                    </div>
                </td>
                <td>
                    <span class="role-badge ${user.isAdmin ? 'admin' : 'user'}">
                        ${user.isAdmin ? '👑 Admin' : '👤 User'}
                    </span>
                </td>
                <td>
                    <span class="status-badge ${user.status || 'active'}">
                        ${user.status || 'Active'}
                    </span>
                </td>
                <td>${createdDate}</td>
                <td>
                    <span class="device-count">${userDeviceCount} devices</span>
                </td>
                <td>
                    <div class="user-actions">
                        ${!isCurrentUser ? `
                            <select onchange="adminManager.updateUserRole('${user.uid}', this.value)" class="role-select">
                                <option value="user" ${!user.isAdmin ? 'selected' : ''}>User</option>
                                <option value="admin" ${user.isAdmin ? 'selected' : ''}>Admin</option>
                            </select>
                            <button onclick="adminManager.confirmDeleteUser('${user.uid}', '${user.email}')" 
                                    class="delete-user-btn" title="Delete User">
                                🗑️
                            </button>
                        ` : `
                            <span class="current-user-label">Current User</span>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }

    updateSystemStatsDisplay() {
        const statsContainer = document.getElementById('systemStatsContainer');
        if (!statsContainer) return;

        statsContainer.innerHTML = `
            <div class="system-stats-grid">
                <div class="stat-card large">
                    <div class="stat-number">${this.deviceStats.totalDevices}</div>
                    <div class="stat-label">Total Devices</div>
                </div>
                <div class="stat-card success">
                    <div class="stat-number">${this.deviceStats.onlineDevices}</div>
                    <div class="stat-label">Online Devices</div>
                </div>
                <div class="stat-card warning">
                    <div class="stat-number">${this.deviceStats.offlineDevices}</div>
                    <div class="stat-label">Offline Devices</div>
                </div>
                <div class="stat-card info">
                    <div class="stat-number">${Object.keys(this.deviceStats.devicesByOwner).length}</div>
                    <div class="stat-label">Active Owners</div>
                </div>
            </div>
            
            <div class="recent-activity">
                <h4>📊 Recent Device Activity</h4>
                <div class="activity-list">
                    ${this.deviceStats.recentActivity.map(activity => `
                        <div class="activity-item">
                            <div class="activity-device">
                                <strong>${activity.deviceName}</strong>
                                <span class="device-id">${activity.deviceId}</span>
                            </div>
                            <div class="activity-owner">${activity.owner}</div>
                            <div class="activity-time">${this.formatTimestamp(activity.lastSeen)}</div>
                            <div class="activity-status ${activity.status}">${activity.status}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // =================== EVENT HANDLERS ===================
    async handleAddUser() {
        const email = document.getElementById('newUserEmail').value.trim();
        const password = document.getElementById('newUserPassword').value.trim();
        const role = document.getElementById('newUserRole').value;

        if (!email || !password) {
            this.showNotification('❌ Please enter both email and password', 'error');
            return;
        }

        if (password.length < 6) {
            this.showNotification('❌ Password must be at least 6 characters', 'error');
            return;
        }

        // Show loading state
        const submitBtn = document.querySelector('.add-user-btn');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '⏳ Creating...';
        submitBtn.disabled = true;

        try {
            const result = await this.createUser(email, password, role);
            
            if (result.success) {
                // Clear form
                document.getElementById('newUserEmail').value = '';
                document.getElementById('newUserPassword').value = '';
                document.getElementById('newUserRole').value = 'user';
                
                this.showNotification(`✅ ${result.message}`, 'success');
            } else {
                this.showNotification(`❌ ${result.error}`, 'error');
            }
        } catch (error) {
            this.showNotification(`❌ Failed to create user: ${error.message}`, 'error');
        } finally {
            // Restore button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }

    confirmDeleteUser(uid, email) {
        if (confirm(`⚠️ Are you sure you want to delete user "${email}"?\n\nThis action cannot be undone.`)) {
            this.deleteUser(uid).then(result => {
                if (result.success) {
                    this.showNotification(`✅ ${result.message}`, 'success');
                } else {
                    this.showNotification(`❌ ${result.error}`, 'error');
                }
            });
        }
    }

    // =================== REAL-TIME LISTENERS ===================
    setupAdminListeners() {
        if (!this.auth.isAdmin || !this.db) return;

        // Listen for user changes
        this.db.ref('users').on('value', (snapshot) => {
            console.log('👑 Admin: Users data updated');
            this.loadAllUsers();
        });

        // Listen for device changes
        this.db.ref('devices').on('value', (snapshot) => {
            console.log('👑 Admin: Devices data updated');
            this.loadSystemStats();
        });

        console.log('✅ Admin real-time listeners established');
    }

    // =================== UTILITY METHODS ===================
    formatTimestamp(timestamp) {
        if (!timestamp) return 'Never';
        
        const now = Date.now() / 1000;
        const diff = now - timestamp;
        
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }

    showNotification(message, type) {
        // Use the dashboard manager's notification system
        if (this.dashboard && this.dashboard.showNotification) {
            this.dashboard.showNotification(message, type);
        } else {
            // Fallback notification
            console.log(`${type.toUpperCase()}: ${message}`);
            alert(message);
        }
    }

    // =================== EXPORT FUNCTIONS ===================
    exportUsersData() {
        if (!this.auth.isAdmin) return;

        const userData = Object.values(this.users).map(user => ({
            email: user.email,
            role: user.role,
            isAdmin: user.isAdmin,
            created: user.created ? new Date(user.created).toISOString() : null,
            status: user.status || 'active',
            deviceCount: this.deviceStats.devicesByOwner[user.email] || 0
        }));

        const csv = this.convertToCSV(userData);
        this.downloadFile(csv, 'users-export.csv', 'text/csv');
    }

    exportSystemStats() {
        if (!this.auth.isAdmin) return;

        const statsData = {
            timestamp: new Date().toISOString(),
            totalDevices: this.deviceStats.totalDevices,
            onlineDevices: this.deviceStats.onlineDevices,
            offlineDevices: this.deviceStats.offlineDevices,
            totalUsers: Object.keys(this.users).length,
            adminUsers: Object.values(this.users).filter(u => u.isAdmin).length,
            devicesByOwner: this.deviceStats.devicesByOwner,
            recentActivity: this.deviceStats.recentActivity
        };

        const json = JSON.stringify(statsData, null, 2);
        this.downloadFile(json, 'system-stats.json', 'application/json');
    }

    convertToCSV(data) {
        if (!data || data.length === 0) return '';
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => {
                const value = row[header];
                return typeof value === 'string' ? `"${value}"` : value;
            }).join(','))
        ].join('\n');
        
        return csvContent;
    }

    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    // =================== CLEANUP ===================
    destroy() {
        if (this.db) {
            this.db.ref('users').off();
            this.db.ref('devices').off();
        }
        console.log('🧹 Admin manager cleaned up');
    }
}

// =================== GLOBAL FUNCTIONS ===================
// These functions are called from the HTML interface

async function handleAddUserSubmit(event) {
    event.preventDefault();
    if (window.adminManager) {
        await window.adminManager.handleAddUser();
    }
}

function exportUsers() {
    if (window.adminManager) {
        window.adminManager.exportUsersData();
    }
}

function exportStats() {
    if (window.adminManager) {
        window.adminManager.exportSystemStats();
    }
}

// Initialize admin manager when auth is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth manager to be available
    const initAdmin = setInterval(() => {
        if (window.authManager && window.dashboardManager && window.authManager.isAdmin) {
            window.adminManager = new AdminManager(window.authManager, window.dashboardManager);
            clearInterval(initAdmin);
            
            // Initialize when user is authenticated
            if (window.authManager.getCurrentUser()) {
                window.adminManager.initialize();
            }
        }
    }, 1000);
});

console.log('👑 Admin module loaded');
