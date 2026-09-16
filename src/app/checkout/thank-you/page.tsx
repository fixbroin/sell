"use client";

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { CheckCircle2, Home, ListOrdered, Mail, Download, Loader2, MapPin, Tag, HandCoins, Ban, Hash, Package, Calendar, Clock, CreditCard, Activity, IndianRupee, Wallet, AlertTriangle } from 'lucide-react';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { Separator } from '@/components/ui/separator';
import { cn, formatCurrency } from '@/lib/utils';
import { db, auth } from '@/lib/firebase';
import { collection, addDoc, Timestamp, doc, getDoc, runTransaction, query, where, getDocs, limit, updateDoc, deleteDoc, setDoc } from '@/lib/mysqlDb';
import type { FirestoreBooking, BookingServiceItem, FirestoreService, FirestorePromoCode, AppSettings, AppliedPlatformFeeItem, FirestoreNotification, BookingStatus, MarketingAutomationSettings, MarketingSettings, ProviderApplication, FirestoreCategory } from '@/types/firestore';
import { getActiveCheckoutEntries, removeCheckedOutItemsFromCart } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { sendBookingConfirmationEmail, type BookingConfirmationEmailInput } from '@/ai/flows/sendBookingEmailFlow';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { sendUserCancellationEmail, type UserCancellationEmailInput } from '@/ai/flows/sendUserCancellationEmailFlow';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId } from '@/lib/guestIdManager';
import { sendWhatsAppFlow } from '@/ai/flows/sendWhatsAppFlow';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { incrementSystemStats } from '@/lib/systemStatsUtils';
import { getHaversineDistance } from '@/lib/locationUtils';

// Add type declarations for GTM dataLayer and gtag
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

interface DisplayBookingDetails extends Omit<FirestoreBooking, 'createdAt' | 'latitude' | 'longitude' | 'discountCode'> {
    servicesSummary: string;
    scheduledDateDisplay: string;
    visitingChargeDisplayed: number;
    createdAt: string;
    latitude: number | null;
    longitude: number | null;
    discountCode: string | null;
}

const generateBookingId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FB-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(chars.length * Math.random()));
  }
  return result;
};

const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive: boolean, taxPercent: number): number => {
    if (!isTaxInclusive || taxPercent <= 0) return displayedPrice;
    return (displayedPrice * 100) / (100 + taxPercent);
};

const clearLocalStorageItems = async (uid?: string) => {
    try {
        await removeCheckedOutItemsFromCart(uid);
    } catch (e) {
        console.error("Error clearing cart after booking:", e);
    }
    if (typeof window !== 'undefined') {
        localStorage.removeItem('yourbrandScheduledDate');
        localStorage.removeItem('yourbrandScheduledTimeSlot');
        localStorage.removeItem('yourbrandEstimatedEndTime');
        localStorage.removeItem('yourbrandCustomerAddress');
        localStorage.removeItem('razorpayPaymentId');
        localStorage.removeItem('razorpayOrderId');
        localStorage.removeItem('razorpaySignature');
        localStorage.removeItem('yourbrandAppliedPromoCode');
        localStorage.removeItem('yourbrandBookingDiscountCode');
        localStorage.removeItem('yourbrandBookingDiscountAmount');
        localStorage.removeItem('yourbrandAppliedPromoCodeId');
        localStorage.removeItem('yourbrandAppliedPlatformFees');
        localStorage.removeItem('isProcessingCancellationFee');
        localStorage.removeItem('bookingIdForCancellationFee');
        localStorage.removeItem('cancellationFeeAmount');
        localStorage.removeItem('yourbrandPaymentMethod');
        localStorage.removeItem('yourbrandFinalBookingTotal');
        localStorage.removeItem('pendingBookingDocId');
    }
};

// --- START: Pricing Logic ---
const getPriceForNthUnit = (service: FirestoreService, n: number): number => {
  if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0 || n <= 0) {
    return service.discountedPrice ?? service.price;
  }
  const sortedVariants = [...service.priceVariants].sort((a, b) => a.fromQuantity - b.fromQuantity);
  const applicableTier = sortedVariants.find(tier => {
    const start = tier.fromQuantity;
    const end = tier.toQuantity ?? Infinity;
    return n >= start && n <= end;
  });
  if (applicableTier) return applicableTier.price;
  const lastApplicableTier = sortedVariants.slice().reverse().find(tier => n >= tier.fromQuantity);
  if (lastApplicableTier) return lastApplicableTier.price;
  return service.discountedPrice ?? service.price;
};

const calculateIncrementalTotalPriceForItem = (service: FirestoreService, quantity: number): number => {
    if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0) {
        const unitPrice = service.discountedPrice ?? service.price;
        return unitPrice * quantity;
    }
    let total = 0;
    for (let i = 1; i <= quantity; i++) {
        total += getPriceForNthUnit(service, i);
    }
    return total;
};
// --- END: Pricing Logic ---

const formatDateForDisplay = (dateString: string | undefined, appConfig?: any): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return formatDateInTimezone(date, appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
    } catch (e) {
        return dateString;
    }
};


export default function ThankYouPage() {
  const [isMounted, setIsMounted] = useState(false);
  const processingRef = useRef(false); // To prevent double processing in StrictMode
  const [bookingDetailsForDisplay, setBookingDetailsForDisplay] = useState<DisplayBookingDetails | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isCancellationConfirmation, setIsCancellationConfirmation] = useState(false);
  const [cancelledBookingId, setCancelledBookingId] = useState<string | null>(null); 
  const [cancellationFeePaidAmount, setCancellationFeePaidAmount] = useState<number>(0);
  const { toast } = useToast();
  const { user: currentUser, isInitialAuthCheckComplete } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hideLoading } = useLoading();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const { settings: globalCompanySettings } = useGlobalSettings();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';

  const SummaryItem = ({ icon: Icon, label, value, className, valueClassName }: { icon: any, label: string, value: React.ReactNode, className?: string, valueClassName?: string }) => (
    <div className={cn("flex items-center justify-between py-3.5 group", className)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-primary/5 group-hover:bg-primary/10 transition-colors">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <span className={cn("text-sm font-bold text-right ml-4", valueClassName)}>{value}</span>
    </div>
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || isLoadingAppSettings || !isInitialAuthCheckComplete) return;

    const processPage = async () => {
      if (processingRef.current) return;
      processingRef.current = true;
      
      setIsLoadingPage(true);
      hideLoading(); 
      
      const paymentMethod = localStorage.getItem('yourbrandPaymentMethod');
      const isOnlinePayment = paymentMethod === 'Online';
      
      const isProcessingCancellationFee = localStorage.getItem('isProcessingCancellationFee') === 'true';
      const bookingFirestoreDocIdForCancellation = localStorage.getItem('bookingIdForCancellationFee');
      const feeAmountStr = localStorage.getItem('cancellationFeeAmount');
      const razorpayPaymentId = localStorage.getItem('razorpayPaymentId'); 
      const razorpayOrderId = localStorage.getItem('razorpayOrderId');
      const razorpaySignature = localStorage.getItem('razorpaySignature');

      // --- 1. Handle Cancellation Fee Payment Verification ---
      const stripePaymentMethod = searchParams.get('payment_method');
      const stripeSessionId = searchParams.get('session_id');
      const isStripeCancellation = stripePaymentMethod === 'stripe' && !!stripeSessionId;

      if (isProcessingCancellationFee && bookingFirestoreDocIdForCancellation && feeAmountStr && (razorpayPaymentId || isStripeCancellation)) {
        try {
            let paymentTransactionId = razorpayPaymentId;
            if (isStripeCancellation) {
              const verifyRes = await fetch(`/api/stripe/verify-session?session_id=${stripeSessionId}`);
              const verifyData = await verifyRes.json();
              if (!verifyData.success) {
                throw new Error(verifyData.error || "Stripe payment verification failed.");
              }
              paymentTransactionId = verifyData.payment_intent || stripeSessionId;
            } else {
              const verificationResponse = await fetch('/api/razorpay/verify-payment', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature }),
              });
              const verificationResult = await verificationResponse.json();
              if (!verificationResult.success || verificationResult.status !== 'captured') {
                  throw new Error(verificationResult.error || "Payment verification failed.");
              }
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });
            
            setIsCancellationConfirmation(true);
            const feeAmount = parseFloat(feeAmountStr);
            setCancellationFeePaidAmount(feeAmount);
            
            const originalBookingRef = doc(db, "bookings", bookingFirestoreDocIdForCancellation);
            const originalBookingSnap = await getDoc(originalBookingRef);
            if (originalBookingSnap.exists()) {
                const originalBookingData = originalBookingSnap.data() as FirestoreBooking;
                setCancelledBookingId(originalBookingData.bookingId);
                await updateDoc(originalBookingRef, { 
                    status: "Cancelled" as BookingStatus, 
                    updatedAt: Timestamp.now(),
                    cancellationFeePaid: feeAmount,
                    cancellationPaymentId: paymentTransactionId,
                });

                // 1. Create and send notification to USER
                if (currentUser) {
                  const userNotificationData: FirestoreNotification = {
                    userId: currentUser.uid,
                    title: "Booking Cancelled",
                    message: `Your booking ${originalBookingData.bookingId} has been successfully cancelled.`,
                    type: 'error',
                    href: '/my-bookings',
                    read: false,
                    createdAt: Timestamp.now(),
                  };
                  await addDoc(collection(db, "userNotifications"), userNotificationData);
                  triggerPushNotification({
                    userId: currentUser.uid,
                    title: userNotificationData.title,
                    body: userNotificationData.message,
                    href: userNotificationData.href
                  });
                }

                // 2. Create and send notification to ADMIN
                try {
                  const usersRef = collection(db, "users");
                  const adminQuery = query(usersRef, where("email", "==", ADMIN_EMAIL), limit(1));
                  const adminSnapshot = await getDocs(adminQuery);
                  if (!adminSnapshot.empty) {
                    const adminUid = adminSnapshot.docs[0].id;
                    const adminNotificationData: FirestoreNotification = {
                      userId: adminUid,
                      title: "Booking Cancelled by User",
                      message: `Booking ${originalBookingData.bookingId} was cancelled by ${originalBookingData.customerName || currentUser?.displayName || currentUser?.email}.`,
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
                  console.error("Error notifying admin about user cancellation:", err);
                }

                // 3. Trigger post-process API for WhatsApp, Stats, etc.
                fetch('/api/bookings/post-process', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bookingDocId: bookingFirestoreDocIdForCancellation, cancelledBy: 'user' }),
                }).catch(err => console.error("Error triggering post-process after paid cancellation:", err));

                // 4. Send cancellation email
                try {
                  const emailInput: UserCancellationEmailInput = {
                      bookingId: originalBookingData.bookingId,
                      customerName: originalBookingData.customerName,
                      customerEmail: originalBookingData.customerEmail,
                      paymentMethod: originalBookingData.paymentMethod,
                      paidAmount: originalBookingData.paymentMethod === 'Online' ? originalBookingData.totalAmount : 0,
                      cancellationFee: feeAmount,
                      refundableAmount: originalBookingData.paymentMethod === 'Online' ? Math.max(0, originalBookingData.totalAmount - feeAmount) : 0,
                      cancellationPaymentId: paymentTransactionId || undefined,
                      siteName: globalCompanySettings?.websiteName || "Yourbrand",
                      smtpHost: appConfig.smtpHost,
                      smtpPort: appConfig.smtpPort,
                      smtpUser: appConfig.smtpUser,
                      smtpPass: appConfig.smtpPass,
                      senderEmail: appConfig.senderEmail,
                      currencySymbol: symbol,
                  };
                  await sendUserCancellationEmail(emailInput);
                } catch (emailError) {
                  console.error("Cancellation email failed from thank-you page:", emailError);
                }

                toast({ title: "Booking Cancelled", description: `Booking ${originalBookingData.bookingId} has been cancelled.` });
            } else {
                toast({ title: "Error", description: "Original booking not found.", variant: "destructive" });
            }

        } catch (error) {
            console.error("Error during cancellation payment verification/update:", error);
            toast({ title: "Payment Error", description: (error as Error).message || "Failed to verify payment. Please contact support.", variant: "destructive" });
        } finally {
            await clearLocalStorageItems(currentUser?.uid);
            setIsLoadingPage(false);
        }
        return;
      }
      
      const cartEntriesFromStorage = getActiveCheckoutEntries();
      if (cartEntriesFromStorage.length === 0) {
        toast({ title: "Booking Processed", description: "Redirecting to My Bookings.", variant: "default" });
        router.push('/my-bookings');
        setIsLoadingPage(false);
        return;
      }

      // --- 2. Handle Regular Booking Confirmation ---
      const stripeBookingId = searchParams.get('bookingId') || (typeof window !== 'undefined' ? localStorage.getItem('pendingBookingDocId') : null);
      const isStripeBooking = stripePaymentMethod === 'stripe' && !isProcessingCancellationFee;

      if (isStripeBooking) {
        if (!stripeSessionId || !stripeBookingId) {
            toast({ title: "Verification Failed", description: "Payment details are missing. Please contact support if you were charged.", variant: "destructive" });
            router.push('/cart'); setIsLoadingPage(false); return;
        }
        try {
            const verifyRes = await fetch(`/api/stripe/verify-session?session_id=${stripeSessionId}&bookingId=${stripeBookingId}`);
            const verifyData = await verifyRes.json();
            if (!verifyData.success) {
                throw new Error(verifyData.error || "Stripe payment verification failed.");
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });

            const bookingRef = doc(db, 'bookings', stripeBookingId);
            const bookingSnap = await getDoc(bookingRef);

            if (bookingSnap.exists() || verifyData.booking) {
                const bookingData = (verifyData.booking || (bookingSnap.exists() ? bookingSnap.data() : {})) as FirestoreBooking;
                const finalBookingNum = bookingData.bookingNumber;
                const servicesSummary = (bookingData.services || []).map(s => `${s.name} (x${s.quantity})`).join(', ');

                logUserActivity(
                  'newBooking',
                  {
                    bookingId: bookingData.bookingId,
                    bookingDocId: stripeBookingId,
                    totalAmount: bookingData.totalAmount,
                    paymentMethod: 'Online',
                    customerName: bookingData.customerName,
                    customerPhone: bookingData.customerPhone,
                    servicesSummary
                  },
                  currentUser?.uid,
                  !currentUser ? getGuestId() : null,
                  bookingData.customerName
                );
                setBookingDetailsForDisplay({ 
                    ...bookingData, 
                    id: stripeBookingId, 
                    bookingNumber: finalBookingNum,
                    servicesSummary, 
                    createdAt: (() => {
                        const millis = getTimestampMillis(bookingData.createdAt);
                        if (!millis) return 'N/A';
                        const d = new Date(millis);
                        return `${formatDateInTimezone(d, appConfig?.timezone || 'Asia/Kolkata')} ${formatTimeInTimezone(d, appConfig?.timezone || 'Asia/Kolkata')}`;
                    })(),
                    scheduledDateDisplay: formatDateForDisplay(bookingData.scheduledDate, appConfig),
                    latitude: bookingData.latitude === undefined ? null : bookingData.latitude, 
                    longitude: bookingData.longitude === undefined ? null : bookingData.longitude, 
                    visitingChargeDisplayed: bookingData.visitingCharge || 0, 
                    discountCode: bookingData.discountCode || null, 
                    discountAmount: bookingData.discountAmount || 0, 
                    paymentMethod: 'Online',
                    status: 'Confirmed',
                });
            } else {
                throw new Error("Booking record not found.");
            }

        } catch (error: any) {
            console.error("Error during Stripe payment confirmation:", error);
            toast({ title: "Payment Error", description: error.message, variant: "destructive", duration: 7000 });
            router.push('/checkout/payment'); 
            setIsLoadingPage(false); 
            return;
        } finally {
            await clearLocalStorageItems(currentUser?.uid);
            setIsLoadingPage(false);
        }
        return;
      }

      const urlBookingId = searchParams.get('bookingId') || (typeof window !== 'undefined' ? localStorage.getItem('pendingBookingDocId') : null);
      const isRazorpayBooking = (searchParams.get('payment_method') === 'razorpay' || (isOnlinePayment && !!urlBookingId)) && !isProcessingCancellationFee;

      if (isRazorpayBooking && urlBookingId) {
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            toast({ title: "Verification Failed", description: "Payment details are missing. Please contact support if you were charged.", variant: "destructive" });
            router.push('/cart'); setIsLoadingPage(false); return;
        }
        try {
            const verificationResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    razorpay_payment_id: razorpayPaymentId, 
                    razorpay_order_id: razorpayOrderId, 
                    razorpay_signature: razorpaySignature,
                    bookingId: urlBookingId
                }),
            });
            const verificationResult = await verificationResponse.json();
            if (!verificationResult.success || verificationResult.status !== 'captured') {
                throw new Error(verificationResult.error || "Payment verification failed. Please contact support.");
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });

            const bookingRef = doc(db, 'bookings', urlBookingId);
            const bookingSnap = await getDoc(bookingRef);

            if (bookingSnap.exists() || verificationResult.booking) {
                const bookingData = (verificationResult.booking || (bookingSnap.exists() ? bookingSnap.data() : {})) as FirestoreBooking;
                const finalBookingNum = bookingData.bookingNumber;
                const servicesSummary = (bookingData.services || []).map(s => `${s.name} (x${s.quantity})`).join(', ');

                logUserActivity(
                  'newBooking',
                  {
                    bookingId: bookingData.bookingId,
                    bookingDocId: urlBookingId,
                    totalAmount: bookingData.totalAmount,
                    paymentMethod: 'Online',
                    customerName: bookingData.customerName,
                    customerPhone: bookingData.customerPhone,
                    servicesSummary
                  },
                  currentUser?.uid,
                  !currentUser ? getGuestId() : null,
                  bookingData.customerName
                );
                setBookingDetailsForDisplay({ 
                    ...bookingData, 
                    id: urlBookingId, 
                    bookingNumber: finalBookingNum,
                    servicesSummary, 
                    createdAt: (() => {
                        const millis = getTimestampMillis(bookingData.createdAt);
                        if (!millis) return 'N/A';
                        const d = new Date(millis);
                        return `${formatDateInTimezone(d, appConfig?.timezone || 'Asia/Kolkata')} ${formatTimeInTimezone(d, appConfig?.timezone || 'Asia/Kolkata')}`;
                    })(),
                    scheduledDateDisplay: formatDateForDisplay(bookingData.scheduledDate, appConfig),
                    latitude: bookingData.latitude === undefined ? null : bookingData.latitude, 
                    longitude: bookingData.longitude === undefined ? null : bookingData.longitude, 
                    visitingChargeDisplayed: bookingData.visitingCharge || 0, 
                    discountCode: bookingData.discountCode || null, 
                    discountAmount: bookingData.discountAmount || 0, 
                    paymentMethod: 'Online',
                    status: 'Confirmed',
                });
            } else {
                throw new Error("Booking record not found.");
            }

        } catch (error: any) {
            console.error("Error during Razorpay payment confirmation:", error);
            toast({ title: "Payment Error", description: error.message, variant: "destructive", duration: 7000 });
            router.push('/checkout/payment'); 
            setIsLoadingPage(false); 
            return;
        } finally {
            await clearLocalStorageItems(currentUser?.uid);
            setIsLoadingPage(false);
        }
        return;
      }

      if (isOnlinePayment) {
        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            toast({ title: "Verification Failed", description: "Payment details are missing. Please contact support if you were charged.", variant: "destructive" });
            router.push('/cart'); setIsLoadingPage(false); return;
        }
        try {
            const verificationResponse = await fetch('/api/razorpay/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ razorpay_payment_id: razorpayPaymentId, razorpay_order_id: razorpayOrderId, razorpay_signature: razorpaySignature }),
            });
            const verificationResult = await verificationResponse.json();
            if (!verificationResult.success || verificationResult.status !== 'captured') {
                throw new Error(verificationResult.error || "Payment verification failed. Please contact support.");
            }
            toast({ title: "Payment Verified", description: "Your payment has been successfully verified." });
            // Payment verified, we continue to create the booking
        } catch (error) {
            console.error("Error during regular payment verification:", error);
            toast({ title: "Payment Error", description: (error as Error).message, variant: "destructive", duration: 7000 });
            router.push('/checkout/payment'); setIsLoadingPage(false); return;
        }
      }

      try {
        let customerEmail = "", scheduledDateStored = new Date().toLocaleDateString('en-CA'), scheduledTimeSlot = "10:00 AM";
        let customerName = "Guest User", customerPhone = "N/A", addressLine1 = "N/A", addressLine2: string | undefined, city = "N/A", state = "N/A", pincode = "N/A";
        let latitude: number | undefined, longitude: number | undefined;
        let bookingDiscountCode: string | undefined;
        let estimatedEndTime: string | undefined;
        let currentCategoryId: string | null = null;
        let storedInterveningBreaks: any[] = [];
        let storedDailyTimeline: any[] = [];

        if (typeof window !== 'undefined') {
          const storedEmail = localStorage.getItem('yourbrandCustomerEmail');
          customerEmail = (storedEmail && storedEmail.trim()) ? storedEmail : (currentUser?.email || "");
          currentCategoryId = localStorage.getItem('yourbrandActiveCheckoutCategory');
          scheduledDateStored = localStorage.getItem('yourbrandScheduledDate') || scheduledDateStored; 
          scheduledTimeSlot = localStorage.getItem('yourbrandScheduledTimeSlot') || scheduledTimeSlot;
          estimatedEndTime = localStorage.getItem('yourbrandEstimatedEndTime') || undefined;
          const breaksStr = localStorage.getItem('yourbrandInterveningBreaks');
          if (breaksStr) { try { storedInterveningBreaks = JSON.parse(breaksStr); } catch (e) {} }
          const dailyTimelineStr = localStorage.getItem('yourbrandDailyTimeline');
          if (dailyTimelineStr) { try { storedDailyTimeline = JSON.parse(dailyTimelineStr); } catch (e) {} }
          bookingDiscountCode = localStorage.getItem('yourbrandBookingDiscountCode') || undefined;
          const addressDataString = localStorage.getItem('yourbrandCustomerAddress');
          if (addressDataString) { const addressData = JSON.parse(addressDataString); customerName = addressData.fullName || customerName; customerPhone = addressData.phone || customerPhone; customerEmail = addressData.email || customerEmail; addressLine1 = addressData.addressLine1 || addressLine1; addressLine2 = addressData.addressLine2 || undefined; city = addressData.city || city; state = addressData.state || state; pincode = addressData.pincode || pincode; latitude = addressData.latitude === null ? undefined : addressData.latitude; longitude = addressData.longitude === null ? undefined : addressData.longitude; }
        }

        const effectiveUserId = currentUser?.uid || (auth.currentUser ? auth.currentUser.uid : null) || (typeof window !== 'undefined' ? localStorage.getItem('yourbrand_user_uid') : null) || undefined;

        const createHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          if (auth.currentUser) {
            const token = await auth.currentUser.getIdToken();
            createHeaders['Authorization'] = `Bearer ${token}`;
          }
        } catch (tokenErr) {
          console.warn("Could not attach idToken to create-cash:", tokenErr);
        }

        // Authoritative server-side booking creation and price calculation
        const createCashRes = await fetch('/api/bookings/create-cash', {
          method: 'POST',
          headers: createHeaders,
          body: JSON.stringify({
            cartEntries: cartEntriesFromStorage,
            customerInfo: {
              fullName: customerName,
              email: customerEmail,
              phone: customerPhone,
              addressLine1,
              addressLine2,
              city,
              state,
              pincode,
              latitude,
              longitude,
            },
            schedule: {
              scheduledDate: scheduledDateStored,
              scheduledTimeSlot,
              estimatedEndTime,
              interveningBreaks: storedInterveningBreaks,
              dailyTimeline: storedDailyTimeline,
            },
            workCategoryId: currentCategoryId,
            promoCode: bookingDiscountCode,
            userId: effectiveUserId,
            paymentMethod: isOnlinePayment ? 'Online' : 'Pay After Service',
            paymentDetails: isOnlinePayment ? {
              razorpayPaymentId,
              razorpayOrderId,
              razorpaySignature
            } : undefined,
          }),
        });

        const createResult = await createCashRes.json();
        if (!createResult.success) {
          throw new Error(createResult.error || 'Failed to place booking.');
        }

        const newBookingData = createResult.booking;
        const newBookingId = createResult.bookingId;
        const bookingDocId = createResult.bookingDocId;

        const servicesSummary = (newBookingData.services || []).map((s: any) => `${s.name} (x${s.quantity})`).join(', ');

        const finalMethod = newBookingData.paymentMethod || (isOnlinePayment ? 'Online' : 'Pay After Service');
        const finalStatus = newBookingData.status || (isOnlinePayment ? 'Confirmed' : 'Pending Payment');

        logUserActivity(
          'newBooking',
          {
            bookingId: newBookingId,
            bookingDocId: bookingDocId,
            totalAmount: newBookingData.totalAmount,
            paymentMethod: finalMethod,
            customerName,
            customerPhone,
            servicesSummary
          },
          currentUser?.uid,
          !currentUser ? getGuestId() : null,
          customerName
        );

        setBookingDetailsForDisplay({ 
            ...newBookingData, 
            id: bookingDocId, 
            servicesSummary, 
            createdAt: (() => {
                const millis = getTimestampMillis(newBookingData.createdAt);
                if (!millis) return 'N/A';
                const d = new Date(millis);
                return `${formatDateInTimezone(d, 'Asia/Kolkata')} ${formatTimeInTimezone(d, 'Asia/Kolkata')}`;
            })(),
            scheduledDateDisplay: formatDateForDisplay(newBookingData.scheduledDate, appConfig),
            latitude: newBookingData.latitude === undefined ? null : newBookingData.latitude, 
            longitude: newBookingData.longitude === undefined ? null : newBookingData.longitude, 
            visitingChargeDisplayed: newBookingData.visitingCharge || 0, 
            discountCode: newBookingData.discountCode, 
            discountAmount: newBookingData.discountAmount, 
            appliedPlatformFees: newBookingData.appliedPlatformFees,
            paymentMethod: finalMethod,
            status: finalStatus,
        } as any);
        setIsLoadingPage(false);
        toast({ title: "Booking Placed!", description: `Your booking ID is ${newBookingId}.`});

        // --- FIRE AND FORGET: Server handles everything else safely ---
        if (!isOnlinePayment) {
          fetch('/api/bookings/post-process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bookingDocId: bookingDocId }),
          }).catch(err => console.error("Error triggering server post-process:", err));
        }

        await clearLocalStorageItems(currentUser?.uid);
        return;

      } catch (error) {
        console.error("Error creating booking:", error);
        toast({ title: "Booking Failed", description: (error as Error).message || "Could not complete booking.", variant: "destructive" });
        setIsLoadingPage(false);
      }
    };

    processPage();
  }, [isMounted, isLoadingAppSettings, isInitialAuthCheckComplete, appConfig, toast, router, currentUser, hideLoading]);

  if (isLoadingPage || !isMounted || isLoadingAppSettings || (!bookingDetailsForDisplay && !isCancellationConfirmation)) {
    return (
      <div className="max-w-2xl mx-auto px-2 sm:px-0">
        <CheckoutStepper currentStepId="confirmation" />
        <Card className="shadow-lg"><CardHeader className="items-center text-center"><Loader2 className="h-12 w-12 text-primary animate-spin mb-4" /><CardTitle className="text-xl sm:text-2xl">Processing Your Request...</CardTitle><CardDescription className="text-sm sm:text-base">Please wait a moment.</CardDescription></CardHeader><CardContent className="space-y-4 min-h-[200px]"></CardContent></Card>
      </div>
    );
  }

  if (isCancellationConfirmation) {
    return (
      <div className="max-w-3xl mx-auto px-2 sm:px-0 pb-10">
        <Card className="shadow-2xl border-none overflow-hidden rounded-3xl text-center">
          <CardHeader className="items-center px-4 sm:px-6 pt-10 pb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-destructive/10 blur-3xl rounded-full scale-150 animate-pulse" />
              <Ban className="h-20 w-20 sm:h-24 sm:w-24 text-destructive relative z-10" />
            </div>
            <CardTitle className="text-3xl sm:text-4xl font-black mt-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Booking Cancelled</CardTitle>
            <CardDescription className="text-lg text-muted-foreground font-medium max-w-sm mx-auto">
                Cancellation fee of <span className="text-foreground font-bold">{formatCurrency(cancellationFeePaidAmount, symbol, decimals, code)}</span> has been paid.
                Booking ID: <span className="text-foreground font-bold">#{cancelledBookingId || 'N/A'}</span> has been successfully cancelled.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 md:px-8 pb-8 pt-2">
             <div className="p-4 rounded-2xl bg-muted border border-border/50 text-sm text-muted-foreground">
                If applicable, any refund will be processed to your original payment method within 5-7 business days.
             </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-4 justify-center p-8 bg-muted/30 border-t">
            <Link href="/" passHref className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 font-bold rounded-xl border-2 hover:bg-background shadow-sm">
                <Home className="mr-2 h-4 w-4" /> Go to Home
              </Button>
            </Link>
            <Link href="/my-bookings" passHref className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-12 font-bold rounded-xl shadow-lg shadow-primary/20">
                <ListOrdered className="mr-2 h-4 w-4" /> View My Bookings
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }
  
  if (!bookingDetailsForDisplay) {
     return (
      <div className="max-w-3xl mx-auto px-2 sm:px-0 pb-10">
        <CheckoutStepper currentStepId="confirmation" />
        <Card className="shadow-2xl border-none overflow-hidden rounded-3xl text-center">
            <CardHeader className="items-center px-4 sm:px-6 pt-10 pb-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full scale-150 animate-pulse" />
                  {React.createElement('lottie-player', {
                    src: '/animations/success.json',
                    background: 'transparent',
                    speed: '1',
                    style: { width: '96px', height: '96px' },
                    autoplay: true,
                    className: 'relative z-10'
                  })}
                </div>
                <CardTitle className="text-3xl sm:text-4xl font-black mt-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Booking Processed</CardTitle>
                <CardDescription className="text-lg text-muted-foreground font-medium max-w-sm mx-auto">
                    Your request has been successfully received and processed.
                </CardDescription>
            </CardHeader>
             <CardContent className="px-4 sm:px-6 md:px-8 pb-8 pt-2">
                 <p className="text-center text-muted-foreground">Loading your booking details. You can also view them in your account profile.</p>
             </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-4 justify-center p-8 bg-muted/30 border-t">
                <Link href="/" passHref className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 font-bold rounded-xl border-2 hover:bg-background shadow-sm">
                    <Home className="mr-2 h-4 w-4" /> Go to Home
                  </Button>
                </Link>
                <Link href="/my-bookings" passHref className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto h-12 font-bold rounded-xl shadow-lg shadow-primary/20">
                    <ListOrdered className="mr-2 h-4 w-4" /> View My Bookings
                  </Button>
                </Link>
            </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-2 sm:px-0 pb-10">
      <CheckoutStepper currentStepId="confirmation" />
      <Card className="shadow-2xl border-none overflow-hidden rounded-3xl">
        <CardHeader className="items-center px-4 sm:px-6 pt-10 pb-6 text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full scale-150 animate-pulse" />
            {React.createElement('lottie-player', {
              src: '/animations/success.json',
              background: 'transparent',
              speed: '1',
              style: { width: '96px', height: '96px' },
              autoplay: true,
              className: 'relative z-10'
            })}
          </div>
          <CardTitle className="text-3xl sm:text-4xl font-black mt-6 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Booking Confirmed!
          </CardTitle>
          <CardDescription className="text-lg text-muted-foreground font-medium max-w-sm mx-auto">
            Sit back and relax. Your service has been successfully scheduled.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-4 sm:px-8 pb-8 pt-2 text-left">
          <div className="max-w-md mx-auto">
            <h3 className="text-xl font-bold mb-6 text-center text-foreground flex items-center justify-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Booking Summary
            </h3>
            
            <div className="space-y-0">
                <SummaryItem icon={Hash} label="Booking ID" value={bookingDetailsForDisplay.bookingId} />
                <Separator className="opacity-40" />
                
                <SummaryItem icon={Package} label="Service(s)" value={bookingDetailsForDisplay.servicesSummary} />
                <Separator className="opacity-40" />
                
                <SummaryItem icon={Calendar} label="Scheduled Date" value={bookingDetailsForDisplay.scheduledDateDisplay} />
                <Separator className="opacity-40" />
                
                <SummaryItem icon={Clock} label="Time Slot" value={bookingDetailsForDisplay.scheduledTimeSlot} />
                <Separator className="opacity-40" />

                {bookingDetailsForDisplay.estimatedEndTime && (
                  <>
                    <SummaryItem 
                        icon={Activity} 
                        label="Estimated Completion" 
                        valueClassName="text-emerald-600"
                        value={`${formatDateInTimezone(new Date(bookingDetailsForDisplay.estimatedEndTime), 'Asia/Kolkata')} ${formatTimeInTimezone(new Date(bookingDetailsForDisplay.estimatedEndTime), 'Asia/Kolkata')}`} 
                    />
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.dailyTimeline && bookingDetailsForDisplay.dailyTimeline.length > 1 && (
                  <>
                    <div className="py-2.5 px-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 rounded-xl space-y-2 text-sm text-muted-foreground my-2">
                      <p className="font-bold text-xs text-blue-800 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Day-by-Day Work Schedule
                      </p>
                      <div className="space-y-1.5 pl-1">
                        {bookingDetailsForDisplay.dailyTimeline.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap text-sm py-1.5 border-b border-border/20 last:border-0">
                            <span className="font-semibold text-foreground/80">{item.dateLabel}</span>
                            <span className="font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap">
                              {item.startTime} - {item.endTime}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.interveningBreaks && bookingDetailsForDisplay.interveningBreaks.length > 0 && (
                  <>
                    <div className="py-2 px-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 rounded-xl space-y-1.5 text-xs text-muted-foreground my-2">
                      <p className="font-bold text-[10px] text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Includes Gaps / Holidays
                      </p>
                      <div className="space-y-1 pl-1">
                        {bookingDetailsForDisplay.interveningBreaks.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className={`mt-1.5 h-1.5 w-1.5 rounded-full ${item.type === 'holiday' ? 'bg-red-500' : item.type === 'partial' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                            <div className="text-muted-foreground">
                              <span className="font-semibold text-foreground/80">{item.dateLabel}</span>
                              {item.timeLabel && <span className="ml-1">({item.timeLabel})</span>}
                              <span className="ml-1.5 font-medium text-muted-foreground/80">— {item.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator className="opacity-40" />
                  </>
                )}

                <SummaryItem icon={MapPin} label="Address" value={`${bookingDetailsForDisplay.addressLine1}${bookingDetailsForDisplay.addressLine2 ? ', ' + bookingDetailsForDisplay.addressLine2 : ''}, ${bookingDetailsForDisplay.city}`} />
                <Separator className="opacity-40" />

                <SummaryItem icon={IndianRupee} label="Items Total" value={formatCurrency(bookingDetailsForDisplay.subTotal, symbol, decimals, code)} />
                <Separator className="opacity-40" />

                {bookingDetailsForDisplay.discountAmount != null && bookingDetailsForDisplay.discountAmount > 0 && (
                  <>
                    <SummaryItem 
                        icon={Tag} 
                        label={`Discount (${bookingDetailsForDisplay.discountCode || 'Applied'})`} 
                        valueClassName="text-emerald-600"
                        value={`- ${formatCurrency(bookingDetailsForDisplay.discountAmount, symbol, decimals, code)}`} 
                    />
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.visitingChargeDisplayed != null && bookingDetailsForDisplay.visitingChargeDisplayed > 0 && (
                  <>
                    <SummaryItem icon={IndianRupee} label="Visiting Charge" value={`+ ${formatCurrency(bookingDetailsForDisplay.visitingCharge || 0, symbol, decimals, code)}`} />
                    <Separator className="opacity-40" />
                  </>
                )}

                {bookingDetailsForDisplay.appliedPlatformFees?.map((fee, index) => (
                  <React.Fragment key={index}>
                    <SummaryItem icon={HandCoins} label={fee.name} value={`+ ${formatCurrency(fee.calculatedFeeAmount + fee.taxAmountOnFee, symbol, decimals, code)}`} />
                    <Separator className="opacity-40" />
                  </React.Fragment>
                ))}

                {bookingDetailsForDisplay.taxAmount > 0 && (
                  <>
                    <SummaryItem icon={Activity} label="Total Tax" value={`+ ${formatCurrency(bookingDetailsForDisplay.taxAmount, symbol, decimals, code)}`} />
                    <Separator className="opacity-40" />
                  </>
                )}

                <SummaryItem 
                    icon={CreditCard} 
                    label="Total Amount" 
                    valueClassName="text-xl text-primary"
                    value={formatCurrency(bookingDetailsForDisplay.totalAmount, symbol, decimals, code)} 
                />
                <Separator className="opacity-40" />

                <SummaryItem icon={Wallet} label="Payment Method" value={bookingDetailsForDisplay.paymentMethod} />
                <Separator className="opacity-40" />

                <SummaryItem icon={Activity} label="Status" value={bookingDetailsForDisplay.status} />
            </div>

            {bookingDetailsForDisplay.customerEmail && (
              <div className="mt-8 p-4 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center gap-3">
                 <Mail className="h-5 w-5 text-primary shrink-0" />
                 <p className="text-sm text-muted-foreground text-center">
                   Confirmation sent to <span className="font-bold text-foreground">{bookingDetailsForDisplay.customerEmail}</span>
                 </p>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col sm:flex-row gap-4 justify-center p-8 bg-muted/30 border-t">
          <Link href="/" passHref className="w-full sm:w-auto">
            <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 font-bold rounded-xl border-2 hover:bg-background shadow-sm">
              <Home className="mr-2 h-4 w-4" /> Go to Home
            </Button>
          </Link>
          <Link href="/my-bookings" passHref className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto h-12 font-bold rounded-xl shadow-lg shadow-primary/20">
              <ListOrdered className="mr-2 h-4 w-4" /> View My Bookings
            </Button>
          </Link>
        </CardFooter>
      </Card>
      <Script src="https://unpkg.com/@lottiefiles/lottie-player@latest/dist/lottie-player.js" strategy="lazyOnload" />
    </div>
  );
}
