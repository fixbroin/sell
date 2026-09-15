import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';
import { NextRequest, NextResponse } from 'next/server';
import { getPool, getDocsInternal, updateDocInternal } from '@/lib/mysql';

export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const rawWithdrawals = await getDocsInternal(pool, 'withdrawalRequests', [{ type: 'orderBy', field: 'requestedAt', direction: 'desc' }]);
    const withdrawals = rawWithdrawals.map((w: any) => ({ id: w.id, ...w.data }));
    return NextResponse.json({ success: true, withdrawals });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { id, data } = await request.json();
    const pool = await getPool();
    await updateDocInternal(pool, 'withdrawalRequests', id, data);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
