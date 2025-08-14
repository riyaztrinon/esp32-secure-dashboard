// dashboard.js - Dashboard Management
class DashboardManager {
    constructor(authManager) {
        this.auth = authManager;
        this.database = null;
        this.devicesData = {};
        this.userDevices = {};
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
            const devicesRef = this.database.ref('devices');
            
            devicesRef.on('value', (snapshot) => {
                const allDevices = snapshot.val() || {};
                this.devicesData = allDevices;
                
                // Filter devices based on user permissions
                this.userDevices = this.filterUserDevices(allDevices);
                
                this.renderDashboard();
                this.updateStats();
            });

        } catch (error) {
            console.error('❌ Error loading devices:', error);
            this.showNotification('Failed to load devices: ' + error.message, 'error');
        }
    }

    filterUserDevices(allDevices) {
        const userEmail = this.auth.currentUser.email;
        const filteredDevices = {};

        for (const deviceId in allDevices) {
            const device = allDevices[deviceId];
            
            // Admin can see all devices, users can only see their own
            if (this.auth.isAdmin || device.owner_email === userEmail) {
                filteredDevices[deviceId] = device;
            }
        }

        return filteredDevices;
    }

    renderDashboard() {
        const grid = document.getElementById('devicesGrid');
        const deviceCount = Object.keys(this.userDevices).length;

        grid.innerHTML = '';

        if (deviceCount === 0) {
            grid.innerHTML = this.getEmptyStateHTML();
            return;
        }

        // Render device cards
        for (const deviceId in this.userDevices) {
            const device = this.userDevices[deviceId];
            const deviceCard = this.createDeviceCard(deviceId, device);
            grid.appendChild(deviceCard);
        }
    }

    getEmptyStateHTML() {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        
        if (this.auth.isAdmin) {
            emptyDiv.innerHTML = `
                <h2>👑 Admin Dashboard</h2>
                <p>No ESP32 devices are currently registered in the system.</p>
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
                </div>
            `;
        }
        
        return emptyDiv;
    }

    createDeviceCard(deviceId, device) {
        const card = document.createElement('div');
        card.className = 'device-card';
        card.id = `device-${deviceId}`;

        const isOnline = this.isDeviceOnline(device);
        const lastSeen = this.getLastSeenText(device);
        
        card.innerHTML = `
            <div class="device-header">
                <div class="device-info">
                    <div class="device-title">📱 ${device.name || deviceId}</div>
                    <div class="device-meta">
                        <span class="device-location">📍 ${device.location || 'Unknown Location'}</span>
                        <span class="device-owner">👤 ${device.owner_email || 'Unknown Owner'}</span>
                    </div>
                </div>
                <div class="device-status-container">
                    <div class="device-status ${isOnline ? 'status-online' : 'status-offline'}">
                        ${isOnline ? '🟢 Online' : '🔴 Offline'}
                    </div>
                    <div class="last-seen">${lastSeen}</div>
                </div>
            </div>

            ${device.data ? this.renderDeviceControls(deviceId, device) : this.renderWaitingState()}
        `;

        return card;
    }

    renderDeviceControls(deviceId, device) {
        let html = '<div class="device-controls">';
        
        // Relay Controls
        if (device.data.relays && Array.isArray(device.data.relays)) {
            html += `
                <div class="control-section">
                    <div class="section-title">⚡ Relay Controls</div>
                    <div class="relays-grid">
                        ${device.data.relays.map((relay, index) => `
                            <div class="relay-control ${relay.state ? 'active' : ''}" 
                                 onclick="dashboard.toggleRelay('${deviceId}', ${index})"
                                 title="Click to toggle Relay ${index + 1}">
                                <div class="relay-name">Relay ${index + 1}</div>
                                <div class="relay-state">${relay.state ? 'ON' : 'OFF'}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // PWM Control
        if (device.data.pwm) {
            html += `
                <div class="control-section">
                    <div class="section-title">💡 PWM Dimming</div>
                    <div class="pwm-control">
                        <div class="pwm-info">
                            <span class="pwm-value">${device.data.pwm.brightness}%</span>
                            <span class="pwm-relay">Relay ${device.data.pwm.active_relay >= 0 ? device.data.pwm.active_relay + 1 : 'None'}</span>
                        </div>
                        <input type="range" min="0" max="100" value="${device.data.pwm.brightness}" 
                               class="pwm-slider" 
                               onchange="dashboard.setPwm('${deviceId}', this.value)"
                               oninput="this.previousElementSibling.children[0].textContent = this.value + '%'">
                    </div>
                </div>
            `;
        }

        // Environmental Sensors
        if (device.data.sensors) {
            html += `
                <div class="control-section">
                    <div class="section-title">🌡️ Environmental Sensors</div>
                    <div class="sensors-grid">
                        <div class="sensor-card temperature">
                            <div class="sensor-icon">🌡️</div>
                            <div class="sensor-value">${device.data.sensors.temperature?.toFixed(1) || '—'}</div>
                            <div class="sensor-unit">°C</div>
                            <div class="sensor-label">Temperature</div>
                        </div>
                        <div class="sensor-card humidity">
                            <div class="sensor-icon">💧</div>
                            <div class="sensor-value">${device.data.sensors.humidity?.toFixed(1) || '—'}</div>
                            <div class="sensor-unit">%</div>
                            <div class="sensor-label">Humidity</div>
                        </div>
                        <div class="sensor-card light">
                            <div class="sensor-icon">☀️</div>
                            <div class="sensor-value">${device.data.sensors.light_lux?.toFixed(0) || '—'}</div>
                            <div class="sensor-unit">lux</div>
                            <div class="sensor-label">Light</div>
                        </div>
                        <div class="sensor-card pressure">
                            <div class="sensor-icon">🌪️</div>
                            <div class="sensor-value">${device.data.sensors.pressure_hpa?.toFixed(1) || '—'}</div>
                            <div class="sensor-unit">hPa</div>
                            <div class="sensor-label">Pressure</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        html += '</div>';
        return html;
    }

    renderWaitingState() {
        return `
            <div class="waiting-state">
                <div class="waiting-icon">⏳</div>
                <h3>Waiting for device data...</h3>
                <p>Device is registered but hasn't sent data yet.</p>
            </div>
        `;
    }

    isDeviceOnline(device) {
        if (!device.data || !device.data.timestamp) return false;
        const now = Date.now() / 1000;
        const deviceTime = device.data.timestamp;
        return (now - deviceTime) < 120; // Online if updated within 2 minutes
    }

    getLastSeenText(device) {
        if (!device.data || !device.data.timestamp) return 'Never';
        
        const now = Date.now() / 1000;
        const deviceTime = device.data.timestamp;
        const diff = now - deviceTime;
        
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
        return `${Math.floor(diff / 86400)} days ago`;
    }

    async toggleRelay(deviceId, relayId) {
        try {
            console.log(`🔄 Toggling relay ${relayId} on device ${deviceId}`);
            
            const relayRef = this.database.ref(`devices/${deviceId}/data/relays/${relayId}/state`);
            const snapshot = await relayRef.once('value');
            const currentState = snapshot.val() || false;
            
            await relayRef.set(!currentState);
            
            console.log(`✅ Relay ${relayId} ${!currentState ? 'turned ON' : 'turned OFF'}`);
            this.showNotification(`Relay ${relayId + 1} ${!currentState ? 'turned ON' : 'turned OFF'}`, 'success');
        } catch (error) {
            console.error('❌ Failed to toggle relay:', error);
            this.showNotification('Failed to control relay. Please try again.', 'error');
        }
    }

    async setPwm(deviceId, brightness) {
        try {
            console.log(`🔄 Setting PWM brightness to ${brightness}% on device ${deviceId}`);
            
            const pwmRef = this.database.ref(`devices/${deviceId}/data/pwm/brightness`);
            await pwmRef.set(parseInt(brightness));
            
            console.log(`✅ PWM brightness set to ${brightness}%`);
        } catch (error) {
            console.error('❌ Failed to set PWM:', error);
            this.showNotification('Failed to control PWM. Please try again.', 'error');
        }
    }

    updateStats() {
        const deviceCount = Object.keys(this.userDevices).length;
        const onlineCount = Object.values(this.userDevices).filter(device => this.isDeviceOnline(device)).length;
        
        document.getElementById('deviceCount').textContent = deviceCount;
        document.getElementById('onlineCount').textContent = onlineCount;
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
    }

    setupRealtimeListeners() {
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.updateStats();
        }, 30000);
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Hide notification after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Global reference for easy access
window.dashboard = null;
