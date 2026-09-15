// src/app/api/admin/stats/sync/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from '@/lib/mysqlDbAdmin';
import { revalidateTag } from 'next/cache';

import { NextRequest } from 'next/server';
import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user || !isUserAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [bookingsSnap, usersSnap, settingsSnap] = await Promise.all([
      adminDb.collection('bookings').get(),
      adminDb.collection('users').get(),
      adminDb.collection('appConfiguration').doc('settings').get()
    ]);

    // Only count users who have an email or mobileNumber (real users)
    const realUsers = usersSnap.docs.filter(doc => {
      const data = doc.data();
      return data.email || data.mobileNumber;
    });
    const totalUsersCount = realUsers.length;
    const totalBookingsCount = bookingsSnap.docs.length;

    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    const providerFeeType = settings?.providerFeeType || 'percentage';
    const providerFeeValue = settings?.providerFeeValue ?? 10;

    let totalRevenue = 0;
    let completedBookingsCount = 0;
    let earnedCommission = 0;
    
    bookingsSnap.forEach(doc => {
      const data = doc.data();
      if (data.status === 'Completed') {
        const amount = data.totalAmount || 0;
        totalRevenue += amount;
        completedBookingsCount++;

        if (providerFeeType === 'fixed') {
          earnedCommission += providerFeeValue;
        } else if (providerFeeType === 'percentage') {
          earnedCommission += (amount * providerFeeValue) / 100;
        }
      }
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    let newSignupsCount = 0;
    realUsers.forEach(doc => {
      const data = doc.data();
      if (data.createdAt && data.createdAt.toDate() >= startOfMonth) {
        newSignupsCount++;
      }
    });

    const statsData = {
      totalBookings: totalBookingsCount,
      completedBookings: completedBookingsCount,
      totalRevenue: totalRevenue,
      earnedCommission: earnedCommission,
      totalUsers: totalUsersCount,
      newSignups30d: newSignupsCount,
      updatedAt: Timestamp.now()
    };

    await adminDb.collection('appConfiguration').doc('stats').set(statsData, { merge: true });

    // PURGE CACHE
    revalidateTag('admin-dashboard-stats', 'max');
    revalidateTag('global-cache', 'max');

    return NextResponse.json({ success: true, stats: statsData });
  } catch (error: any) {
    console.error('Error syncing stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
