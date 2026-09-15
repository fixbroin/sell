import { NextResponse } from 'next/server';
import { getPool, getDocInternal, setDocInternal } from '@/lib/mysql';

let settingsCache: { data: any; expiresAt: number } | null = null;
const CACHE_TTL_MS = 10000; // 10s edge cache

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (settingsCache && Date.now() < settingsCache.expiresAt) {
      return NextResponse.json(settingsCache.data, {
        headers: {
          'Cache-Control': 'public, max-age=10, stale-while-revalidate=30'
        }
      });
    }

    const pool = await getPool();
    const webSettings = await getDocInternal(pool, 'webSettings', 'global');
    const seoSettings = await getDocInternal(pool, 'seoSettings', 'global');
    const appConfig = await getDocInternal(pool, 'appConfiguration', 'global');

    const responseData = {
      success: true,
      webSettings: webSettings.data || {},
      seoSettings: seoSettings.data || {},
      appConfig: appConfig.data || {},
      timestamp: new Date().toISOString()
    };

    settingsCache = { data: responseData, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, max-age=10, stale-while-revalidate=30'
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch global settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { section, data } = await request.json();
    const pool = await getPool();

    settingsCache = null; // Flush cache on edit

    if (section === 'webSettings') {
      await setDocInternal(pool, 'webSettings', 'global', data, { merge: true });
    } else if (section === 'seoSettings') {
      await setDocInternal(pool, 'seoSettings', 'global', data, { merge: true });
    } else if (section === 'appConfig') {
      await setDocInternal(pool, 'appConfiguration', 'global', data, { merge: true });
    } else {
      return NextResponse.json({ success: false, error: 'Invalid section' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update settings' },
      { status: 500 }
    );
  }
}
