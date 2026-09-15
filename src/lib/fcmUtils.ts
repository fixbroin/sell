
"use client";

import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { app, db } from "./firebase"; // Ensure your firebase.ts exports 'app'
import { doc, setDoc, Timestamp, getDoc } from '@/lib/mysqlDb';
import type { MarketingSettings } from "@/types/firestore";
import { isWebView, sendPushNotificationData } from './webview-bridge'; // Import WebView bridge functions

let marketingSettingsCache: MarketingSettings | null = null;

// Function to fetch marketing settings (includes VAPID key and client config)
const getMarketingSettings = async (): Promise<MarketingSettings | null> => {
  if (marketingSettingsCache) return marketingSettingsCache;
  try {
    const settingsDocRef = doc(db, "webSettings", "marketingConfiguration");
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      marketingSettingsCache = docSnap.data() as MarketingSettings;
      return marketingSettingsCache;
    }
    console.warn("FCM Utils: Marketing settings not found in Firestore.");
    return null;
  } catch (error) {
    console.error("FCM Utils: Error fetching marketing settings:", error);
    return null;
  }
};

// Function to initialize Firebase Cloud Messaging and request permission
export const initializeFCM = async (userId?: string | null): Promise<string | null> => {
  if (typeof window === 'undefined' || !userId) {
    console.log("FCM Utils: Not in browser environment or no user ID, skipping FCM init.");
    return null;
  }

  const supported = await isSupported();
  if (!supported) {
    console.log("FCM Utils: Firebase Messaging is not supported in this browser.");
    return null;
  }

  const marketingSettings = await getMarketingSettings();
  if (!marketingSettings?.firebasePublicVapidKey) {
    console.warn("FCM Utils: VAPID key for FCM not found in marketing settings. Push notifications will not be enabled.");
    return null;
  }

  try {
    const messaging = getMessaging(app);

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      console.log("FCM Utils: Notification permission granted.");

      // Get token
      const fcmToken = await getToken(messaging, {
        vapidKey: marketingSettings.firebasePublicVapidKey,
      });

      if (fcmToken) {
        console.log("FCM Utils: Token received:", fcmToken);
        // Save token to Firestore
        const userDocRef = doc(db, "users", userId);
        // Store token in a subcollection or a map field. Using a map for simplicity here.
        await setDoc(userDocRef, {
          fcmTokens: {
            [fcmToken]: Timestamp.now()
          }
        }, { merge: true });
        console.log("FCM Utils: Token saved to Firestore for user:", userId);
        return fcmToken;
      } else {
        console.log("FCM Utils: No registration token available. Request permission to generate one.");
        return null;
      }
    } else {
      console.log("FCM Utils: Notification permission denied.");
      return null;
    }
  } catch (error) {
    console.error("FCM Utils: Error initializing FCM or getting token:", error);
    return null;
  }
};

// Listener for foreground messages (app is active tab)
export const onForegroundMessage = () => {
  if (typeof window === 'undefined' || !isSupported()) {
    return;
  }
  const messaging = getMessaging(app);
  onMessage(messaging, (payload) => {
    console.log("FCM Utils: Message received in foreground: ", payload);
    
    // Play custom sound based on notification type/data
    try {
      const soundFile = payload.data?.sound === 'order' ? '/sounds/order_sound.wav' : '/sounds/default-notification.mp3';
      const audio = new Audio(soundFile);
      audio.play().catch(e => console.warn("FCM Utils: Could not play notification sound:", e));
    } catch (soundErr) {
      console.error("FCM Utils: Sound play error:", soundErr);
    }

    // If in a WebView, send the data to the native app
    if (isWebView()) {
      sendPushNotificationData(payload);
      return; // Prevent showing the browser notification
    }

    // For regular browsers, show a standard notification
    if (payload.notification && typeof window !== 'undefined' && 'Notification' in window) {
      const notification = new Notification(payload.notification.title || "New Message", {
        body: payload.notification.body || "",
        icon: payload.notification.icon || "/android-chrome-192x192.png",
      });

      notification.onclick = (event) => {
        event.preventDefault(); // prevent the browser from focusing the Notification's tab
        const url = payload.data?.click_action || payload.data?.url || '/';
        window.focus();
        window.location.href = url;
        notification.close();
      };
    }
  });
};

/**
 * Triggers a push notification via the internal API.
 */
export const triggerPushNotification = async (params: {
  userId: string;
  title: string;
  body: string;
  href?: string;
  icon?: string;
  sound?: 'order' | 'default';
  type?: string;
  variables?: Record<string, string | number | undefined>;
}) => {
  try {
    const response = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return await response.json();
  } catch (error) {
    console.error("FCM Utils: Error triggering push notification:", error);
    return { error: "Failed to trigger push" };
  }
};
