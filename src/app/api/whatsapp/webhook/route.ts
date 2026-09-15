import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/firebase';
import { doc, getDoc } from '@/lib/mysqlDb';
import type { MarketingSettings } from '@/types/firestore';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';

const getMarketingSettings = async (): Promise<MarketingSettings | null> => {
  try {
    const settingsDocRef = doc(db, "webSettings", "marketingConfiguration");
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      return docSnap.data() as MarketingSettings;
    }
    return null;
  } catch (error) {
    console.error("Error fetching Marketing Settings from database:", error);
    return null;
  }
};

/**
 * Handles the WhatsApp Webhook Verification GET request.
 * See: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export async function GET(req: NextRequest) {
  const rl = checkRateLimit(req, { max: 30, windowMs: 60 * 1000, keyPrefix: 'whatsapp-webhook-get' });
  if (!rl.allowed) {
    return rateLimitResponse(rl.resetTime);
  }

  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const settings = await getMarketingSettings();
  const VERIFY_TOKEN = settings?.whatsAppVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN;

  if (!VERIFY_TOKEN) {
    console.error("WHATSAPP_VERIFY_TOKEN is not set in Firestore or environment variables.");
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  // Check if token and mode match
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WhatsApp Webhook Verified successfully!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    console.warn('WhatsApp Webhook verification failed. Tokens do not match.');
    return new NextResponse('Forbidden', { status: 403 });
  }
}

/**
 * Handles incoming WhatsApp message notifications via POST request with cryptographic signature validation.
 * See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export async function POST(req: NextRequest) {
  // 1. Rate Limiting
  const rl = checkRateLimit(req, { max: 120, windowMs: 60 * 1000, keyPrefix: 'whatsapp-webhook-post' });
  if (!rl.allowed) {
    return rateLimitResponse(rl.resetTime);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');

    const settings = await getMarketingSettings();
    const appSecret = settings?.whatsAppAppSecret || process.env.WHATSAPP_APP_SECRET;

    // 2. Cryptographic Signature Verification
    if (appSecret) {
      if (!signature) {
        console.warn('WhatsApp Webhook rejected: Missing x-hub-signature-256 header.');
        return NextResponse.json({ error: 'Missing webhook signature.' }, { status: 401 });
      }

      const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

      const sigBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.warn('WhatsApp Webhook rejected: Signature verification failed.');
        return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 403 });
      }
    }

    // 3. Process Webhook Payload
    let body = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (parseErr) {
        console.error('Invalid JSON payload in WhatsApp webhook:', parseErr);
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
      }
    }

    console.log('Received authenticated WhatsApp Webhook Payload:', JSON.stringify(body, null, 2));

    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    return NextResponse.json({ status: 'error', error: (error as Error).message }, { status: 500 });
  }
}
