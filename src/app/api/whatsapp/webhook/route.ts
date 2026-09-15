
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from '@/lib/mysqlDb';
import type { MarketingSettings } from '@/types/firestore';

const getWhatsAppVerifyToken = async (): Promise<string | undefined> => {
  try {
    const settingsDocRef = doc(db, "webSettings", "marketingConfiguration");
    const docSnap = await getDoc(settingsDocRef);
    if (docSnap.exists()) {
      const settings = docSnap.data() as MarketingSettings;
      return settings.whatsAppVerifyToken;
    }
    return process.env.WHATSAPP_VERIFY_TOKEN; // Fallback to env var
  } catch (error) {
    console.error("Error fetching WhatsApp Verify Token from Firestore:", error);
    return process.env.WHATSAPP_VERIFY_TOKEN; // Fallback on error
  }
};


/**
 * Handles the WhatsApp Webhook Verification GET request.
 * See: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const VERIFY_TOKEN = await getWhatsAppVerifyToken();

  if (!VERIFY_TOKEN) {
    console.error("WHATSAPP_VERIFY_TOKEN is not set in Firestore or environment variables.");
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }

  // Check if a token and mode is in the query string of the request
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    // Responds with the challenge token from the request
    console.log('WhatsApp Webhook Verified!');
    return new NextResponse(challenge, { status: 200 });
  } else {
    // Responds with '403 Forbidden' if verify tokens do not match
    console.warn('WhatsApp Webhook verification failed. Tokens do not match.');
    return new NextResponse('Forbidden', { status: 403 });
  }
}

/**
 * Handles incoming WhatsApp message notifications via POST request.
 * See: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Log the entire payload to see the structure of incoming messages
    console.log('Received WhatsApp Webhook Payload:', JSON.stringify(body, null, 2));

    // Here you would add your logic to process the incoming message.
    // For example, you could check for `object: 'whatsapp_business_account'`
    // and then process the `entry[0].changes[0].value.messages[0]` object.

    // WhatsApp requires a quick 200 OK response to acknowledge receipt of the webhook.
    return NextResponse.json({ status: 'success' }, { status: 200 });

  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error);
    // Even on error, it's often best to return 200 to prevent WhatsApp
    // from disabling the webhook, but log the error for debugging.
    return NextResponse.json({ status: 'error', error: (error as Error).message }, { status: 500 });
  }
}
