import { NextResponse } from 'next/server';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getGlobalSEOSettings();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error in /api/global-seo:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
