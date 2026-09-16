import { type NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebaseAdmin';
import { calculateServerBookingTotal } from '@/lib/bookingPricingServer';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { generateBookingId } from '@/lib/bookingUtils';
import { Timestamp } from '@/lib/mysqlDbAdmin';
import { verifyRequest } from '@/lib/dbSecurity';
import { getPool, getDocsInternal } from '@/lib/mysql';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      cartEntries,
      customerInfo = {},
      schedule = {},
      workCategoryId,
      promoCode,
      userId,
      paymentMethod,
      paymentDetails,
    } = body;

    if (!Array.isArray(cartEntries) || cartEntries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cart entries are required.' },
        { status: 400 }
      );
    }

    // Robust User Resolution:
    let resolvedUserId: string | undefined = typeof userId === 'string' && userId.trim() ? userId.trim() : undefined;

    // 1. Check request Authorization token if userId not yet resolved
    if (!resolvedUserId) {
      try {
        const caller = await verifyRequest(req);
        if (caller && caller.uid && caller.uid !== 'guest' && caller.uid !== 'server') {
          resolvedUserId = caller.uid;
        }
      } catch (authErr) {
        console.warn("Could not verify caller token in create-cash:", authErr);
      }
    }

    // 2. If still unresolved, look up registered user by email
    const emailToMatch = (customerInfo.email || '').toLowerCase().trim();
    if (!resolvedUserId && emailToMatch) {
      try {
        const pool = await getPool();
        const matchingUsers = await getDocsInternal(pool, 'users', [
          { type: 'where', field: 'email', op: '==', value: emailToMatch },
          { type: 'limit', value: 1 }
        ]);
        if (matchingUsers && matchingUsers.length > 0) {
          resolvedUserId = matchingUsers[0].id;
        }
      } catch (dbErr) {
        console.warn("Could not look up user by email in create-cash:", dbErr);
      }
    }

    // 1. Authoritative Server-side Price Calculation
    const pricing = await calculateServerBookingTotal({
      cartEntries,
      promoCode,
      categoryId: workCategoryId,
    });

    // 2. Authoritative Online Payment Verification (if requested)
    let finalPaymentMethod = 'Pay After Service';
    let finalStatus = 'Pending Payment';
    let onlinePaymentFields: Record<string, any> = {};

    if (paymentMethod === 'Online') {
      const razorpayPaymentId = paymentDetails?.razorpayPaymentId || paymentDetails?.razorpay_payment_id;
      const razorpayOrderId = paymentDetails?.razorpayOrderId || paymentDetails?.razorpay_order_id;
      const razorpaySignature = paymentDetails?.razorpaySignature || paymentDetails?.razorpay_signature;

      if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
        return NextResponse.json(
          { success: false, error: 'Payment details are required for online booking.' },
          { status: 400 }
        );
      }

      const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
      const appConfig = appConfigSnap.exists ? (appConfigSnap.data() as any) : null;
      const razorpayKeySecret = appConfig?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

      if (!razorpayKeySecret) {
        return NextResponse.json(
          { success: false, error: 'Payment gateway secret not configured on server.' },
          { status: 500 }
        );
      }

      const verificationPayload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const expectedSignature = crypto
        .createHmac('sha256', razorpayKeySecret)
        .update(verificationPayload.toString())
        .digest('hex');

      if (expectedSignature !== razorpaySignature) {
        return NextResponse.json(
          { success: false, error: 'Invalid online payment signature.' },
          { status: 400 }
        );
      }

      finalPaymentMethod = 'Online';
      finalStatus = 'Confirmed';
      onlinePaymentFields = {
        razorpayPaymentId,
        razorpayOrderId,
        razorpaySignature,
      };
    }

    // 3. Sequential Booking Number and ID Generation
    const nextBookingNumber = await assignNewBookingNumber();
    const newBookingId = generateBookingId();

    // 4. Construct Authoritative Booking Record
    const newBookingData = {
      bookingId: newBookingId,
      bookingNumber: nextBookingNumber,
      ...(resolvedUserId && { userId: resolvedUserId }),
      customerName: customerInfo.fullName || customerInfo.name || 'Guest User',
      customerEmail: customerInfo.email || '',
      customerPhone: customerInfo.phone || 'N/A',
      addressLine1: customerInfo.addressLine1 || 'N/A',
      ...(customerInfo.addressLine2 && { addressLine2: customerInfo.addressLine2 }),
      city: customerInfo.city || 'N/A',
      state: customerInfo.state || 'N/A',
      pincode: customerInfo.pincode || 'N/A',
      ...(customerInfo.latitude !== undefined && customerInfo.latitude !== null && { latitude: customerInfo.latitude }),
      ...(customerInfo.longitude !== undefined && customerInfo.longitude !== null && { longitude: customerInfo.longitude }),
      scheduledDate: schedule.scheduledDate || new Date().toISOString().split('T')[0],
      scheduledTimeSlot: schedule.scheduledTimeSlot || '10:00 AM',
      ...(schedule.estimatedEndTime && { estimatedEndTime: schedule.estimatedEndTime }),
      interveningBreaks: schedule.interveningBreaks || [],
      dailyTimeline: schedule.dailyTimeline || [],
      services: pricing.services,
      subTotal: pricing.subTotal,
      ...(pricing.visitingCharge > 0 && { visitingCharge: pricing.visitingCharge }),
      taxAmount: pricing.taxAmount,
      totalAmount: pricing.totalAmount,
      platformFeeTotal: pricing.platformFeeTotal,
      ...(pricing.appliedPlatformFees.length > 0 && { appliedPlatformFees: pricing.appliedPlatformFees }),
      ...(pricing.discountCode && { discountCode: pricing.discountCode }),
      ...(pricing.discountAmount > 0 && { discountAmount: pricing.discountAmount }),
      paymentMethod: finalPaymentMethod,
      status: finalStatus,
      ...onlinePaymentFields,
      createdAt: Timestamp.now(),
      isReviewedByCustomer: false,
      ...(workCategoryId && { workCategoryId }),
    };

    const docRef = await adminDb.collection('bookings').add(newBookingData);

    // 5. Trigger Server-Side Post Processing (Notifications, Dispatch, WhatsApp)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/bookings/post-process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        bookingDocId: docRef.id, 
        triggerSource: finalPaymentMethod === 'Online' ? 'online_checkout' : 'cash_checkout' 
      }),
    }).catch((err) => console.error('Error triggering post-process for booking:', err));

    // Send in-app notification if online booking placed by logged in user
    if (finalPaymentMethod === 'Online' && resolvedUserId) {
      try {
        await adminDb.collection('userNotifications').add({
          userId: resolvedUserId,
          title: 'Booking Confirmed!',
          message: `Your booking ${newBookingId} has been successfully placed. We'll assign a provider shortly.`,
          type: 'success',
          href: '/my-bookings',
          read: false,
          createdAt: Timestamp.now(),
        });
      } catch (notifyErr) {
        console.error('Error sending in-app notification for online booking:', notifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      bookingId: newBookingId,
      bookingDocId: docRef.id,
      booking: { ...newBookingData, id: docRef.id },
    });
  } catch (error: any) {
    console.error('Error in create-cash booking endpoint:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
