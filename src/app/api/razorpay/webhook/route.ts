import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { depositProviderWalletAction } from '@/app/actions/providerWalletActions';
import { db } from '@/lib/mysqlDb';
import { doc, getDoc, updateDoc, Timestamp, addDoc, collection, query, where, getDocs, limit } from '@/lib/mysqlDb';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import type { FirestoreNotification } from '@/types/firestore';

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

      if (type === 'booking' && bookingId) {
        const bookingRef = doc(db, 'bookings', bookingId);
        const bookingSnap = await getDoc(bookingRef);

        if (bookingSnap.exists()) {
          const bookingData = bookingSnap.data() as any;
          if (bookingData.status === 'Pending Payment') {
            const orderId = order.order_id || order.id;
            const paymentId = order.id;
            const nextBookingNumber = await assignNewBookingNumber();

            await updateDoc(bookingRef, {
              status: 'Confirmed',
              bookingNumber: nextBookingNumber,
              paymentMethod: 'Online',
              razorpayPaymentId: paymentId,
              razorpayOrderId: orderId,
              updatedAt: Timestamp.now(),
            });

            // Trigger post-processing (emails, stats, auto-dispatch, WhatsApp)
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain';
            fetch(`${appUrl}/api/bookings/post-process`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingDocId: bookingId, triggerSource: 'razorpay_webhook' })
            }).catch(err => console.error("Error triggering post-process from Razorpay webhook:", err));

            // Create and send notification to customer
            if (bookingData.userId) {
              const userNotificationData: Omit<FirestoreNotification, 'id'> = {
                userId: bookingData.userId,
                title: "Booking Confirmed!",
                message: `Your booking ${bookingData.bookingId} has been successfully placed. We'll assign a provider shortly.`,
                type: 'success',
                href: '/my-bookings',
                read: false,
                createdAt: Timestamp.now(),
              };
              await addDoc(collection(db, "userNotifications"), userNotificationData);
              triggerPushNotification({
                userId: bookingData.userId,
                title: userNotificationData.title,
                body: userNotificationData.message,
                href: userNotificationData.href
              });
            }

            // Create and send alert to Admin
            try {
              const usersRef = collection(db, "users");
              const adminQuery = query(usersRef, where("email", "==", ADMIN_EMAIL), limit(1));
              const adminSnapshot = await getDocs(adminQuery);
              if (!adminSnapshot.empty) {
                const adminUid = adminSnapshot.docs[0].id;
                const adminNotificationData: Omit<FirestoreNotification, 'id'> = {
                  userId: adminUid,
                  title: "New Booking Placed (Online)",
                  message: `Booking ${bookingData.bookingId} for ₹${bookingData.totalAmount} has been confirmed via Razorpay.`,
                  type: 'admin_alert',
                  href: `/admin/bookings`,
                  read: false,
                  createdAt: Timestamp.now(),
                };
                await addDoc(collection(db, "userNotifications"), adminNotificationData);
                triggerPushNotification({
                  userId: adminUid,
                  title: adminNotificationData.title,
                  body: adminNotificationData.message,
                  href: adminNotificationData.href
                });
              }
            } catch (err) {
              console.error("Error notifying admin from Razorpay webhook:", err);
            }
          }
        }
      } else if (type === 'wallet_topup' && providerId && amountStr) {
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
