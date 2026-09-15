// src/app/api/bookings/create-cash/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { calculateServerBookingTotal } from '@/lib/bookingPricingServer';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { generateBookingId } from '@/lib/bookingUtils';
import { Timestamp } from '@/lib/mysqlDbAdmin';

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
    } = body;

    if (!Array.isArray(cartEntries) || cartEntries.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Cart entries are required.' },
        { status: 400 }
      );
    }

    // 1. Authoritative Server-side Price Calculation
    const pricing = await calculateServerBookingTotal({
      cartEntries,
      promoCode,
      categoryId: workCategoryId,
    });

    // 2. Sequential Booking Number and ID Generation
    const nextBookingNumber = await assignNewBookingNumber();
    const newBookingId = generateBookingId();

    // 3. Construct Authoritative Booking Record
    const newBookingData = {
      bookingId: newBookingId,
      bookingNumber: nextBookingNumber,
      ...(userId && { userId }),
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
      paymentMethod: 'Pay After Service',
      status: 'Pending Payment',
      createdAt: Timestamp.now(),
      isReviewedByCustomer: false,
      ...(workCategoryId && { workCategoryId }),
    };

    const docRef = await adminDb.collection('bookings').add(newBookingData);

    // 4. Trigger Server-Side Post Processing (Notifications, Dispatch, WhatsApp)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    fetch(`${appUrl}/api/bookings/post-process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingDocId: docRef.id, triggerSource: 'cash_checkout' }),
    }).catch((err) => console.error('Error triggering post-process for cash booking:', err));

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
