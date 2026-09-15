import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { adminDb } from "./mysqlDbAdmin";

// Load full service account JSON from environment
const serviceAccountJson = process.env.FIREBASE_ADMIN_SDK_CONFIG;

if (!serviceAccountJson) {
  throw new Error("FIREBASE_ADMIN_SDK_CONFIG is missing in environment variables.");
}

// Parse JSON string into object
const serviceAccount = JSON.parse(serviceAccountJson);

// Initialize app only once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
    }),
  });
}

export const adminAuth = getAuth();
export { adminDb };

