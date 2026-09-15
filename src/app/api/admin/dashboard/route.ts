import { NextResponse } from 'next/server';
import { getPool } from '@/lib/mysql';

import { NextRequest } from 'next/server';
import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

export async function GET(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user || !isUserAdmin(user)) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }
    const pool = await getPool();

    // Run count queries in parallel
    const [bookingsRes, usersRes, servicesRes, providersRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) as count FROM \`bookings\``),
      pool.query(`SELECT COUNT(*) as count FROM \`users\``),
      pool.query(`SELECT COUNT(*) as count FROM \`adminServices\``),
      pool.query(`SELECT COUNT(*) as count FROM \`providerApplications\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = 'approved'`)
    ]);

    const bookingsCount = (bookingsRes[0] as any[])[0]?.count || 0;
    const usersCount = (usersRes[0] as any[])[0]?.count || 0;
    const servicesCount = (servicesRes[0] as any[])[0]?.count || 0;
    const providersCount = (providersRes[0] as any[])[0]?.count || 0;

    // Fetch recent 5 bookings
    const [recentBookingsRows]: any = await pool.query(
      `SELECT \`id\`, \`data\` FROM \`bookings\` ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) DESC LIMIT 5`
    );

    const recentBookings = (recentBookingsRows || []).map((row: any) => {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return { id: row.id, ...data };
    });

    return NextResponse.json({
      success: true,
      stats: {
        totalBookings: bookingsCount,
        totalUsers: usersCount,
        totalServices: servicesCount,
        totalProviders: providersCount
      },
      recentBookings,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch admin stats' },
      { status: 500 }
    );
  }
}
