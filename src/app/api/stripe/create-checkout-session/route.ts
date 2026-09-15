import { type NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebaseAdmin';

const getCurrencySubunitDecimals = (currencyCode: string): number => {
  const c = currencyCode.toUpperCase();
  if (['JPY', 'KRW', 'CLP', 'VND', 'UGX'].includes(c)) return 0;
  if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 3;
  return 2;
};

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
    const { type, amount, currency = 'INR', bookingId, providerId, successUrl, cancelUrl } = await req.json();

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount provided.' }, { status: 400 });
    }

    const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = appConfigSnap.exists ? appConfigSnap.data() as any : null;

    let reconciledAmount = amount;

    if (bookingId && (type === 'booking' || type === 'cancellation_fee')) {
      const bookingDoc = await adminDb.collection('bookings').doc(bookingId).get();
      if (!bookingDoc.exists) {
        return NextResponse.json({ success: false, error: 'Booking not found.' }, { status: 404 });
      }
      const bookingData = bookingDoc.data() as any;
      if (type === 'booking') {
        reconciledAmount = bookingData.totalAmount;
      } else if (type === 'cancellation_fee') {
        reconciledAmount = calculateServerCancellationFee(bookingData, appConfig);
      }
    } else if (type === 'wallet_topup' && providerId) {
      const minDeposit = appConfig?.minDepositAmount || 500;
      const maxDeposit = appConfig?.maxDepositAmount || 10000;
      if (amount < minDeposit || amount > maxDeposit) {
        return NextResponse.json({ success: false, error: `Deposit must be between ${minDeposit} and ${maxDeposit}.` }, { status: 400 });
      }
    }

    const stripeSecretKey = appConfig?.stripeSecretKey;
    if (!stripeSecretKey) {
      console.error("Stripe Secret Key is not configured in settings.");
      return NextResponse.json({ success: false, error: 'Stripe is not configured on this server.' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16' as any,
    });

    const decimals = getCurrencySubunitDecimals(currency);
    const stripeAmount = Math.round(reconciledAmount * Math.pow(10, decimals));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: type === 'wallet_topup' 
                ? 'Provider Wallet Top Up' 
                : type === 'cancellation_fee' 
                ? `Cancellation Fee (Booking #${bookingId})` 
                : `Service Booking Payment (#${bookingId})`,
            },
            unit_amount: stripeAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        type,
        bookingId: bookingId || "",
        providerId: providerId || "",
        amount: reconciledAmount.toString(),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session || !session.url) {
      return NextResponse.json({ success: false, error: 'Failed to create checkout session.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: session.url, sessionId: session.id });

  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return NextResponse.json({ success: false, error: `Internal Server Error: ${errorMessage}` }, { status: 500 });
  }
}
