
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { CalendarDays, MapPin, CreditCard, ChevronRight, Loader2, Info, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useAuth } from '@/hooks/useAuth';
import { getActiveCheckoutEntries } from '@/lib/cartManager';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import ScheduleSelection from '@/components/checkout/ScheduleSelection';
import AddressSelection from '@/components/checkout/AddressSelection';
import PromoCodeCard from '@/components/checkout/PromoCodeCard';
import type { Address } from '@/types/firestore';
import PaymentSummary from '@/components/checkout/payment/PaymentSummary';
import PaymentMethods from '@/components/checkout/payment/PaymentMethods';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId } from '@/lib/guestIdManager';
import { formatDateInTimezone } from '@/lib/utils';

interface AppliedPromoCodeInfo {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  calculatedDiscount: number;
}

export default function CheckoutPage() {
  const [isMounted, setIsMounted] = useState(false);
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const { showLoading, hideLoading } = useLoading();
  const router = useRouter();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  // Refs for scrolling
  const scheduleSectionRef = useRef<HTMLDivElement>(null);
  const addressSectionRef = useRef<HTMLDivElement>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const orderSummaryRef = useRef<HTMLDivElement>(null);

  // State for selections
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduledSlot, setScheduledSlot] = useState<string | null>(null);
  const [estimatedEndTime, setEstimatedEndTime] = useState<string | null>(null);
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromoCodeInfo | null>(null);
  const [sumOfItemPrices, setSumOfItemPrices] = useState(0);

  // Modals state
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    // Load from localStorage
    const savedDateStr = localStorage.getItem('yourbrandScheduledDate');
    const savedSlot = localStorage.getItem('yourbrandScheduledTimeSlot');
    const savedEndTime = localStorage.getItem('yourbrandEstimatedEndTime');
    const savedAddressRaw = localStorage.getItem('yourbrandCustomerAddress');
    const savedPromoRaw = localStorage.getItem('yourbrandAppliedPromoCode');

    let hasDate = false;
    let hasAddress = false;

    if (savedDateStr) {
      setScheduledDate(new Date(savedDateStr));
      hasDate = true;
    }
    if (savedSlot) setScheduledSlot(savedSlot);
    if (savedEndTime) setEstimatedEndTime(savedEndTime);
    if (savedAddressRaw) {
      try {
        setSelectedAddress(JSON.parse(savedAddressRaw));
        hasAddress = true;
      } catch (e) {
        console.error("Error parsing saved address", e);
      }
    }
    if (savedPromoRaw) {
      try {
        setAppliedPromo(JSON.parse(savedPromoRaw));
      } catch (e) {
        localStorage.removeItem('yourbrandAppliedPromoCode');
      }
    }

    const cartItems = getActiveCheckoutEntries();
    if (cartItems.length === 0) {
      router.push('/cart');
      return;
    }

    // Auto-flow logic
    if (!hasAddress) {
      setIsAddressModalOpen(true);
    } else if (!hasDate) {
      setIsScheduleModalOpen(true);
    }
  }, [router]);

  const handleScheduleSelect = (date: Date, slot: string, endTime: string, interveningBreaks: any[], dailyTimeline?: any[]) => {
    setScheduledDate(date);
    setScheduledSlot(slot);
    setEstimatedEndTime(endTime);
    localStorage.setItem('yourbrandScheduledDate', date.toLocaleDateString('en-CA'));
    localStorage.setItem('yourbrandScheduledTimeSlot', slot);
    localStorage.setItem('yourbrandEstimatedEndTime', endTime);
    localStorage.setItem('yourbrandInterveningBreaks', JSON.stringify(interveningBreaks));
    localStorage.setItem('yourbrandDailyTimeline', JSON.stringify(dailyTimeline || []));
    setIsScheduleModalOpen(false);
    toast({ title: "Schedule Updated", description: "Your service time has been updated." });

    // Log time slot selection activity
    logUserActivity(
      'checkoutStep',
      {
        checkoutStepName: 'time_slot_selected',
        scheduledDate: date.toLocaleDateString('en-CA'),
        scheduledSlot: slot,
        estimatedEndTime: endTime,
        pageUrl: '/checkout'
      },
      user?.uid,
      !user ? getGuestId() : null
    );

    // Auto-flow logic
    if (!selectedAddress) {
      setTimeout(() => {
        setIsAddressModalOpen(true);
      }, 300); // Small delay for smooth transition
    } else {
      // Scroll to payment section if address already exists
      setTimeout(() => {
        paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  };

  const handleAddressSelect = (address: Address) => {
    setSelectedAddress(address);
    localStorage.setItem('yourbrandCustomerAddress', JSON.stringify(address));
    localStorage.setItem('yourbrandCustomerEmail', address.email || "");
    setIsAddressModalOpen(false);
    toast({ title: "Address Updated", description: "Your service address has been updated." });

    // Log address selection activity
    logUserActivity(
      'checkoutStep',
      {
        checkoutStepName: 'address_selected',
        addressId: address.id,
        fullName: address.fullName,
        phone: address.phone,
        city: address.city,
        pincode: address.pincode,
        pageUrl: '/checkout'
      },
      user?.uid,
      !user ? getGuestId() : null
    );

    // Auto-flow logic: if no schedule date, open schedule modal
    if (!scheduledDate) {
      setTimeout(() => {
        setIsScheduleModalOpen(true);
      }, 300); // Small delay for smooth transition
    } else {
      // Scroll to payment section
      setTimeout(() => {
        paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 500);
    }
  };

  const handlePaymentMethodSelect = (method: string) => {
    setPaymentMethod(method);

    // Log payment method selection activity
    logUserActivity(
      'checkoutStep',
      {
        checkoutStepName: 'payment_method_selected',
        paymentMethod: method,
        pageUrl: '/checkout'
      },
      user?.uid,
      !user ? getGuestId() : null
    );

    // Scroll to book button in order summary
    setTimeout(() => {
      orderSummaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return "Not selected";
    return formatDateInTimezone(date, appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
  };

  if (!isMounted || isLoadingAppSettings || isLoadingAuth) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Cart", href: "/cart" },
    { label: "Checkout" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-2 pb-20">
      <Breadcrumbs items={breadcrumbItems} className="mb-6" />
      <CheckoutStepper currentStepId="checkout" /> {/* We show checkout as the active step */}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          {/* Address Section */}
          <div ref={addressSectionRef}>
            <Card className="overflow-hidden border-none shadow-md">
              <CardHeader className="bg-muted/30 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Address</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsAddressModalOpen(true)} className="text-primary border-primary/20 hover:border-primary/40 hover:bg-primary/5 hover:text-primary font-bold h-8 px-3 rounded-md">
                  {selectedAddress ? "Change" : "Select"}
                </Button>
              </CardHeader>
              <CardContent className="py-4">
                {selectedAddress ? (
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-full">
                      <MapPin className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold">{selectedAddress.fullName}</p>
                      <p className="text-sm text-muted-foreground line-clamp-1">{selectedAddress.addressLine1}, {selectedAddress.city}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4 text-center cursor-pointer" onClick={() => setIsAddressModalOpen(true)}>
                    <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
                    <p className="font-medium">No address selected</p>
                    <p className="text-sm text-muted-foreground">Click to provide service location</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Schedule Section */}
          <div ref={scheduleSectionRef}>
            <Card className="overflow-hidden border-none shadow-md">
              <CardHeader className="bg-muted/30 py-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Schedule</CardTitle>
                </div>
                <Button variant="outline" size="sm" onClick={() => setIsScheduleModalOpen(true)} className="text-primary border-primary/20 hover:border-primary/40 hover:bg-primary/5 hover:text-primary font-bold h-8 px-3 rounded-md">
                  {scheduledDate ? "Change" : "Select"}
                </Button>
              </CardHeader>
              <CardContent className="py-4">
                {scheduledDate ? (
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-full">
                      <Clock className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold">{formatDate(scheduledDate)}</p>
                      <p className="text-sm text-muted-foreground">{scheduledSlot}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4 text-center cursor-pointer" onClick={() => setIsScheduleModalOpen(true)}>
                    <AlertTriangle className="h-8 w-8 text-amber-500 mb-2" />
                    <p className="font-medium">No schedule selected</p>
                    <p className="text-sm text-muted-foreground">Click to pick a date and time</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Payment Section */}
          <div ref={paymentSectionRef}>
            <Card className="border-none shadow-md">
              <CardHeader className="bg-muted/30 py-4">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Payment Method</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="py-6">
                <PaymentMethods 
                  selectedMethod={paymentMethod}
                  onSelect={handlePaymentMethodSelect}
                />
              </CardContent>
            </Card>
          </div>

          {/* Promo Code Section (Mobile Only) */}
          <div className="lg:hidden">
            <PromoCodeCard 
              sumOfItemPrices={sumOfItemPrices} 
              appliedPromo={appliedPromo} 
              onApply={setAppliedPromo} 
            />
          </div>
        </div>

        {/* Order Summary Column */}
        <div className="lg:col-span-4" ref={orderSummaryRef}>
          <div className="sticky top-6 space-y-6">
            {/* Promo Code Section (Desktop Only) */}
            <div className="hidden lg:block">
              <PromoCodeCard 
                sumOfItemPrices={sumOfItemPrices} 
                appliedPromo={appliedPromo} 
                onApply={setAppliedPromo} 
              />
            </div>

            <PaymentSummary 
              paymentMethod={paymentMethod}
              canBook={!!scheduledDate && !!scheduledSlot && !!selectedAddress && !!paymentMethod}
              appliedPromo={appliedPromo}
              onSumCalculated={setSumOfItemPrices}
            />
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      <Dialog open={isScheduleModalOpen} onOpenChange={setIsScheduleModalOpen}>
        <DialogContent className="max-w-4xl w-[95vw] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Select Date & Time</DialogTitle>
            <DialogDescription>
              Choose a convenient date and time slot for your service.
            </DialogDescription>
          </DialogHeader>
          <ScheduleSelection 
            onSelect={handleScheduleSelect}
            initialDate={scheduledDate || undefined}
            initialSlot={scheduledSlot || undefined}
            latitude={selectedAddress?.latitude ?? undefined}
            longitude={selectedAddress?.longitude ?? undefined}
          />
        </DialogContent>
      </Dialog>

      {/* Address Modal */}
      <Dialog open={isAddressModalOpen} onOpenChange={setIsAddressModalOpen}>
        <DialogContent className="max-w-2xl w-[95vw] overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Select Service Address</DialogTitle>
            <DialogDescription>
              Provide the location where the service should be performed.
            </DialogDescription>
          </DialogHeader>
          <AddressSelection 
            onSelect={handleAddressSelect}
            initialAddressId={selectedAddress?.id}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
