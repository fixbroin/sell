import { NextResponse } from 'next/server';
import { getPool, getDocsInternal } from '@/lib/mysql';

let servicesCache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10000;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const subCategoryId = searchParams.get('subCategoryId');

    if (!categoryId && !subCategoryId && servicesCache && Date.now() < servicesCache.expiresAt) {
      return NextResponse.json(servicesCache.data, {
        headers: {
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=60'
        }
      });
    }

    const pool = await getPool();
    const constraints: any[] = [];
    if (categoryId) constraints.push({ type: 'where', field: 'categoryId', op: '==', value: categoryId });
    if (subCategoryId) constraints.push({ type: 'where', field: 'subCategoryId', op: '==', value: subCategoryId });

    const rawServices = await getDocsInternal(pool, 'adminServices', constraints);
    const services = rawServices.map((s: any) => ({
      id: s.id,
      ...s.data
    }));

    const responseData = {
      success: true,
      services,
      timestamp: new Date().toISOString()
    };

    if (!categoryId && !subCategoryId) {
      servicesCache = { data: responseData, expiresAt: Date.now() + CACHE_TTL_MS };
    }

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=60'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch services' },
      { status: 500 }
    );
  }
}
