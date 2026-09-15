import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { Timestamp } from '@/lib/mysqlDbAdmin';

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('session_id');
    const bookingId = req.nextUrl.searchParams.get('bookingId') || req.nextUrl.searchParams.get('booking_id');

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID is required.' }, { status: 400 });
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? (appConfigSnap.data() as any) : null;

    const stripeSecretKey = appConfig?.stripeSecretKey;
    if (!stripeSecretKey) {
      return NextResponse.json({ success: false, error: 'Stripe is not configured.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as any,
    });

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      let updatedBooking: any = null;

      if (bookingId) {
        const bookingRef = adminDb.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (bookingSnap.exists) {
          const bookingData = bookingSnap.data() as any;

          if (bookingData.status === 'Pending Payment') {
            const nextBookingNumber = await assignNewBookingNumber();
            const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.id;

            await bookingRef.update({
              status: 'Confirmed',
              bookingNumber: nextBookingNumber,
              paymentMethod: 'Online',
              stripeSessionId: session.id,
              stripePaymentIntent: paymentIntentId,
              updatedAt: Timestamp.now(),
            });

            updatedBooking = {
              ...bookingData,
              id: bookingId,
              status: 'Confirmed',
              bookingNumber: nextBookingNumber,
              paymentMethod: 'Online',
              stripeSessionId: session.id,
              stripePaymentIntent: paymentIntentId,
            };

            // Trigger Post-Processing
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            fetch(`${appUrl}/api/bookings/post-process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingDocId: bookingId, triggerSource: 'stripe_checkout_verify' }),
            }).catch((err) => console.error('Error triggering post-process from Stripe verify:', err));

            // Notify User In-App
            if (bookingData.userId) {
              try {
                await adminDb.collection('userNotifications').add({
                  userId: bookingData.userId,
                  title: 'Booking Confirmed!',
                  message: `Your booking ${bookingData.bookingId} has been successfully placed. We'll assign a provider shortly.`,
                  type: 'success',
                  href: '/my-bookings',
                  read: false,
                  createdAt: Timestamp.now(),
                });
              } catch (notifyErr) {
                console.error('Error sending in-app notification:', notifyErr);
              }
            }
          } else {
            updatedBooking = { ...bookingData, id: bookingId };
          }
        }
      }

      return NextResponse.json({
        success: true,
        payment_intent: session.payment_intent,
        status: session.payment_status,
        metadata: session.metadata,
        booking: updatedBooking,
      });
    }

    return NextResponse.json({ success: false, error: 'Payment has not been completed.' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Verification failed.' }, { status: 500 });
  }
}
