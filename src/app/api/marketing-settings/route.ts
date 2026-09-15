import { NextResponse } from 'next/server';
import { getMarketingSettings } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const data = await getMarketingSettings();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error in /api/marketing-settings:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
