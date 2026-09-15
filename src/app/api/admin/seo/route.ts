import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';
import { NextRequest, NextResponse } from 'next/server';
import { getPool, getDocInternal, getDocsInternal, setDocInternal } from '@/lib/mysql';

export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const globalSeo = await getDocInternal(pool, 'seoSettings', 'global');
    const cityCategorySeo = await getDocsInternal(pool, 'cityCategorySeoSettings', []);
    const areaCategorySeo = await getDocsInternal(pool, 'areaCategorySeoSettings', []);

    return NextResponse.json({
      success: true,
      globalSeo: globalSeo.data || {},
      cityCategorySeo: cityCategorySeo.map((item: any) => ({ id: item.id, ...item.data })),
      areaCategorySeo: areaCategorySeo.map((item: any) => ({ id: item.id, ...item.data }))
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
    const { section, id, data } = await request.json();
    const pool = await getPool();
    const targetTable = section === 'cityCategory' ? 'cityCategorySeoSettings' : section === 'areaCategory' ? 'areaCategorySeoSettings' : 'seoSettings';
    const targetId = id || 'global';
    await setDocInternal(pool, targetTable, targetId, data, { merge: true });
    return NextResponse.json({ success: true, id: targetId });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
