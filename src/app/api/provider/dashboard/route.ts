import { NextResponse } from 'next/server';
import { getPool } from '@/lib/mysql';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');

    if (!providerId) {
      return NextResponse.json({ success: false, error: 'Provider ID required' }, { status: 400 });
    }

    const pool = await getPool();

    const [assignedBookingsRows]: any = await pool.query(
      `SELECT \`id\`, \`data\` FROM \`bookings\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.assignedProviderId')) = ? ORDER BY JSON_UNQUOTE(JSON_EXTRACT(data, '$.createdAt')) DESC`,
      [providerId]
    );

    const bookings = (assignedBookingsRows || []).map((row: any) => {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return { id: row.id, ...data };
    });

    const completedBookings = bookings.filter((b: any) => b.status === 'completed');
    const totalEarnings = completedBookings.reduce((sum: number, b: any) => sum + (Number(b.totalAmount) || 0), 0);

    return NextResponse.json({
      success: true,
      stats: {
        totalBookings: bookings.length,
        completedBookings: completedBookings.length,
        totalEarnings
      },
      bookings,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch provider dashboard' },
      { status: 500 }
    );
  }
}
