
import { type NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getBaseUrl } from '@/lib/config';
import { adminDb } from '@/lib/firebaseAdmin';

// Handler for the POST method
export async function POST(req: NextRequest) {
  // Check for the correct request method
  if (req.method !== 'POST') {
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  try {
    // 1. Fetch Global Master Toggle & Credentials from Firestore
    const [marketingConfigDoc, marketingAutomationDoc] = await Promise.all([
      adminDb.collection('webSettings').doc('marketingConfiguration').get(),
      adminDb.collection('webSettings').doc('marketingAutomation').get()
    ]);

    const marketingConfig = marketingConfigDoc.data() || {};
    const marketingAutomation = marketingAutomationDoc.data() || {};

    // 2. Check Global Master Toggle
    if (marketingAutomation.isWhatsAppEnabled === false) {
      console.log("WhatsApp notifications are globally disabled.");
      return NextResponse.json({ success: false, error: 'WhatsApp notifications are globally disabled.' }, { status: 403 });
    }

    // 3. Retrieve Credentials (Priority: DB > ENV)
    const WHATSAPP_TOKEN = marketingConfig.whatsAppApiToken || process.env.WHATSAPP_TOKEN;
    const WHATSAPP_PHONE_NUMBER_ID = marketingConfig.whatsAppPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
      console.error("WhatsApp credentials are not set in Firestore or environment variables.");
      return NextResponse.json({ success: false, error: 'WhatsApp configuration error.' }, { status: 500 });
    }

    // 4. Parse the request body
    const body = await req.json();
    const { to, templateName, parameters = [] } = body;

    console.log(`[WhatsApp API] Attempting to send template "${templateName}" to: ${to}`);

    // Validate essential parameters
    if (!to || !templateName) {
      return NextResponse.json({ success: false, error: 'Missing `to` or `templateName` in request body.' }, { status: 400 });
    }

    // Construct the components array
    const components = [];

    // All templates have an image header, so we can add it unconditionally
    components.push({
      type: "header",
      parameters: [{
        type: "image",
        image: {
          // This URL must be a public, permanent link to the image approved in your template.
          link: `${getBaseUrl()}/default-image.png` 
        }
      }]
    });
    

    // Add body component if there are parameters
    if (parameters.length > 0) {
      components.push({
        type: "body",
        parameters: parameters.map((param: string) => ({ type: "text", text: param })),
      });
    }

    // Construct the final request payload
    const payload = {
      messaging_product: 'whatsapp',
      to: to.replace(/\+/g, '').replace(/\s/g, ''), // Ensure no + or spaces
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_US' },
        components: components,
      },
    };

    console.log("[WhatsApp API] Payload to Meta:", JSON.stringify(payload, null, 2));

    // Make the API call to WhatsApp
    const result = await axios.post(
      `https://graph.facebook.com/v19.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log("[WhatsApp API] Success Response from Meta:", JSON.stringify(result.data, null, 2));

    // Return a success response
    return NextResponse.json({ success: true, result: result.data });

  } catch (error: any) {
    // Log detailed error information for debugging
    console.error("WhatsApp API Error:", error.response?.data || error.message);
    
    // Return a generic error response to the client
    return NextResponse.json({ 
      success: false, 
      error: error.response?.data?.error?.message || error.message || 'An unknown error occurred.'
    }, { status: 500 });
  }
}
