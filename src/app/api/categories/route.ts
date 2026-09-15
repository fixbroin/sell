import { NextResponse } from 'next/server';
import { getPool, getDocsInternal } from '@/lib/mysql';

let categoriesCache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10000;

export async function GET() {
  try {
    if (categoriesCache && Date.now() < categoriesCache.expiresAt) {
      return NextResponse.json(categoriesCache.data, {
        headers: {
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=60'
        }
      });
    }

    const pool = await getPool();
    const rawCategories = await getDocsInternal(pool, 'adminCategories', []);
    const rawSubCategories = await getDocsInternal(pool, 'adminSubCategories', []);

    const categories = rawCategories.map((c: any) => ({
      id: c.id,
      ...c.data
    }));

    const subCategories = rawSubCategories.map((sc: any) => ({
      id: sc.id,
      ...sc.data
    }));

    const responseData = {
      success: true,
      categories,
      subCategories,
      timestamp: new Date().toISOString()
    };

    categoriesCache = { data: responseData, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=60'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}
