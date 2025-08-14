// config.js - Secure configuration without hardcoded secrets
class Config {
    constructor() {
        this.environment = this.detectEnvironment();
        this.firebaseConfig = this.getFirebaseConfig();
    }

    detectEnvironment() {
        const hostname = window.location.hostname;
        
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'development';
        } else if (hostname.includes('github.io')) {
            return 'production';
        } else {
            return 'staging';
        }
    }

    getFirebaseConfig() {
        // Configuration is loaded from URL parameters or environment
        const urlParams = new URLSearchParams(window.location.search);
        
        // Try to get config from URL parameters (for secure deployment)
        const apiKey = urlParams.get('apiKey') || this.getFromStorage('firebase_api_key');
        const authDomain = urlParams.get('authDomain') || this.getFromStorage('firebase_auth_domain');
        const databaseURL = urlParams.get('databaseURL') || this.getFromStorage('firebase_database_url');
        const projectId = urlParams.get('projectId') || this.getFromStorage('firebase_project_id');

        if (!apiKey || !authDomain || !databaseURL || !projectId) {
            // Show configuration modal if not configured
            this.showConfigurationModal();
            return null;
        }

        const config = {
            apiKey: apiKey,
            authDomain: authDomain,
            databaseURL: databaseURL,
            projectId: projectId,
            storageBucket: `${projectId}.appspot.com`,
            messagingSenderId: "123456789", // This can be public
            appId: "1:123456789:web:abcdef123456" // This can be public
        };

        // Store securely for future use
        this.storeConfig(config);
        return config;
    }

    getFromStorage(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    storeConfig(config) {
        try {
            Object.keys(config).forEach(key => {
                localStorage.setItem(`firebase_${key.toLowerCase()}`, config[key]);
            });
        } catch (e) {
            console.warn('Could not store configuration');
        }
    }

    showConfigurationModal() {
        const modal = document.createElement('div');
        modal.id = 'config-modal';
        modal.innerHTML = `
            <div class="config-modal-overlay">
                <div class="config-modal-content">
                    <h2>🔧 Firebase Configuration Required</h2>
                    <p>Please enter your Firebase project configuration:</p>
                    
                    <form id="config-form">
                        <div class="form-group">
                            <label>Firebase API Key:</label>
                            <input type="text" id="config-api-key" placeholder="AIzaSy..." required>
                        </div>
                        
                        <div class="form-group">
                            <label>Auth Domain:</label>
                            <input type="text" id="config-auth-domain" placeholder="your-project.firebaseapp.com" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Database URL:</label>
                            <input type="url" id="config-database-url" placeholder="https://your-project-default-rtdb.firebaseio.com" required>
                        </div>
                        
                        <div class="form-group">
                            <label>Project ID:</label>
                            <input type="text" id="config-project-id" placeholder="your-project-id" required>
                        </div>
                        
                        <button type="submit">💾 Save Configuration</button>
                    </form>
                    
                    <div class="config-help">
                        <p><strong>🔒 Security Note:</strong> These settings are stored locally and never transmitted to third parties.</p>
                        <p><strong>📖 Help:</strong> Get these values from your Firebase Console → Project Settings → General → Your apps</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('config-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const config = {
                apiKey: document.getElementById('config-api-key').value,
                authDomain: document.getElementById('config-auth-domain').value,
                databaseURL: document.getElementById('config-database-url').value,
                projectId: document.getElementById('config-project-id').value,
                storageBucket: document.getElementById('config-project-id').value + '.appspot.com',
                messagingSenderId: "123456789",
                appId: "1:123456789:web:abcdef123456"
            };

            this.storeConfig(config);
            this.firebaseConfig = config;
            document.body.removeChild(modal);
            
            // Reload to initialize Firebase
            window.location.reload();
        });
    }

    isConfigured() {
        return this.firebaseConfig !== null;
    }
}

// Export configuration instance
window.appConfig = new Config();
