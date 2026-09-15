import { NextResponse } from 'next/server';
import { getReferralSettingsServer } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const data = await getReferralSettingsServer();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error in /api/referral-settings:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
