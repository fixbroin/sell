import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { depositProviderWalletAction } from '@/app/actions/providerWalletActions';
import { db } from '@/lib/mysqlDb';
import { doc, getDoc, updateDoc, addDoc, collection, Timestamp, query, where, getDocs } from '@/lib/mysqlDb';

export async function POST(req: NextRequest) {
  let rawBody = '';
  try {
    rawBody = await req.text();
    const signature = req.headers.get('stripe-signature') || '';

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const stripeSecretKey = appConfig?.stripeSecretKey;
    const stripeWebhookSecret = appConfig?.stripeWebhookSecret;

    if (!stripeSecretKey || !stripeWebhookSecret) {
      console.error("Stripe keys or Webhook Secret are not configured in database config.");
      return NextResponse.json({ success: false, error: 'Stripe webhook config missing on server.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as any,
    });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, stripeWebhookSecret);
    } catch (err: any) {
      console.error(`Stripe signature verification failed: ${err.message}`);
      return NextResponse.json({ success: false, error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
    }

    console.log(`Received Stripe Webhook Event: ${event.type}`);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata;

      if (!metadata) {
        console.warn("Stripe session completed but holds no metadata. Skipping.");
        return NextResponse.json({ success: true, message: 'Skipped - No metadata.' });
      }

      const { type, bookingId, providerId, amount: amountStr } = metadata;
      const parsedAmount = parseFloat(amountStr || '0');

      console.log(`Processing session completed. Type: ${type}, bookingId: ${bookingId}, providerId: ${providerId}, amount: ${parsedAmount}`);

      if (type === 'booking') {
        if (!bookingId) {
          console.error("Stripe booking payment completed but bookingId is missing from metadata.");
          return NextResponse.json({ success: false, error: 'bookingId is missing from metadata.' }, { status: 400 });
        }

        // Fetch the booking document
        const bookingRef = doc(db, 'bookings', bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data();
          if (bookingData.status === 'Pending Payment') {
            // Update booking status to Confirmed and store Stripe Session ID
            await updateDoc(bookingRef, {
              status: 'Confirmed',
              stripeSessionId: session.id,
              stripePaymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : null,
              paymentMethod: 'Online',
              updatedAt: Timestamp.now(),
            });

            console.log(`Stripe Webhook confirmed Booking ID: ${bookingId}. Triggering post-process.`);

            // Trigger server-side post-process internally
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006';
            fetch(`${appUrl}/api/bookings/post-process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingDocId: bookingId, triggerSource: 'stripe_webhook' })
            }).catch(err => console.error("Error triggering post-process from Stripe Webhook:", err));
          } else {
            console.log(`Booking ID ${bookingId} already processed (Status: ${bookingData.status}).`);
          }
        } else {
          console.error(`Booking ID ${bookingId} not found in database.`);
        }

      } else if (type === 'cancellation_fee') {
        if (!bookingId) {
          console.error("Stripe cancellation fee completed but bookingId is missing from metadata.");
          return NextResponse.json({ success: false, error: 'bookingId is missing from metadata.' }, { status: 400 });
        }

        const bookingRef = doc(db, 'bookings', bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data();
          if (bookingData.status !== 'Cancelled') {
            // Update booking status to Cancelled and save cancellation details
            await updateDoc(bookingRef, {
              status: 'Cancelled',
              cancellationPaymentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.id,
              cancellationPaymentMethod: 'Stripe',
              updatedAt: Timestamp.now(),
            });

            console.log(`Stripe Webhook completed cancellation fee for Booking ID: ${bookingId}. Triggering post-process.`);

            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3006';
            fetch(`${appUrl}/api/bookings/post-process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingDocId: bookingId, cancelledBy: 'user', triggerSource: 'stripe_webhook_cancellation' }),
            }).catch(err => console.error("Error triggering post-process for cancellation:", err));
          } else {
            console.log(`Booking ID ${bookingId} is already Cancelled.`);
          }
        } else {
          console.error(`Booking ID ${bookingId} not found for cancellation fee update.`);
        }

      } else if (type === 'wallet_topup') {
        if (!providerId) {
          console.error("Stripe wallet deposit completed but providerId is missing from metadata.");
          return NextResponse.json({ success: false, error: 'providerId is missing from metadata.' }, { status: 400 });
        }

        // Query check to prevent double credit (idempotency check)
        const txnQuery = query(
          collection(db, 'providerWalletTransactions'), 
          where('stripe_session_id', '==', session.id)
        );
        const txnSnap = await getDocs(txnQuery);

        if (txnSnap.empty) {
          console.log(`Executing wallet credit for provider: ${providerId}, amount: ${parsedAmount}`);
          const depositResult = await depositProviderWalletAction(providerId, parsedAmount, {
            stripe_session_id: session.id,
            stripe_payment_intent: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
            payment_method: 'Stripe'
          });

          if (!depositResult.success) {
            throw new Error(`Wallet deposit failed: ${depositResult.message}`);
          }
          console.log(`Successfully credited wallet via Stripe: ${session.id}`);
        } else {
          console.log(`Stripe session ${session.id} already credited to provider wallet.`);
        }
      }
    }

    return NextResponse.json({ success: true, received: true });
  } catch (error: any) {
    console.error('Error processing Stripe webhook:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
