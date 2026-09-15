import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { Timestamp } from '@/lib/mysqlDbAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      bookingId,
      isCancellationFee,
      feeAmount,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: 'Missing payment details for verification.' },
        { status: 400 }
      );
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? (appConfigSnap.data() as any) : null;

    const razorpayKeySecret = appConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeySecret) {
      console.error('Razorpay Key Secret is not set in database settings or environment variables.');
      return NextResponse.json(
        { success: false, error: 'Payment gateway not configured on server for verification.' },
        { status: 500 }
      );
    }

    const verificationPayload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(verificationPayload.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ success: false, error: 'Invalid payment signature.' }, { status: 400 });
    }

    // Signature is cryptographically verified!
    let updatedBooking: any = null;

    if (bookingId) {
      const bookingRef = adminDb.collection('bookings').doc(bookingId);
      const bookingSnap = await bookingRef.get();

      if (bookingSnap.exists) {
        const bookingData = bookingSnap.data() as any;

        if (isCancellationFee) {
          // Handle Cancellation Fee
          await bookingRef.update({
            status: 'Cancelled',
            updatedAt: Timestamp.now(),
            cancellationFeePaid: Number(feeAmount) || 0,
            cancellationPaymentId: razorpay_payment_id,
          });

          updatedBooking = {
            ...bookingData,
            status: 'Cancelled',
            cancellationFeePaid: Number(feeAmount) || 0,
            cancellationPaymentId: razorpay_payment_id,
          };

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          fetch(`${appUrl}/api/bookings/post-process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingDocId: bookingId, cancelledBy: 'user' }),
          }).catch((err) => console.error('Error triggering post-process for cancellation:', err));
        } else if (bookingData.status === 'Pending Payment') {
          // Confirm booking authoritatively on server
          const nextBookingNumber = await assignNewBookingNumber();

          await bookingRef.update({
            status: 'Confirmed',
            bookingNumber: nextBookingNumber,
            paymentMethod: 'Online',
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature,
            updatedAt: Timestamp.now(),
          });

          updatedBooking = {
            ...bookingData,
            id: bookingId,
            status: 'Confirmed',
            bookingNumber: nextBookingNumber,
            paymentMethod: 'Online',
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            razorpaySignature: razorpay_signature,
          };

          // Trigger Server Post-Processing (Auto dispatch, notification, WhatsApp)
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          fetch(`${appUrl}/api/bookings/post-process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookingDocId: bookingId, triggerSource: 'razorpay_checkout_verify' }),
          }).catch((err) => console.error('Error triggering post-process from verify-payment:', err));

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
      status: 'captured',
      booking: updatedBooking,
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
