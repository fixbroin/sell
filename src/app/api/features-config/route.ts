import { NextResponse } from 'next/server';
import { getFeaturesConfigServer, getMarketingAutomationSettings } from '@/lib/webServerUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [features, marketing] = await Promise.all([
      getFeaturesConfigServer(),
      getMarketingAutomationSettings()
    ]);
    return NextResponse.json({ features, marketing });
  } catch (error) {
    console.error("API Error in /api/features-config:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
