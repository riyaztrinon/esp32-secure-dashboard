// auth.js - Secure authentication with role management
class AuthManager {
    constructor(config) {
        this.config = config;
        this.currentUser = null;
        this.userRole = null;
        this.isAdmin = false;
        this.db = null;
        this.auth = null;
    }

    async initialize() {
        if (!this.config.isConfigured()) {
            throw new Error('Firebase configuration required');
        }

        try {
            // Initialize Firebase
            firebase.initializeApp(this.config.firebaseConfig);
            this.auth = firebase.auth();
            this.db = firebase.database();

            // Set up auth state listener
            this.auth.onAuthStateChanged(async (user) => {
                if (user) {
                    await this.handleUserSignIn(user);
                } else {
                    this.handleUserSignOut();
                }
            });

            console.log('✅ Authentication system initialized');
        } catch (error) {
            console.error('❌ Failed to initialize authentication:', error);
            throw error;
        }
    }

    async handleUserSignIn(user) {
        try {
            this.currentUser = user;
            
            // Check user role and permissions
            await this.loadUserRole(user.uid);
            
            // Update UI
            this.showDashboard();
            
            console.log(`✅ User signed in: ${user.email} (${this.userRole})`);
        } catch (error) {
            console.error('❌ Error handling sign in:', error);
            this.signOut();
        }
    }

    async loadUserRole(uid) {
        try {
            // Check if user is admin
            const adminSnapshot = await this.db.ref(`admins/${uid}`).once('value');
            this.isAdmin = adminSnapshot.exists();
            
            if (this.isAdmin) {
                this.userRole = 'admin';
            } else {
                // Check regular user role
                const userSnapshot = await this.db.ref(`users/${uid}`).once('value');
                const userData = userSnapshot.val();
                this.userRole = userData?.role || 'user';
            }
        } catch (error) {
            console.error('❌ Error loading user role:', error);
            this.userRole = 'user';
            this.isAdmin = false;
        }
    }

    handleUserSignOut() {
        this.currentUser = null;
        this.userRole = null;
        this.isAdmin = false;
        this.showLogin();
        console.log('✅ User signed out');
    }

    async signIn(email, password) {
        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            return { success: true, user: userCredential.user };
        } catch (error) {
            console.error('❌ Sign in failed:', error);
            return { success: false, error: error.message };
        }
    }

    async signOut() {
        try {
            await this.auth.signOut();
        } catch (error) {
            console.error('❌ Sign out failed:', error);
        }
    }

    // Admin function to create new users
    async createUser(email, password, role = 'user') {
        if (!this.isAdmin) {
            throw new Error('Unauthorized: Admin access required');
        }

        try {
            // This creates a user account
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Add user to database with role
            await this.db.ref(`users/${user.uid}`).set({
                email: email,
                role: role,
                created: Date.now(),
                createdBy: this.currentUser.uid
            });

            console.log(`✅ User created: ${email} (${role})`);
            return { success: true, user: user };
        } catch (error) {
            console.error('❌ User creation failed:', error);
            return { success: false, error: error.message };
        }
    }

    showLogin() {
        document.getElementById('loginContainer').classList.remove('hidden');
        document.getElementById('dashboardContainer').classList.add('hidden');
        document.getElementById('loadingContainer').classList.add('hidden');
    }

    showDashboard() {
        document.getElementById('loginContainer').classList.add('hidden');
        document.getElementById('dashboardContainer').classList.remove('hidden');
        document.getElementById('loadingContainer').classList.add('hidden');
        
        // Update user info
        document.getElementById('userEmail').textContent = this.currentUser.email;
        document.getElementById('userRole').textContent = this.userRole.toUpperCase();
        
        // Show admin panel if user is admin
        if (this.isAdmin) {
            document.getElementById('adminPanel').classList.remove('hidden');
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getRole() {
        return this.userRole;
    }
}

// Initialize auth manager when config is ready
window.authManager = new AuthManager(window.appConfig);
