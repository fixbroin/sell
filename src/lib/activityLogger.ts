
import { db } from '@/lib/firebase';
import { collection, Timestamp, doc, setDoc, getDoc } from '@/lib/mysqlDb'; 
import type { UserActivity, UserActivityEventType, UserActivityEventData, FeaturesConfiguration } from '@/types/firestore';

// Helper function to remove undefined properties from an object recursively
const removeUndefinedProps = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefinedProps);
  } else if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = removeUndefinedProps(value);
      }
      return acc;
    }, {} as Record<string, any>);
  }
  return obj;
};

// Simple cache for logging enabled state to avoid excessive Firestore reads
let isLoggingEnabledCache: boolean | null = null;
let isProviderLoggingEnabledCache: boolean | null = null;
let lastCacheUpdate: number = 0;
let lastProviderCacheUpdate: number = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const isBot = (): boolean => {
    if (typeof window === 'undefined') return true;
    const botPatterns = [
        'bot', 'crawler', 'spider', 'crawling', 'googlebot', 'bingbot', 'yandexbot', 
        'slurp', 'duckduckbot', 'baiduspider', 'adsbot', 'mediapartners-google',
        'lighthouse', 'gtmetrix', 'pingdom', 'facebookexternalhit', 'whatsapp', 'linkedinbot'
    ];
    const ua = navigator.userAgent.toLowerCase();
    return botPatterns.some(pattern => ua.includes(pattern));
};

const checkIsLoggingEnabled = async (isProvider: boolean): Promise<boolean> => {
    // If it's a bot, we don't even care if logging is enabled, we skip it
    if (isBot()) return false;

    const cacheKey = isProvider ? 'fb-provider-logging-enabled' : 'fb-logging-enabled';

    // Check session storage first for client-side persistence
    if (typeof window !== 'undefined') {
        try {
            const sessionCache = sessionStorage.getItem(cacheKey);
            if (sessionCache !== null) {
                return sessionCache === 'true';
            }
        } catch (e) {}
    }

    const now = Date.now();
    const cacheVal = isProvider ? isProviderLoggingEnabledCache : isLoggingEnabledCache;
    const cacheTime = isProvider ? lastProviderCacheUpdate : lastCacheUpdate;
    if (cacheVal !== null && (now - cacheTime < CACHE_TTL)) {
        return cacheVal;
    }

    try {
        const configDocRef = doc(db, 'webSettings', 'featuresConfiguration');
        const docSnap = await getDoc(configDocRef);
        let isEnabled = true;
        if (docSnap.exists()) {
            const data = docSnap.data() as FeaturesConfiguration;
            if (isProvider) {
                isEnabled = data.enableProviderActivityLogging !== false;
            } else {
                isEnabled = data.enableUserActivityLogging !== false;
            }
        }
        
        if (isProvider) {
            isProviderLoggingEnabledCache = isEnabled;
            lastProviderCacheUpdate = now;
        } else {
            isLoggingEnabledCache = isEnabled;
            lastCacheUpdate = now;
        }

        if (typeof window !== 'undefined') {
            try { sessionStorage.setItem(cacheKey, String(isEnabled)); } catch (e) {}
        }

        return isEnabled;
    } catch (error) {
        console.error("ActivityLogger: Error checking enabled state:", error);
        return true; 
    }
};

import { triggerRefresh } from './revalidateUtils';

export const logUserActivity = async (
  eventType: UserActivityEventType,
  eventData: UserActivityEventData,
  userId?: string | null,
  guestId?: string | null,
  userDisplayName?: string | null
): Promise<void> => {
  if (!userId && !guestId) {
    return;
  }

  const isProviderActivity = !!(eventType.startsWith('provider') || 
                                eventData?.pageUrl?.startsWith('/provider') || 
                                eventData?.pageUrl?.includes('/provider'));

  // Check if logging is enabled in Admin Panel
  const isEnabled = await checkIsLoggingEnabled(isProviderActivity);
  if (!isEnabled) {
      return;
  }

  try {
    // Denormalize: Include name directly to save reads later
    let finalDisplayName = userDisplayName || eventData.fullName || eventData.customerName;
    
    if (!finalDisplayName) {
        finalDisplayName = userId ? "Registered User" : "Guest User";
    }

    const activityData: any = {
      userId: userId || null,
      guestId: guestId || null,
      userDisplayName: finalDisplayName,
      eventType,
      eventData: removeUndefinedProps(eventData),
      timestamp: Timestamp.now(),
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'server',
    };

    const userActivitiesCollectionRef = collection(db, 'userActivities');
    const newActivityDocRef = doc(userActivitiesCollectionRef);
    await setDoc(newActivityDocRef, activityData);

    // Also log out-of-coverage requests to a separate dedicated collection
    if (eventType === 'checkoutStep' && eventData?.checkoutStepName === 'out_of_coverage') {
      try {
        const outOfZoneCollectionRef = collection(db, 'outOfZoneRequests');
        const newOutOfZoneDocRef = doc(outOfZoneCollectionRef);
        await setDoc(newOutOfZoneDocRef, activityData);
      } catch (err) {
        console.error('Error copying out-of-coverage request to outOfZoneRequests collection:', err);
      }
    }

    // Smart Sync: If it's a major event, tell the server to refresh the activity cache
    if (['newBooking', 'newUser', 'userLogin'].includes(eventType)) {
        await triggerRefresh('users');
    }

  } catch (error) {
    // Log the raw error object first for better inspection in browser console
    console.error('Raw error object from Firestore setDoc in activityLogger:', error);
    
    // Then log the structured error message
    console.error(
      'Error logging user activity to Firestore (using setDoc):', 
      JSON.stringify({ 
        error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack?.substring(0, 500) } : String(error), 
        eventType, 
        // Ensure eventData is serializable and not too large for logs
        eventData: typeof eventData === 'object' ? JSON.parse(JSON.stringify(eventData, (key, value) => 
          typeof value === 'string' && value.length > 100 ? value.substring(0,100) + '...' : value
        )) : eventData,
        userId, 
        guestId 
      }, null, 2)
    );
  }
};
