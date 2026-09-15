import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID is required.' }, { status: 400 });
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const stripeSecretKey = appConfig?.stripeSecretKey;
    if (!stripeSecretKey) {
      return NextResponse.json({ success: false, error: 'Stripe is not configured.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as any,
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      return NextResponse.json({ 
        success: true, 
        payment_intent: session.payment_intent, 
        status: session.payment_status, 
        metadata: session.metadata 
      });
    }

    return NextResponse.json({ success: false, error: 'Payment has not been completed.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Verification failed.' }, { status: 500 });
  }
}
