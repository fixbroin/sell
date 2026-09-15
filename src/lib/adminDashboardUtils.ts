// src/lib/adminDashboardUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { cache } from 'react';
import { unstable_cache, revalidateTag } from 'next/cache';
import { Timestamp } from './mysqlDbAdmin';
import type { FirestoreBooking, FirestoreUser, UserActivity } from '@/types/firestore';
import { serializeFirestoreData } from './serializeUtils';
import { triggerRefresh } from './revalidateUtils';

export interface DashboardData {
  stats: {
    completedRevenue: number;
    totalBookings: number;
    activeUsers: number;
    newSignups: number;
    earnedCommission: number;
  };
  analytics: {
    topServices: any[];
    topSearchTerms: { term: string; count: number }[];
  };
  recentActivities: any[];
}

export const getDashboardData = cache(
  async (providerFeeType?: string, providerFeeValue?: number): Promise<DashboardData> => {
    try {
      // 1. Fetch live collection records for 100% accurate system stats
      const [bookingsSnap, usersSnap] = await Promise.all([
        adminDb.collection('bookings').get(),
        adminDb.collection('users').get()
      ]);

      let completedRevenue = 0;
      let earnedCommission = 0;
      let completedBookings = 0;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      bookingsSnap.forEach(doc => {
        const data = doc.data() as FirestoreBooking;
        if (data.status === 'Completed') {
          completedBookings++;
          completedRevenue += data.totalAmount || 0;
          if (providerFeeType === 'fixed') {
            earnedCommission += providerFeeValue || 0;
          } else if (providerFeeType === 'percentage') {
            earnedCommission += ((data.totalAmount || 0) * (providerFeeValue || 0)) / 100;
          }
        }
      });

      // Filter real users with email or mobileNumber, or fallback to total count
      const realUsers = usersSnap.docs.filter(doc => {
        const data = doc.data();
        return data.email || data.mobileNumber;
      });

      const activeUsers = realUsers.length > 0 ? realUsers.length : usersSnap.size;
      const totalBookings = bookingsSnap.size;

      let newSignups = 0;
      usersSnap.forEach(doc => {
        const data = doc.data() as any;
        if (data.createdAt) {
          const createdDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
          if (!isNaN(createdDate.getTime()) && createdDate >= startOfMonth) {
            newSignups++;
          }
        }
      });

      // Synchronize latest stats into MySQL appConfiguration/stats in background
      adminDb.collection('appConfiguration').doc('stats').set({
        totalBookings,
        completedBookings,
        totalRevenue: completedRevenue,
        earnedCommission,
        totalUsers: activeUsers,
        newSignups30d: newSignups,
        updatedAt: Timestamp.now()
      }, { merge: true }).catch(e => console.error("Error auto-syncing stats:", e));

      // 2. Fetch search activities
      const [searchActivitiesSnap, persistentSearchSnap] = await Promise.all([
        adminDb.collection('userActivities').where('eventType', '==', 'search').limit(100).get(),
        adminDb.collection('searchAnalytics').limit(100).get()
      ]);

      // 3. Analytics: Trending Services (Top 10 bookings - OPTIMIZED to reduce massive reads)
      const trendingBookings = await adminDb.collection('bookings').orderBy('createdAt', 'desc').limit(100).get();
      
      // Only fetch details for services that actually appear in recent bookings
      const uniqueServiceIds = new Set<string>();
      trendingBookings.forEach(doc => {
        const data = doc.data() as FirestoreBooking;
        data.services?.forEach(s => uniqueServiceIds.add(s.serviceId));
      });

      // Batch fetch service details
      const serviceDetailsPromises = Array.from(uniqueServiceIds).map(id => 
        adminDb.collection('adminServices').doc(id).get()
      );
      const serviceSnaps = await Promise.all(serviceDetailsPromises);
      const servicesDataMap = new Map(serviceSnaps.map(s => [s.id, { id: s.id, ...s.data() }]));

      const serviceCounts: { [key: string]: number } = {};
      trendingBookings.forEach(doc => {
        const data = doc.data() as FirestoreBooking;
        data.services?.forEach(s => {
          serviceCounts[s.serviceId] = (serviceCounts[s.serviceId] || 0) + (s.quantity || 1);
        });
      });

      const topServices = Object.entries(serviceCounts)
        .map(([serviceId, count]) => {
          const serviceSnap = serviceSnaps.find(s => s.id === serviceId);
          if (!serviceSnap || !serviceSnap.exists) return null;
          
          const serviceDetails = serviceSnap.data();
          return serviceDetails ? { ...serializeFirestoreData<any>(serviceDetails), id: serviceSnap.id, count } : null;
        })
        .filter(item => item !== null)
        .sort((a, b) => (b as any).count - (a as any).count)
        .slice(0, 50); // Increased from 10 to 50 to show more services

      // 4. Analytics: Search Hotspots
      const searchCounts: { [key: string]: number } = {};
      searchActivitiesSnap.forEach(doc => {
        const term = doc.data().eventData?.searchQuery?.toLowerCase().trim();
        if (term) searchCounts[term] = (searchCounts[term] || 0) + 1;
      });
      persistentSearchSnap.forEach(doc => {
        const term = doc.data().term?.toLowerCase().trim();
        if (term) searchCounts[term] = (searchCounts[term] || 0) + 1;
      });
      const topSearchTerms = Object.entries(searchCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([term, count]) => ({ term, count }))
        .slice(0, 20);

      // 5. Recent Activities
      const [recentBookings, recentUsers] = await Promise.all([
        adminDb.collection('bookings').orderBy('createdAt', 'desc').limit(5).get(),
        adminDb.collection('users').orderBy('createdAt', 'desc').limit(5).get()
      ]);

      const activities = [
        ...recentBookings.docs.map(doc => {
          const data = doc.data() as FirestoreBooking;
          return {
            id: doc.id,
            type: 'new_booking',
            timestamp: serializeFirestoreData<string>(data.createdAt),
            title: 'New Booking',
            description: `ID: ${data.bookingId.substring(0, 8)} • ${data.customerName}`,
            href: `/admin/bookings/edit/${doc.id}`,
          };
        }),
        ...recentUsers.docs.map(doc => {
          const data = doc.data() as FirestoreUser;
          return {
            id: doc.id,
            type: 'new_user_signup',
            timestamp: serializeFirestoreData<string>(data.createdAt),
            title: 'New User Signup',
            description: `${data.displayName || data.email}`,
            href: `/admin/users`,
          };
        })
      ].sort((a, b) => new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime()).slice(0, 7);

      return serializeFirestoreData<DashboardData>({
        stats: {
          completedRevenue,
          totalBookings,
          activeUsers,
          newSignups,
          earnedCommission
        },
        analytics: {
          topServices,
          topSearchTerms
        },
        recentActivities: activities
      });
    } catch (error) {
      console.error("Error in getDashboardData:", error);
      throw error;
    }
  }
);

export const getArchivedBookings = cache(
  async (): Promise<FirestoreBooking[]> => {
    try {
      const q = adminDb.collection('bookings').orderBy('createdAt', 'desc');
      
      const offset = 10;
      const snapshot = await q.offset(offset).limit(50).get();
      
      return serializeFirestoreData(snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as FirestoreBooking)));
    } catch (error) {
      console.error("Error in getArchivedBookings:", error);
      return [];
    }
  }
);

export const getArchivedUsers = cache(
  async (): Promise<FirestoreUser[]> => {
    try {
      const q = adminDb.collection('users').orderBy('createdAt', 'desc');
      
      const offset = 20;
      const snapshot = await q.offset(offset).limit(50).get();
      
      return serializeFirestoreData(snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as FirestoreUser)));
    } catch (error) {
      console.error("Error in getArchivedUsers:", error);
      return [];
    }
  }
);

export const getArchivedActivities = cache(
  async (): Promise<UserActivity[]> => {
    try {
      const snapshot = await adminDb.collection('userActivities')
        .orderBy('timestamp', 'desc')
        .limit(100)
        .get();

      return serializeFirestoreData(snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as UserActivity)));
    } catch (error) {
      console.error("Error in getArchivedActivities:", error);
      return [];
    }
  }
);

export interface PromoCodeUsageRecord {
  id: string;
  bookingId: string;
  customerName: string;
  customerEmail: string;
  discountCode: string;
  discountAmount: number;
  status: string;
  createdAt: string;
}

export const getPromoCodeUsageHistory = cache(
  async (): Promise<PromoCodeUsageRecord[]> => {
    try {
      // METHOD B: Read from specialized promoCodeUsage collection
      // This collection only contains usage records, so 50 records = 50 reads.
      // Limit to 200 to keep reads predictable as the business grows.
      const snapshot = await adminDb.collection('promoCodeUsage')
        .orderBy('createdAt', 'desc')
        .limit(200) 
        .get();

      if (snapshot.empty) return [];

      return serializeFirestoreData(snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as PromoCodeUsageRecord)));
    } catch (error) {
      console.error("Error in getPromoCodeUsageHistory:", error);
      return [];
    }
  }
);

/**
 * MIGRATION TOOL: Moves existing promo usage from 'bookings' to 'promoCodeUsage'
 */
export async function migratePromoCodeUsage() {
  try {
    // Read all bookings (limit to 5000) and filter in memory to be 100% sure we catch everything
    const bookingsSnap = await adminDb.collection('bookings')
      .orderBy('createdAt', 'desc')
      .limit(5000)
      .get();
    
    const batch = adminDb.batch();
    let count = 0;
    let totalDiscount = 0;
    
    for (const doc of bookingsSnap.docs) {
      const data = doc.data();
      const dCode = data.discountCode || data.promoCode || data.appliedPromoCode;
      const discountVal = Number(data.discountAmount || 0);
      
      if (dCode || (discountVal > 0)) {
        count++;
        totalDiscount += discountVal;
        const usageId = `usage_${doc.id}`;
        const usageRef = adminDb.collection('promoCodeUsage').doc(usageId);
        
        batch.set(usageRef, {
          bookingId: data.bookingId || "N/A",
          customerName: data.customerName || "Unknown",
          customerEmail: data.customerEmail || "No Email",
          discountCode: dCode ? String(dCode) : "Legacy/Applied",
          discountAmount: discountVal,
          status: data.status || "Pending",
          createdAt: data.createdAt || Timestamp.now()
        }, { merge: true });
      }
    }
    
    if (count > 0) {
      await batch.commit();
      // Set the initial total discount in stats
      const statsRef = adminDb.collection('appConfiguration').doc('stats');
      await statsRef.set({ 
        totalDiscountGiven: totalDiscount,
        updatedAt: Timestamp.now()
      }, { merge: true });
    }
    
    await triggerRefresh('promo-usage');
    await triggerRefresh('global-cache'); // Refresh stats
    return { success: true, count };
  } catch (error) {
    console.error("Migration Error:", error);
    return { success: false, error: String(error) };
  }
}

export async function clearSearchHotspots() {
  try {
    const batchSize = 500;
    
    // 1. Delete from searchAnalytics
    const searchAnalyticsSnap = await adminDb.collection('searchAnalytics').limit(batchSize).get();
    if (!searchAnalyticsSnap.empty) {
      const batch = adminDb.batch();
      searchAnalyticsSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    // 2. Delete from userActivities where eventType is 'search'
    const searchActivitiesSnap = await adminDb.collection('userActivities')
      .where('eventType', '==', 'search')
      .limit(batchSize)
      .get();
      
    if (!searchActivitiesSnap.empty) {
      const batch = adminDb.batch();
      searchActivitiesSnap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    revalidateTag('admin-dashboard-stats', 'max');
    return { success: true };
  } catch (error) {
    console.error("Error clearing search hotspots:", error);
    return { success: false, error: String(error) };
  }
}
