import { NextResponse } from 'next/server';
import { getPool, addDocInternal, getDocsInternal } from '@/lib/mysql';

export async function POST(request: Request) {
  try {
    const data = await request.json();
    const pool = await getPool();
    const payload = {
      ...data,
      status: 'pending',
      appliedAt: new Date().toISOString()
    };
    const result = await addDocInternal(pool, 'providerApplications', payload);
    return NextResponse.json({ success: true, id: result.id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'User ID required' }, { status: 400 });
    }

    const pool = await getPool();
    const rawApps = await getDocsInternal(pool, 'providerApplications', [{ type: 'where', field: 'userId', op: '==', value: userId }]);
    const applications = rawApps.map((app: any) => ({ id: app.id, ...app.data }));

    return NextResponse.json({
      success: true,
      application: applications[0] || null
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
