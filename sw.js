// Basic service worker for ESP32 Home Automation Dashboard
const CACHE_NAME = 'esp32-dashboard-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles.css',
    '/config.js',
    '/auth.js',
    '/dashboard.js',
    '/admin.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Cache opened');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            })
    );
});
