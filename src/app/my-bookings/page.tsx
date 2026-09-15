
"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ListOrdered, PackageSearch, ArrowLeft, Loader2, Eye, Trash2, Download, Ban, UserCircle, Languages, Phone, AlertTriangle, Clock } from "lucide-react"; // Added Phone
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp, getDoc, addDoc, getDocs, limit } from '@/lib/mysqlDb'; 
import type { FirestoreBooking, BookingStatus, GlobalWebSettings, ProviderApplication, FirestoreNotification } from '@/types/firestore'; 
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { generateInvoicePdf } from '@/lib/InvoicePdfForDownload'; 
import { useGlobalSettings } from "@/hooks/useGlobalSettings"; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useRouter } from "next/navigation";
import { useLoading } from '@/contexts/LoadingContext';
import { sendUserCancellationEmail, type UserCancellationEmailInput } from '@/ai/flows/sendUserCancellationEmailFlow';
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"; 
import { Separator } from "@/components/ui/separator"; 
import AppImage from "@/components/ui/AppImage";
import { triggerPushNotification } from "@/lib/fcmUtils";
import { ADMIN_EMAIL } from "@/contexts/AuthContext";
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone, formatCurrency } from "@/lib/utils";


// Enriched booking type to include provider details
interface EnrichedBooking extends FirestoreBooking {
    providerDetails?: ProviderApplication;
}

const formatBookingTimestamp = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  const d = new Date(millis);
  return `${formatDateInTimezone(d, 'Asia/Kolkata')} ${formatTimeInTimezone(d, 'Asia/Kolkata')}`;
};

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return formatDateInTimezone(date, 'Asia/Kolkata');
    } catch (e) {
        return dateString;
    }
};

const parseSlotToHHMM = (slot: string): { hours: number; minutes: number } | null => {
    const timeMatch = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeMatch) return null;
    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const period = timeMatch[3].toUpperCase();

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0; 
    return { hours, minutes };
};

const getStatusBadgeVariant = (status: BookingStatus) => {
    switch (status) {
      case 'Completed': return 'default';
      case 'Confirmed':
      case 'ProviderAccepted':
      case 'AssignedToProvider':
      case 'InProgressByProvider':
        return 'default'; 
      case 'Pending Payment':
      case 'Rescheduled':
      case 'Processing':
        return 'secondary';
      case 'Cancelled':
      case 'ProviderRejected':
        return 'destructive';
      default: return 'outline';
    }
  };

const getStatusBadgeClass = (status: BookingStatus) => {
    switch (status) {
        case 'Completed': return 'bg-green-500 hover:bg-green-600';
        case 'Confirmed':
        case 'ProviderAccepted':
        case 'AssignedToProvider':
        case 'InProgressByProvider':
            return 'bg-blue-500 hover:bg-blue-600';
        case 'Pending Payment':
        case 'Rescheduled':
            return 'bg-orange-500 hover:bg-orange-600';
        case 'Processing':
            return 'bg-purple-500 hover:bg-purple-600';
        case 'Cancelled':
        case 'ProviderRejected':
            return 'bg-red-600 hover:bg-red-700';
        default: return '';
    }
};


export default function MyBookingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [myBookings, setMyBookings] = useState<EnrichedBooking[]>([]); // Use enriched type
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState<string | null>(null);
  
  const { settings: globalCompanySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const router = useRouter();
  const { showLoading } = useLoading();

  const formatBookingTimestamp = (timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(millis, appConfig.timezone, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const formatDateForDisplay = (dateString: string | undefined): string => {
      if (!dateString) return 'N/A';
      try {
          if (dateString.includes('-')) {
              const [y, m, d] = dateString.split('-').map(Number);
              const dateObj = new Date(y, m - 1, d);
              return formatDateInTimezone(dateObj, appConfig.timezone, { day: '2-digit', month: 'short', year: 'numeric' });
          }
          return formatDateInTimezone(dateString, appConfig.timezone, { day: '2-digit', month: 'short', year: 'numeric' });
      } catch (e) {
          return dateString;
      }
  };

  const [showCancellationDialog, setShowCancellationDialog] = useState(false);
  const [cancellationDialogContent, setCancellationDialogContent] = useState<{ title: string; description: React.ReactNode; actionText?: string; onAction?: () => void; showPayButton?: boolean; feeAmount?: number, feeType?: 'fixed' | 'percentage' } | null>(null);
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState<FirestoreBooking | null>(null);


  useEffect(() => {
    if (!user || authLoading) {
      if (!authLoading && !user) setIsLoadingBookings(false);
      return;
    }

    setIsLoadingBookings(true);
    const bookingsCollectionRef = collection(db, "bookings");
    // Added limit(50) to prevent excessive reads while showing recent history
    const q = query(
      bookingsCollectionRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const fetchedBookings = querySnapshot.docs.map(docSnap => ({ 
        ...docSnap.data(),
        id: docSnap.id, 
      } as FirestoreBooking));

      // Enrich bookings with provider details AND service images if missing
      const enrichedPromises = fetchedBookings.map(async (booking): Promise<EnrichedBooking> => {
        const enrichedBooking: EnrichedBooking = { ...booking };

        // 1. Fetch Provider Details
        if (booking.providerId) {
          try {
            const providerDocRef = doc(db, "providerApplications", booking.providerId);
            const providerDocSnap = await getDoc(providerDocRef);
            if (providerDocSnap.exists()) {
              enrichedBooking.providerDetails = providerDocSnap.data() as ProviderApplication;
            }
          } catch (error) {
            console.error(`Failed to fetch provider details for ID ${booking.providerId}`, error);
          }
        }

        // 2. Fetch missing service images
        if (booking.services && booking.services.length > 0 && !booking.services[0].imageUrl) {
            try {
                const serviceDocRef = doc(db, "adminServices", booking.services[0].serviceId);
                const serviceDocSnap = await getDoc(serviceDocRef);
                if (serviceDocSnap.exists()) {
                    const sData = serviceDocSnap.data();
                    if (sData?.imageUrl) {
                        enrichedBooking.services[0].imageUrl = sData.imageUrl;
                    }
                }
            } catch (err) {
                console.error("Failed to fetch service image for enrichment", err);
            }
        }

        return enrichedBooking;
      });
      
      const resolvedBookings = await Promise.all(enrichedPromises);
      setMyBookings(resolvedBookings);
      setIsLoadingBookings(false);

    }, (error) => {
      console.error("Error fetching user bookings: ", error);
      toast({ title: "Error", description: "Could not fetch your bookings.", variant: "destructive" });
      setIsLoadingBookings(false);
    });

    return () => unsubscribe();
  }, [user, authLoading, toast]);


  const calculateCancellationEligibility = (booking: FirestoreBooking) => {
    if (!appConfig.enableCancellationPolicy) {
      return { eligibleForFree: true, message: "Cancellation policy is currently disabled. Free cancellation allowed.", fee: 0, feeType: 'fixed' as 'fixed' | 'percentage', isFinalWindow: false };
    }

    // Assuming booking.scheduledDate is YYYY-MM-DD from Firestore
    const [year, month, day] = booking.scheduledDate.split('-').map(Number);
    const serviceDate = new Date(year, month - 1, day); // Month is 0-indexed

    const slotTime = booking.scheduledTimeSlot;
    
    const timeParts = parseSlotToHHMM(slotTime);
    if (!timeParts) {
      console.error("Invalid time slot format:", slotTime);
      return { eligibleForFree: false, message: "Could not parse service time. Please contact support.", fee: appConfig.cancellationFeeValue || 0, feeType: appConfig.cancellationFeeType || 'fixed', isFinalWindow: false };
    }

    const serviceStartTime = new Date(serviceDate);
    serviceStartTime.setHours(timeParts.hours, timeParts.minutes, 0, 0);

    const now = new Date();
    const diffMs = serviceStartTime.getTime() - now.getTime();

    // 1. Check final restricted window (e.g., 3 hours before service start)
    const finalHours = appConfig.finalCancellationHours || 0;
    const finalMinutes = appConfig.finalCancellationMinutes || 0;
    const totalFinalWindowMs = ((finalHours * 60) + finalMinutes) * 60 * 1000;

    if (appConfig.enableFinalCancellationWindow && diffMs < totalFinalWindowMs) {
      return {
        eligibleForFree: false,
        message: "You are cancelling within the final restricted window.",
        fee: 100, // 100% cancellation charge
        feeType: 'percentage' as 'fixed' | 'percentage',
        isFinalWindow: true
      };
    }

    if (diffMs <= 0) { 
      return { eligibleForFree: false, message: "Service time has already passed or is too soon to cancel.", fee: appConfig.cancellationFeeValue || 0, feeType: appConfig.cancellationFeeType || 'fixed', isFinalWindow: false };
    }

    const freeWindowDays = appConfig.freeCancellationDays || 0;
    const freeWindowHours = appConfig.freeCancellationHours || 0;
    const freeWindowMinutes = appConfig.freeCancellationMinutes || 0;
    const totalFreeWindowMs = ((freeWindowDays * 24 * 60) + (freeWindowHours * 60) + freeWindowMinutes) * 60 * 1000;

    const fee = appConfig.cancellationFeeValue || 0;
    const feeType = appConfig.cancellationFeeType || 'fixed';

    if (diffMs >= totalFreeWindowMs) {
      let windowMessage = "";
      if (freeWindowDays > 0) windowMessage += `${freeWindowDays} day(s) `;
      if (freeWindowHours > 0) windowMessage += `${freeWindowHours} hour(s) `;
      if (freeWindowMinutes > 0) windowMessage += `${freeWindowMinutes} minute(s) `;
      if (windowMessage.trim() === "") windowMessage = "the configured window";
      else windowMessage = windowMessage.trim();
      
      return { eligibleForFree: true, message: `You are eligible for free cancellation as you are cancelling ${windowMessage} before the service.`, fee: 0, feeType, isFinalWindow: false };
    } else {
      return { eligibleForFree: false, message: "You are outside the free cancellation window.", fee, feeType, isFinalWindow: false };
    }
  };

  const openCancellationDialog = (booking: FirestoreBooking) => {
    setSelectedBookingForCancel(booking);
    const eligibility = calculateCancellationEligibility(booking);
    let feeAmount = 0;
    let feeDisplay = "";
    let finalRefundAmount = 0;

    if (!eligibility.eligibleForFree) {
        if (eligibility.feeType === 'percentage') {
            feeAmount = (booking.totalAmount * eligibility.fee) / 100;
            feeDisplay = `${eligibility.fee}% (${formatCurrency(feeAmount, symbol, decimals, code)})`;
        } else {
            feeAmount = eligibility.fee;
            feeDisplay = formatCurrency(feeAmount, symbol, decimals, code);
        }
        finalRefundAmount = (booking.totalAmount || 0) - feeAmount;
    }
    
    const proceedWithCancellation = async () => {
        if (!booking.id || !user) return;
        setIsCancelling(booking.id);
        const bookingDocRef = doc(db, "bookings", booking.id);
        try {
            await updateDoc(bookingDocRef, { 
                status: "Cancelled" as BookingStatus, 
                updatedAt: Timestamp.now(),
                cancellationFeeCharged: feeAmount,
                refundableAmount: booking.paymentMethod === 'Online' ? finalRefundAmount : 0,
                cancellationRefundStatus: booking.paymentMethod === 'Online' ? (finalRefundAmount > 0 ? 'Pending' : 'N/A') : 'N/A'
            });
            
            // 1. Create and send notification to USER
            const userNotificationData: FirestoreNotification = {
              userId: user.uid,
              title: "Booking Cancelled",
              message: `Your booking ${booking.bookingId} has been successfully cancelled.`,
              type: 'error',
              href: '/my-bookings',
              read: false,
              createdAt: Timestamp.now(),
            };
            await addDoc(collection(db, "userNotifications"), userNotificationData);
            triggerPushNotification({
              userId: user.uid,
              title: userNotificationData.title,
              body: userNotificationData.message,
              href: userNotificationData.href
            });

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
                  message: `Booking ${booking.bookingId} was cancelled by ${user.displayName || user.email}.`,
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

            toast({ title: "Booking Cancelled", description: "Your booking has been successfully cancelled." });
            
            // Trigger post-process API for WhatsApp, Stats, etc.
            fetch('/api/bookings/post-process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingDocId: booking.id, cancelledBy: 'user' }),
            }).catch(err => console.error("Error triggering post-process after cancellation:", err));

            // Send cancellation email using the NEW dedicated flow
            const emailInput: UserCancellationEmailInput = {
                bookingId: booking.bookingId,
                customerName: booking.customerName,
                customerEmail: booking.customerEmail,
                paymentMethod: booking.paymentMethod,
                paidAmount: booking.paymentMethod === 'Online' ? booking.totalAmount : 0,
                cancellationFee: feeAmount,
                refundableAmount: finalRefundAmount,
                siteName: globalCompanySettings?.websiteName || "Yourbrand",
                smtpHost: appConfig.smtpHost,
                smtpPort: appConfig.smtpPort,
                smtpUser: appConfig.smtpUser,
                smtpPass: appConfig.smtpPass,
                senderEmail: appConfig.senderEmail,
                currencySymbol: symbol,
            };
            try {
  await sendUserCancellationEmail(emailInput);
                    } catch (emailError) {
  console.error("Cancellation email failed:", emailError);
   }

        } catch (error) {
            toast({ title: "Error", description: "Could not cancel booking.", variant: "destructive" });
        } finally {
            setIsCancelling(null);
            setShowCancellationDialog(false);
        }
    };
    
    const proceedToPayCancellationFee = () => {
        if (!booking.id) return;
        showLoading();
        localStorage.setItem('bookingIdForCancellationFee', booking.id); 
        localStorage.setItem('cancellationFeeAmount', feeAmount.toFixed(2));
        router.push(`/checkout/payment?reason=cancellation_fee&booking_id=${booking.bookingId}`);
        setShowCancellationDialog(false);
    };

    if (eligibility.eligibleForFree) {
      setCancellationDialogContent({
        title: "Confirm Free Cancellation",
        description: <p>{eligibility.message}</p>,
        actionText: "Confirm Cancellation",
        onAction: proceedWithCancellation,
      });
    } else { 
      if (eligibility.isFinalWindow) {
        if (booking.paymentMethod !== 'Online' || booking.status === 'Pending Payment') {
          setCancellationDialogContent({
            title: "Restricted Cancellation Window",
            description: (
              <>
                <p>Cancellations made within the final restricted window before service start incur a <strong>100% cancellation fee</strong>.</p>
                <p className="mt-2 text-destructive font-semibold">You must pay the full booking amount of <strong>{feeDisplay}</strong> as a cancellation fee to proceed.</p>
              </>
            ),
            actionText: "Pay Cancellation Fee",
            onAction: proceedToPayCancellationFee,
          });
        } else { // Paid online
          setCancellationDialogContent({
            title: "No Refund Allowed",
            description: (
              <>
                <p>Cancellations made within the final restricted window before service start incur a <strong>100% cancellation fee</strong>.</p>
                <p className="mt-2 text-destructive font-semibold">No refund (₹0) will be returned as the full booking amount has been charged.</p>
              </>
            ),
            actionText: "Confirm Cancellation (No Refund)",
            onAction: proceedWithCancellation,
          });
        }
      } else if (booking.paymentMethod !== 'Online' || booking.status === 'Pending Payment') {
        setCancellationDialogContent({
          title: "Cancellation Fee Applies",
          description: (
            <>
              <p>{eligibility.message} A cancellation fee of <strong>{feeDisplay}</strong> will apply.</p>
              <p className="mt-2 font-semibold">You must pay the cancellation fee to proceed with cancellation.</p>
            </>
          ),
          actionText: "Pay Cancellation Fee",
          onAction: proceedToPayCancellationFee,
        });
      } else { // Paid online
        setCancellationDialogContent({
          title: "Confirm Cancellation with Fee",
          description: (
            <>
              <p>{eligibility.message} A cancellation fee of <strong>{feeDisplay}</strong> will be deducted.</p>
              <p className="mt-2">The remaining amount will be refunded to your original payment method (refunds may take 5-7 business days).</p>
            </>
          ),
          actionText: "Confirm & Accept Fee",
          onAction: proceedWithCancellation,
        });
      }
    }
    setShowCancellationDialog(true);
  };


  const canBeCancelledByRule = (status: BookingStatus) => {
    return status === "Pending Payment" || status === "Confirmed" || status === "Rescheduled" || status === "AssignedToProvider" || status === "ProviderAccepted" || status === "InProgressByProvider";
  };

  const shouldShowProviderDetails = (status: BookingStatus) => {
    const hiddenStatuses: BookingStatus[] = ["Completed", "Cancelled", "ProviderRejected", "Pending Payment"];
    return !hiddenStatuses.includes(status);
  };

  const handleDownloadInvoice = async (booking: FirestoreBooking) => {
    if (!booking.id) {
      toast({ title: "Error", description: "Booking data is incomplete for invoice.", variant: "destructive"});
      return;
    }
    setIsDownloadingInvoice(booking.id);
    try {
      const companyDetailsForInvoice = {
        name: globalCompanySettings?.websiteName || "Yourbrand.in",
        address: globalCompanySettings?.address || "123 Main Street, City, Country - 123456",
        contactEmail: globalCompanySettings?.contactEmail || "support@yourdomain.com",
        contactMobile: globalCompanySettings?.contactMobile || "+91-7353113455",
        logoUrl: globalCompanySettings?.logoUrl || undefined,
        timezone: appConfig?.timezone || "Asia/Kolkata",
        currencySymbol: appConfig?.currencySymbol || "₹",
        dateFormat: appConfig?.dateFormat,
      };
      await generateInvoicePdf(booking, companyDetailsForInvoice);
    } catch (error) {
      console.error("Error generating invoice:", error);
      toast({ title: "Invoice Error", description: "Could not generate the invoice PDF.", variant: "destructive"});
    } finally {
      setIsDownloadingInvoice(null);
    }
  };

  if (authLoading || isLoadingBookings || isLoadingCompanySettings || isLoadingAppSettings) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <p className="mt-2 text-muted-foreground">Loading your bookings...</p>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl md:text-4xl font-headline font-semibold text-foreground">
            My Bookings
          </h1>
          <Link href="/" passHref className="hidden sm:block">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </Link>
        </div>

        {myBookings.length === 0 ? (
          <div className="text-center py-12">
            <PackageSearch className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No Bookings Yet</h2>
            <p className="text-muted-foreground mb-6">You haven't made any bookings with Yourbrand.</p>
            <Link href="/categories" passHref>
              <Button>Book a Service</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {myBookings.map((booking, index) => {
              const hasMultipleServices = booking.services && booking.services.length > 1;
              return (
                <Card key={booking.id} className="shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                  <div className="flex flex-col md:flex-row">
                    {/* Service Image Section / Services List */}
                    {hasMultipleServices ? (
                      <div className="w-full md:w-96 p-3 bg-muted/10 border-b md:border-b-0 md:border-r border-border/40 flex flex-col justify-start gap-4 shrink-0">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Booked Services ({booking.services.length})</span>
                        </div>
                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                          {booking.services.map((service) => (
                            <div key={service.serviceId} className="flex items-center justify-between p-3 border rounded-xl bg-background shadow-xs gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted shrink-0">
                                  <AppImage 
                                    src={service.imageUrl || "/default-image.png"} 
                                    alt={service.name}
                                    fill
                                    className="object-cover"
                                  />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-xs truncate text-foreground" title={service.name}>{service.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{formatCurrency(service.pricePerUnit, symbol, decimals, code)} per unit</p>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-[10px] font-black text-primary">Qty: {service.quantity}</p>
                                <p className="font-black text-xs text-foreground">{formatCurrency(service.pricePerUnit * service.quantity, symbol, decimals, code)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full aspect-square md:w-80 md:h-81 bg-muted shrink-0">
                        <AppImage 
                          src={booking.services[0]?.imageUrl || "/default-image.png"} 
                          alt={booking.services[0]?.name || "Service Image"}
                          fill
                          priority={index === 0}
                          className="object-cover"
                        />
                      </div>
                    )}

                    <div className="flex-1 flex flex-col">
                      <CardHeader>
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                          <CardTitle className="text-xl font-headline">
                            {hasMultipleServices 
                              ? booking.services.map(s => s.name).join(', ') 
                              : (booking.services[0]?.name || "Service Image")
                            }
                          </CardTitle>
                          <Badge variant={getStatusBadgeVariant(booking.status)} className={`capitalize text-xs w-fit ${getStatusBadgeClass(booking.status)}`}>
                              {booking.status}
                          </Badge>
                        </div>
                        <CardDescription>Booking ID: {booking.bookingId}</CardDescription>
                      </CardHeader>
                    <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm flex-grow">
                  <div>
                    <p className="text-muted-foreground">Scheduled Date</p>
                    <p className="font-medium">{formatDateForDisplay(booking.scheduledDate)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Time Slot</p>
                    <p className="font-medium">{booking.scheduledTimeSlot}</p>
                  </div>
                  {booking.estimatedEndTime && (
                    <div>
                      <p className="text-muted-foreground text-green-600 font-semibold">Estimated Completion</p>
                      <p className="font-medium text-green-700">
                        {formatDateInTimezone(booking.estimatedEndTime, appConfig.timezone, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} at {formatTimeInTimezone(booking.estimatedEndTime, appConfig.timezone)}
                      </p>
                    </div>
                  )}
                  {booking.dailyTimeline && booking.dailyTimeline.length > 1 && (
                    <div className="sm:col-span-2 md:col-span-3 py-2.5 px-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 rounded-xl space-y-2 text-sm text-muted-foreground my-1">
                      <p className="font-bold text-xs text-blue-800 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Day-by-Day Work Schedule
                      </p>
                      <div className="space-y-1.5 pl-1">
                        {booking.dailyTimeline.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap text-sm py-1.5 border-b border-border/20 last:border-0">
                            <span className="font-semibold text-foreground/80">{item.dateLabel}</span>
                            <span className="font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap">
                              {item.startTime} - {item.endTime}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {booking.interveningBreaks && booking.interveningBreaks.length > 0 && (
                    <div className="sm:col-span-2 md:col-span-3 py-2.5 px-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 rounded-xl space-y-1.5 text-xs text-muted-foreground my-1">
                      <p className="font-bold text-[10px] text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Includes Gaps / Holidays
                      </p>
                      <div className="space-y-1 pl-1">
                        {booking.interveningBreaks.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2">
                            <div className={`mt-1.5 h-1.5 w-1.5 rounded-full ${item.type === 'holiday' ? 'bg-red-500' : item.type === 'partial' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                            <div className="text-muted-foreground text-xs">
                              <span className="font-semibold text-foreground/80">{item.dateLabel}</span>
                              {item.timeLabel && <span className="ml-1">({item.timeLabel})</span>}
                              <span className="ml-1.5 font-medium text-muted-foreground/80">— {item.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Total Amount</p>
                    <p className="font-medium">{formatCurrency(booking.totalAmount, symbol, decimals, code)}</p>
                  </div>
                  <div className="sm:col-span-2 md:col-span-3">
                    <p className="text-muted-foreground">Booked On</p>
                    <p className="font-medium">{formatBookingTimestamp(booking.createdAt)}</p>
                  </div>

                  {booking.providerDetails && shouldShowProviderDetails(booking.status) && (
                    <div className="sm:col-span-2 md:col-span-3 pt-4 border-t">
                      <h4 className="text-md font-semibold mb-2 text-foreground">Your Provider</h4>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12">
                            <AvatarImage src={booking.providerDetails.profilePhotoUrl || undefined} alt={booking.providerDetails.fullName} />
                            <AvatarFallback><UserCircle className="h-6 w-6" /></AvatarFallback>
                            </Avatar>
                            <div>
                            <p className="font-semibold">{booking.providerDetails.fullName}</p>
                            {booking.providerDetails.languagesSpokenLabels && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1"><Languages className="h-3 w-3"/> {booking.providerDetails.languagesSpokenLabels.join(', ')}</p>
                            )}
                            </div>
                        </div>
                        {booking.providerDetails.mobileNumber && (
                           booking.status === 'AssignedToProvider' ? (
                             <Button variant="outline" size="sm" disabled title="Awaiting provider acceptance">
                               <Phone className="mr-2 h-4 w-4" /> Call (Awaiting Accept)
                             </Button>
                           ) : (
                             <a href={`tel:${booking.providerDetails.mobileNumber}`}>
                                <Button variant="outline" size="sm">
                                    <Phone className="mr-2 h-4 w-4" /> Call
                                </Button>
                             </a>
                           )
                         )}
                      </div>
                    </div>
                  )}
                  </CardContent>
                  <CardFooter className="flex flex-col sm:flex-row justify-end items-stretch sm:items-center gap-2 pb-6">

                  {booking.status === "Completed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => handleDownloadInvoice(booking)}
                      disabled={isDownloadingInvoice === booking.id}
                    >
                      {isDownloadingInvoice === booking.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
                      Download Invoice
                    </Button>
                  )}
                  {canBeCancelledByRule(booking.status) && (
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        className="w-full sm:w-auto"
                        onClick={() => openCancellationDialog(booking)}
                        disabled={isCancelling === booking.id}
                    >
                        {isCancelling === booking.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-1 h-4 w-4" />}
                        Cancel Booking
                    </Button>
                  )}
                  </CardFooter>
                  </div>
                  </div>
                  </Card>
              );
            })}

          </div>
        )}
      </div>
      {cancellationDialogContent && (
        <AlertDialog open={showCancellationDialog} onOpenChange={setShowCancellationDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{cancellationDialogContent.title}</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div>{cancellationDialogContent.description}</div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setShowCancellationDialog(false); setSelectedBookingForCancel(null);}}>No</AlertDialogCancel>
              {cancellationDialogContent.onAction && (
                <AlertDialogAction onClick={cancellationDialogContent.onAction} className={cancellationDialogContent.title.toLowerCase().includes("fee") && !cancellationDialogContent.title.toLowerCase().includes("free") ? "bg-destructive hover:bg-destructive/90" : ""}>
                  {cancellationDialogContent.actionText || "Confirm"}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </ProtectedRoute>
  );
}

