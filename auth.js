// Enhanced auth.js - Fix for authentication persistence
class AuthManager {
    constructor(config) {
        this.config = config;
        this.currentUser = null;
        this.userRole = null;
        this.isAdmin = false;
        this.db = null;
        this.auth = null;
        this.initialized = false;
    }

    async initialize() {
        if (!this.config.isConfigured()) {
            throw new Error('Firebase configuration required');
        }

        try {
            // Initialize Firebase with persistence
            firebase.initializeApp(this.config.firebaseConfig);
            this.auth = firebase.auth();
            this.db = firebase.database();

            // Set authentication persistence BEFORE setting up listeners
            await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            console.log('✅ Firebase auth persistence set to LOCAL');

            // Set up auth state listener with enhanced handling
            this.setupAuthStateListener();
            
            this.initialized = true;
            console.log('✅ Authentication system initialized');
        } catch (error) {
            console.error('❌ Failed to initialize authentication:', error);
            throw error;
        }
    }

    setupAuthStateListener() {
        this.auth.onAuthStateChanged(async (user) => {
            console.log('🔄 Auth state changed:', user ? user.email : 'null');
            
            if (user) {
                await this.handleUserSignIn(user);
            } else {
                this.handleUserSignOut();
            }
        });

        // Also listen for ID token changes (more reliable)
        this.auth.onIdTokenChanged(async (user) => {
            console.log('🔄 ID token changed:', user ? user.email : 'null');
            
            if (user && this.currentUser) {
                // Refresh user role if token changed
                await this.loadUserRole(user.uid);
            }
        });
    }

    async handleUserSignIn(user) {
        try {
            this.currentUser = user;
            
            // Load user role with retry logic
            await this.loadUserRole(user.uid);
            
            // Update UI after successful auth
            this.showDashboard();
            
            console.log(`✅ User authenticated: ${user.email} (${this.userRole})`);
        } catch (error) {
            console.error('❌ Error handling sign in:', error);
            // Don't sign out on role loading error, just default to user role
            this.userRole = 'user';
            this.isAdmin = false;
            this.showDashboard();
        }
    }

    handleUserSignOut() {
        this.currentUser = null;
        this.userRole = null;
        this.isAdmin = false;
        this.showLogin();
        console.log('✅ User signed out');
    }
}
