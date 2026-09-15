
'use server';

import { adminDb } from './firebaseAdmin';
import { Timestamp } from './mysqlDbAdmin';
import type { GlobalWebSettings, ThemePalette, MarketingAutomationSettings, FirestoreSlide, ReferralSettings, FeaturesConfiguration } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { defaultGlobalWebSettings } from '@/config/webDefaults';
import { defaultAppSettings } from '@/config/appDefaults';
import { defaultMarketingValues } from '@/hooks/useMarketingSettings';
import type { ContentPage, FirestoreCategory, FirestoreSubCategory, FirestoreService, FirestoreTax, FirestoreCity, FirestoreArea, CityCategorySeoSetting, AreaCategorySeoSetting, AreaServiceSeoSetting } from '@/types/firestore';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

import { serializeFirestoreData } from './serializeUtils';

const WEB_SETTINGS_DOC_ID = "global";
const APP_CONFIG_DOC_ID = "applicationConfig";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";
const WEB_SETTINGS_COLLECTION = "webSettings";

/**
 * Fetches a content page by slug with caching.
 */
export const getContentPageData = cache(async (slug: string): Promise<ContentPage | null> => {
  return unstable_cache(
    async () => {
      try {
        const pageDocRef = adminDb.collection("contentPages").doc(slug);
        const docSnap = await pageDocRef.get();
        if (docSnap.exists) {
          const data = docSnap.data();
          return { ...serializeFirestoreData(data), id: docSnap.id } as ContentPage;
        }
        return null;
      } catch (error) {
        console.error(`Error fetching content page for slug "${slug}":`, error);
        return null;
      }
    },
    [`content-page-${slug}`],
    { revalidate: false, tags: ['content', `content-${slug}`, 'global-cache'] }
  )();
});

/**
 * Fetches marketing settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getMarketingSettings = cache(async (): Promise<any> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc(MARKETING_CONFIG_DOC_ID).get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          return serializeFirestoreData({
            ...defaultMarketingValues,
            ...data,
          });
        }
        return defaultMarketingValues;
      } catch (error) {
        console.error('Error fetching marketing settings via Admin SDK:', error);
        return defaultMarketingValues;
      }
    },
    ['marketing-settings'],
    { 
      revalidate: 86400, 
      tags: ['marketing-settings', 'global-cache'] 
    }
  )();
});

/**
 * Fetches marketing automation settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getMarketingAutomationSettings = cache(async (): Promise<MarketingAutomationSettings | null> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc('marketingAutomation').get();
        if (docSnap.exists) {
          return serializeFirestoreData(docSnap.data()) as MarketingAutomationSettings;
        }
        return null;
      } catch (error) {
        console.error('Error fetching marketing automation settings via Admin SDK:', error);
        return null;
      }
    },
    ['marketing-automation-settings'],
    { 
      revalidate: 86400, 
      tags: ['marketing-settings', 'global-cache'] 
    }
  )();
});

/**
 * Fetches global app settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getGlobalAppSettings = cache(async (): Promise<any> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc(APP_CONFIG_DOC_ID).get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          return serializeFirestoreData({
            ...defaultAppSettings,
            ...data,
          });
        }
        return defaultAppSettings;
      } catch (error) {
        console.error('Error fetching global app settings via Admin SDK:', error);
        return defaultAppSettings;
      }
    },
    ['global-app-settings'],
    { 
      revalidate: 86400, 
      tags: ['app-settings', 'global-cache'] 
    }
  )();
});

/**
 * Fetches global web settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getGlobalWebSettings = cache(async (): Promise<GlobalWebSettings> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection(WEB_SETTINGS_COLLECTION).doc(WEB_SETTINGS_DOC_ID).get();
        if (docSnap.exists) {
          const data = docSnap.data() as Partial<GlobalWebSettings>;
          
          const mergedLightPalette: Required<ThemePalette> = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
          THEME_PALETTE_KEYS.forEach(key => {
            if (data.themeColors?.light?.[key]) {
              (mergedLightPalette[key] as any) = data.themeColors.light[key];
            }
          });

          const mergedDarkPalette: Required<ThemePalette> = { ...DEFAULT_DARK_THEME_COLORS_HSL };
          THEME_PALETTE_KEYS.forEach(key => {
            if (data.themeColors?.dark?.[key]) {
              (mergedDarkPalette[key] as any) = data.themeColors.dark[key];
            }
          });

          return serializeFirestoreData({
            ...defaultGlobalWebSettings,
            ...data,
            themeColors: {
              light: mergedLightPalette,
              dark: mergedDarkPalette,
            },
            socialMediaLinks: {
              ...defaultGlobalWebSettings.socialMediaLinks,
              ...(data.socialMediaLinks || {}),
            },
            globalAdminPopup: {
              ...defaultGlobalWebSettings.globalAdminPopup,
              ...(data.globalAdminPopup || {}),
            },
          }) as GlobalWebSettings;
        }
        return defaultGlobalWebSettings;
      } catch (error) {
        console.error('Error fetching global web settings via Admin SDK:', error);
        return defaultGlobalWebSettings;
      }
    },
    ['global-web-settings'],
    { 
      revalidate: 86400, 
      tags: ['web-settings', 'global-cache'] 
    }
  )();
});

/**
 * Assigns a sequential user number to a new user and increments the counter.
 * Uses a transaction to ensure atomicity.
 */
export async function assignNewUserNumber() {
  const statsRef = adminDb.collection('appConfiguration').doc('stats');
  
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      let nextNumber = 1;
      
      if (statsDoc.exists) {
        const data = statsDoc.data();
        if (data && data.lastUserNumber !== undefined) {
          nextNumber = data.lastUserNumber + 1;
        }
      }
      
      transaction.set(statsRef, { 
        lastUserNumber: nextNumber,
        updatedAt: Timestamp.now() 
      }, { merge: true });
      
      return nextNumber;
    });
    
    return result;
  } catch (error) {
    console.error("Error assigning new user number:", error);
    // Fallback: use timestamp if transaction fails (less ideal but better than crash)
    return Math.floor(Date.now() / 1000);
  }
}

/**
 * Assigns a sequential booking number to a new booking and increments the counter.
 * Uses a transaction to ensure atomicity.
 */
export async function assignNewBookingNumber() {
  const statsRef = adminDb.collection('appConfiguration').doc('stats');
  
  try {
    const result = await adminDb.runTransaction(async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      let nextNumber = 1;
      
      if (statsDoc.exists) {
        const data = statsDoc.data();
        if (data && data.lastBookingNumber !== undefined) {
          nextNumber = data.lastBookingNumber + 1;
        }
      }
      
      transaction.set(statsRef, { 
        lastBookingNumber: nextNumber,
        updatedAt: Timestamp.now() 
      }, { merge: true });
      
      return nextNumber;
    });
    
    return result;
  } catch (error) {
    console.error("Error assigning new booking number:", error);
    // Fallback: use timestamp if transaction fails (less ideal but better than crash)
    return Math.floor(Date.now() / 1000);
  }
}

/**
 * Fetches all admin categories with caching.
 */
export const getAdminCategories = cache(async (): Promise<FirestoreCategory[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("adminCategories").orderBy("order", "asc").get();
        return snapshot.docs.map(doc => ({ ...serializeFirestoreData(doc.data()), id: doc.id } as FirestoreCategory));
      } catch (error) {
        console.error("Error fetching admin categories:", error);
        return [];
      }
    },
    ['admin-categories-full'],
    { revalidate: 86400, tags: ['categories', 'global-cache'] }
  )();
});

/**
 * Fetches all admin sub-categories with caching.
 */
export const getAdminSubCategories = cache(async (): Promise<FirestoreSubCategory[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("adminSubCategories").orderBy("order", "asc").get();
        return snapshot.docs.map(doc => ({ ...serializeFirestoreData(doc.data()), id: doc.id } as FirestoreSubCategory));
      } catch (error) {
        console.error("Error fetching admin sub-categories:", error);
        return [];
      }
    },
    ['admin-subcategories-full'],
    { revalidate: 86400, tags: ['categories', 'global-cache'] }
  )();
});

/**
 * Fetches all admin services with caching.
 */
export const getAdminServices = cache(async (): Promise<FirestoreService[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("adminServices").orderBy("name", "asc").get();
        return snapshot.docs.map(doc => ({ ...serializeFirestoreData(doc.data()), id: doc.id } as FirestoreService));
      } catch (error) {
        console.error("Error fetching admin services:", error);
        return [];
      }
    },
    ['admin-services-full'],
    { revalidate: false, tags: ['services', 'global-cache'] }
  )();
});

/**
 * Fetches all taxes with caching.
 */
export const getTaxes = cache(async (): Promise<FirestoreTax[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("taxes").get();
        return snapshot.docs.map(doc => ({ ...serializeFirestoreData(doc.data()), id: doc.id } as FirestoreTax));
      } catch (error) {
        console.error("Error fetching taxes:", error);
        return [];
      }
    },
    ['taxes-full'],
    { revalidate: false, tags: ['taxes', 'global-cache'] }
  )();
});

/**
 * Fetches all cities with caching.
 */
export const getCities = cache(async (): Promise<FirestoreCity[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("cities").orderBy("name", "asc").get();
        return snapshot.docs.map(doc => ({ ...serializeFirestoreData(doc.data()), id: doc.id } as FirestoreCity));
      } catch (error) {
        console.error("Error fetching cities:", error);
        return [];
      }
    },
    ['cities-full-list'],
    { revalidate: false, tags: ['locations', 'global-cache'] }
  )();
});

/**
 * Fetches all areas with caching.
 */
export const getAreas = cache(async (): Promise<FirestoreArea[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("areas").orderBy("name", "asc").get();
        return snapshot.docs.map(doc => ({ ...serializeFirestoreData(doc.data()), id: doc.id } as FirestoreArea));
      } catch (error) {
        console.error("Error fetching areas:", error);
        return [];
      }
    },
    ['areas-full-list'],
    { revalidate: false, tags: ['locations', 'global-cache'] }
  )();
});

/**
 * Fetches all City-Category SEO settings with caching.
 */
export const getCityCategorySeoSettings = cache(async (): Promise<CityCategorySeoSetting[]> => {
  try {
    const snapshot = await adminDb.collection("cityCategorySeoSettings").orderBy("cityName").orderBy("categoryName").get();
    return snapshot.docs.map(doc => {
      const data = serializeFirestoreData(doc.data()) as any;
      delete data.seo_content;
      delete data.faqs;
      return { ...data, id: doc.id } as CityCategorySeoSetting;
    });
  } catch (error) {
    console.error("Error fetching city-category SEO settings:", error);
    return [];
  }
});

/**
 * Fetches all Area-Category SEO settings with caching.
 */
export const getAreaCategorySeoSettings = cache(async (): Promise<AreaCategorySeoSetting[]> => {
  try {
    const snapshot = await adminDb.collection("areaCategorySeoSettings").orderBy("cityName").orderBy("areaName").orderBy("categoryName").get();
    return snapshot.docs.map(doc => {
      const data = serializeFirestoreData(doc.data()) as any;
      delete data.seo_content;
      delete data.faqs;
      return { ...data, id: doc.id } as AreaCategorySeoSetting;
    });
  } catch (error) {
    console.error("Error fetching area-category SEO settings:", error);
    return [];
  }
});

/**
 * Fetches all Area-Service SEO settings with caching.
 */
export const getAreaServiceSeoSettings = cache(async (): Promise<AreaServiceSeoSetting[]> => {
  try {
    const snapshot = await adminDb.collection("areaServiceSeoSettings").get();
    const settings = snapshot.docs.map(doc => {
      const data = serializeFirestoreData(doc.data()) as any;
      delete data.seo_content;
      delete data.faqs;
      return { ...data, id: doc.id } as AreaServiceSeoSetting;
    });
    
    // Sort in memory to avoid requiring a Firestore composite index
    settings.sort((a, b) => {
      const cityComp = (a.cityName || '').localeCompare(b.cityName || '');
      if (cityComp !== 0) return cityComp;
      const areaComp = (a.areaName || '').localeCompare(b.areaName || '');
      if (areaComp !== 0) return areaComp;
      return (a.serviceName || '').localeCompare(b.serviceName || '');
    });
    
    return settings;
  } catch (error) {
    console.error("Error fetching area-service SEO settings:", error);
    return [];
  }
});

/**
 * Fetches the cache versions document from Firestore with real-time accuracy.
 */
export const getRemoteCacheVersionsServer = cache(async (): Promise<any> => {
  try {
    const docSnap = await adminDb.collection("appConfiguration").doc("cacheVersions").get();
    if (docSnap.exists) {
      return serializeFirestoreData(docSnap.data() || {});
    }
    return {};
  } catch (error) {
    console.error("Error fetching cache versions via Admin SDK:", error);
    return {};
  }
});

/**
 * Fetches referral configuration settings from Firestore with caching.
 */
export const getReferralSettingsServer = cache(async (): Promise<ReferralSettings | null> => {
  return unstable_cache(
    async () => {
      try {
        const docSnap = await adminDb.collection("appConfiguration").doc("referral").get();
        if (docSnap.exists) {
          return serializeFirestoreData(docSnap.data()) as ReferralSettings;
        }
        return null;
      } catch (error) {
        console.error("Error fetching referral settings via Admin SDK:", error);
        return null;
      }
    },
    ['server-referral-settings'],
    { revalidate: 86400, tags: ['withdrawal-referral-config', 'global-cache'] }
  )();
});

/**
 * Fetches active slideshow slides from Firestore with caching.
 */
export const getHeroSlidesServer = cache(async (): Promise<FirestoreSlide[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("adminSlideshows")
          .where("isActive", "==", true)
          .orderBy("order", "asc")
          .get();
        return snapshot.docs.map(doc => ({
          ...serializeFirestoreData(doc.data() as any),
          id: doc.id
        } as FirestoreSlide));
      } catch (error) {
        console.error("Error fetching hero slides via Admin SDK:", error);
        return [];
      }
    },
    ['server-hero-slides'],
    { revalidate: 86400, tags: ['content', 'global-cache'] }
  )();
});

/**
 * Fetches features configuration settings from Firestore with caching.
 */
export const getFeaturesConfigServer = cache(async (): Promise<FeaturesConfiguration> => {
  return unstable_cache(
    async () => {
      const defaultFeaturesConfig: FeaturesConfiguration = {
        showMostPopularServices: true,
        showRecentlyAddedServices: true,
        showCategoryWiseServices: true,
        showBlogSection: true,
        showCustomServiceButton: false,
        homepageCategoryVisibility: {},
        ads: [],
      };
      try {
        const docSnap = await adminDb.collection("webSettings").doc("featuresConfiguration").get();
        if (docSnap.exists) {
          return serializeFirestoreData({
            ...defaultFeaturesConfig,
            ...docSnap.data(),
          }) as FeaturesConfiguration;
        }
        return defaultFeaturesConfig;
      } catch (error) {
        console.error("Error fetching features config via Admin SDK:", error);
        return defaultFeaturesConfig;
      }
    },
    ['server-features-config'],
    { revalidate: 86400, tags: ['web-settings', 'global-cache'] }
  )();
});

/**
 * Fetches active FAQs from Firestore with caching.
 */
export const getFaqsServer = cache(async (): Promise<any[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection("adminFAQs").where("isActive", "==", true).get();
        const faqs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as any));
        return serializeFirestoreData(
          faqs.sort((a, b) => (a.order || 0) - (b.order || 0))
        );
      } catch (err) {
        console.error("Error fetching FAQs:", err);
        return [];
      }
    },
    ['server-admin-faqs'],
    { revalidate: 86400, tags: ['faqs', 'global-cache'] }
  )();
});

const getTimestampString = (timestamp: any): string => {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  if (typeof timestamp === 'number') return new Date(timestamp).toISOString();
  if (timestamp._seconds !== undefined) return new Date(timestamp._seconds * 1000).toISOString();
  if (timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000).toISOString();
  if (timestamp.toDate && typeof timestamp.toDate === 'function') return timestamp.toDate().toISOString();
  const date = new Date(timestamp);
  return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

/**
 * Fetches published blog posts from Firestore with caching.
 */
export const getPublishedPostsServer = cache(async (): Promise<any[]> => {
  return unstable_cache(
    async () => {
      try {
        const snapshot = await adminDb.collection('blogPosts').get();
        const posts = snapshot.docs
          .map(doc => {
            const data = serializeFirestoreData(doc.data()) as any;
            return {
              ...data,
              id: doc.id,
              createdAt: getTimestampString(data.createdAt),
              updatedAt: data.updatedAt ? getTimestampString(data.updatedAt) : undefined,
            };
          })
          .filter(post => post.isPublished === true)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        return posts;
      } catch (error) {
        console.error("Error fetching blog posts:", error);
        return [];
      }
    },
    ['server-published-blog-posts'],
    { revalidate: 86400, tags: ['blog', 'global-cache'] }
  )();
});

