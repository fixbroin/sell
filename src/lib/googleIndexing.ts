// src/lib/googleIndexing.ts
'use server';

import { google } from 'googleapis';
import { adminDb } from './firebaseAdmin';
import { getBaseUrl } from './config';
import { Timestamp } from './mysqlDbAdmin';

/**
 * Parses the service account config from the environment and initializes Google authentication.
 */
const getGoogleAuth = () => {
  const credentialsString = process.env.FIREBASE_ADMIN_SDK_CONFIG;
  if (!credentialsString) {
    throw new Error("FIREBASE_ADMIN_SDK_CONFIG environment variable is not defined.");
  }
  const credentials = JSON.parse(credentialsString);
  
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
    },
    scopes: ['https://www.googleapis.com/auth/indexing'],
  });
};

/**
 * Calls the Google Indexing API to notify Google of updated or deleted URLs.
 */
export async function notifyGoogleIndexing(urls: string[], action: 'URL_UPDATED' | 'URL_DELETED') {
  try {
    const auth = getGoogleAuth();
    const indexer = google.indexing({ version: 'v3', auth });
    
    console.log(`[Google Indexing] Sending ${action} notification for ${urls.length} URLs...`);
    
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await indexer.urlNotifications.publish({
            requestBody: {
              url: url,
              type: action,
            },
          });
          console.log(`[Google Indexing] Successfully submitted ${url} (${action})`);
          return { url, success: true, response: response.data };
        } catch (err: any) {
          console.error(`[Google Indexing] Failed to submit ${url}:`, err.message || err);
          return { url, success: false, error: err.message || String(err) };
        }
      })
    );
    return results;
  } catch (error: any) {
    console.error("[Google Indexing] API client initialization failed:", error.message || error);
    return [];
  }
}

/**
 * Resolves all affected URLs for a given entity type and submits them to Google Indexing.
 * 
 * @param type The type of entity updated
 * @param identifier The unique slug, ID, or parameters describing the item.
 * @param isActive Determines if the URLs should be marked as updated or deleted.
 */
export async function submitToGoogleIndexing(
  type: 'service' | 'category' | 'city' | 'area' | 'area-service' | 'blog' | 'city-category' | 'area-category',
  identifier: any,
  isActive: boolean = true
) {
  const baseUrl = getBaseUrl() || 'https://yourdomain';
  const urls: string[] = [];
  const action = isActive ? 'URL_UPDATED' : 'URL_DELETED';

  try {
    if (type === 'service') {
      const slug = identifier as string;
      if (!slug) return [];
      urls.push(`${baseUrl}/service/${slug}`);
      
      // Fetch all localized area-service combinations
      const seoSettings = await adminDb
        .collection('areaServiceSeoSettings')
        .where('serviceSlug', '==', slug)
        .where('isActive', '==', true)
        .get();
        
      seoSettings.forEach(doc => {
        const data = doc.data();
        if (data.citySlug && data.areaSlug) {
          urls.push(`${baseUrl}/${data.citySlug}/${data.areaSlug}/service/${slug}`);
        }
      });
      
    } else if (type === 'category') {
      const slug = identifier as string;
      if (!slug) return [];
      urls.push(`${baseUrl}/category/${slug}`);
      
      // Fetch all active cities
      const citiesSnapshot = await adminDb.collection('cities').where('isActive', '==', true).get();
      const cities = citiesSnapshot.docs.map(d => ({ id: d.id, slug: d.data().slug }));
      
      for (const city of cities) {
        if (city.slug) {
          urls.push(`${baseUrl}/${city.slug}/category/${slug}`);
          
          // Fetch areas for this city
          const areasSnapshot = await adminDb
            .collection('areas')
            .where('cityId', '==', city.id)
            .where('isActive', '==', true)
            .get();
            
          areasSnapshot.forEach(areaDoc => {
            const areaSlug = areaDoc.data().slug;
            if (areaSlug) {
              urls.push(`${baseUrl}/${city.slug}/${areaSlug}/${slug}`);
            }
          });
        }
      }
      
    } else if (type === 'city') {
      const citySlug = identifier as string;
      if (!citySlug) return [];
      urls.push(`${baseUrl}/${citySlug}`);
      
      // Fetch city document by slug to resolve areas
      const cityQuery = await adminDb.collection('cities').where('slug', '==', citySlug).limit(1).get();
      if (!cityQuery.empty) {
        const cityId = cityQuery.docs[0].id;
        
        // Fetch active categories
        const categoriesSnapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).get();
        const categories = categoriesSnapshot.docs.map(d => d.data().slug).filter(Boolean);
        
        categories.forEach(catSlug => {
          urls.push(`${baseUrl}/${citySlug}/category/${catSlug}`);
        });
        
        // Fetch areas for this city
        const areasSnapshot = await adminDb.collection('areas').where('cityId', '==', cityId).where('isActive', '==', true).get();
        const areas = areasSnapshot.docs.map(d => d.data().slug).filter(Boolean);
        
        areas.forEach(areaSlug => {
          urls.push(`${baseUrl}/${citySlug}/${areaSlug}`);
          categories.forEach(catSlug => {
            urls.push(`${baseUrl}/${citySlug}/${areaSlug}/${catSlug}`);
          });
        });
      }
      
    } else if (type === 'area') {
      const areaId = identifier as string;
      if (!areaId) return [];
      const areaDoc = await adminDb.collection('areas').doc(areaId).get();
      if (areaDoc.exists) {
        const areaData = areaDoc.data();
        if (areaData && areaData.slug && areaData.cityId) {
          const areaSlug = areaData.slug;
          const cityDoc = await adminDb.collection('cities').doc(areaData.cityId).get();
          if (cityDoc.exists) {
            const citySlug = cityDoc.data()?.slug;
            if (citySlug) {
              urls.push(`${baseUrl}/${citySlug}/${areaSlug}`);
              
              // Fetch categories
              const categoriesSnapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).get();
              categoriesSnapshot.forEach(catDoc => {
                const catSlug = catDoc.data().slug;
                if (catSlug) {
                  urls.push(`${baseUrl}/${citySlug}/${areaSlug}/${catSlug}`);
                }
              });
            }
          }
        }
      }
      
    } else if (type === 'area-service') {
      const { citySlug, areaSlug, serviceSlug } = identifier as { citySlug: string; areaSlug: string; serviceSlug: string };
      if (citySlug && areaSlug && serviceSlug) {
        urls.push(`${baseUrl}/${citySlug}/${areaSlug}/service/${serviceSlug}`);
      }
      
    } else if (type === 'blog') {
      const slug = identifier as string;
      if (!slug) return [];
      urls.push(`${baseUrl}/blog/${slug}`);
      
    } else if (type === 'city-category') {
      const { citySlug, categorySlug } = identifier as { citySlug: string; categorySlug: string };
      if (citySlug && categorySlug) {
        urls.push(`${baseUrl}/${citySlug}/category/${categorySlug}`);
      }
      
    } else if (type === 'area-category') {
      const { citySlug, areaSlug, categorySlug } = identifier as { citySlug: string; areaSlug: string; categorySlug: string };
      if (citySlug && areaSlug && categorySlug) {
        urls.push(`${baseUrl}/${citySlug}/${areaSlug}/${categorySlug}`);
      }
    }

    if (urls.length > 0) {
      console.log(`[Google Indexing API] Triggering indexing for ${urls.length} URLs:`, urls);
      return await notifyGoogleIndexing(urls, action);
    }
  } catch (err: any) {
    console.error("[Google Indexing API] Error in submitToGoogleIndexing server action:", err.message || err);
  }
  return [];
}

export async function runBulkIndexingBatch() {
  const baseUrl = getBaseUrl() || 'https://yourdomain';
  const urls: string[] = [];

  // 1. Static Pages
  const staticPages = [
    '', '/about-us', '/contact-us', '/careers', '/terms-and-conditions',
    '/privacy-policy', '/faq', '/service-disclaimer', '/cancellation-policy',
    '/damage-and-claims-policy', '/categories', '/blog', '/sitemap', '/near-me'
  ];
  staticPages.forEach(p => urls.push(`${baseUrl}${p}`));

  // 2. Fetch Categories
  const categoriesSnapshot = await adminDb.collection('adminCategories').where('isActive', '==', true).get();
  const categories: Array<{ id: string, slug: string }> = [];
  categoriesSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      categories.push({ id: doc.id, slug: data.slug });
      urls.push(`${baseUrl}/category/${data.slug}`);
    }
  });

  // 3. Fetch Services
  const servicesSnapshot = await adminDb.collection('adminServices').where('isActive', '==', true).get();
  servicesSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      urls.push(`${baseUrl}/service/${data.slug}`);
    }
  });

  // 4. Fetch Cities & Areas
  const citiesSnapshot = await adminDb.collection('cities').where('isActive', '==', true).get();
  const cities: Array<{ id: string, slug: string }> = [];
  citiesSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      cities.push({ id: doc.id, slug: data.slug });
      urls.push(`${baseUrl}/${data.slug}`);
    }
  });

  for (const city of cities) {
    // City Categories
    categories.forEach(cat => {
      urls.push(`${baseUrl}/${city.slug}/category/${cat.slug}`);
    });

    // Fetch Areas for this city
    const areasSnapshot = await adminDb.collection('areas')
      .where('cityId', '==', city.id)
      .where('isActive', '==', true)
      .get();
      
    areasSnapshot.forEach(doc => {
      const areaData = doc.data();
      if (areaData.slug) {
        urls.push(`${baseUrl}/${city.slug}/${areaData.slug}`);
        // Area Categories
        categories.forEach(cat => {
          urls.push(`${baseUrl}/${city.slug}/${areaData.slug}/${cat.slug}`);
        });
      }
    });
  }

  // 5. Fetch Area-Service SEO overrides
  const serviceSeoSnapshot = await adminDb.collection('areaServiceSeoSettings').where('isActive', '==', true).get();
  serviceSeoSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.citySlug && data.areaSlug && data.serviceSlug) {
      urls.push(`${baseUrl}/${data.citySlug}/${data.areaSlug}/service/${data.serviceSlug}`);
    }
  });

  // 6. Fetch Blogs
  const blogSnapshot = await adminDb.collection('blogPosts').where('isPublished', '==', true).get();
  blogSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      urls.push(`${baseUrl}/blog/${data.slug}`);
    }
  });

  // 7. Fetch City-Category SEO overrides
  const cityCategorySeoSnapshot = await adminDb.collection('cityCategorySeoSettings').where('isActive', '==', true).get();
  cityCategorySeoSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.citySlug && data.categorySlug) {
      urls.push(`${baseUrl}/${data.citySlug}/category/${data.categorySlug}`);
    }
  });

  // 8. Fetch Area-Category SEO overrides
  const areaCategorySeoSnapshot = await adminDb.collection('areaCategorySeoSettings').where('isActive', '==', true).get();
  areaCategorySeoSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.citySlug && data.areaSlug && data.categorySlug) {
      urls.push(`${baseUrl}/${data.citySlug}/${data.areaSlug}/${data.categorySlug}`);
    }
  });

  const uniqueUrls = [...new Set(urls)];

  const progressSnapshot = await adminDb.collection('indexingProgress').get();
  const submittedUrls = new Set<string>();
  progressSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.url && data.success) {
      submittedUrls.add(data.url);
    }
  });

  const pendingUrls = uniqueUrls.filter(url => !submittedUrls.has(url));

  return {
    uniqueUrls,
    submittedUrls: Array.from(submittedUrls),
    pendingUrls
  };
}

export async function triggerBulkIndexingBatch() {
  try {
    const { uniqueUrls, pendingUrls } = await runBulkIndexingBatch();
    
    if (pendingUrls.length === 0) {
      // Mark complete
      await adminDb.collection('appConfiguration').doc('indexingStatus').set({
        isBulkIndexingComplete: true,
        updatedAt: Timestamp.now()
      }, { merge: true });

      return {
        success: true,
        submittedCount: 0,
        successCount: 0,
        failureCount: 0,
        remainingPending: 0,
        totalUrls: uniqueUrls.length,
        message: 'All pages are already indexed!'
      };
    }

    const BATCH_LIMIT = 180;
    const batch = pendingUrls.slice(0, BATCH_LIMIT);

    const results = await notifyGoogleIndexing(batch, 'URL_UPDATED');

    const batchDbWriter = adminDb.batch();
    results.forEach(res => {
      const docId = Buffer.from(res.url).toString('base64url');
      const docRef = adminDb.collection('indexingProgress').doc(docId);
      
      batchDbWriter.set(docRef, {
        url: res.url,
        success: res.success,
        submittedAt: Timestamp.now(),
        error: res.error || null
      }, { merge: true });
    });

    await batchDbWriter.commit();

    const successCount = results.filter(r => r.success).length;

    // Check if that was the last batch
    if (pendingUrls.length <= BATCH_LIMIT) {
      await adminDb.collection('appConfiguration').doc('indexingStatus').set({
        isBulkIndexingComplete: true,
        updatedAt: Timestamp.now()
      }, { merge: true });
    }

    return {
      success: true,
      submittedCount: batch.length,
      successCount: successCount,
      failureCount: batch.length - successCount,
      remainingPending: Math.max(0, pendingUrls.length - batch.length),
      totalUrls: uniqueUrls.length
    };
  } catch (error: any) {
    console.error("[Indexing Action] Trigger failed:", error.message || error);
    return {
      success: false,
      error: error.message || String(error)
    };
  }
}

export async function getIndexingStatus() {
  try {
    const { uniqueUrls, submittedUrls, pendingUrls } = await runBulkIndexingBatch();
    
    const statusDoc = await adminDb.collection('appConfiguration').doc('indexingStatus').get();
    const isBulkIndexingComplete = statusDoc.exists ? (statusDoc.data()?.isBulkIndexingComplete === true) : false;

    const recentSnapshot = await adminDb.collection('indexingProgress')
      .orderBy('submittedAt', 'desc')
      .limit(20)
      .get();
      
    const recentSubmissions = recentSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        url: data.url,
        success: data.success,
        submittedAt: data.submittedAt ? (data.submittedAt as Timestamp).toDate().toISOString() : null,
        error: data.error || null
      };
    });

    return {
      success: true,
      totalUrls: uniqueUrls.length,
      submittedCount: submittedUrls.length,
      pendingCount: pendingUrls.length,
      isBulkIndexingComplete,
      recentSubmissions
    };
  } catch (error: any) {
    console.error("[Indexing Action] Failed to fetch status:", error.message || error);
    return {
      success: false,
      error: error.message || String(error)
    };
  }
}

export async function updateIndexingConfig(isBulkIndexingComplete: boolean) {
  try {
    await adminDb.collection('appConfiguration').doc('indexingStatus').set({
      isBulkIndexingComplete,
      updatedAt: Timestamp.now()
    }, { merge: true });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}
