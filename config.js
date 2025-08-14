// Enhanced config.js - Fix for persistent configuration issues
class Config {
    constructor() {
        this.environment = this.detectEnvironment();
        this.storageKey = 'esp32_firebase_config_v3'; // Updated version
        this.configValid = false;
        this.firebaseConfig = this.getFirebaseConfig();
    }

    getFirebaseConfig() {
        // Try multiple storage methods with validation
        let config = this.loadFromStorage();
        
        if (config && this.validateConfig(config)) {
            this.configValid = true;
            console.log('✅ Valid configuration loaded from storage');
            return config;
        }

        // If storage fails, try URL parameters
        config = this.loadFromURLParams();
        if (config && this.validateConfig(config)) {
            this.storeConfig(config);
            this.configValid = true;
            console.log('✅ Valid configuration loaded from URL');
            return config;
        }

        // Show configuration modal only if no valid config found
        console.log('❌ No valid configuration found, showing modal');
        this.showConfigurationModal();
        return null;
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

        // Additional validation
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

    loadFromStorage() {
        try {
            // Try new storage format first
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (this.validateConfig(parsed)) {
                    return parsed;
                }
            }

            // Try legacy formats
            const legacyKeys = [
                'esp32_firebase_config_v2',
                'esp32_firebase_config_v1',
                'firebase_config'
            ];

            for (const key of legacyKeys) {
                const legacyStored = localStorage.getItem(key);
                if (legacyStored) {
                    const parsed = JSON.parse(legacyStored);
                    if (this.validateConfig(parsed)) {
                        // Migrate to new format
                        this.storeConfig(parsed);
                        return parsed;
                    }
                }
            }

            // Try individual localStorage items
            const individualConfig = {
                apiKey: localStorage.getItem('firebase_api_key') || localStorage.getItem('firebase_apikey'),
                authDomain: localStorage.getItem('firebase_auth_domain') || localStorage.getItem('firebase_authdomain'),
                databaseURL: localStorage.getItem('firebase_database_url') || localStorage.getItem('firebase_databaseurl'),
                projectId: localStorage.getItem('firebase_project_id') || localStorage.getItem('firebase_projectid')
            };

            if (this.validateConfig(individualConfig)) {
                const fullConfig = this.completeConfig(individualConfig);
                this.storeConfig(fullConfig);
                return fullConfig;
            }

        } catch (e) {
            console.warn('❌ Storage access failed:', e);
        }
        
        return null;
    }

    storeConfig(config) {
        try {
            const configToStore = JSON.stringify(config);
            
            // Store in multiple places for maximum reliability
            localStorage.setItem(this.storageKey, configToStore);
            sessionStorage.setItem(this.storageKey, configToStore);
            
            // Also store individual items for compatibility
            Object.keys(config).forEach(key => {
                localStorage.setItem(`firebase_${key.toLowerCase()}`, config[key]);
            });
            
            // Set a flag to indicate config is stored
            localStorage.setItem('firebase_config_stored', 'true');
            
            console.log('✅ Configuration stored successfully');
            this.configValid = true;
        } catch (e) {
            console.error('❌ Failed to store configuration:', e);
        }
    }

    isConfigured() {
        return this.configValid && this.firebaseConfig !== null;
    }

    // Add method to force re-validation
    revalidateConfig() {
        const config = this.loadFromStorage();
        if (config && this.validateConfig(config)) {
            this.firebaseConfig = config;
            this.configValid = true;
            return true;
        }
        return false;
    }
}
