import { NextResponse } from 'next/server';
import { getPool, getDocsInternal, updateDocInternal } from '@/lib/mysql';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');

    if (!providerId) {
      return NextResponse.json({ success: false, error: 'Provider ID required' }, { status: 400 });
    }

    const pool = await getPool();
    const rawBookings = await getDocsInternal(pool, 'bookings', [
      { type: 'where', field: 'assignedProviderId', op: '==', value: providerId },
      { type: 'orderBy', field: 'createdAt', direction: 'desc' }
    ]);
    const bookings = rawBookings.map((b: any) => ({ id: b.id, ...b.data }));

    return NextResponse.json({ success: true, bookings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { bookingId, status, providerNotes } = await request.json();
    if (!bookingId) return NextResponse.json({ success: false, error: 'Booking ID required' }, { status: 400 });

    const pool = await getPool();
    await updateDocInternal(pool, 'bookings', bookingId, {
      status,
      providerNotes,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true, bookingId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
