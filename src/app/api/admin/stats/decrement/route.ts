// src/app/api/admin/stats/decrement/route.ts
import { NextResponse } from 'next/server';
import { incrementSystemStats } from '@/lib/systemStatsUtils';

import { NextRequest } from 'next/server';
import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user || !isUserAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { totalBookings, completedBookings, totalRevenue, earnedCommission } = await request.json();

    const updates: any = {};
    if (totalBookings) updates.totalBookings = -totalBookings;
    if (completedBookings) updates.completedBookings = -completedBookings;
    if (totalRevenue) updates.totalRevenue = -totalRevenue;
    if (earnedCommission) updates.earnedCommission = -earnedCommission;

    if (Object.keys(updates).length > 0) {
      await incrementSystemStats(updates);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error decrementing system stats:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
