import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { depositProviderWalletAction } from '@/app/actions/providerWalletActions';
import { db } from '@/lib/mysqlDb';
import { doc, getDoc, updateDoc, Timestamp } from '@/lib/mysqlDb';

export async function POST(req: NextRequest) {
  let rawBody = '';
  try {
    rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const razorpayWebhookSecret = appConfig?.razorpayWebhookSecret;

    if (!razorpayWebhookSecret) {
      console.error("Razorpay Webhook Secret is not configured in database config.");
      return NextResponse.json({ success: false, error: 'Razorpay webhook secret missing.' }, { status: 500 });
    }

    const expectedSignature = crypto
      .createHmac('sha256', razorpayWebhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error("Razorpay webhook signature verification failed.");
      return NextResponse.json({ success: false, error: 'Invalid webhook signature.' }, { status: 400 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;
    console.log(`Received Razorpay Webhook Event: ${event}`);

    if (event === 'order.paid' || event === 'payment.captured') {
      const order = payload.payload.payment?.entity?.order_id 
        ? payload.payload.payment.entity 
        : payload.payload.order?.entity;

      if (!order) {
        return NextResponse.json({ success: true, message: 'No order or payment entity found.' });
      }

      // Retrieve notes
      const notes = order.notes || {};
      const { type, bookingId, providerId, amount: amountStr } = notes;

      if (type === 'wallet_topup' && providerId && amountStr) {
        const parsedAmount = parseFloat(amountStr);
        const orderId = order.order_id || order.id;
        const paymentId = order.id;

        // Perform deposit using our depositProviderWalletAction server action
        await depositProviderWalletAction(providerId, parsedAmount, {
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          payment_method: 'Razorpay'
        });
      } else if (type === 'cancellation_fee' && bookingId && amountStr) {
        const parsedAmount = parseFloat(amountStr);
        const bookingRef = doc(db, 'bookings', bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data();
          if (bookingData.status !== 'Cancelled') {
            const orderId = order.order_id || order.id;
            const paymentId = order.id;

            await updateDoc(bookingRef, {
              status: 'Cancelled',
              cancellationPaymentId: paymentId || orderId,
              cancellationPaymentMethod: 'Razorpay',
              updatedAt: Timestamp.now(),
              cancellationFeePaid: parsedAmount
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error handling Razorpay webhook:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
