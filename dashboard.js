// Enhanced dashboard.js - Fix device counting and online status
class DashboardManager {
    constructor(authManager) {
        this.auth = authManager;
        this.database = null;
        this.devicesData = {};
        this.userDevices = {};
        this.onlineDevicesCount = 0;
    }

    async initialize() {
        if (!this.auth.currentUser) {
            console.log('❌ No authenticated user');
            return;
        }

        this.database = firebase.database();
        console.log('✅ Dashboard manager initialized');
        
        await this.loadDevices();
        this.setupRealtimeListeners();
    }

    async loadDevices() {
        try {
            console.log('📡 Loading devices for user:', this.auth.currentUser.email);
            
            const devicesRef = this.database.ref('devices');
            
            devicesRef.on('value', (snapshot) => {
                const allDevices = snapshot.val() || {};
                console.log('📊 Raw devices data:', Object.keys(allDevices).length, 'total devices');
                
                this.devicesData = allDevices;
                
                // Filter devices based on user permissions
                this.userDevices = this.filterUserDevices(allDevices);
                
                console.log('👤 User devices:', Object.keys(this.userDevices).length, 'devices for', this.auth.currentUser.email);
                
                this.renderDashboard();
                this.updateStats();
            }, (error) => {
                console.error('❌ Error loading devices:', error);
                this.showNotification('Failed to load devices: ' + error.message, 'error');
                
                // Show debug info for troubleshooting
                this.showDebugInfo(error);
            });

        } catch (error) {
            console.error('❌ Error setting up device listener:', error);
            this.showNotification('Failed to setup device monitoring: ' + error.message, 'error');
        }
    }

    filterUserDevices(allDevices) {
        const userEmail = this.auth.currentUser.email;
        const filteredDevices = {};
        let totalCount = 0;
        let userCount = 0;

        console.log('🔍 Filtering devices for user:', userEmail);
        console.log('👑 User is admin:', this.auth.isAdmin);

        for (const deviceId in allDevices) {
            const device = allDevices[deviceId];
            totalCount++;
            
            console.log(`📱 Device ${deviceId}:`, {
                owner: device.owner_email,
                name: device.name,
                hasData: !!device.data
            });
            
            // Admin can see all devices, users can only see their own
            if (this.auth.isAdmin || device.owner_email === userEmail) {
                filteredDevices[deviceId] = device;
                userCount++;
                console.log(`✅ Device ${deviceId} accessible to user`);
            } else {
                console.log(`❌ Device ${deviceId} not accessible to user`);
            }
        }

        console.log(`📈 Device filtering results: ${userCount}/${totalCount} devices accessible`);
        return filteredDevices;
    }

    isDeviceOnline(device) {
        if (!device || !device.data || !device.data.timestamp) {
            console.log('❌ Device missing timestamp data');
            return false;
        }
        
        const now = Date.now() / 1000;
        const deviceTime = device.data.timestamp;
        const timeDiff = now - deviceTime;
        const isOnline = timeDiff < 120; // Online if updated within 2 minutes
        
        console.log(`🔍 Device online check: ${timeDiff.toFixed(0)}s ago, online: ${isOnline}`);
        return isOnline;
    }

    updateStats() {
        const deviceCount = Object.keys(this.userDevices).length;
        let onlineCount = 0;
        
        // Calculate online devices
        for (const deviceId in this.userDevices) {
            const device = this.userDevices[deviceId];
            if (this.isDeviceOnline(device)) {
                onlineCount++;
            }
        }
        
        this.onlineDevicesCount = onlineCount;
        
        console.log('📊 Stats update:', { deviceCount, onlineCount });
        
        // Update UI
        const deviceCountElement = document.getElementById('deviceCount');
        const onlineCountElement = document.getElementById('onlineCount');
        
        if (deviceCountElement) deviceCountElement.textContent = deviceCount;
        if (onlineCountElement) onlineCountElement.textContent = onlineCount;
        
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
        
        // Update dashboard title based on device count
        if (deviceCount === 0) {
            document.getElementById('dashboardTitle').textContent = 
                this.auth.isAdmin ? '👑 Admin Dashboard (No Devices)' : '🏠 My Smart Home (No Devices)';
        } else {
            document.getElementById('dashboardTitle').textContent = 
                this.auth.isAdmin ? `👑 Admin Dashboard (${deviceCount} Devices)` : `🏠 My Smart Home (${deviceCount} Devices)`;
        }
    }

    showDebugInfo(error) {
        if (!this.auth.isAdmin) return; // Only show debug info to admins
        
        const debugModal = document.createElement('div');
        debugModal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content debug-modal">
                    <h2>🔍 Device Loading Debug Info</h2>
                    <div class="debug-info">
                        <h3>Current User:</h3>
                        <ul>
                            <li>Email: ${this.auth.currentUser.email}</li>
                            <li>UID: ${this.auth.currentUser.uid}</li>
                            <li>Is Admin: ${this.auth.isAdmin}</li>
                        </ul>
                        
                        <h3>Error Details:</h3>
                        <pre>${JSON.stringify(error, null, 2)}</pre>
                        
                        <h3>Troubleshooting Steps:</h3>
                        <ol>
                            <li>Check Firebase Security Rules allow device access</li>
                            <li>Verify at least one ESP32 device is configured</li>
                            <li>Ensure device owner_email matches user email</li>
                            <li>Check Firebase Console → Realtime Database → Data</li>
                        </ol>
                        
                        <h3>Expected Database Structure:</h3>
                        <pre>
devices/
  ESP32_XXXXXX/
    name: "Living Room"
    owner_email: "${this.auth.currentUser.email}"
    location: "Living Room"
    data/
      timestamp: ${Math.floor(Date.now() / 1000)}
      relays: [...]
                        </pre>
                    </div>
                    <button onclick="this.remove()" class="close-btn">❌ Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(debugModal);
    }

    renderDashboard() {
        const grid = document.getElementById('devicesGrid');
        const deviceCount = Object.keys(this.userDevices).length;

        grid.innerHTML = '';

        if (deviceCount === 0) {
            grid.appendChild(this.getEmptyStateElement());
            return;
        }

        // Render device cards
        for (const deviceId in this.userDevices) {
            const device = this.userDevices[deviceId];
            const deviceCard = this.createDeviceCard(deviceId, device);
            grid.appendChild(deviceCard);
        }
    }

    getEmptyStateElement() {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        
        if (this.auth.isAdmin) {
            emptyDiv.innerHTML = `
                <h2>👑 Admin Dashboard</h2>
                <p>No ESP32 devices are currently registered in the system.</p>
                
                <div class="debug-section">
                    <h3>🔍 Troubleshooting:</h3>
                    <ul>
                        <li>Check Firebase Console → Realtime Database → Data for devices node</li>
                        <li>Verify ESP32 devices have completed setup process</li>
                        <li>Check Firebase Security Rules allow device access</li>
                    </ul>
                    
                    <button onclick="window.open('https://console.firebase.google.com')" class="debug-btn">
                        🔧 Open Firebase Console
                    </button>
                </div>
                
                <div class="help-box">
                    <p>Devices will appear here once users complete the ESP32 setup process.</p>
                </div>
            `;
        } else {
            emptyDiv.innerHTML = `
                <h2>🏠 Welcome to Your Smart Home</h2>
                <p>You don't have any ESP32 devices registered yet.</p>
                <div class="help-box">
                    <h3>🔧 To add your first device:</h3>
                    <ol>
                        <li>Power on your ESP32 home automation device</li>
                        <li>Connect to WiFi: <strong>ESP32_HomeAutomation_Setup</strong></li>
                        <li>Password: <strong>homesetup123</strong></li>
                        <li>Open browser: <strong>http://192.168.4.1</strong></li>
                        <li>Use your email: <strong>${this.auth.currentUser.email}</strong></li>
                        <li>Complete all 3 setup tabs</li>
                    </ol>
                    
                    <div class="setup-status">
                        <h4>📱 Setup Status Check:</h4>
                        <p>User Email: <code>${this.auth.currentUser.email}</code></p>
                        <p>Make sure to use this exact email when setting up your ESP32 device.</p>
                    </div>
                </div>
            `;
        }
        
        return emptyDiv;
    }

    // Rest of your existing methods remain the same...
    setupRealtimeListeners() {
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.updateStats();
        }, 30000);
    }
}
