// config.js - Admin-Only Firebase Configuration
class ConfigManager {
    constructor() {
        this.storageKey = 'smart_home_admin_config_v1';
        this.config = null;
        this.isConfigured = false;
        this.isAdminConfigMode = false;
    }

    async initialize() {
        console.log('🔧 Initializing configuration manager');
        
        // Try to load existing global configuration
        this.config = this.loadGlobalConfig();
        
        if (this.config && this.validateConfig(this.config)) {
            this.isConfigured = true;
            console.log('✅ Global configuration loaded');
            return this.config;
        }
        
        // Check if this is admin setup mode
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('admin_setup') === 'true') {
            this.isAdminConfigMode = true;
            this.showAdminConfigModal();
        } else {
            // Show message for regular users
            this.showUserWaitingMessage();
        }
        
        return null;
    }

    loadGlobalConfig() {
        try {
            // Try to load from a global config file or URL parameter
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return JSON.parse(stored);
            }
            
            // Check if config is embedded in URL (admin setup)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('firebase_config')) {
                const configData = JSON.parse(decodeURIComponent(urlParams.get('firebase_config')));
                this.saveGlobalConfig(configData);
                return configData;
            }
        } catch (error) {
            console.warn('Failed to load global configuration:', error);
        }
        return null;
    }

    saveGlobalConfig(config) {
        try {
            const fullConfig = {
                ...config,
                storageBucket: `${config.projectId}.appspot.com`,
                messagingSenderId: '123456789',
                appId: '1:123456789:web:abcdef123456',
                configuredAt: Date.now(),
                configuredBy: 'admin'
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(fullConfig));
            this.config = fullConfig;
            this.isConfigured = true;
            
            console.log('✅ Global configuration saved by admin');
            return fullConfig;
        } catch (error) {
            console.error('Failed to save global configuration:', error);
            throw error;
        }
    }

    showAdminConfigModal() {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content admin-config-modal">
                    <h2>👑 Admin Firebase Setup</h2>
                    <p><strong>One-time configuration for all users</strong></p>
                    
                    <div class="admin-warning">
                        ⚠️ This configuration will be used by all users of the system.
                        Only configure this if you are the system administrator.
                    </div>
                    
                    <div class="config-form">
                        <div class="form-group">
                            <label>🔑 Firebase API Key:</label>
                            <input type="text" id="adminApiKey" placeholder="AIzaSy...">
                            <small>From Firebase Console → Project Settings → Web API Key</small>
                        </div>
                        
                        <div class="form-group">
                            <label>🏢 Auth Domain:</label>
                            <input type="text" id="adminAuthDomain" placeholder="your-project.firebaseapp.com">
                        </div>
                        
                        <div class="form-group">
                            <label>🌐 Database URL:</label>
                            <input type="url" id="adminDatabaseURL" placeholder="https://your-project-default-rtdb.firebaseio.com">
                        </div>
                        
                        <div class="form-group">
                            <label>📋 Project ID:</label>
                            <input type="text" id="adminProjectId" placeholder="your-project-id">
                        </div>
                        
                        <div class="form-actions">
                            <button onclick="this.saveAdminConfiguration()" class="admin-save-btn">
                                👑 Save Global Configuration
                            </button>
                        </div>
                    </div>
                    
                    <div class="admin-help">
                        <h4>📋 Admin Setup Instructions:</h4>
                        <ol>
                            <li>Configure Firebase credentials above</li>
                            <li>Create admin user in Firebase Authentication</li>
                            <li>Add admin entry to Realtime Database</li>
                            <li>Share regular dashboard URL with users</li>
                        </ol>
                    </div>
                </div>
            </div>
        `;
        
        modal.querySelector('.admin-save-btn').onclick = () => this.handleAdminConfigSave(modal);
        document.body.appendChild(modal);
    }

    showUserWaitingMessage() {
        const message = document.createElement('div');
        message.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content user-waiting">
                    <h2>🏠 Smart Home Dashboard</h2>
                    <div class="waiting-content">
                        <div class="loading-spinner"></div>
                        <h3>⚙️ System Not Configured</h3>
                        <p>The Firebase backend hasn't been configured yet.</p>
                        <p>Please contact your system administrator to complete the initial setup.</p>
                        
                        <div class="admin-contact">
                            <h4>For Administrators:</h4>
                            <p>Add <code>?admin_setup=true</code> to the URL to configure Firebase credentials.</p>
                            <p>Example: <code>https://yourusername.github.io/repo/?admin_setup=true</code></p>
                        </div>
                        
                        <button onclick="window.location.reload()" class="retry-btn">
                            🔄 Retry Connection
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(message);
    }

    handleAdminConfigSave(modal) {
        const config = {
            apiKey: modal.querySelector('#adminApiKey').value.trim(),
            authDomain: modal.querySelector('#adminAuthDomain').value.trim(),
            databaseURL: modal.querySelector('#adminDatabaseURL').value.trim(),
            projectId: modal.querySelector('#adminProjectId').value.trim()
        };

        if (!this.validateConfig(config)) {
            alert('❌ Please fill in all fields with valid values');
            return;
        }

        try {
            const fullConfig = this.saveGlobalConfig(config);
            modal.remove();
            
            alert('✅ Global Firebase configuration saved! All users can now access the system.');
            
            // Redirect to regular dashboard
            window.location.href = window.location.href.split('?')[0];
        } catch (error) {
            alert('❌ Failed to save configuration: ' + error.message);
        }
    }

    validateConfig(config) {
        if (!config) {
            console.log('❌ Config validation failed: null config');
            return false;
        }
        
        const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId'];
        const missing = required.filter(key => !config[key] || config[key].trim().length === 0);
        
        if (missing.length > 0) {
            console.log('❌ Config validation failed: missing fields:', missing);
            return false;
        }

        if (!config.apiKey.startsWith('AIzaSy')) {
            console.log('❌ Config validation failed: invalid API key format');
            return false;
        }

        if (!config.authDomain.includes('.firebaseapp.com')) {
            console.log('❌ Config validation failed: invalid auth domain format');
            return false;
        }

        if (!config.databaseURL.includes('firebaseio.com')) {
            console.log('❌ Config validation failed: invalid database URL format');
            return false;
        }

        console.log('✅ Configuration validation passed');
        return true;
    }
}

// Initialize global configuration manager
window.configManager = new ConfigManager();
