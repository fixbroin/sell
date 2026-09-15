// src/lib/firebase-admin.ts
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';

let adminApp: App;

export function initFirebaseAdmin() {
  // Check if an app is already initialized to prevent re-initialization error
  if (getApps().length === 0) {
    const serviceAccountString = process.env.FIREBASE_ADMIN_SDK_CONFIG;

    if (!serviceAccountString) {
      console.error("FIREBASE_ADMIN_SDK_CONFIG env variable is not set. Cannot initialize Firebase Admin SDK.");
      // In a real scenario, you might want to throw an error or handle this case differently
      // depending on whether the admin SDK is strictly required for the operation.
      return; 
    }

    try {
      const serviceAccount = JSON.parse(serviceAccountString);
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        // Add other admin config if needed, e.g., databaseURL
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      console.error('Error initializing Firebase Admin SDK:', error);
      // This will cause subsequent operations using adminApp to fail, which is intended.
    }
  } else {
    adminApp = getApps()[0];
  }
}
