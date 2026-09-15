import { type NextRequest, NextResponse } from 'next/server';
import Razorpay from 'razorpay';
import { nanoid } from 'nanoid';

import { adminDb } from '@/lib/firebaseAdmin';

function calculateServerCancellationFee(bookingData: any, appConfig: any) {
  if (!appConfig?.enableCancellationPolicy) {
    return 0;
  }

  // 1. Calculate time difference
  if (!bookingData.scheduledDate || !bookingData.scheduledTimeSlot) {
    const feeValue = appConfig?.cancellationFeeValue || 0;
    const feeType = appConfig?.cancellationFeeType || 'fixed';
    return feeType === 'percentage' ? (feeValue / 100) * (bookingData.totalAmount || 0) : feeValue;
  }

  const [year, month, day] = bookingData.scheduledDate.split('-').map(Number);
  const serviceDate = new Date(year, month - 1, day);

  const slotTime = bookingData.scheduledTimeSlot;
  const timeMatch = slotTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) {
    const feeValue = appConfig?.cancellationFeeValue || 0;
    const feeType = appConfig?.cancellationFeeType || 'fixed';
    return feeType === 'percentage' ? (feeValue / 100) * (bookingData.totalAmount || 0) : feeValue;
  }

  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const period = timeMatch[3].toUpperCase();
  if (period === "PM" && hours < 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;

  const serviceStartTime = new Date(serviceDate);
  serviceStartTime.setHours(hours, minutes, 0, 0);

  const now = new Date();
  const diffMs = serviceStartTime.getTime() - now.getTime();

  // 2. Check final restricted window (e.g., 3 hours)
  const finalHours = appConfig?.finalCancellationHours || 0;
  const finalMinutes = appConfig?.finalCancellationMinutes || 0;
  const totalFinalWindowMs = ((finalHours * 60) + finalMinutes) * 60 * 1000;

  if (appConfig?.enableFinalCancellationWindow && diffMs < totalFinalWindowMs) {
    // Within final window -> 100% cancellation charge
    return bookingData.totalAmount || 0;
  }

  // 3. Check free cancellation window
  const freeWindowDays = appConfig?.freeCancellationDays || 0;
  const freeWindowHours = appConfig?.freeCancellationHours || 0;
  const freeWindowMinutes = appConfig?.freeCancellationMinutes || 0;
  const totalFreeWindowMs = ((freeWindowDays * 24 * 60) + (freeWindowHours * 60) + freeWindowMinutes) * 60 * 1000;

  if (diffMs >= totalFreeWindowMs) {
    return 0; // Free cancellation
  }

  // 4. Standard fee
  const feeValue = appConfig?.cancellationFeeValue || 0;
  const feeType = appConfig?.cancellationFeeType || 'fixed';
  return feeType === 'percentage' ? (feeValue / 100) * (bookingData.totalAmount || 0) : feeValue;
}

export async function POST(req: NextRequest) {
  try {
    const { amount, currency = 'INR', notes } = await req.json();

    if (!amount || typeof amount !== 'number' || amount < 100) { // Razorpay minimum is 1 INR (100 paise)
      return NextResponse.json({ success: false, error: 'Invalid amount provided.' }, { status: 400 });
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    const type = notes?.type;
    const bookingId = notes?.bookingId;
    const providerId = notes?.providerId;

    let reconciledBaseAmount = amount / 100;

    if (bookingId && (type === 'booking' || type === 'cancellation_fee')) {
      const bookingDoc = await adminDb.collection('bookings').doc(bookingId).get();
      if (!bookingDoc.exists) {
        return NextResponse.json({ success: false, error: 'Booking not found.' }, { status: 404 });
      }
      const bookingData = bookingDoc.data() as any;
      if (type === 'booking') {
        reconciledBaseAmount = bookingData.totalAmount;
      } else if (type === 'cancellation_fee') {
        reconciledBaseAmount = calculateServerCancellationFee(bookingData, appConfig);
      }
    } else if (type === 'wallet_topup' && providerId) {
      const minDeposit = appConfig?.minDepositAmount || 500;
      const maxDeposit = appConfig?.maxDepositAmount || 10000;
      if ((amount / 100) < minDeposit || (amount / 100) > maxDeposit) {
        return NextResponse.json({ success: false, error: `Deposit must be between ${minDeposit} and ${maxDeposit}.` }, { status: 400 });
      }
    }

    const reconciledAmountPaise = Math.round(reconciledBaseAmount * 100);

    const razorpayKeyId = appConfig?.razorpayKeyId || process.env.RAZORPAY_KEY_ID;
    const razorpayKeySecret = appConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayKeyId || !razorpayKeySecret) {
      console.error("Razorpay API keys are not set in database settings or environment variables.");
      return NextResponse.json({ success: false, error: 'Payment gateway not configured on server.' }, { status: 500 });
    }

    const instance = new Razorpay({
      key_id: razorpayKeyId,
      key_secret: razorpayKeySecret,
    });

    const options = {
      amount: reconciledAmountPaise, // amount in the smallest currency unit (paise)
      currency: currency,
      receipt: `receipt_${nanoid()}`,
      notes: {
        ...(notes || {}),
        amount: reconciledBaseAmount.toString()
      },
    };

    const order = await instance.orders.create(options);

    if (!order) {
      return NextResponse.json({ success: false, error: 'Failed to create order with Razorpay.' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true, ...order });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
