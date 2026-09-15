import { NextResponse } from 'next/server';
import { getRemoteCacheVersionsServer } from '@/lib/webServerUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getRemoteCacheVersionsServer();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate'
      }
    });
  } catch (error) {
    console.error("API Error in /api/cache-versions:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
