// dashboard.js - Personal dashboard with device management
class DashboardManager {
    constructor(authManager) {
        this.auth = authManager;
        this.db = null;
        this.devicesData = {};
        this.userDevices = {};
    }

    async initialize() {
        this.db = firebase.database();
        await this.loadUserDevices();
        this.setupRealtimeListeners();
        console.log('✅ Dashboard initialized');
    }

    async loadUserDevices() {
        if (!this.auth.getCurrentUser()) {
            console.log('⚠️ No authenticated user');
            return;
        }

        try {
            const devicesRef = this.db.ref('devices');
            
            devicesRef.on('value', (snapshot) => {
                const allDevices = snapshot.val() || {};
                this.devicesData = allDevices;
                
                // Filter devices based on user permissions
                this.userDevices = this.filterUserDevices(allDevices);
                
                this.renderDashboard();
                this.updateLastUpdateTime();
            });

        } catch (error) {
            console.error('❌ Error loading devices:', error);
        }
    }

    filterUserDevices(allDevices) {
        const userEmail = this.auth.getCurrentUser().email;
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
        
        // Update dashboard header
        document.getElementById('deviceCount').textContent = deviceCount;
        document.getElementById('dashboardTitle').textContent = 
            this.auth.isAdmin ? 'Admin Dashboard - All Devices' : 'My Devices Dashboard';

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
        if (this.auth.isAdmin) {
            return `
                <div class="empty-state">
                    <h2>👑 Admin Dashboard</h2>
                    <p>No ESP32 devices are currently registered in the system.</p>
                    <p>Devices will appear here once they complete the setup process.</p>
                </div>
            `;
        } else {
            return `
                <div class="empty-state">
                    <h2>📱 Welcome to Your Smart Home Dashboard</h2>
                    <p>You don't have any ESP32 devices registered yet.</p>
                    <div class="setup-instructions">
                        <h3>🔧 To add your first device:</h3>
                        <ol>
                            <li>Power on your ESP32 home automation device</li>
                            <li>Connect to the WiFi network: <strong>ESP32_HomeAutomation_Setup</strong></li>
                            <li>Open your browser and go to: <strong>http://192.168.4.1</strong></li>
                            <li>Complete the setup with your email: <strong>${this.auth.getCurrentUser().email}</strong></li>
                        </ol>
                    </div>
                </div>
            `;
        }
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
                        <span class="device-id">🆔 ${deviceId}</span>
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
        return `
            <!-- Device Controls -->
            <div class="device-controls">
                <!-- Relay Controls -->
                <div class="control-section">
                    <div class="section-title">⚡ Relay Controls</div>
                    <div class="relays-grid">
                        ${device.data.relays ? device.data.relays.map(relay => `
                            <div class="relay-control ${relay.state ? 'active' : ''}" 
                                 onclick="dashboardManager.toggleRelay('${deviceId}', ${relay.id})"
                                 title="Click to toggle Relay ${relay.id + 1}">
                                <div class="relay-name">Relay ${relay.id + 1}</div>
                                <div class="relay-state">${relay.state ? 'ON' : 'OFF'}</div>
                            </div>
                        `).join('') : '<div class="no-data">No relay data available</div>'}
                    </div>
                </div>

                <!-- PWM Control -->
                ${device.data.pwm ? `
                    <div class="control-section">
                        <div class="section-title">💡 PWM Dimming</div>
                        <div class="pwm-control">
                            <div class="pwm-info">
                                <span class="pwm-value">${device.data.pwm.brightness}%</span>
                                <span class="pwm-relay">Relay ${device.data.pwm.active_relay >= 0 ? device.data.pwm.active_relay + 1 : 'None'}</span>
                            </div>
                            <input type="range" min="0" max="100" value="${device.data.pwm.brightness}" 
                                   class="pwm-slider" 
                                   onchange="dashboardManager.setPwm('${deviceId}', this.value)"
                                   oninput="this.previousElementSibling.children[0].textContent = this.value + '%'">
                        </div>
                    </div>
                ` : ''}

                <!-- Environmental Sensors -->
                ${device.data.sensors ? `
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
                ` : ''}
            </div>
        `;
    }

    renderWaitingState() {
        return `
            <div class="waiting-state">
                <div class="waiting-icon">⏳</div>
                <h3>Waiting for device data...</h3>
                <p>Device is registered but hasn't sent data yet.</p>
                <div class="waiting-steps">
                    <div class="step">1. Ensure device is powered on</div>
                    <div class="step">2. Check WiFi connection</div>
                    <div class="step">3. Data should appear within 30 seconds</div>
                </div>
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

    // Device Control Methods
    async toggleRelay(deviceId, relayId) {
        try {
            console.log(`🔄 Toggling relay ${relayId} on device ${deviceId}`);
            
            const relayRef = this.db.ref(`devices/${deviceId}/data/relays/${relayId}/state`);
            const currentState = this.devicesData[deviceId]?.data?.relays?.[relayId]?.state || false;
            
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
            
            const pwmRef = this.db.ref(`devices/${deviceId}/data/pwm/brightness`);
            await pwmRef.set(parseInt(brightness));
            
            console.log(`✅ PWM brightness set to ${brightness}%`);
        } catch (error) {
            console.error('❌ Failed to set PWM:', error);
            this.showNotification('Failed to control PWM. Please try again.', 'error');
        }
    }

    setupRealtimeListeners() {
        // Listen for real-time updates
        if (this.db) {
            this.db.ref('devices').on('value', () => {
                this.updateLastUpdateTime();
            });
        }
    }

    updateLastUpdateTime() {
        document.getElementById('lastUpdate').textContent = new Date().toLocaleString();
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Initialize dashboard manager
window.dashboardManager = null;
