// config.js - Secure Configuration Management
class ConfigManager {
    constructor() {
        this.storageKey = 'smart_home_config_v1';
        this.config = null;
        this.isConfigured = false;
    }

    async initialize() {
        console.log('🔧 Initializing configuration manager');
        
        // Try to load existing configuration
        this.config = this.loadFromStorage();
        
        if (this.config && this.validateConfig(this.config)) {
            this.isConfigured = true;
            console.log('✅ Configuration loaded from storage');
            return this.config;
        }
        
        // Show configuration modal if no valid config
        this.showConfigModal();
        return null;
    }

    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Failed to load configuration from storage:', error);
        }
        return null;
    }

    validateConfig(config) {
        if (!config) return false;
        
        const required = ['apiKey', 'authDomain', 'databaseURL', 'projectId'];
        const isValid = required.every(key => config[key] && config[key].trim().length > 0);
        
        if (!isValid) return false;
        
        // Additional validation
        if (!config.apiKey.startsWith('AIzaSy')) return false;
        if (!config.authDomain.includes('.firebaseapp.com')) return false;
        if (!config.databaseURL.includes('firebaseio.com')) return false;
        
        return true;
    }

    saveConfig(config) {
        try {
            const fullConfig = {
                ...config,
                storageBucket: `${config.projectId}.appspot.com`,
                messagingSenderId: '123456789',
                appId: '1:123456789:web:abcdef123456'
            };
            
            localStorage.setItem(this.storageKey, JSON.stringify(fullConfig));
            this.config = fullConfig;
            this.isConfigured = true;
            
            console.log('✅ Configuration saved successfully');
            return fullConfig;
        } catch (error) {
            console.error('Failed to save configuration:', error);
            throw error;
        }
    }

    showConfigModal() {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content config-modal">
                    <h2>🔧 Firebase Configuration</h2>
                    <p>Please enter your Firebase project credentials:</p>
                    
                    <div class="config-form">
                        <div class="form-group">
                            <label>🔑 Firebase API Key:</label>
                            <input type="text" id="configApiKey" placeholder="AIzaSy...">
                            <small>Get from Firebase Console → Project Settings → Web API Key</small>
                        </div>
                        
                        <div class="form-group">
                            <label>🏢 Auth Domain:</label>
                            <input type="text" id="configAuthDomain" placeholder="your-project.firebaseapp.com">
                            <small>Usually: your-project-id.firebaseapp.com</small>
                        </div>
                        
                        <div class="form-group">
                            <label>🌐 Database URL:</label>
                            <input type="url" id="configDatabaseURL" placeholder="https://your-project-default-rtdb.firebaseio.com">
                            <small>Get from Realtime Database section</small>
                        </div>
                        
                        <div class="form-group">
                            <label>📋 Project ID:</label>
                            <input type="text" id="configProjectId" placeholder="your-project-id">
                            <small>Found in Project Settings → General</small>
                        </div>
                        
                        <div class="form-actions">
                            <button onclick="this.saveConfiguration()" class="save-btn">💾 Save & Continue</button>
                        </div>
                    </div>
                    
                    <div class="config-help">
                        <details>
                            <summary>❓ How to get Firebase credentials</summary>
                            <ol>
                                <li>Go to <a href="https://console.firebase.google.com" target="_blank">Firebase Console</a></li>
                                <li>Select your project</li>
                                <li>Click ⚙️ Settings → Project settings</li>
                                <li>Scroll to "Your apps" → Web app → Config</li>
                                <li>Copy the values to the form above</li>
                            </ol>
                        </details>
                    </div>
                </div>
            </div>
        `;
        
        modal.querySelector('.save-btn').onclick = () => this.handleConfigSave(modal);
        document.body.appendChild(modal);
    }

    handleConfigSave(modal) {
        const config = {
            apiKey: modal.querySelector('#configApiKey').value.trim(),
            authDomain: modal.querySelector('#configAuthDomain').value.trim(),
            databaseURL: modal.querySelector('#configDatabaseURL').value.trim(),
            projectId: modal.querySelector('#configProjectId').value.trim()
        };

        if (!this.validateConfig(config)) {
            alert('❌ Please fill in all fields with valid values');
            return;
        }

        try {
            const fullConfig = this.saveConfig(config);
            modal.remove();
            
            // Reload page to reinitialize with new config
            setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            alert('❌ Failed to save configuration: ' + error.message);
        }
    }

    showSettingsModal() {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-content">
                    <h2>⚙️ Dashboard Settings</h2>
                    <div class="settings-options">
                        <button onclick="this.reconfigure()" class="settings-option">
                            🔧 Reconfigure Firebase
                        </button>
                        <button onclick="this.clearAllData()" class="settings-option danger">
                            🗑️ Clear All Data
                        </button>
                        <button onclick="this.exportConfig()" class="settings-option">
                            📤 Export Configuration
                        </button>
                    </div>
                    <button onclick="this.remove()" class="close-btn">❌ Close</button>
                </div>
            </div>
        `;
        
        modal.querySelector('button[onclick="this.reconfigure()"]').onclick = () => {
            if (confirm('Clear current configuration?')) {
                localStorage.removeItem(this.storageKey);
                window.location.reload();
            }
        };
        
        modal.querySelector('button[onclick="this.clearAllData()"]').onclick = () => {
            if (confirm('⚠️ Clear ALL data including login sessions?')) {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
            }
        };
        
        modal.querySelector('button[onclick="this.exportConfig()"]').onclick = () => {
            const config = { ...this.config };
            delete config.apiKey; // Don't export sensitive data
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'smart-home-config.json';
            a.click();
            URL.revokeObjectURL(url);
        };
        
        document.body.appendChild(modal);
    }
}

// Initialize global configuration manager
window.configManager = new ConfigManager();
