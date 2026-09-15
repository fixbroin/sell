import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';
import { NextRequest, NextResponse } from 'next/server';
import { getPool, getDocsInternal, addDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';

export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const rawFaqs = await getDocsInternal(pool, 'adminFAQs', []);
    const faqs = rawFaqs.map((f: any) => ({ id: f.id, ...f.data }));
    return NextResponse.json({ success: true, faqs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const data = await request.json();
    const pool = await getPool();
    const result = await addDocInternal(pool, 'adminFAQs', data);
    return NextResponse.json({ success: true, id: result.id });
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
    await updateDocInternal(pool, 'adminFAQs', id, data);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    const pool = await getPool();
    await deleteDocInternal(pool, 'adminFAQs', id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
