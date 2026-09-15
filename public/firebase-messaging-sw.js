
// This service worker handles background push notifications from Firebase Cloud Messaging.

// Import the Firebase scripts for the service worker
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Import the dynamic config served by our API route
// This is necessary because service workers cannot access environment variables directly.
importScripts('/api/firebase-config');

// Initialize the Firebase app in the service worker with the fetched config
if (typeof firebaseConfig !== 'undefined') {
    firebase.initializeApp(firebaseConfig);

    // Retrieve an instance of Firebase Messaging so that it can handle background messages.
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        console.log('[firebase-messaging-sw.js] Received background message ', payload);

        // Customize the notification that will be shown to the user
        const notificationTitle = payload.notification.title;
        const notificationOptions = {
            body: payload.notification.body,
            icon: payload.notification.icon || '/android-chrome-192x192.png', // A default icon
            data: {
                url: payload.data?.click_action || payload.data?.url || '/'
            }
        };

        // The self.registration.showNotification() method displays the notification
        return self.registration.showNotification(notificationTitle, notificationOptions);
    });

    // Handle notification click event
    self.addEventListener('notificationclick', (event) => {
        console.log('[firebase-messaging-sw.js] Notification clicked', event.notification.data);
        
        event.notification.close(); // Close the notification

        const urlToOpen = event.notification.data.url || '/';

        // Open the window or focus an existing one
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
                // Check if there is already a window open with this URL
                for (let i = 0; i < windowClients.length; i++) {
                    const client = windowClients[i];
                    if (client.url === urlToOpen && 'focus' in client) {
                        return client.focus();
                    }
                }
                // If no window is open, open a new one
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
        );
    });
} else {
    console.error("firebase-messaging-sw.js: firebaseConfig is not defined. Firebase could not be initialized. Was /api/firebase-config fetched correctly?");
}
