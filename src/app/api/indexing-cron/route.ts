// src/app/api/indexing-cron/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getBaseUrl } from '@/lib/config';
import { notifyGoogleIndexing } from '@/lib/googleIndexing';
import { Timestamp } from '@/lib/mysqlDbAdmin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

export async function GET(req: NextRequest) {
  // 1. Rate Limiting
  const rl = checkRateLimit(req, { max: 10, windowMs: 60 * 1000, keyPrefix: 'indexing-cron' });
  if (!rl.allowed) {
    return rateLimitResponse(rl.resetTime);
  }

  // 2. Secret Verification (CRON_SECRET must be set and match)
  const configuredSecret = process.env.CRON_SECRET;
  const providedSecret = new URL(req.url).searchParams.get('secret') || req.headers.get('x-cron-secret');
  if (!configuredSecret || configuredSecret.length < 16 || providedSecret !== configuredSecret) {
    return NextResponse.json({ error: 'Unauthorized: A valid CRON_SECRET is required to execute indexing tasks.' }, { status: 401 });
  }

  try {
    // Check if bulk indexing has already been marked as complete to save database reads
    const statusDoc = await adminDb.collection('appConfiguration').doc('indexingStatus').get();
    if (statusDoc.exists && statusDoc.data()?.isBulkIndexingComplete === true) {
      return NextResponse.json({
        status: 'ok',
        message: 'Bulk indexing is marked complete in Firestore. Exiting immediately with 1 database read.',
        isComplete: true
      });
    }

    const baseUrl = getBaseUrl() || 'https://yourdomain';
    const urls: string[] = [];

    console.log("[Indexing Cron] Compiling all site URLs...");

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

    // De-duplicate URLs
    const uniqueUrls = [...new Set(urls)];
    console.log(`[Indexing Cron] Compiled ${uniqueUrls.length} unique URLs.`);

    // Fetch already submitted URLs from Firestore
    const progressSnapshot = await adminDb.collection('indexingProgress').get();
    const submittedUrls = new Set<string>();
    progressSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.url && data.success) {
        submittedUrls.add(data.url);
      }
    });

    // Filter pending URLs
    const pendingUrls = uniqueUrls.filter(url => !submittedUrls.has(url));
    console.log(`[Indexing Cron] Pending indexation URLs: ${pendingUrls.length}`);

    if (pendingUrls.length === 0) {
      // Mark bulk indexing complete in Firestore so future runs exit instantly
      await adminDb.collection('appConfiguration').doc('indexingStatus').set({
        isBulkIndexingComplete: true,
        updatedAt: Timestamp.now()
      }, { merge: true });

      return NextResponse.json({
        status: 'ok',
        message: 'All pages are already indexed. Marked complete in Firestore. No work to do!',
        totalCompiled: uniqueUrls.length,
        pendingCount: 0
      });
    }

    // Process a batch of 180 (leaving a safety margin of 20 URLs for real-time admin edits)
    const BATCH_LIMIT = 180;
    const batch = pendingUrls.slice(0, BATCH_LIMIT);

    console.log(`[Indexing Cron] Submitting batch of ${batch.length} URLs to Google Indexing API...`);
    const results = await notifyGoogleIndexing(batch, 'URL_UPDATED');

    // Save progress to Firestore
    const batchDbWriter = adminDb.batch();
    results.forEach(res => {
      // Use base64url encoding of URL to create a unique Firestore Document ID (avoids slash conflicts)
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
    console.log(`[Indexing Cron] Batch completed. Successful: ${successCount}/${batch.length}`);

    return NextResponse.json({
      status: 'ok',
      submittedCount: batch.length,
      successCount: successCount,
      failureCount: batch.length - successCount,
      remainingPending: pendingUrls.length - batch.length,
      totalUrls: uniqueUrls.length
    });

  } catch (error: any) {
    console.error("[Indexing Cron] API request failed:", error.message || error);
    return NextResponse.json({ status: 'error', error: error.message || String(error) }, { status: 500 });
  }
}
