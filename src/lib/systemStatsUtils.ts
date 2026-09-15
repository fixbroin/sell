// src/lib/systemStatsUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { FieldValue, Timestamp } from './mysqlDbAdmin';

export async function incrementSystemStats(updates: {
  totalBookings?: number;
  completedBookings?: number;
  totalRevenue?: number;
  earnedCommission?: number;
  totalUsers?: number;
  newSignups30d?: number;
  lastUserNumber?: number;
  lastBookingNumber?: number;
  totalDiscountGiven?: number;
}) {
  try {
    const statsRef = adminDb.collection('appConfiguration').doc('stats');
    const payload: any = {
      updatedAt: Timestamp.now()
    };

    if (updates.totalBookings) payload.totalBookings = FieldValue.increment(updates.totalBookings);
    if (updates.completedBookings) payload.completedBookings = FieldValue.increment(updates.completedBookings);
    if (updates.totalRevenue) payload.totalRevenue = FieldValue.increment(updates.totalRevenue);
    if (updates.earnedCommission) payload.earnedCommission = FieldValue.increment(updates.earnedCommission);
    if (updates.totalUsers) payload.totalUsers = FieldValue.increment(updates.totalUsers);
    if (updates.newSignups30d) payload.newSignups30d = FieldValue.increment(updates.newSignups30d);
    if (updates.lastUserNumber) payload.lastUserNumber = FieldValue.increment(updates.lastUserNumber);
    if (updates.lastBookingNumber) payload.lastBookingNumber = FieldValue.increment(updates.lastBookingNumber);
    if (updates.totalDiscountGiven) payload.totalDiscountGiven = FieldValue.increment(updates.totalDiscountGiven);

    await statsRef.set(payload, { merge: true });
  } catch (error) {
    console.error("Error incrementing system stats:", error);
  }
}

function getExactTimestampMillis(data: any): number {
  const dateStr = data.scheduledDate || data.bookingDate;
  const timeStr = data.scheduledTimeSlot || data.bookingTime;

  if (dateStr) {
    try {
      const parts = String(dateStr).split('-').map(Number);
      if (parts.length === 3) {
        let h = 12, m = 0;
        if (timeStr) {
          const match = String(timeStr).match(/(\d+):(\d+)\s*(AM|PM)?/i);
          if (match) {
            h = parseInt(match[1], 10);
            m = parseInt(match[2], 10);
            const ampm = match[3]?.toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
          }
        }
        return new Date(parts[0], parts[1] - 1, parts[2], h, m).getTime();
      }
    } catch (e) {}
  }

  const ca = data.createdAt;
  if (ca) {
    if (typeof ca._seconds === 'number') return ca._seconds * 1000;
    if (typeof ca.seconds === 'number') return ca.seconds * 1000;
    if (typeof ca === 'string' || typeof ca === 'number') {
      const t = new Date(ca).getTime();
      if (!isNaN(t)) return t;
    }
  }

  return 0;
}

/**
 * Resequences all booking numbers to remove gaps from deletions.
 */
export async function resequenceBookingNumbers() {
  try {
    const statsRef = adminDb.collection('appConfiguration').doc('stats');
    const bookingsSnap = await adminDb.collection('bookings').get();
    
    // Sort chronologically (oldest = 1, latest = highest number)
    const sortedDocs = bookingsSnap.docs
      .map(doc => ({
        ref: doc.ref,
        data: doc.data(),
        timestamp: getExactTimestampMillis(doc.data())
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const totalBookings = sortedDocs.length;
    let modifiedCount = 0;
    let batchCount = 0;
    let batch = adminDb.batch();

    for (let i = 0; i < sortedDocs.length; i++) {
      const item = sortedDocs[i];
      const targetNumber = i + 1;
      if (item.data.bookingNumber !== targetNumber) {
        batch.update(item.ref, { bookingNumber: targetNumber });
        modifiedCount++;
        batchCount++;

        if (batchCount >= 400) {
          await batch.commit();
          batch = adminDb.batch();
          batchCount = 0;
        }
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }

    await statsRef.set({ 
      lastBookingNumber: totalBookings,
      updatedAt: Timestamp.now() 
    }, { merge: true });

    return { success: true, count: modifiedCount };
  } catch (error) {
    console.error("Error resequencing booking numbers:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Resequences all user numbers to remove gaps from deletions.
 */
export async function resequenceUserNumbers() {
  try {
    const statsRef = adminDb.collection('appConfiguration').doc('stats');
    const usersSnap = await adminDb.collection('users').get();
    
    // Sort chronologically (oldest = 1, latest = highest number)
    const sortedDocs = usersSnap.docs
      .map(doc => ({
        ref: doc.ref,
        data: doc.data(),
        timestamp: getExactTimestampMillis(doc.data())
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    const totalUsers = sortedDocs.length;
    let modifiedCount = 0;
    let batchCount = 0;
    let batch = adminDb.batch();

    for (let i = 0; i < sortedDocs.length; i++) {
      const item = sortedDocs[i];
      const targetNumber = i + 1;
      if (item.data.userNumber !== targetNumber) {
        batch.update(item.ref, { userNumber: targetNumber });
        modifiedCount++;
        batchCount++;

        if (batchCount >= 400) {
          await batch.commit();
          batch = adminDb.batch();
          batchCount = 0;
        }
      }
    }
    
    if (batchCount > 0) {
      await batch.commit();
    }

    await statsRef.set({ 
      lastUserNumber: totalUsers,
      updatedAt: Timestamp.now() 
    }, { merge: true });

    return { success: true, count: modifiedCount };
  } catch (error) {
    console.error("Error resequencing user numbers:", error);
    return { success: false, error: String(error) };
  }
}

export async function initializeBookingNumbers() {
  return resequenceBookingNumbers();
}

export async function initializeUserNumbers() {
  return resequenceUserNumbers();
}
