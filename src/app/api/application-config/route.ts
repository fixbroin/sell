import { NextResponse } from 'next/server';
import { getGlobalAppSettings } from '@/lib/webServerUtils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getGlobalAppSettings();
    
    // Sanitize credentials to prevent public exposure
    if (data) {
      delete data.stripeSecretKey;
      delete data.stripeWebhookSecret;
      delete data.razorpayKeySecret;
      delete data.razorpayWebhookSecret;
      delete data.smtpPass;
      delete data.smtpUser;
      delete data.smtpHost;
    }

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate'
      }
    });
  } catch (error) {
    console.error("API Error in /api/application-config:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
