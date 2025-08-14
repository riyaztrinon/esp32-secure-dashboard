// admin.js - Admin Panel Management
class AdminManager {
    constructor(authManager, dashboardManager) {
        this.auth = authManager;
        this.dashboard = dashboardManager;
        this.database = null;
        this.users = {};
        this.systemStats = {};
    }

    async initialize() {
        if (!this.auth.isAdmin) {
            console.warn('❌ Admin panel not available - user is not admin');
            return;
        }

        this.database = firebase.database();
        console.log('✅ Admin manager initialized');
        
        await this.loadSystemData();
        this.setupAdminListeners();
    }

    async loadSystemData() {
        try {
            // Load users
            const usersRef = this.database.ref('users');
            const adminsRef = this.database.ref('admins');
            
            const [usersSnapshot, adminsSnapshot] = await Promise.all([
                usersRef.once('value'),
                adminsRef.once('value')
            ]);
            
            const usersData = usersSnapshot.val() || {};
            const adminsData = adminsSnapshot.val() || {};
            
            // Combine user data
            this.users = {};
            for (const uid in usersData) {
                this.users[uid] = {
                    ...usersData[uid],
                    uid: uid,
                    isAdmin: !!adminsData[uid]
                };
            }
            
            // Add admin-only accounts
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
            
            this.updateSystemStats();
            this.renderAdminPanel();
            
        } catch (error) {
            console.error('❌ Failed to load admin data:', error);
        }
    }

    updateSystemStats() {
        const deviceCount = Object.keys(this.dashboard.devicesData).length;
        const onlineDevices = Object.values(this.dashboard.devicesData)
            .filter(device => this.dashboard.isDeviceOnline(device)).length;
        const userCount = Object.keys(this.users).length;
        const adminCount = Object.values(this.users).filter(user => user.isAdmin).length;
        
        this.systemStats = {
            totalDevices: deviceCount,
            onlineDevices: onlineDevices,
            offlineDevices: deviceCount - onlineDevices,
            totalUsers: userCount,
            adminUsers: adminCount,
            regularUsers: userCount - adminCount
        };
        
        this.renderSystemStats();
    }

    renderSystemStats() {
        const container = document.getElementById('systemStatsContainer');
        if (!container) return;
        
        container.innerHTML = `
            <div class="stat-card">
                <div class="stat-number">${this.systemStats.totalDevices}</div>
                <div class="stat-label">Total Devices</div>
            </div>
            <div class="stat-card success">
                <div class="stat-number">${this.systemStats.onlineDevices}</div>
                <div class="stat-label">Online Devices</div>
            </div>
            <div class="stat-card warning">
                <div class="stat-number">${this.systemStats.offlineDevices}</div>
                <div class="stat-label">Offline Devices</div>
            </div>
            <div class="stat-card info">
                <div class="stat-number">${this.systemStats.totalUsers}</div>
                <div class="stat-label">Total Users</div>
            </div>
        `;
    }

    renderAdminPanel() {
        const userTableContainer = document.getElementById('adminUserTable');
        if (!userTableContainer) return;
        
        const userList = Object.values(this.users);
        
        let html = `
            <div class="admin-stats">
                <div class="admin-stat">
                    <span class="stat-number">${this.systemStats.totalUsers}</span>
                    <span class="stat-label">Total Users</span>
                </div>
                <div class="admin-stat">
                    <span class="stat-number">${this.systemStats.adminUsers}</span>
                    <span class="stat-label">Administrators</span>
                </div>
                <div class="admin-stat">
                    <span class="stat-number">${this.systemStats.regularUsers}</span>
                    <span class="stat-label">Regular Users</span>
                </div>
            </div>
            
            <div class="users-table-container">
                <table class="users-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Role</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        userList.forEach(user => {
            const createdDate = user.created ? new Date(user.created).toLocaleDateString() : 'Unknown';
            const isCurrentUser = user.uid === this.auth.currentUser.uid;
            
            html += `
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
                    <td>${createdDate}</td>
                    <td>
                        ${!isCurrentUser ? `
                            <select onchange="adminManager.updateUserRole('${user.uid}', this.value)">
                                <option value="user" ${!user.isAdmin ? 'selected' : ''}>User</option>
                                <option value="admin" ${user.isAdmin ? 'selected' : ''}>Admin</option>
                            </select>
                        ` : `
                            <span class="current-user">Current User</span>
                        `}
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        userTableContainer.innerHTML = html;
    }

    async handleAddUser() {
        const email = document.getElementById('newUserEmail').value.trim();
        const password = document.getElementById('newUserPassword').value.trim();
        const role = document.getElementById('newUserRole').value;

        if (!email || !password) {
            this.dashboard.showNotification('Please enter both email and password', 'error');
            return;
        }

        try {
            const result = await this.auth.createUser(email, password, role);
            
            if (result.success) {
                // Clear form
                document.getElementById('newUserEmail').value = '';
                document.getElementById('newUserPassword').value = '';
                document.getElementById('newUserRole').value = 'user';
                
                this.dashboard.showNotification(`User ${email} created successfully as ${role}`, 'success');
                
                // Reload admin data
                await this.loadSystemData();
            } else {
                this.dashboard.showNotification(`Failed to create user: ${result.error}`, 'error');
            }
        } catch (error) {
            this.dashboard.showNotification(`Error: ${error.message}`, 'error');
        }
    }

    async updateUserRole(uid, newRole) {
        try {
            // Update user role
            await this.database.ref(`users/${uid}/role`).set(newRole);
            
            if (newRole === 'admin') {
                // Add to admins
                const userData = this.users[uid];
                await this.database.ref(`admins/${uid}`).set({
                    email: userData.email,
                    role: 'admin',
                    created: Date.now()
                });
            } else {
                // Remove from admins
                await this.database.ref(`admins/${uid}`).remove();
            }
            
            this.dashboard.showNotification(`User role updated to ${newRole}`, 'success');
            await this.loadSystemData();
            
        } catch (error) {
            this.dashboard.showNotification(`Failed to update role: ${error.message}`, 'error');
        }
    }

    setupAdminListeners() {
        // Listen for real-time updates
        this.database.ref('users').on('value', () => this.loadSystemData());
        this.database.ref('devices').on('value', () => this.updateSystemStats());
    }

    exportUsers() {
        const userData = Object.values(this.users).map(user => ({
            email: user.email,
            role: user.isAdmin ? 'admin' : 'user',
            created: user.created ? new Date(user.created).toISOString() : null
        }));

        const csv = this.convertToCSV(userData);
        this.downloadFile(csv, 'users-export.csv', 'text/csv');
        
        this.dashboard.showNotification('Users exported successfully', 'success');
    }

    convertToCSV(data) {
        if (!data.length) return '';
        
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => `"${row[header] || ''}"`).join(','))
        ].join('\n');
        
        return csvContent;
    }

    downloadFile(content, filename, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Global reference
window.adminManager = null;
