import { NextResponse } from 'next/server';
import { getGlobalWebSettings } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const data = await getGlobalWebSettings();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate'
      }
    });
  } catch (error) {
    console.error("API Error in /api/web-settings:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
