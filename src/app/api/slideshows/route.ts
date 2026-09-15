import { NextResponse } from 'next/server';
import { getPool, getDocsInternal } from '@/lib/mysql';

let slideshowsCache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 15000;

export async function GET() {
  try {
    if (slideshowsCache && Date.now() < slideshowsCache.expiresAt) {
      return NextResponse.json(slideshowsCache.data, {
        headers: {
          'Cache-Control': 'public, max-age=15, stale-while-revalidate=60'
        }
      });
    }

    const pool = await getPool();
    const rawSlideshows = await getDocsInternal(pool, 'adminSlideshows', []);
    const slideshows = rawSlideshows.map((s: any) => ({
      id: s.id,
      ...s.data
    }));

    const responseData = {
      success: true,
      slideshows,
      timestamp: new Date().toISOString()
    };

    slideshowsCache = { data: responseData, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, max-age=15, stale-while-revalidate=60'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch slideshows' },
      { status: 500 }
    );
  }
}
