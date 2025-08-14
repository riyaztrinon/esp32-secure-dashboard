// auth.js - Authentication Management
class AuthManager {
    constructor(config) {
        this.config = config;
        this.auth = null;
        this.database = null;
        this.currentUser = null;
        this.userRole = 'user';
        this.isAdmin = false;
        this.authStateCallbacks = [];
    }

    async initialize() {
        if (!this.config) {
            throw new Error('Configuration required for authentication');
        }

        try {
            // Initialize Firebase
            firebase.initializeApp(this.config);
            this.auth = firebase.auth();
            this.database = firebase.database();

            // Set authentication persistence
            await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

            // Set up auth state listener
            this.auth.onAuthStateChanged(async (user) => {
                if (user) {
                    await this.handleUserSignIn(user);
                } else {
                    this.handleUserSignOut();
                }
                
                // Call registered callbacks
                this.authStateCallbacks.forEach(callback => callback(user));
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
            
            // Check if user is admin
            const adminRef = this.database.ref(`admins/${user.uid}`);
            const adminSnapshot = await adminRef.once('value');
            this.isAdmin = adminSnapshot.exists();
            this.userRole = this.isAdmin ? 'admin' : 'user';
            
            this.showDashboard();
            console.log(`✅ User signed in: ${user.email} (${this.userRole})`);
        } catch (error) {
            console.error('❌ Error during sign in:', error);
            this.userRole = 'user';
            this.isAdmin = false;
            this.showDashboard();
        }
    }

    handleUserSignOut() {
        this.currentUser = null;
        this.userRole = 'user';
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
            return { success: false, error: this.getErrorMessage(error) };
        }
    }

    async signOut() {
        try {
            await this.auth.signOut();
        } catch (error) {
            console.error('❌ Sign out failed:', error);
        }
    }

    async createUser(email, password, role = 'user') {
        if (!this.isAdmin) {
            throw new Error('Admin access required');
        }

        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Add user to database
            await this.database.ref(`users/${user.uid}`).set({
                email: email,
                role: role,
                created: Date.now(),
                createdBy: this.currentUser.uid
            });

            // If admin, add to admins node
            if (role === 'admin') {
                await this.database.ref(`admins/${user.uid}`).set({
                    email: email,
                    role: 'admin',
                    created: Date.now()
                });
            }

            return { success: true, user: user };
        } catch (error) {
            console.error('❌ User creation failed:', error);
            return { success: false, error: this.getErrorMessage(error) };
        }
    }

    onAuthStateChanged(callback) {
        this.authStateCallbacks.push(callback);
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
        document.getElementById('userRole').textContent = this.isAdmin ? 'ADMIN' : 'USER';
        
        // Show admin panel if user is admin
        if (this.isAdmin) {
            document.getElementById('adminPanel').classList.remove('hidden');
            document.getElementById('dashboardTitle').textContent = '👑 Admin Dashboard';
        } else {
            document.getElementById('adminPanel').classList.add('hidden');
            document.getElementById('dashboardTitle').textContent = '🏠 My Smart Home';
        }
    }

    getErrorMessage(error) {
        const errorMap = {
            'auth/user-not-found': 'User not found. Please check your email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/invalid-email': 'Invalid email address format.',
            'auth/email-already-in-use': 'Email address is already registered.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later.'
        };
        
        return errorMap[error.code] || error.message;
    }
}
