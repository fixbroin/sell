// src/app/api/admin/database/migrate-firebase-to-mysql/route.ts
import { NextResponse } from 'next/server';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getPool, setDocInternal } from '@/lib/mysql';

const COLLECTIONS = [
  'adminCategories',
  'adminSubCategories',
  'adminServices',
  'userCarts',
  'bookings',
  'users',
  'adminSlideshows',
  'webSettings',
  'appConfiguration',
  'contentPages',
  'adminFAQs',
  'adminReviews',
  'timeSlotCategoryLimits',
  'adminPromoCodes',
  'taxes',
  'visitorInfoLogs',
  'userActivities',
  'chats',
  'userNotifications',
  'adminPopups',
  'admins',
  'providerApplications',
  'withdrawalRequests',
  'blogPosts',
  'contactUsSubmissions',
  'popupSubmissions',
  'cityCategorySeoSettings',
  'areaCategorySeoSettings',
  'areaServiceSeoSettings',
  'quotations',
  'invoices',
  'serviceZones',
  'referrals',
  'pinCodeAreaMappings',
  'cities',
  'areas',
  'searchAnalytics',
  'leaves',
  'seoSettings'
];

function getRealFirestore() {
  const serviceAccountJson = process.env.FIREBASE_ADMIN_SDK_CONFIG;
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_ADMIN_SDK_CONFIG environment variable is missing.");
  }
  const serviceAccount = JSON.parse(serviceAccountJson);
  let app;
  if (!getApps().length) {
    app = initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
      }),
    });
  } else {
    app = getApps()[0];
  }
  return getFirestore(app);
}

import { type NextRequest } from 'next/server';
import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user || !isUserAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }
    const firestore = getRealFirestore();
    const pool = await getPool();
    const summary: Record<string, number> = {};
    let totalMigrated = 0;

    for (const colName of COLLECTIONS) {
      try {
        const snapshot = await firestore.collection(colName).get();
        let count = 0;
        for (const docSnapshot of snapshot.docs) {
          const docData = docSnapshot.data();
          await setDocInternal(pool, colName, docSnapshot.id, docData);
          count++;
          totalMigrated++;
        }
        summary[colName] = count;
      } catch (colErr: any) {
        console.warn(`Could not migrate collection ${colName}:`, colErr?.message || colErr);
        summary[colName] = 0;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully merged ${totalMigrated} documents from Firebase into MySQL!`,
      totalMigrated,
      summary
    });
  } catch (error: any) {
    console.error("Firebase to MySQL Migration Error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "Failed to migrate Firebase data to MySQL"
    }, { status: 500 });
  }
}
