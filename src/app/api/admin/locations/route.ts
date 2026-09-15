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
    const rawCities = await getDocsInternal(pool, 'cities', []);
    const rawAreas = await getDocsInternal(pool, 'areas', []);
    const rawZones = await getDocsInternal(pool, 'serviceZones', []);

    return NextResponse.json({
      success: true,
      cities: rawCities.map((c: any) => ({ id: c.id, ...c.data })),
      areas: rawAreas.map((a: any) => ({ id: a.id, ...a.data })),
      serviceZones: rawZones.map((z: any) => ({ id: z.id, ...z.data }))
    });
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
    const { type, data } = await request.json();
    const pool = await getPool();
    const targetTable = type === 'area' ? 'areas' : type === 'zone' ? 'serviceZones' : 'cities';
    const result = await addDocInternal(pool, targetTable, data);
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
    const { type, id, data } = await request.json();
    const pool = await getPool();
    const targetTable = type === 'area' ? 'areas' : type === 'zone' ? 'serviceZones' : 'cities';
    await updateDocInternal(pool, targetTable, id, data);
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
    const type = searchParams.get('type');
    if (!id) return NextResponse.json({ success: false, error: 'ID required' }, { status: 400 });

    const pool = await getPool();
    const targetTable = type === 'area' ? 'areas' : type === 'zone' ? 'serviceZones' : 'cities';
    await deleteDocInternal(pool, targetTable, id);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
