// scripts/bulk-index.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://yourdomain';
const PROGRESS_FILE = path.join(__dirname, 'indexing-progress.json');

const serviceAccountJson = process.env.FIREBASE_ADMIN_SDK_CONFIG;
if (!serviceAccountJson) {
  console.error("Error: FIREBASE_ADMIN_SDK_CONFIG is missing in .env file.");
  process.exit(1);
}

const serviceAccount = JSON.parse(serviceAccountJson);

// Initialize Firebase Admin
initializeApp({
  credential: cert({
    projectId: serviceAccount.project_id,
    clientEmail: serviceAccount.client_email,
    privateKey: serviceAccount.private_key.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

// Initialize Google Auth
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: serviceAccount.client_email,
    private_key: serviceAccount.private_key.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/indexing'],
});

const indexer = google.indexing({ version: 'v3', auth });

async function compileAllUrls() {
  console.log("Fetching data from Firestore...");
  const urls = [];

  // 1. Static Pages
  const staticPages = [
    '', '/about-us', '/contact-us', '/careers', '/terms-and-conditions',
    '/privacy-policy', '/faq', '/service-disclaimer', '/cancellation-policy',
    '/damage-and-claims-policy', '/categories', '/blog', '/sitemap', '/near-me'
  ];
  staticPages.forEach(p => urls.push(`${BASE_URL}${p}`));

  // 2. Fetch Categories
  const categoriesSnap = await db.collection('adminCategories').where('isActive', '==', true).get();
  const categories = [];
  categoriesSnap.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      categories.push({ id: doc.id, slug: data.slug });
      urls.push(`${BASE_URL}/category/${data.slug}`);
    }
  });
  console.log(`Fetched ${categories.length} active categories.`);

  // 3. Fetch Services
  const servicesSnap = await db.collection('adminServices').where('isActive', '==', true).get();
  const servicesSlugs = [];
  servicesSnap.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      servicesSlugs.push(data.slug);
      urls.push(`${BASE_URL}/service/${data.slug}`);
    }
  });
  console.log(`Fetched ${servicesSlugs.length} active services.`);

  // 4. Fetch Cities & Areas
  const citiesSnap = await db.collection('cities').where('isActive', '==', true).get();
  const cities = [];
  citiesSnap.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      cities.push({ id: doc.id, slug: data.slug });
      urls.push(`${BASE_URL}/${data.slug}`);
    }
  });
  console.log(`Fetched ${cities.length} active cities.`);

  // Loop cities to resolve area and localized category URLs
  for (const city of cities) {
    // City Categories
    categories.forEach(cat => {
      urls.push(`${BASE_URL}/${city.slug}/category/${cat.slug}`);
    });

    // Fetch Areas for this city
    const areasSnap = await db.collection('areas')
      .where('cityId', '==', city.id)
      .where('isActive', '==', true)
      .get();
      
    areasSnap.forEach(doc => {
      const areaData = doc.data();
      if (areaData.slug) {
        urls.push(`${BASE_URL}/${city.slug}/${areaData.slug}`);
        // Area Categories
        categories.forEach(cat => {
          urls.push(`${BASE_URL}/${city.slug}/${areaData.slug}/${cat.slug}`);
        });
      }
    });
  }

  // 5. Fetch Area-Service SEO overrides
  const serviceSeoSnap = await db.collection('areaServiceSeoSettings').where('isActive', '==', true).get();
  serviceSeoSnap.forEach(doc => {
    const data = doc.data();
    if (data.citySlug && data.areaSlug && data.serviceSlug) {
      urls.push(`${BASE_URL}/${data.citySlug}/${data.areaSlug}/service/${data.serviceSlug}`);
    }
  });
  console.log(`Fetched ${serviceSeoSnap.size} localized service SEO overrides.`);

  // 6. Fetch Blogs
  const blogSnap = await db.collection('blogPosts').where('isPublished', '==', true).get();
  blogSnap.forEach(doc => {
    const data = doc.data();
    if (data.slug) {
      urls.push(`${BASE_URL}/blog/${data.slug}`);
    }
  });
  console.log(`Fetched ${blogSnap.size} published blogs.`);

  // De-duplicate
  const uniqueUrls = [...new Set(urls)];
  console.log(`Compiled total of ${uniqueUrls.length} unique URLs.`);
  return uniqueUrls;
}

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    } catch (e) {
      return { submitted: {} };
    }
  }
  return { submitted: {} };
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf8');
}

async function run() {
  try {
    const allUrls = await compileAllUrls();
    const progress = loadProgress();
    
    // Filter out already submitted URLs
    const pendingUrls = allUrls.filter(url => !progress.submitted[url]);
    console.log(`Pending URLs to submit: ${pendingUrls.length}`);

    if (pendingUrls.length === 0) {
      console.log("All URLs have already been submitted! Job complete.");
      process.exit(0);
    }

    // Set batch size limit (200 is default daily Google Indexing API quota)
    const BATCH_LIMIT = 200;
    const batch = pendingUrls.slice(0, BATCH_LIMIT);
    console.log(`Starting submission batch of ${batch.length} URLs to Google Indexing API...`);

    let successCount = 0;
    for (const url of batch) {
      try {
        await indexer.urlNotifications.publish({
          requestBody: {
            url: url,
            type: 'URL_UPDATED',
          },
        });
        progress.submitted[url] = {
          date: new Date().toISOString(),
          success: true
        };
        successCount++;
        console.log(`[OK] Submitted: ${url}`);
      } catch (err) {
        console.error(`[FAIL] Failed: ${url} ->`, err.message || err);
        progress.submitted[url] = {
          date: new Date().toISOString(),
          success: false,
          error: err.message || String(err)
        };
      }
      
      // Sleep a tiny bit to avoid throttling (100ms)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    saveProgress(progress);
    console.log(`\nBatch finished!`);
    console.log(`Successfully submitted: ${successCount}/${batch.length}`);
    console.log(`Remaining pending URLs: ${pendingUrls.length - batch.length}`);
    console.log(`You can run this script again tomorrow to process the next batch.`);
    
    process.exit(0);
  } catch (error) {
    console.error("Fatal error during bulk indexing execution:", error);
    process.exit(1);
  }
}

run();
