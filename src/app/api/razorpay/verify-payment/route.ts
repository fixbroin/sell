
import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ success: false, error: 'Missing payment details for verification.' }, { status: 400 });
    }
    
    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const razorpayKeySecret = appConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeySecret) {
      console.error("Razorpay Key Secret is not set in database settings or environment variables.");
      return NextResponse.json({ success: false, error: 'Payment gateway not configured on server for verification.' }, { status: 500 });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature === razorpay_signature) {
      // Signature is valid. You can now trust this payment.
      // In a real app, you would fetch the payment details from Razorpay API again
      // to double-check the amount and status before confirming the order in your DB.
      // For this example, we will assume if the signature is valid, the payment is captured.
      return NextResponse.json({ success: true, status: 'captured' });
    } else {
      // Signature is invalid.
      return NextResponse.json({ success: false, error: 'Invalid payment signature.' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
