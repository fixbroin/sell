
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Info, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext';
import { formatCurrency } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp, addDoc } from '@/lib/mysqlDb';
import type { FirestoreService, AppliedPlatformFeeItem } from '@/types/firestore';
import { getActiveCheckoutEntries, type CartEntry } from '@/lib/cartManager';
import TaxBreakdownDisplay from '@/components/shared/TaxBreakdownDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from "@/components/ui/alert";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const generateBookingId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FB-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(chars.length * Math.random()));
  }
  return result;
};

interface AppliedPromoCodeInfo {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  calculatedDiscount: number;
}

const getBasePrice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
  if (isTaxInclusive && taxPercent && taxPercent > 0) {
    return displayedPrice / (1 + taxPercent / 100);
  }
  return displayedPrice;
};

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

interface PaymentSummaryProps {
  paymentMethod: string;
  canBook: boolean;
  appliedPromo: AppliedPromoCodeInfo | null;
  onSumCalculated?: (sum: number) => void;
}

export default function PaymentSummary({ paymentMethod, canBook, appliedPromo, onSumCalculated }: PaymentSummaryProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { showLoading, hideLoading } = useLoading();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const { settings: globalSettings } = useGlobalSettings();

  const freeDays = appConfig?.freeCancellationDays || 0;
  const freeHours = appConfig?.freeCancellationHours || 0;
  const freeMins = appConfig?.freeCancellationMinutes || 0;

  let freeWindowText = "";
  if (freeDays > 0) freeWindowText += `${freeDays} day(s) `;
  if (freeHours > 0) freeWindowText += `${freeHours} hour(s) `;
  if (freeMins > 0 || freeWindowText === "") freeWindowText += `${freeMins} minute(s)`;
  freeWindowText = freeWindowText.trim();

  const finalHours = appConfig?.finalCancellationHours || 0;
  const finalMins = appConfig?.finalCancellationMinutes || 0;

  let finalWindowText = "";
  if (finalHours > 0) finalWindowText += `${finalHours} hour(s) `;
  if (finalMins > 0 || finalWindowText === "") finalWindowText += `${finalMins} minute(s)`;
  finalWindowText = finalWindowText.trim();

  const [cartEntries, setCartEntries] = useState<CartEntry[]>([]);
  const [serviceDetailsMap, setServiceDetailsMap] = useState<Record<string, FirestoreService>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isGatewayDialogOpen, setIsGatewayDialogOpen] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  const [categoryOverrides, setCategoryOverrides] = useState<{
    visitingChargeAmount?: number;
    minimumBookingAmount?: number;
    minimumBookingPolicyDescription?: string;
  } | null>(null);

  const [subTotal, setSubTotal] = useState(0); 
  const [visitingCharge, setVisitingCharge] = useState(0); 
  const [taxAmount, setTaxAmount] = useState(0); 
  const [totalAmountDue, setTotalAmountDue] = useState(0); 
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);

  const [calculatedPlatformFees, setCalculatedPlatformFees] = useState<AppliedPlatformFeeItem[]>([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [isTaxBreakdownOpen, setIsTaxBreakdownOpen] = useState(false);
  const [isVisitingChargeInfoOpen, setIsVisitingChargeInfoOpen] = useState(false);
  const [isPlatformFeeInfoOpen, setIsPlatformFeeInfoOpen] = useState(false);
  const [taxBreakdownItems, setTaxBreakdownItems] = useState<any[]>([]);
  const [visitingChargeBreakdown, setVisitingChargeBreakdown] = useState<any>(null);
  const [sumOfDisplayedItemPrices, setSumOfDisplayedItemPrices] = useState(0);

  const dynamicVisitingChargePolicy = useMemo(() => {
    const vcAmount = (categoryOverrides && typeof categoryOverrides.visitingChargeAmount === 'number') ? categoryOverrides.visitingChargeAmount : appConfig.visitingChargeAmount;
    const minBooking = (categoryOverrides && typeof categoryOverrides.minimumBookingAmount === 'number') ? categoryOverrides.minimumBookingAmount : appConfig.minimumBookingAmount;
    const policyDesc = (categoryOverrides && categoryOverrides.minimumBookingPolicyDescription) ? categoryOverrides.minimumBookingPolicyDescription : appConfig.minimumBookingPolicyDescription;

    if (!policyDesc || typeof minBooking !== 'number' || typeof vcAmount !== 'number') {
      return `A visiting charge of ${formatCurrency(vcAmount || 0, symbol, decimals, code)} will be applied if your booking total is below ${formatCurrency(minBooking || 0, symbol, decimals, code)}.`;
    }
    const escapedSymbol = (symbol || "₹").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const patternVc = new RegExp(`(?:₹|\\$|${escapedSymbol})?{VISITING_CHARGE}`, 'g');
    const patternMin = new RegExp(`(?:₹|\\$|${escapedSymbol})?{MINIMUM_BOOKING_AMOUNT}`, 'g');

    const normalizedPolicy = policyDesc
      .replace(patternMin, "{MINIMUM_BOOKING_AMOUNT}")
      .replace(patternVc, "{VISITING_CHARGE}");

    return normalizedPolicy
      .replace(/{MINIMUM_BOOKING_AMOUNT}/g, formatCurrency(minBooking, symbol, decimals, code))
      .replace(/{VISITING_CHARGE}/g, formatCurrency(vcAmount, symbol, decimals, code))
      .replace("{MINIMUM_BOOKING_AMOUNT}", formatCurrency(minBooking, symbol, decimals, code))
      .replace("{VISITING_CHARGE}", formatCurrency(vcAmount, symbol, decimals, code));
  }, [appConfig, categoryOverrides, symbol, decimals, code]);

  const dynamicPlatformFeeTitle = useMemo(() => {
    if (!appConfig?.platformFees) return "Fee Details";
    const activeNames = appConfig.platformFees.filter(fee => fee.isActive).map(fee => fee.name);
    return activeNames.length > 0 ? activeNames.join(" & ") : "Fee Details";
  }, [appConfig]);

  const dynamicPlatformFeeDescription = useMemo(() => {
    if (!appConfig?.platformFees || appConfig.platformFees.length === 0) return "";
    return appConfig.platformFees
      .filter(fee => fee.isActive)
      .map(fee => {
        if (fee.description) return fee.description;
        const rateText = fee.type === 'percentage' ? `${fee.value}% of items total` : `${formatCurrency(fee.value, symbol, decimals, code)} flat fee`;
        return `${fee.name} is a ${rateText} applied to your booking to support secure payments, background checks, and digital infrastructure maintenance.`;
      })
      .join("\n\n");
  }, [appConfig, symbol, decimals, code]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const entries = getActiveCheckoutEntries();
    setCartEntries(entries);

    if (entries.length === 0) {
      setIsLoading(false);
      return;
    }

    try {
      const detailsPromises = entries.map(async (entry) => {
        const serviceSnap = await getDoc(doc(db, "adminServices", entry.serviceId));
        return serviceSnap.exists() ? { ...serviceSnap.data(), id: serviceSnap.id } as FirestoreService : null;
      });
      const resolved = (await Promise.all(detailsPromises)).filter(Boolean) as FirestoreService[];
      const map = resolved.reduce((acc, s) => ({ ...acc, [s.id]: s }), {});
      setServiceDetailsMap(map);

      let customCategoryData = null;
      const activeCatId = localStorage.getItem('yourbrandActiveCheckoutCategory');
      if (activeCatId) {
        const catSnap = await getDoc(doc(db, "adminCategories", activeCatId));
        if (catSnap.exists()) {
          const cd = catSnap.data();
          customCategoryData = {
            visitingChargeAmount: cd.visitingChargeAmount,
            minimumBookingAmount: cd.minimumBookingAmount,
            minimumBookingPolicyDescription: cd.minimumBookingPolicyDescription
          };
        }
      }
      setCategoryOverrides(customCategoryData);
    } catch (error) {
      console.error("Error loading payment data", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (isLoading || isLoadingAppSettings || cartEntries.length === 0) return;

    let currentBaseSubtotal = 0;
    let currentSumOfDisplayed = 0;
    const newBreakdown: any[] = [];

    cartEntries.forEach((entry) => {
      const detail = serviceDetailsMap[entry.serviceId];
      if (detail) {
        const displayedPrice = calculateIncrementalTotalPriceForItem(detail, entry.quantity);
        currentSumOfDisplayed += displayedPrice;
        const taxRate = detail.taxPercent || 0;
        const basePrice = getBasePrice(displayedPrice, detail.isTaxInclusive, taxRate);
        currentBaseSubtotal += basePrice;
        const itemTax = basePrice * (taxRate / 100);
        newBreakdown.push({
          name: detail.name,
          quantity: entry.quantity,
          pricePerUnit: displayedPrice / entry.quantity,
          itemSubtotal: basePrice,
          taxPercent: taxRate,
          taxAmount: itemTax,
          isTaxInclusive: detail.isTaxInclusive === true
        });
      }
    });

    setSumOfDisplayedItemPrices(currentSumOfDisplayed);
    if (onSumCalculated) onSumCalculated(currentSumOfDisplayed);
    setSubTotal(currentBaseSubtotal);
    setTaxBreakdownItems(newBreakdown);

    let currentDiscount = 0;
    if (appliedPromo && currentSumOfDisplayed > 0) {
      if (appliedPromo.discountType === 'percentage') {
        currentDiscount = (currentSumOfDisplayed * appliedPromo.discountValue) / 100;
      } else {
        currentDiscount = appliedPromo.discountValue;
      }
      currentDiscount = Math.min(currentDiscount, currentSumOfDisplayed);
      setDiscountAmount(currentDiscount);
    } else {
      setDiscountAmount(0);
    }

    const netAmount = currentSumOfDisplayed - currentDiscount;
    let baseVC = 0;
    let displayedVC = 0;
    let currentPolicy: string | null = null;

    const vcAmount = (categoryOverrides && typeof categoryOverrides.visitingChargeAmount === 'number') ? categoryOverrides.visitingChargeAmount : appConfig.visitingChargeAmount;
    const minBooking = (categoryOverrides && typeof categoryOverrides.minimumBookingAmount === 'number') ? categoryOverrides.minimumBookingAmount : appConfig.minimumBookingAmount;
    const policyDesc = (categoryOverrides && categoryOverrides.minimumBookingPolicyDescription) ? categoryOverrides.minimumBookingPolicyDescription : appConfig.minimumBookingPolicyDescription;

    if (appConfig.enableMinimumBookingPolicy && typeof minBooking === 'number' && typeof vcAmount === 'number') {
      if (netAmount < minBooking) {
        displayedVC = vcAmount;
        baseVC = getBasePrice(displayedVC, appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent);
        if (policyDesc) {
          const escapedSymbol = (symbol || "₹").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const patternVc = new RegExp(`(?:₹|\\$|${escapedSymbol})?{VISITING_CHARGE}`, 'g');
          const patternMin = new RegExp(`(?:₹|\\$|${escapedSymbol})?{MINIMUM_BOOKING_AMOUNT}`, 'g');
          const normalizedPolicy = policyDesc
            .replace(patternMin, "{MINIMUM_BOOKING_AMOUNT}")
            .replace(patternVc, "{VISITING_CHARGE}");
          currentPolicy = normalizedPolicy
            .replace(/{MINIMUM_BOOKING_AMOUNT}/g, `${symbol}${minBooking}`)
            .replace(/{VISITING_CHARGE}/g, `${symbol}${displayedVC}`)
            .replace("{MINIMUM_BOOKING_AMOUNT}", `${symbol}${minBooking}`)
            .replace("{VISITING_CHARGE}", `${symbol}${displayedVC}`);
        }
      }
    }
    setVisitingCharge(baseVC);
    setPolicyMessage(currentPolicy);

    let platformFeeBase = 0;
    let platformFeeTax = 0;
    const newPlatformFees: AppliedPlatformFeeItem[] = [];

    // Only apply platform fees if visiting charge is NOT applied (i.e. baseVC is 0)
    if (baseVC === 0) {
      (appConfig.platformFees || []).forEach(fee => {
        if (fee.isActive) {
          const feeAmount = fee.type === 'percentage' ? (currentSumOfDisplayed * fee.value) / 100 : fee.value;
          const feeTax = feeAmount * (fee.feeTaxRatePercent / 100);
          newPlatformFees.push({
            name: fee.name,
            type: fee.type,
            valueApplied: fee.value,
            calculatedFeeAmount: feeAmount,
            taxRatePercentOnFee: fee.feeTaxRatePercent,
            taxAmountOnFee: feeTax
          });
          platformFeeBase += feeAmount;
          platformFeeTax += feeTax;
        }
      });
    }
    setCalculatedPlatformFees(newPlatformFees);

    const itemTaxTotal = newBreakdown.reduce((sum, item) => sum + item.taxAmount, 0);
    let vcTax = 0;
    if (appConfig.enableTaxOnVisitingCharge && baseVC > 0) {
      vcTax = baseVC * ((appConfig.visitingChargeTaxPercent || 0) / 100);
    }
    setVisitingChargeBreakdown(displayedVC > 0 ? {
      amount: displayedVC,
      baseAmount: baseVC,
      taxPercent: appConfig.visitingChargeTaxPercent || 0,
      taxAmount: vcTax,
      isTaxInclusive: appConfig.isVisitingChargeTaxInclusive || false
    } : null);

    const finalTax = itemTaxTotal + vcTax + platformFeeTax;
    setTaxAmount(finalTax);
    setTotalAmountDue(currentBaseSubtotal + baseVC - currentDiscount + platformFeeBase + finalTax);
  }, [cartEntries, serviceDetailsMap, appConfig, isLoading, isLoadingAppSettings, appliedPromo, onSumCalculated]);

  const loadRazorpay = () => new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

  const handleRazorpayCheckout = async () => {
    setIsProcessingPayment(true);
    showLoading();

    const scriptLoaded = await loadRazorpay();
    if (!scriptLoaded) {
      toast({ title: "Error", description: "Razorpay failed to load.", variant: "destructive" });
      setIsProcessingPayment(false);
      hideLoading();
      return;
    }

    try {
      const getCurrencySubunitDecimals = (currencyCode: string): number => {
        const c = currencyCode.toUpperCase();
        if (['JPY', 'KRW', 'CLP', 'VND', 'UGX'].includes(c)) return 0;
        if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 3;
        return 2;
      };
      const currencyDecimals = getCurrencySubunitDecimals(code);

      const res = await fetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              amount: Math.round(totalAmountDue * Math.pow(10, currencyDecimals)),
              currency: code
          }),
      });
      const orderDetails = await res.json();

      let customerName = "Guest", customerEmail = "guest@example.com", customerContact = undefined;
      const customerAddressDataString = localStorage.getItem('yourbrandCustomerAddress');
      if (customerAddressDataString) {
        try {
          const addr = JSON.parse(customerAddressDataString);
          customerName = addr.fullName || customerName;
          customerEmail = addr.email || customerEmail;
          customerContact = addr.phone || undefined;
        } catch (e) {}
      }

      const options = {
        key: appConfig.razorpayKeyId,
        amount: orderDetails.amount,
        currency: code,
        name: globalSettings?.websiteName || "Yourbrand",
        description: "Service Booking",
        order_id: orderDetails.id,
        handler: (response: any) => {
          localStorage.setItem('razorpayPaymentId', response.razorpay_payment_id);
          localStorage.setItem('razorpayOrderId', response.razorpay_order_id);
          localStorage.setItem('razorpaySignature', response.razorpay_signature);
          localStorage.setItem('yourbrandPaymentMethod', 'Online');
          localStorage.setItem('yourbrandFinalBookingTotal', totalAmountDue.toString());
          if (appliedPromo) {
            localStorage.setItem('yourbrandBookingDiscountCode', appliedPromo.code);
            localStorage.setItem('yourbrandBookingDiscountAmount', appliedPromo.calculatedDiscount.toString());
            localStorage.setItem('yourbrandAppliedPromoCodeId', appliedPromo.id);
          }
          if (calculatedPlatformFees.length > 0) localStorage.setItem('yourbrandAppliedPlatformFees', JSON.stringify(calculatedPlatformFees));
          router.push('/checkout/thank-you');
        },
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerContact
        },
        theme: { color: "#45A0A2" },
        modal: { ondismiss: () => { setIsProcessingPayment(false); hideLoading(); }}
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      toast({ title: "Payment Error", variant: "destructive" });
      setIsProcessingPayment(false);
      hideLoading();
    }
  };

  const handleStripeCheckout = async () => {
    setIsProcessingPayment(true);
    showLoading();

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const newBookingId = generateBookingId();
      
      let customerEmail = "";
      let customerName = "Guest User", customerPhone = "N/A", addressLine1 = "N/A", addressLine2: string | undefined, city = "N/A", state = "N/A", pincode = "N/A";
      let latitude: number | undefined, longitude: number | undefined;
      let bookingDiscountCode: string | undefined, bookingDiscountAmount: number | undefined, appliedPromoCodeId: string | undefined;
      let storedAppliedPlatformFees: AppliedPlatformFeeItem[] = [];
      let estimatedEndTime: string | undefined;
      let currentCategoryId: string | null = null;
      let storedInterveningBreaks: any[] = [];
      let storedDailyTimeline: any[] = [];

      if (typeof window !== 'undefined') {
        const storedEmail = localStorage.getItem('yourbrandCustomerEmail');
        customerEmail = (storedEmail && storedEmail.trim()) ? storedEmail : (auth.currentUser?.email || "");
        currentCategoryId = localStorage.getItem('yourbrandActiveCheckoutCategory');
        const breaksStr = localStorage.getItem('yourbrandInterveningBreaks');
        if (breaksStr) { try { storedInterveningBreaks = JSON.parse(breaksStr); } catch (e) {} }
        const dailyTimelineStr = localStorage.getItem('yourbrandDailyTimeline');
        if (dailyTimelineStr) { try { storedDailyTimeline = JSON.parse(dailyTimelineStr); } catch (e) {} }
        bookingDiscountCode = localStorage.getItem('yourbrandBookingDiscountCode') || undefined;
        const discountAmountStr = localStorage.getItem('yourbrandBookingDiscountAmount');
        bookingDiscountAmount = discountAmountStr ? parseFloat(discountAmountStr) : undefined;
        appliedPromoCodeId = localStorage.getItem('yourbrandAppliedPromoCodeId') || undefined;
        const platformFeesStr = localStorage.getItem('yourbrandAppliedPlatformFees');
        if (platformFeesStr) { try { storedAppliedPlatformFees = JSON.parse(platformFeesStr); } catch (e) {} }
        const addressDataString = localStorage.getItem('yourbrandCustomerAddress');
        if (addressDataString) { const addressData = JSON.parse(addressDataString); customerName = addressData.fullName || customerName; customerPhone = addressData.phone || customerPhone; customerEmail = addressData.email || customerEmail; addressLine1 = addressData.addressLine1 || addressLine1; addressLine2 = addressData.addressLine2 || undefined; city = addressData.city || city; state = addressData.state || state; pincode = addressData.pincode || pincode; latitude = addressData.latitude === null ? undefined : addressData.latitude; longitude = addressData.longitude === null ? undefined : addressData.longitude; }
      }

      const bookingServices = cartEntries.map(entry => {
        const detail = serviceDetailsMap[entry.serviceId];
        if (!detail) return null;
        const displayedPriceForQuantity = calculateIncrementalTotalPriceForItem(detail, entry.quantity);
        const itemTaxRate = (detail.taxPercent || 0) > 0 ? (detail.taxPercent || 0) : 0;
        const basePriceForQuantity = getBasePrice(displayedPriceForQuantity, detail.isTaxInclusive === true, itemTaxRate);
        const taxAmountForItem = basePriceForQuantity * (itemTaxRate / 100);

        return {
          serviceId: entry.serviceId,
          name: detail.name,
          quantity: entry.quantity,
          pricePerUnit: displayedPriceForQuantity / entry.quantity,
          discountedPricePerUnit: detail.discountedPrice || null,
          isTaxInclusive: detail.isTaxInclusive === true,
          taxPercentApplied: itemTaxRate,
          taxAmountForItem: taxAmountForItem,
          imageUrl: detail.imageUrl || null
        };
      }).filter(Boolean);

      const totalPlatformFeeBaseAmount = calculatedPlatformFees.reduce((sum, fee) => sum + fee.calculatedFeeAmount, 0);
      const totalTaxOnPlatformFees = calculatedPlatformFees.reduce((sum, fee) => sum + fee.taxAmountOnFee, 0);

      const newBookingData = {
        bookingId: newBookingId,
        bookingNumber: 0,
        ...(auth.currentUser?.uid && { userId: auth.currentUser.uid }),
        customerName, customerEmail, customerPhone, addressLine1, ...(addressLine2 && { addressLine2 }), city, state, pincode,
        ...(latitude !== undefined && { latitude }), ...(longitude !== undefined && { longitude }),
        scheduledDate: localStorage.getItem('yourbrandScheduledDate') || "",
        scheduledTimeSlot: localStorage.getItem('yourbrandScheduledTimeSlot') || "",
        estimatedEndTime: localStorage.getItem('yourbrandEstimatedEndTime') || null,
        interveningBreaks: storedInterveningBreaks,
        dailyTimeline: storedDailyTimeline,
        services: bookingServices,
        subTotal: subTotal,
        ...(visitingCharge > 0 && { visitingCharge: visitingCharge }),
        taxAmount: taxAmount,
        totalAmount: totalAmountDue,
        platformFeeTotal: totalPlatformFeeBaseAmount + totalTaxOnPlatformFees,
        ...(appliedPromo && { discountCode: appliedPromo.code }),
        ...(discountAmount > 0 && { discountAmount: discountAmount }),
        ...(calculatedPlatformFees.length > 0 && { appliedPlatformFees: calculatedPlatformFees }),
        paymentMethod: 'Online',
        status: 'Pending Payment',
        createdAt: Timestamp.now(),
        isReviewedByCustomer: false,
        workCategoryId: currentCategoryId || undefined,
      };

      const docRef = await addDoc(collection(db, "bookings"), newBookingData);

      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'booking',
          bookingId: docRef.id,
          amount: totalAmountDue,
          currency: code,
          successUrl: `${origin}/checkout/thank-you?payment_method=stripe&session_id={CHECKOUT_SESSION_ID}&bookingId=${docRef.id}`,
          cancelUrl: `${origin}/checkout`,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to initiate Stripe checkout.');
      }

      const data = await res.json();

      localStorage.setItem('yourbrandPaymentMethod', 'Online');
      localStorage.setItem('yourbrandFinalBookingTotal', totalAmountDue.toString());
      if (appliedPromo) {
        localStorage.setItem('yourbrandBookingDiscountCode', appliedPromo.code);
        localStorage.setItem('yourbrandBookingDiscountAmount', appliedPromo.calculatedDiscount.toString());
        localStorage.setItem('yourbrandAppliedPromoCodeId', appliedPromo.id);
      }
      if (calculatedPlatformFees.length > 0) {
        localStorage.setItem('yourbrandAppliedPlatformFees', JSON.stringify(calculatedPlatformFees));
      }

      router.push(data.url);

    } catch (error: any) {
      toast({ title: "Stripe Payment Error", description: error.message || "Could not initiate payment.", variant: "destructive" });
      setIsProcessingPayment(false);
      hideLoading();
    }
  };

  const handleBookNow = async () => {
    if (!canBook) return;
    setIsProcessingPayment(true);
    showLoading();

    const storageMethod = paymentMethod === 'Pay After Service' ? 'Pay After Service' : 'Online';

    if (paymentMethod === 'Pay After Service') {
        localStorage.setItem('yourbrandPaymentMethod', storageMethod);
        localStorage.setItem('yourbrandFinalBookingTotal', totalAmountDue.toString());
        if (appliedPromo) {
            localStorage.setItem('yourbrandBookingDiscountCode', appliedPromo.code);
            localStorage.setItem('yourbrandBookingDiscountAmount', appliedPromo.calculatedDiscount.toString());
            localStorage.setItem('yourbrandAppliedPromoCodeId', appliedPromo.id);
        }
        if (calculatedPlatformFees.length > 0) localStorage.setItem('yourbrandAppliedPlatformFees', JSON.stringify(calculatedPlatformFees));
        router.push('/checkout/thank-you'); 
        return; 
    }

    if (paymentMethod === 'online') {
        const razorpayEnabled = appConfig.enableRazorpay !== false && !!appConfig.razorpayKeyId;
        const stripeEnabled = appConfig.enableStripe === true && !!appConfig.stripePublishableKey;

        if (!razorpayEnabled && !stripeEnabled) {
          toast({ title: "Payments Disabled", description: "Online payments are currently not available.", variant: "destructive" });
          setIsProcessingPayment(false); hideLoading(); return;
        }

        if (razorpayEnabled && stripeEnabled) {
          setIsGatewayDialogOpen(true);
          setIsProcessingPayment(false);
          hideLoading();
          return;
        }

        if (stripeEnabled) {
          await handleStripeCheckout();
        } else {
          await handleRazorpayCheckout();
        }
    }
  };

  if (isLoading) return <div className="p-3 bg-muted animate-pulse rounded-xl h-64" />;

  return (
    <Card className="border-none shadow-lg">
      <CardHeader className="bg-primary/5 py-4">
        <CardTitle className="text-lg">Order Summary</CardTitle>
      </CardHeader>
      <CardContent className="py-6 space-y-4">
        {/* Breakdown */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Items Total</span>
            <span>{formatCurrency(sumOfDisplayedItemPrices, symbol, decimals, code)}</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-green-600 font-medium">
              <span>Discount {appliedPromo ? `(${appliedPromo.code})` : ''}</span>
              <span>-{formatCurrency(discountAmount, symbol, decimals, code)}</span>
            </div>
          )}
          {visitingCharge > 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span>Visiting Charge</span>
                <Info className="h-3 w-3 cursor-pointer hover:text-primary transition-colors" onClick={() => setIsVisitingChargeInfoOpen(true)} />
              </div>
              <span>{formatCurrency((((categoryOverrides && typeof categoryOverrides.visitingChargeAmount === 'number') ? categoryOverrides.visitingChargeAmount : appConfig.visitingChargeAmount) || 0), symbol, decimals, code)}</span>
            </div>
          )}
          {calculatedPlatformFees.map(fee => (
            <div key={fee.name} className="flex justify-between items-center">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span>{fee.name}</span>
                <Info className="h-3 w-3 cursor-pointer hover:text-primary transition-colors" onClick={() => setIsPlatformFeeInfoOpen(true)} />
              </div>
              <span>{formatCurrency(fee.calculatedFeeAmount + fee.taxAmountOnFee, symbol, decimals, code)}</span>
            </div>
          ))}
          {taxAmount > 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-1 text-muted-foreground">
                Tax
                <Info className="h-3 w-3 cursor-pointer hover:text-primary transition-colors" onClick={() => setIsTaxBreakdownOpen(true)} />
              </div>
              <span>{formatCurrency(taxAmount, symbol, decimals, code)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2 mt-2">
            <span>Total Amount</span>
            <span className="text-primary">{formatCurrency(totalAmountDue, symbol, decimals, code)}</span>
          </div>
        </div>

        {policyMessage && (
          <Alert className="bg-amber-50 border-amber-200 py-2 shadow-sm">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-xs text-amber-700 leading-tight">{policyMessage}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="bg-primary/5 py-6 flex flex-col gap-4">
        <p className="text-xs text-muted-foreground text-center w-full">
          By placing this order, you agree to our{" "}
          <button 
            type="button" 
            onClick={() => setShowPolicyModal(true)} 
            className="text-primary hover:underline font-semibold focus:outline-none"
          >
            Cancellation Policy
          </button>.
        </p>
        <Button 
          className="w-full py-6 text-lg font-bold shadow-lg text-white" 
          disabled={!canBook || isProcessingPayment}
          onClick={handleBookNow}
        >
          {isProcessingPayment ? <Loader2 className="h-5 w-5 animate-spin mr-2 text-white" /> : null}
          {paymentMethod === 'Pay After Service' ? 'Confirm Booking' : 'Book & Pay Now'}
        </Button>
      </CardFooter>

      <Dialog open={isTaxBreakdownOpen} onOpenChange={setIsTaxBreakdownOpen}>
        <DialogContent className="w-[90vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tax Breakdown</DialogTitle>
            <DialogDescription>
              A detailed view of the taxes applied to your items and platform fees.
            </DialogDescription>
          </DialogHeader>
          <TaxBreakdownDisplay 
            items={taxBreakdownItems}
            visitingCharge={visitingChargeBreakdown}
            platformFees={calculatedPlatformFees}
            subTotalBeforeDiscount={subTotal}
            totalDiscount={discountAmount}
            totalTax={taxAmount}
            grandTotal={totalAmountDue}
            defaultTaxRatePercent={appConfig.visitingChargeTaxPercent || 0}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isVisitingChargeInfoOpen} onOpenChange={setIsVisitingChargeInfoOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Visiting Charge Details</DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-relaxed text-foreground whitespace-pre-line">
              {dynamicVisitingChargePolicy}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={isPlatformFeeInfoOpen} onOpenChange={setIsPlatformFeeInfoOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dynamicPlatformFeeTitle} Details</DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-relaxed text-foreground whitespace-pre-line">
              {dynamicPlatformFeeDescription}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog open={isGatewayDialogOpen} onOpenChange={setIsGatewayDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-bold">Select Payment Method</DialogTitle>
            <DialogDescription className="text-center text-sm">
              Please choose your preferred gateway to complete your booking.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button
              className="flex justify-between items-center py-6 border rounded-xl hover:bg-accent hover:text-accent-foreground font-semibold"
              variant="outline"
              onClick={async () => {
                setIsGatewayDialogOpen(false);
                await handleRazorpayCheckout();
              }}
            >
              <span className="text-lg">Razorpay</span>
              <span className="text-xs text-muted-foreground">(Cards, Netbanking, UPI, Wallets)</span>
            </Button>
            <Button
              className="flex justify-between items-center py-6 border rounded-xl hover:bg-accent hover:text-accent-foreground font-semibold"
              variant="outline"
              onClick={async () => {
                setIsGatewayDialogOpen(false);
                await handleStripeCheckout();
              }}
            >
              <span className="text-lg">Stripe</span>
              <span className="text-xs text-muted-foreground">(Credit/Debit Cards, International)</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancellation Policy Dialog */}
      <Dialog open={showPolicyModal} onOpenChange={setShowPolicyModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Cancellation Policy</DialogTitle>
            <DialogDescription>
              Please review our cancellation and refund guidelines before completing your booking.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 my-2 max-h-[60vh] overflow-y-auto pr-1">
            {!appConfig?.enableCancellationPolicy ? (
              <p className="text-sm text-muted-foreground">
                Cancellation policy is currently disabled. You can cancel any booking at any time for a full 100% refund.
              </p>
            ) : (
              <div className="space-y-4">
                {/* 1. Free Cancellation */}
                <div className="flex gap-3 items-start">
                  <div className="h-6 w-6 rounded bg-green-500/10 flex items-center justify-center shrink-0 text-green-600 font-bold text-xs">1</div>
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">Free Cancellation Window</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cancel at least{" "}
                      <strong>{freeWindowText}</strong>{" "}
                      before your scheduled service time for a <strong>100% refund</strong>.
                    </p>
                  </div>
                </div>

                {/* 2. Standard Cancellation Fee */}
                <div className="flex gap-3 items-start border-t pt-3">
                  <div className="h-6 w-6 rounded bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-600 font-bold text-xs">2</div>
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">Standard Cancellation Fee</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {appConfig.enableFinalCancellationWindow ? (
                        <>
                          Cancellations made between <strong>{freeWindowText}</strong> and <strong>{finalWindowText}</strong> before the scheduled service start time will incur a fee of{" "}
                          <strong>
                            {appConfig.cancellationFeeType === 'percentage' 
                              ? `${appConfig.cancellationFeeValue}%` 
                              : `${appConfig.currencySymbol || '₹'}${appConfig.cancellationFeeValue}`}
                          </strong>.
                        </>
                      ) : (
                        <>
                          Cancellations made less than <strong>{freeWindowText}</strong> before the scheduled service start time will incur a fee of{" "}
                          <strong>
                            {appConfig.cancellationFeeType === 'percentage' 
                              ? `${appConfig.cancellationFeeValue}%` 
                              : `${appConfig.currencySymbol || '₹'}${appConfig.cancellationFeeValue}`}
                          </strong>.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* 3. Final Restricted Window */}
                {appConfig.enableFinalCancellationWindow && (
                  <div className="flex gap-3 items-start border-t pt-3">
                    <div className="h-6 w-6 rounded bg-destructive/10 flex items-center justify-center shrink-0 text-destructive font-bold text-xs">3</div>
                    <div>
                      <h4 className="font-semibold text-destructive text-sm">Final Restricted Window (No Refund)</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cancellations made within{" "}
                        <strong>{finalWindowText}</strong>{" "}
                        before the scheduled service start time will receive a <strong>100% cancellation charge (No Refund / {formatCurrency(0, symbol, decimals, code)} Refund)</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. Pay After Service / COD Note */}
                <div className="flex gap-3 items-start border-t pt-3">
                  <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">ℹ</div>
                  <div>
                    <h4 className="font-semibold text-foreground text-sm">Pay After Service / Cash on Delivery</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      For bookings scheduled under <strong>Pay After Service</strong> or <strong>Cash on Delivery</strong>, any applicable cancellation fee or charge must be paid securely online before the cancellation request is processed.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="sm:justify-end">
            <Button type="button" onClick={() => setShowPolicyModal(false)}>
              Close & Go Back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
