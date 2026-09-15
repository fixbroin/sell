
"use client";

import { useState, useEffect } from 'react';
import type { FirestoreBooking, BookingServiceItem, AppliedPlatformFeeItem, ProviderApplication } from '@/types/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, ExternalLink, Tag, HandCoins, Plus, UserCheck, Loader2, Phone, UserCircle, Clock, AlertTriangle, Wallet, Ban } from 'lucide-react'; 
import AppImage from '@/components/ui/AppImage'; 
import { getTimestampMillis, formatScheduledDate, formatCurrency, formatDateInTimezone, formatTimeInTimezone, isCashPayment } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { openWhatsAppChooser } from '@/lib/whatsappUtils';
import ProviderWalletAdjustmentModal from '@/components/admin/provider/ProviderWalletAdjustmentModal';

interface BookingDetailsModalContentProps {
  booking: FirestoreBooking;
}

const formatDetailTimestamp = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  const d = new Date(millis);
  return `${formatDateInTimezone(d, 'Asia/Kolkata')} ${formatTimeInTimezone(d, 'Asia/Kolkata')}`;
};

const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
    if (isTaxInclusive && taxPercent && taxPercent > 0) {
      return displayedPrice / (1 + taxPercent / 100);
    }
    return displayedPrice;
  };


export default function BookingDetailsModalContent({ booking }: BookingDetailsModalContentProps) {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [provider, setProvider] = useState<ProviderApplication | null>(null);
  const [isLoadingProvider, setIsLoadingProvider] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [refundStatus, setRefundStatus] = useState<string>(booking.cancellationRefundStatus || 'Pending');
  const [isUpdatingRefund, setIsUpdatingRefund] = useState(false);

  const handleMarkAsProcessed = async () => {
    if (!booking.id) return;
    setIsUpdatingRefund(true);
    try {
      await updateDoc(doc(db, "bookings", booking.id), {
        cancellationRefundStatus: 'Processed',
        updatedAt: Timestamp.now()
      });
      setRefundStatus('Processed');
      toast({
        title: "Refund Processed",
        description: `Booking #${booking.bookingId} refund has been marked as Processed.`,
      });
      // Fire clear cache for bookings to keep pages fresh
      await fetch('/api/admin/clear-cache?tag=bookings', { method: 'POST' }).catch(err => console.error(err));
    } catch (e) {
      console.error("Failed to update refund status:", e);
      toast({
        title: "Update Failed",
        description: "Could not update refund status.",
        variant: "destructive"
      });
    } finally {
      setIsUpdatingRefund(false);
    }
  };

  useEffect(() => {
    async function fetchProvider() {
      if (!booking.providerId) {
        setProvider(null);
        return;
      }
      setIsLoadingProvider(true);
      try {
        const providerDoc = await getDoc(doc(db, "providerApplications", booking.providerId));
        if (providerDoc.exists()) {
          setProvider({ id: providerDoc.id, ...providerDoc.data() } as ProviderApplication);
        }
      } catch (error) {
        console.error("Error fetching provider details:", error);
      } finally {
        setIsLoadingProvider(false);
      }
    }
    fetchProvider();
  }, [booking.providerId]);

  const handleViewOnMap = () => {
    if (typeof booking.latitude === 'number' && typeof booking.longitude === 'number') {
      const url = `https://www.google.com/maps?q=${booking.latitude},${booking.longitude}`;
      window.open(url, '_blank');
    }
  };

  const handleWhatsAppClick = () => {
    if (booking.customerPhone) {
      const message = `Hi ${booking.customerName}, I'm contacting you from Yourbrand regarding your booking #${booking.bookingId}.`;
      openWhatsAppChooser(booking.customerPhone, message);
    }
  };


  const hasValidCoordinates = typeof booking.latitude === 'number' && typeof booking.longitude === 'number';
  const coordinatesPresent = booking.latitude != null && booking.longitude != null;
  const sumOfDisplayedItemPrices = booking.services.reduce((sum, item) => sum + (item.pricePerUnit * item.quantity), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Customer Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong>Name:</strong> {booking.customerName}</p>
            <p><strong>Email:</strong> {booking.customerEmail}</p>
            <div className="flex items-center gap-2">
              <p><strong>Phone:</strong> <a href={`tel:${booking.customerPhone}`} className="text-primary hover:underline">{booking.customerPhone}</a></p>
              {booking.customerPhone && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleWhatsAppClick} title="Chat on WhatsApp">
                  <AppImage src="/whatsapp.png" alt="WhatsApp Icon" width={24} height={24} />
                  <span className="sr-only">Chat on WhatsApp</span>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Service Address</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{booking.addressLine1}</p>
            {booking.addressLine2 && <p>{booking.addressLine2}</p>}
            <p>{booking.city}, {booking.state} - {booking.pincode}</p>
            
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground flex items-center">
                <MapPin size={12} className="mr-1 text-primary"/>
                Coordinates:
              </p>
              {coordinatesPresent ? (
                <>
                  <p className="text-xs">
                    Lat: {hasValidCoordinates ? booking.latitude?.toFixed(6) : String(booking.latitude)},
                    Lng: {hasValidCoordinates ? booking.longitude?.toFixed(6) : String(booking.longitude)}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewOnMap}
                    className="text-xs mt-1"
                    disabled={!hasValidCoordinates}
                  >
                    <ExternalLink size={12} className="mr-1" />
                    View on Map
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">N/A</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- Assigned Provider Section --- */}
      <Card className="shadow-sm border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Assigned Service Provider
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingProvider ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading provider details...
            </div>
          ) : provider ? (
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 border-2 border-white shadow-sm">
                <AvatarImage src={provider.profilePhotoUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {provider.fullName?.[0].toUpperCase() || <UserCircle />}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1 flex-grow min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm">{provider.fullName}</p>
                    {booking.autoAssigned && (
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 font-bold uppercase tracking-tighter">Auto-Assigned</Badge>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs flex items-center gap-1 hover:bg-primary/10 border-primary/20 text-primary self-start sm:self-auto shrink-0"
                    onClick={() => setIsWalletModalOpen(true)}
                  >
                    <Wallet className="h-3 w-3" /> Refund / Adjust Wallet
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {provider.mobileNumber}</span>
                  <span className="px-2 py-0.5 bg-muted rounded-full text-[10px] font-medium">{provider.workCategoryName}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground italic py-2">
              No provider has been assigned to this booking yet.
            </div>
          )}
        </CardContent>
      </Card>


      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Booking & Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div><strong>Booking No:</strong> <Badge className="text-xs bg-primary text-white font-black px-2 shadow-sm">#{booking.bookingNumber || "N/A"}</Badge></div>
            <div><strong>Booking ID:</strong> <Badge variant="secondary" className="text-xs font-mono">{booking.bookingId}</Badge></div>
            <div><strong>Status:</strong> <Badge variant={booking.status === "Completed" ? "default" : booking.status === "Confirmed" ? "default" : "outline"} className={ booking.status === "Confirmed" ? "bg-green-500 text-white hover:bg-green-600" : booking.status === "Completed" ? "bg-blue-500 text-white hover:bg-blue-600" : booking.status === "Cancelled" ? "bg-red-500 text-white hover:bg-red-600" : ""}>{booking.status}</Badge></div>
            <p><strong>Scheduled Date:</strong> {formatScheduledDate(booking.scheduledDate)}</p>
            <p><strong>Scheduled Time:</strong> {booking.scheduledTimeSlot}</p>
            {booking.estimatedEndTime && (
              <p className="text-green-600 font-bold">
                <strong>Estimated Completion:</strong> {formatDateInTimezone(new Date(booking.estimatedEndTime), 'Asia/Kolkata')} {formatTimeInTimezone(new Date(booking.estimatedEndTime), 'Asia/Kolkata')}
              </p>
            )}
            <div className="flex items-center gap-2">
                <strong>Payment Method:</strong> 
                <Badge variant="outline" className={
                    booking.status === 'Completed' 
                    ? "bg-green-50 text-green-700 border-green-200"
                    : isCashPayment(booking.paymentMethod)
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-green-50 text-green-700 border-green-200"
                }>
                    {booking.status === 'Completed' 
                        ? (isCashPayment(booking.paymentMethod) ? "Paid (Pay After Service)" : `Paid (Online)`)
                        : (isCashPayment(booking.paymentMethod) ? "Pay After Service" : "Online")
                    }
                </Badge>
            </div>
            {booking.razorpayPaymentId && (
              <div className="col-span-1 sm:col-span-2">
                <strong>Razorpay Payment ID:</strong>
                <span className="text-xs font-mono break-all block mt-0.5 select-all">{booking.razorpayPaymentId}</span>
              </div>
            )}
            {booking.razorpayOrderId && (
              <div className="col-span-1 sm:col-span-2">
                <strong>Razorpay Order ID:</strong>
                <span className="text-xs font-mono break-all block mt-0.5 select-all">{booking.razorpayOrderId}</span>
              </div>
            )}
            {booking.stripeSessionId && (
              <div className="col-span-1 sm:col-span-2">
                <strong>Stripe Session ID:</strong>
                <span className="text-xs font-mono break-all block mt-0.5 select-all">{booking.stripeSessionId}</span>
              </div>
            )}
            {booking.stripePaymentIntent && (
              <div className="col-span-1 sm:col-span-2">
                <strong>Stripe Payment Intent ID:</strong>
                <span className="text-xs font-mono break-all block mt-0.5 select-all">{booking.stripePaymentIntent}</span>
              </div>
            )}
            {booking.status === 'Cancelled' && booking.cancellationFeePaid !== undefined && (
              <div>
                <strong>Cancellation Fee Paid:</strong>
                <span className="font-bold text-red-600 ml-1.5">{symbol}{booking.cancellationFeePaid}</span>
              </div>
            )}
            {booking.status === 'Cancelled' && booking.cancellationPaymentId && (
              <div className="col-span-1 sm:col-span-2">
                <strong>Cancellation Payment ID:</strong>
                <span className="text-xs font-mono break-all block mt-0.5 select-all">{booking.cancellationPaymentId}</span>
              </div>
            )}
            {booking.createdAt && <p><strong>Booked On:</strong> {formatDetailTimestamp(booking.createdAt)}</p>}
            {booking.updatedAt && <p><strong>Last Updated:</strong> {formatDetailTimestamp(booking.updatedAt)}</p>}
          </div>

          {booking.dailyTimeline && booking.dailyTimeline.length > 1 && (
            <div className="mt-4 py-2.5 px-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 rounded-xl space-y-2 text-sm text-muted-foreground">
              <p className="font-bold text-xs text-blue-800 dark:text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Day-by-Day Work Schedule
              </p>
              <div className="space-y-1.5 pl-1">
                {booking.dailyTimeline.map((item, idx) => (
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
            <div className="mt-4 py-2.5 px-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 rounded-xl space-y-1.5 text-xs text-muted-foreground">
              <p className="font-bold text-[10px] text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Includes Gaps / Holidays
              </p>
              <div className="space-y-1 pl-1">
                {booking.interveningBreaks.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs">
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
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Services Booked</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead className="text-center">Qty</TableHead>
                <TableHead className="text-right">Unit Price ({symbol})</TableHead>
                <TableHead className="text-right">Total ({symbol})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {booking.services.map((service, index) => {
                const unitPrice = service.pricePerUnit;
                const itemTotal = unitPrice * service.quantity;
                return (
                  <TableRow key={`${service.serviceId}-${index}`}>
                    <TableCell>{service.name}</TableCell>
                    <TableCell className="text-center">{service.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(unitPrice, symbol, decimals, code)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(itemTotal, symbol, decimals, code)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
            <CardTitle className="text-lg">Payment Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
              <span className="text-muted-foreground">Items Total (Displayed Prices):</span>
              <span>{formatCurrency(sumOfDisplayedItemPrices, symbol, decimals, code)}</span>
          </div>
          {booking.discountAmount != null && booking.discountAmount > 0 && (
              <div className="flex justify-between text-green-600">
                  <span className="text-muted-foreground">Discount ({booking.discountCode || 'Applied'}):</span>
                  <span>- {formatCurrency(booking.discountAmount, symbol, decimals, code)}</span>
              </div>
          )}
          {booking.visitingCharge != null && booking.visitingCharge > 0 && (
               <div className="flex justify-between">
                  <span className="text-muted-foreground">Visiting Charge (Base):</span>
                  <span>+ {formatCurrency(booking.visitingCharge, symbol, decimals, code)}</span>
              </div>
          )}
          {booking.appliedPlatformFees && booking.appliedPlatformFees.length > 0 && booking.appliedPlatformFees.map((fee, index) => (
              <div key={`platform-fee-summary-${index}`} className="flex justify-between">
                  <span className="text-muted-foreground flex items-center">
                      <HandCoins className="mr-1 h-3.5 w-3.5 text-muted-foreground"/> {fee.name}{fee.taxRatePercentOnFee > 0 && <span className="text-xs ml-1">(incl. tax)</span>}:
                  </span>
                  <span>+ {formatCurrency(fee.calculatedFeeAmount + fee.taxAmountOnFee, symbol, decimals, code)}</span>
              </div>
          ))}
          <div className="flex justify-between">
              <span className="text-muted-foreground">Total Tax:</span> 
              <span>+ {formatCurrency(booking.taxAmount, symbol, decimals, code)}</span>
          </div>

          {booking.additionalCharges && booking.additionalCharges.length > 0 && (
            <>
              <Separator className="my-2 opacity-50" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 mb-2">Additional Charges (On-Site):</p>
                {booking.additionalCharges.map((charge, idx) => (
                  <div key={idx} className="flex justify-between text-amber-900 font-medium">
                    <span className="flex items-center gap-1.5"><Plus size={12}/> {charge.name}</span>
                    <span>+ {formatCurrency(charge.amount, symbol, decimals, code)}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <Separator />
          <div className="flex justify-between font-bold text-md text-primary">
              <span>Total Amount:</span>
              <span>{formatCurrency(booking.totalAmount, symbol, decimals, code)}</span>
          </div>
        </CardContent>
      </Card>

      {booking.status === 'Cancelled' && (
        <Card className="shadow-sm border-destructive/20 bg-destructive/5 animate-in fade-in slide-in-from-bottom-2 duration-350">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2 text-destructive">
              <Ban className="h-5 w-5 text-destructive" />
              Cancellation & Refund Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {booking.paymentMethod === 'Online' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <strong className="text-muted-foreground block text-xs uppercase tracking-wider">Original Paid Amount:</strong>
                  <span className="font-semibold text-foreground text-sm block mt-0.5">{formatCurrency(booking.totalAmount, symbol, decimals, code)}</span>
                </div>
                <div>
                  <strong className="text-muted-foreground block text-xs uppercase tracking-wider">Cancellation Fee Charged:</strong>
                  <span className="font-bold text-red-600 text-sm block mt-0.5">
                    {booking.cancellationFeeCharged !== undefined 
                      ? formatCurrency(booking.cancellationFeeCharged, symbol, decimals, code)
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <strong className="text-muted-foreground block text-xs uppercase tracking-wider">Calculated Refund Amount:</strong>
                  <span className="font-bold text-green-600 text-sm block mt-0.5">
                    {booking.refundableAmount !== undefined 
                      ? formatCurrency(booking.refundableAmount, symbol, decimals, code)
                      : 'N/A'}
                  </span>
                </div>
                <div>
                  <strong className="text-muted-foreground block text-xs uppercase tracking-wider">Refund Status:</strong>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <Badge variant="outline" className={
                      refundStatus === 'Processed'
                        ? "bg-green-50 text-green-700 border-green-200"
                        : refundStatus === 'Pending'
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : "bg-muted text-muted-foreground"
                    }>
                      {refundStatus}
                    </Badge>
                    {refundStatus === 'Pending' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7 text-xs px-2.5 font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 border-emerald-200 bg-emerald-50/20"
                        onClick={handleMarkAsProcessed}
                        disabled={isUpdatingRefund}
                      >
                        {isUpdatingRefund ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Mark as Processed
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <strong className="text-muted-foreground block text-xs uppercase tracking-wider">Original Payment Option:</strong>
                  <span className="font-semibold text-foreground text-sm block mt-0.5">Pay After Service / Cash on Delivery</span>
                </div>
                <div>
                  <strong className="text-muted-foreground block text-xs uppercase tracking-wider">Cancellation Fee Paid:</strong>
                  <span className="font-bold text-red-600 text-sm block mt-0.5">
                    {booking.cancellationFeePaid !== undefined && booking.cancellationFeePaid > 0
                      ? formatCurrency(booking.cancellationFeePaid, symbol, decimals, code) 
                      : 'Not Paid / Free'}
                  </span>
                </div>
                {booking.cancellationPaymentId && (
                  <div className="col-span-1 sm:col-span-2">
                    <strong className="text-muted-foreground block text-xs uppercase tracking-wider">Cancellation Payment Transaction ID:</strong>
                    <span className="text-xs font-mono break-all block mt-0.5 select-all text-foreground bg-muted p-2 rounded">{booking.cancellationPaymentId}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {booking.notes && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Customer Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.notes}</p>
          </CardContent>
        </Card>
      )}

      {provider && (
        <ProviderWalletAdjustmentModal 
          isOpen={isWalletModalOpen} 
          onClose={() => setIsWalletModalOpen(false)} 
          providerId={booking.providerId!} 
          providerName={provider.fullName || 'Provider'}
          bookingId={booking.bookingId}
        />
      )}
    </div>
  );
}
