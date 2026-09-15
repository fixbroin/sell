
"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowRight, ArrowLeft, CreditCard, Landmark, IndianRupee, Wallet, Info, Clock, Loader2, Tag, CheckCircle, XCircle, ListFilter, HandCoins, Ban } from 'lucide-react';
import CheckoutStepper from '@/components/checkout/CheckoutStepper';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, Timestamp, addDoc, deleteDoc } from '@/lib/mysqlDb';
import type { FirestoreService, FirestoreUser, FirestorePromoCode, AppSettings, PlatformFeeSetting, AppliedPlatformFeeItem, PriceVariant } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import TaxBreakdownDisplay from '@/components/shared/TaxBreakdownDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth as useAuthHook } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { isWebView, requestNativePayment } from '@/lib/webview-bridge';
import { getTimestampMillis } from '@/lib/utils';


const generateBookingId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FB-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(chars.length * Math.random()));
  }
  return result;
};

declare global {
  interface Window {
    Razorpay: any;
  }
}

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


export default function PaymentPage() {
  const [paymentMethod, setPaymentMethod] = useState("online");
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const { showLoading, hideLoading } = useLoading();
  const { user: currentUser } = useAuthHook();
  const searchParams = useSearchParams();

  const [isCancellationFeeMode, setIsCancellationFeeMode] = useState(false);
  const [cancellationFeeDetails, setCancellationFeeDetails] = useState<{ bookingId: string; feeAmount: number; humanReadableBookingId?: string } | null>(null);
  const [isGatewayDialogOpen, setIsGatewayDialogOpen] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  const [cartEntries, setCartEntries] = useState<CartEntry[]>([]);
  const [serviceDetailsMap, setServiceDetailsMap] = useState<Record<string, FirestoreService>>({});

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;

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

  const [subTotal, setSubTotal] = useState(0); 
  const [categoryOverrides, setCategoryOverrides] = useState<{
    visitingChargeAmount?: number;
    minimumBookingAmount?: number;
    minimumBookingPolicyDescription?: string;
  } | null>(null);

  const [visitingCharge, setVisitingCharge] = useState(0); 
  const [taxAmount, setTaxAmount] = useState(0); 
  const [totalAmountDue, setTotalAmountDue] = useState(0); 
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [isLoadingCartDetails, setIsLoadingCartDetails] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const [calculatedPlatformFees, setCalculatedPlatformFees] = useState<AppliedPlatformFeeItem[]>([]);
  const [totalPlatformFeeBaseAmount, setTotalPlatformFeeBaseAmount] = useState(0);
  const [totalTaxOnPlatformFees, setTotalTaxOnPlatformFees] = useState(0);

  const canOfferPayLater = useMemo(() => {
    if (!appConfig.enableCOD) return false; 
    if (isCancellationFeeMode) return false; 
    if (cartEntries.length === 0) return false; 
    return cartEntries.every(entry => {
        const serviceDetail = serviceDetailsMap[entry.serviceId];
        return serviceDetail?.allowPayLater !== false; 
    });
  }, [appConfig.enableCOD, cartEntries, serviceDetailsMap, isCancellationFeeMode]);


  const onlinePaymentEnabled = useMemo(() => appConfig.enableOnlinePayment !== false, [appConfig]);
  const payAfterServiceEnabled = useMemo(() => canOfferPayLater, [canOfferPayLater]);


  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [appliedPromoCode, setAppliedPromoCode] = useState<AppliedPromoCodeInfo | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [allFetchedPromoCodes, setAllFetchedPromoCodes] = useState<FirestorePromoCode[]>([]);
  const [availablePromoCodesToDisplay, setAvailablePromoCodesToDisplay] = useState<FirestorePromoCode[]>([]);
  const [isLoadingPromos, setIsLoadingPromos] = useState(true);
  const [effectiveTaxRateDisplay, setEffectiveTaxRateDisplay] = useState<string>("Est. Tax");
  const [isTaxBreakdownOpen, setIsTaxBreakdownOpen] = useState(false);
  const [taxBreakdownItems, setTaxBreakdownItems] = useState<Parameters<typeof TaxBreakdownDisplay>[0]['items']>([]);
  const [visitingChargeBreakdown, setVisitingChargeBreakdown] = useState<Parameters<typeof TaxBreakdownDisplay>[0]['visitingCharge']>(null);
  const [sumOfDisplayedItemPrices, setSumOfDisplayedItemPrices] = useState(0);

  const loadInitialData = useCallback(async () => {
    setIsLoadingCartDetails(true);
    setIsLoadingPromos(true);
    const currentCartEntries = getCartEntries();
    setCartEntries(currentCartEntries);

    logUserActivity('checkoutStep', { checkoutStepName: 'payment', pageUrl: pathname, cartItemCount: currentCartEntries.length }, currentUser?.uid, !currentUser ? getGuestId() : null);

    if (currentCartEntries.length === 0) {
      toast({ title: "Cart Empty", description: "Your cart is empty. Please add services to proceed.", variant: "default" });
      setSubTotal(0); setVisitingCharge(0); setTaxAmount(0); setTotalAmountDue(0); setPolicyMessage(null); setDiscountAmount(0); setAppliedPromoCode(null);
      setAllFetchedPromoCodes([]); setAvailablePromoCodesToDisplay([]);
      setIsLoadingCartDetails(false); setIsLoadingPromos(false);
      setTaxBreakdownItems([]); setVisitingChargeBreakdown(null); setSumOfDisplayedItemPrices(0);
      setCalculatedPlatformFees([]); setTotalPlatformFeeBaseAmount(0); setTotalTaxOnPlatformFees(0);
      return;
    }

    try {
      const detailsPromises = currentCartEntries.map(async (entry) => {
        const serviceDocRef = doc(db, "adminServices", entry.serviceId);
        const serviceSnap = await getDoc(serviceDocRef);
        if (serviceSnap.exists()) {
          const serviceData = serviceSnap.data() as FirestoreService;
          return { 
            ...serviceData, 
            id: serviceSnap.id,
            isTaxInclusive: serviceData.isTaxInclusive === true,
            allowPayLater: serviceData.allowPayLater === undefined ? true : serviceData.allowPayLater 
          } as FirestoreService;
        }
        toast({ title: "Cart Item Error", description: `Service ID ${entry.serviceId} not found.`, variant: "destructive", duration: 7000 });
        return null;
      });
      const resolvedDetails = (await Promise.all(detailsPromises)).filter(Boolean) as FirestoreService[];
      const detailsMap = resolvedDetails.reduce((acc, service) => { acc[service.id] = service; return acc; }, {} as Record<string, FirestoreService>);
      setServiceDetailsMap(detailsMap);
      const validCartEntries = currentCartEntries.filter(entry => detailsMap[entry.serviceId]);
      if (validCartEntries.length !== currentCartEntries.length) setCartEntries(validCartEntries);

      const storedPromo = localStorage.getItem('yourbrandAppliedPromoCode');
      if (storedPromo) { try { const parsedPromo: AppliedPromoCodeInfo = JSON.parse(storedPromo); setAppliedPromoCode(parsedPromo); setPromoCodeInput(parsedPromo.code); } catch (e) { localStorage.removeItem('yourbrandAppliedPromoCode'); } }

      const promoQuery = query(collection(db, "adminPromoCodes"), where("isActive", "==", true));
      const promoSnap = await getDocs(promoQuery);
      const fetchedPromos = promoSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as FirestorePromoCode));
      setAllFetchedPromoCodes(fetchedPromos);

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
    } catch (error) { console.error("[PaymentPage] Error fetching service details or promos:", error); toast({ title: "Error", description: "Could not load page data. Please try refreshing.", variant: "destructive" }); setAllFetchedPromoCodes([]);
    } finally { setIsLoadingCartDetails(false); }
  }, [pathname, currentUser, toast]);

  useEffect(() => {
    setIsMounted(true);
    const reason = searchParams.get('reason');
    if (reason === 'cancellation_fee') {
      const feeBookingId = localStorage.getItem('bookingIdForCancellationFee');
      const feeAmountStr = localStorage.getItem('cancellationFeeAmount');
      const humanBookingId = searchParams.get('booking_id'); 
      if (feeBookingId && feeAmountStr) {
        setIsCancellationFeeMode(true);
        setCancellationFeeDetails({ 
            bookingId: feeBookingId, 
            feeAmount: parseFloat(feeAmountStr),
            humanReadableBookingId: humanBookingId || undefined 
        });
        setTotalAmountDue(parseFloat(feeAmountStr)); 
        setIsLoadingCartDetails(false); 
        setIsLoadingPromos(false); 
      } else {
        toast({title: "Error", description: "Cancellation fee details missing. Please try again.", variant: "destructive"});
        router.push('/my-bookings');
      }
    }
  }, [searchParams, toast, router]);

  useEffect(() => {
    if (!isMounted || isLoadingAppSettings || isCancellationFeeMode) return;

    loadInitialData();
    
    // Listen for cart changes from other tabs/windows
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'yourbrandUserCart') {
        loadInitialData();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isMounted, isLoadingAppSettings, isCancellationFeeMode, loadInitialData]);

  useEffect(() => {
    if (isLoadingCartDetails || isLoadingAppSettings || isCancellationFeeMode || cartEntries.length === 0) {
      if (cartEntries.length === 0 && !isLoadingCartDetails && !isLoadingAppSettings && !isCancellationFeeMode) {
          setSubTotal(0); setVisitingCharge(0); setTaxAmount(0); setDiscountAmount(0); setTotalAmountDue(0); setPolicyMessage(null);
          setAvailablePromoCodesToDisplay([]); setIsLoadingPromos(false);
          setTaxBreakdownItems([]); setVisitingChargeBreakdown(null); setSumOfDisplayedItemPrices(0);
          setCalculatedPlatformFees([]); setTotalPlatformFeeBaseAmount(0); setTotalTaxOnPlatformFees(0);
      }
      return;
    }

    let currentBaseSubtotalFromItems = 0; let currentSumOfDisplayedPrices = 0; const newBreakdownItems: typeof taxBreakdownItems = [];
    let allItemsHaveSameTaxRate = true; let firstItemTaxRate: number | undefined = undefined;

    cartEntries.forEach((entry, index) => {
      const detail = serviceDetailsMap[entry.serviceId];
      if (detail) {
        const displayedPriceForQuantity = calculateIncrementalTotalPriceForItem(detail, entry.quantity);
        currentSumOfDisplayedPrices += displayedPriceForQuantity;
        const itemTaxRatePercent = (detail.taxPercent !== undefined && detail.taxPercent > 0) ? detail.taxPercent : 0;
        const basePriceForQuantity = getBasePrice(displayedPriceForQuantity, detail.isTaxInclusive, itemTaxRatePercent);
        currentBaseSubtotalFromItems += basePriceForQuantity;
        const itemTaxAmount = (basePriceForQuantity) * (itemTaxRatePercent / 100);
        if (index === 0) firstItemTaxRate = itemTaxRatePercent; else if (itemTaxRatePercent !== firstItemTaxRate) allItemsHaveSameTaxRate = false;
        newBreakdownItems.push({ name: detail.name, quantity: entry.quantity, pricePerUnit: displayedPriceForQuantity / entry.quantity, itemSubtotal: basePriceForQuantity, taxPercent: itemTaxRatePercent, taxAmount: itemTaxAmount, isTaxInclusive: detail.isTaxInclusive === true, isDefaultRate: false });
      }
    });
    setSumOfDisplayedItemPrices(currentSumOfDisplayedPrices); setSubTotal(currentBaseSubtotalFromItems); setTaxBreakdownItems(newBreakdownItems);

    let currentDiscountAmount = 0;
    if (appliedPromoCode && currentSumOfDisplayedPrices > 0) {
      if (appliedPromoCode.discountType === 'percentage') currentDiscountAmount = (currentSumOfDisplayedPrices * appliedPromoCode.discountValue) / 100;
      else currentDiscountAmount = appliedPromoCode.discountValue;
      currentDiscountAmount = Math.min(currentDiscountAmount, currentSumOfDisplayedPrices);
      setDiscountAmount(currentDiscountAmount);
    } else setDiscountAmount(0);

    const subtotalForFeeAndVcCheck = currentSumOfDisplayedPrices - currentDiscountAmount;
    let calculatedBaseVisitingCharge = 0; let displayedVisitingChargeAmount = 0; let currentPolicyMessage: string | null = null;

    const vcAmount = (categoryOverrides && typeof categoryOverrides.visitingChargeAmount === 'number') ? categoryOverrides.visitingChargeAmount : appConfig.visitingChargeAmount;
    const minBooking = (categoryOverrides && typeof categoryOverrides.minimumBookingAmount === 'number') ? categoryOverrides.minimumBookingAmount : appConfig.minimumBookingAmount;
    const policyDesc = (categoryOverrides && categoryOverrides.minimumBookingPolicyDescription) ? categoryOverrides.minimumBookingPolicyDescription : appConfig.minimumBookingPolicyDescription;

    if (appConfig.enableMinimumBookingPolicy && typeof minBooking === 'number' && typeof vcAmount === 'number') {
      if (subtotalForFeeAndVcCheck > 0 && subtotalForFeeAndVcCheck < minBooking) {
        displayedVisitingChargeAmount = vcAmount;
        calculatedBaseVisitingCharge = getBasePrice(displayedVisitingChargeAmount, appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent);
        if (policyDesc) {
          const escapedSymbol = (symbol || "₹").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const patternVc = new RegExp(`(?:₹|\\$|${escapedSymbol})?{VISITING_CHARGE}`, 'g');
          const patternMin = new RegExp(`(?:₹|\\$|${escapedSymbol})?{MINIMUM_BOOKING_AMOUNT}`, 'g');
          const normalizedPolicy = policyDesc
            .replace(patternMin, "{MINIMUM_BOOKING_AMOUNT}")
            .replace(patternVc, "{VISITING_CHARGE}");
          currentPolicyMessage = normalizedPolicy
            .replace(/{MINIMUM_BOOKING_AMOUNT}/g, `${symbol}${minBooking}`)
            .replace(/{VISITING_CHARGE}/g, `${symbol}${displayedVisitingChargeAmount}`)
            .replace("{MINIMUM_BOOKING_AMOUNT}", `${symbol}${minBooking}`)
            .replace("{VISITING_CHARGE}", `${symbol}${displayedVisitingChargeAmount}`);
        }
      }
    }
    setVisitingCharge(calculatedBaseVisitingCharge); setPolicyMessage(currentPolicyMessage);

    let runningTotalForPlatformFeeBase = 0; let runningTotalTaxOnPlatformFees = 0; const newCalculatedPlatformFees: AppliedPlatformFeeItem[] = [];
    if (calculatedBaseVisitingCharge === 0 && appConfig.platformFees && appConfig.platformFees.length > 0) {
      appConfig.platformFees.forEach(fee => {
        if (fee.isActive) {
          let feeBaseAmount = 0;
          if (fee.type === 'percentage') feeBaseAmount = (currentSumOfDisplayedPrices * fee.value) / 100; else feeBaseAmount = fee.value;
          const taxOnThisFee = feeBaseAmount * (fee.feeTaxRatePercent / 100);
          newCalculatedPlatformFees.push({ name: fee.name, type: fee.type, valueApplied: fee.value, calculatedFeeAmount: feeBaseAmount, taxRatePercentOnFee: fee.feeTaxRatePercent, taxAmountOnFee: taxOnThisFee });
          runningTotalForPlatformFeeBase += feeBaseAmount; runningTotalTaxOnPlatformFees += taxOnThisFee;
        }
      });
    }
    setCalculatedPlatformFees(newCalculatedPlatformFees); setTotalPlatformFeeBaseAmount(runningTotalForPlatformFeeBase); setTotalTaxOnPlatformFees(runningTotalTaxOnPlatformFees);

    const totalItemTaxAmount = newBreakdownItems.reduce((sum, item) => sum + item.taxAmount, 0);
    let visitingChargeTaxAmount = 0; let visitingChargeTaxPercentForBreakdown = 0;
    if (appConfig.enableTaxOnVisitingCharge && calculatedBaseVisitingCharge > 0 && (appConfig.visitingChargeTaxPercent || 0) > 0) {
      visitingChargeTaxAmount = calculatedBaseVisitingCharge * ((appConfig.visitingChargeTaxPercent || 0) / 100);
      visitingChargeTaxPercentForBreakdown = appConfig.visitingChargeTaxPercent || 0;
    }
    setVisitingChargeBreakdown(displayedVisitingChargeAmount > 0 ? { amount: displayedVisitingChargeAmount, baseAmount: calculatedBaseVisitingCharge, taxPercent: visitingChargeTaxPercentForBreakdown, taxAmount: visitingChargeTaxAmount, isTaxInclusive: appConfig.isVisitingChargeTaxInclusive || false } : null);
    const finalTotalTaxAmount = totalItemTaxAmount + visitingChargeTaxAmount + runningTotalTaxOnPlatformFees; setTaxAmount(finalTotalTaxAmount);

    let effectiveGlobalRate = 0;
    if (allItemsHaveSameTaxRate && firstItemTaxRate !== undefined) effectiveGlobalRate = firstItemTaxRate;
    if (calculatedBaseVisitingCharge > 0 && appConfig.enableTaxOnVisitingCharge && (appConfig.visitingChargeTaxPercent || 0) > 0) { if (!(allItemsHaveSameTaxRate && (appConfig.visitingChargeTaxPercent || 0) === firstItemTaxRate)) allItemsHaveSameTaxRate = false; }
    else if (calculatedBaseVisitingCharge > 0 && (!appConfig.enableTaxOnVisitingCharge || (appConfig.visitingChargeTaxPercent || 0) <= 0)) { if (allItemsHaveSameTaxRate && firstItemTaxRate !== 0) allItemsHaveSameTaxRate = false; }
    if (newCalculatedPlatformFees.some(pf => pf.taxRatePercentOnFee > 0)) allItemsHaveSameTaxRate = false;
    if (allItemsHaveSameTaxRate && effectiveGlobalRate > 0) setEffectiveTaxRateDisplay(`Tax (${effectiveGlobalRate.toFixed(1)}%)`);
    else if (finalTotalTaxAmount > 0) setEffectiveTaxRateDisplay("Total Tax"); else setEffectiveTaxRateDisplay("Tax (0%)");
    setTotalAmountDue(currentBaseSubtotalFromItems + calculatedBaseVisitingCharge - currentDiscountAmount + runningTotalForPlatformFeeBase + finalTotalTaxAmount);

    if (allFetchedPromoCodes.length === 0) { setAvailablePromoCodesToDisplay([]); setIsLoadingPromos(false); return; }
    const currentDate = new Date();
    const filtered = allFetchedPromoCodes.filter(promoData => {
      if (promoData.isHidden) return false;
      let isValid = true; 
      const validFromMillis = getTimestampMillis(promoData.validFrom);
      if (validFromMillis) { 
        const start = new Date(validFromMillis); 
        start.setHours(0,0,0,0); 
        if (currentDate < start) isValid = false; 
      }
      const validUntilMillis = getTimestampMillis(promoData.validUntil);
      if (isValid && validUntilMillis) { 
        const end = new Date(validUntilMillis); 
        end.setHours(23,59,59,999); 
        if (currentDate > end) isValid = false; 
      }
      if (isValid && promoData.minBookingAmount && currentSumOfDisplayedPrices < promoData.minBookingAmount) isValid = false;
      if (isValid && promoData.maxUses && promoData.usesCount >= promoData.maxUses) isValid = false;
      return isValid;
    });
    setAvailablePromoCodesToDisplay(filtered); setIsLoadingPromos(false);

    // Re-validate applied promo code
    if(appliedPromoCode) {
      const activePromoDetails = allFetchedPromoCodes.find(p => p.id === appliedPromoCode.id);
      if(!activePromoDetails || (activePromoDetails.minBookingAmount && sumOfDisplayedItemPrices < activePromoDetails.minBookingAmount)){
        handleRemovePromoCode(true); // silent removal
        toast({ title: "Promo Code Removed", description: "Your cart total no longer meets the minimum requirement for the applied promo code.", variant: "destructive" });
      }
    }


  }, [cartEntries, serviceDetailsMap, appConfig, isLoadingCartDetails, isLoadingAppSettings, appliedPromoCode, allFetchedPromoCodes, isCancellationFeeMode, toast, sumOfDisplayedItemPrices]);

  useEffect(() => {
    if (!isLoadingCartDetails && !isLoadingAppSettings) {
      if (isCancellationFeeMode) { setPaymentMethod("online"); return; } 
      if (onlinePaymentEnabled) setPaymentMethod("online"); 
      else if (payAfterServiceEnabled) setPaymentMethod("Pay After Service"); 
      else setPaymentMethod("");
    }
  }, [isLoadingCartDetails, isLoadingAppSettings, onlinePaymentEnabled, payAfterServiceEnabled, isCancellationFeeMode]);

  const handleApplyPromoCode = async () => {
    if (!promoCodeInput.trim()) { toast({ title: "Info", description: "Please enter a promo code.", variant: "default" }); return; }
    setIsApplyingPromo(true); setAppliedPromoCode(null); setDiscountAmount(0);
    try {
      const promoCodeRef = collection(db, "adminPromoCodes"); const q = query(promoCodeRef, where("code", "==", promoCodeInput.toUpperCase())); const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) { toast({ title: "Invalid Code", description: "This promo code does not exist.", variant: "destructive" }); setIsApplyingPromo(false); return; }
      const promoDoc = querySnapshot.docs[0]; const promoData = { id: promoDoc.id, ...promoDoc.data() } as FirestorePromoCode; const currentDate = new Date();
      if (!promoData.isActive) { toast({ title: "Inactive Code", description: "This promo code is currently not active.", variant: "destructive" }); setIsApplyingPromo(false); return; }
      const validFromMillis = getTimestampMillis(promoData.validFrom);
      if (validFromMillis) { 
        const start = new Date(validFromMillis); 
        start.setHours(0,0,0,0); 
        if (currentDate < start) { 
          toast({ title: "Not Yet Valid", description: "This promo code is not active yet.", variant: "destructive" }); 
          setIsApplyingPromo(false); 
          return; 
        } 
      }
      const validUntilMillis = getTimestampMillis(promoData.validUntil);
      if (validUntilMillis) { 
        const end = new Date(validUntilMillis); 
        end.setHours(23,59,59,999); 
        if (currentDate > end) { 
          toast({ title: "Expired Code", description: "This promo code has expired.", variant: "destructive" }); 
          setIsApplyingPromo(false); 
          return; 
        } 
      }
      if (promoData.minBookingAmount && sumOfDisplayedItemPrices < promoData.minBookingAmount) { toast({ title: "Minimum Amount Not Met", description: `Minimum booking amount of ${symbol}${promoData.minBookingAmount} required. Your items total is ${symbol}${sumOfDisplayedItemPrices.toFixed(decimals)}.`, variant: "destructive" }); setIsApplyingPromo(false); return; }
      if (promoData.maxUses && promoData.usesCount >= promoData.maxUses) { toast({ title: "Limit Reached", description: "This promo code has reached its usage limit.", variant: "destructive" }); setIsApplyingPromo(false); return; }
      if (promoData.maxUsesPerUser && promoData.maxUsesPerUser > 0 && currentUser?.uid) {
        const bookingsRef = collection(db, "bookings");
        const userUsageQuery = query(bookingsRef, where("userId", "==", currentUser.uid), where("discountCode", "==", promoData.code.toUpperCase()));
        const userUsageSnapshot = await getDocs(userUsageQuery);
        if (userUsageSnapshot.size >= promoData.maxUsesPerUser) {
          toast({ title: "Limit Reached", description: "You have already used this promo code the maximum allowed number of times.", variant: "destructive" });
          setIsApplyingPromo(false);
          return;
        }
      }
      let calculatedDiscount = 0; if (promoData.discountType === 'percentage') calculatedDiscount = (sumOfDisplayedItemPrices * promoData.discountValue) / 100; else calculatedDiscount = promoData.discountValue;
      calculatedDiscount = Math.min(calculatedDiscount, sumOfDisplayedItemPrices);
      const appliedInfo: AppliedPromoCodeInfo = { id: promoData.id, code: promoData.code, discountType: promoData.discountType, discountValue: promoData.discountValue, calculatedDiscount: calculatedDiscount };
      setAppliedPromoCode(appliedInfo); localStorage.setItem('yourbrandAppliedPromoCode', JSON.stringify(appliedInfo));
      toast({ title: "Promo Applied!", description: `Discount of ${symbol}${calculatedDiscount.toFixed(decimals)} applied.`, className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) { console.error("[PaymentPage] Error applying promo code:", error); toast({ title: "Error", description: "Could not apply promo code.", variant: "destructive" });
    } finally { setIsApplyingPromo(false); }
  };

  const handleRemovePromoCode = (silent = false) => { setAppliedPromoCode(null); setPromoCodeInput(""); localStorage.removeItem('yourbrandAppliedPromoCode'); if(!silent) toast({ title: "Promo Removed", description: "Discount has been removed." }); };
  const handleSelectAvailablePromo = (code: string) => setPromoCodeInput(code);

  const createPendingBooking = async () => {
    const newBookingId = generateBookingId();
    let customerEmail = "";
    let customerName = "Guest User", customerPhone = "N/A", addressLine1 = "N/A", addressLine2: string | undefined, city = "N/A", state = "N/A", pincode = "N/A";
    let latitude: number | undefined, longitude: number | undefined;
    let bookingDiscountCode: string | undefined, bookingDiscountAmount: number | undefined, appliedPromoCodeId: string | undefined;
    let storedAppliedPlatformFees: AppliedPlatformFeeItem[] = [];
    let currentCategoryId: string | null = null;
    let storedInterveningBreaks: any[] = [];
    let storedDailyTimeline: any[] = [];

    if (typeof window !== 'undefined') {
      const storedEmail = localStorage.getItem('yourbrandCustomerEmail');
      customerEmail = (storedEmail && storedEmail.trim()) ? storedEmail : (currentUser?.email || "");
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
      if (addressDataString) { 
        const addressData = JSON.parse(addressDataString); 
        customerName = addressData.fullName || currentUser?.displayName || customerName; 
        customerPhone = addressData.phone || (currentUser as any)?.phoneNumber || customerPhone; 
        customerEmail = addressData.email || currentUser?.email || customerEmail; 
        addressLine1 = addressData.addressLine1 || addressLine1; 
        addressLine2 = addressData.addressLine2 || undefined; 
        city = addressData.city || city; 
        state = addressData.state || state; 
        pincode = addressData.pincode || pincode; 
        latitude = addressData.latitude === null ? undefined : addressData.latitude; 
        longitude = addressData.longitude === null ? undefined : addressData.longitude; 
      } else if (currentUser) {
        customerName = currentUser.displayName || customerName;
        customerEmail = currentUser.email || customerEmail;
        customerPhone = (currentUser as any)?.phoneNumber || customerPhone;
      }
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

    const newBookingData = {
      bookingId: newBookingId,
      bookingNumber: 0,
      ...(currentUser?.uid && { userId: currentUser.uid }),
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
      ...(bookingDiscountCode !== undefined && { discountCode: bookingDiscountCode }),
      ...(bookingDiscountAmount !== undefined && { discountAmount: bookingDiscountAmount }),
      ...(calculatedPlatformFees.length > 0 && { appliedPlatformFees: calculatedPlatformFees }),
      paymentMethod: 'Online',
      status: 'Pending Payment',
      createdAt: Timestamp.now(),
      isReviewedByCustomer: false,
      workCategoryId: currentCategoryId || undefined,
    };

    const docRef = await addDoc(collection(db, "bookings"), newBookingData);
    return { docRef, newBookingId, customerName, customerEmail, customerPhone };
  };

  const loadRazorpayScript = () => new Promise((resolve) => { if (window.Razorpay) { resolve(true); return; } const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = () => resolve(true); script.onerror = () => resolve(false); document.body.appendChild(script); });

  const handleRazorpayCheckout = async () => {
    setIsProcessingPayment(true);
    showLoading();

    if (isWebView()) {
        const paymentDetails = {
            amount: Math.round(totalAmountDue * 100),
            currency: appConfig?.currencyCode || 'INR',
            description: isCancellationFeeMode && cancellationFeeDetails?.humanReadableBookingId ? `Cancellation Fee for Booking ${cancellationFeeDetails.humanReadableBookingId}` : "Service Booking Payment"
        };
        requestNativePayment(paymentDetails);
        setIsProcessingPayment(false);
        hideLoading();
        return;
    }

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) { 
      toast({ title: "Error", description: "Could not load Razorpay checkout. Please try again.", variant: "destructive" }); 
      setIsProcessingPayment(false); 
      hideLoading(); 
      return; 
    }

    try {
      const currencyCode = appConfig?.currencyCode || 'INR';
      const getCurrencySubunitDecimals = (currencyCode: string): number => {
        const c = currencyCode.toUpperCase();
        if (['JPY', 'KRW', 'CLP', 'VND', 'UGX'].includes(c)) return 0;
        if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 3;
        return 2;
      };
      const currencyDecimals = getCurrencySubunitDecimals(currencyCode);

      let pendingBookingDocId: string | null = null;
      let customerNameForPrefill = "Guest";
      let customerEmailForPrefill = "guest@example.com";
      let customerContactForPrefill: string | undefined = undefined;

      if (!isCancellationFeeMode) {
        const { docRef, customerName, customerEmail, customerPhone } = await createPendingBooking();
        pendingBookingDocId = docRef.id;
        customerNameForPrefill = customerName;
        customerEmailForPrefill = customerEmail;
        customerContactForPrefill = customerPhone !== 'N/A' ? customerPhone : undefined;
      } else {
        const customerAddressDataString = localStorage.getItem('yourbrandCustomerAddress');
        if (customerAddressDataString) { 
          try { 
            const addr = JSON.parse(customerAddressDataString); 
            customerNameForPrefill = addr.fullName || customerNameForPrefill; 
            customerEmailForPrefill = addr.email || customerEmailForPrefill; 
            customerContactForPrefill = addr.phone || undefined; 
          } catch (e) { 
            console.error("Error parsing address for Razorpay:", e); 
          } 
        } else if (auth.currentUser) { 
          customerNameForPrefill = auth.currentUser.displayName || customerNameForPrefill; 
          customerEmailForPrefill = auth.currentUser.email || customerEmailForPrefill; 
        }
      }

      const orderCreationResponse = await fetch('/api/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              amount: Math.round(totalAmountDue * Math.pow(10, currencyDecimals)),
              currency: currencyCode,
              notes: isCancellationFeeMode && cancellationFeeDetails ? {
                type: 'cancellation_fee',
                bookingId: cancellationFeeDetails.bookingId,
                amount: cancellationFeeDetails.feeAmount.toString()
              } : {
                type: 'booking',
                bookingId: pendingBookingDocId,
                amount: totalAmountDue.toString()
              }
          }),
      });

      if (!orderCreationResponse.ok) {
        if (pendingBookingDocId) {
          try { await deleteDoc(doc(db, 'bookings', pendingBookingDocId)); } catch (e) {}
        }
        const errorResult = await orderCreationResponse.json();
        throw new Error(errorResult.error || 'Failed to create Razorpay order.');
      }
      const orderDetails = await orderCreationResponse.json();

      const paymentDescription = isCancellationFeeMode && cancellationFeeDetails?.humanReadableBookingId ? `Cancellation Fee for Booking ${cancellationFeeDetails.humanReadableBookingId}` : "Service Booking Payment";

      const options = {
        key: appConfig.razorpayKeyId, 
        amount: orderDetails.amount, 
        currency: currencyCode, 
        name: globalSettings?.websiteName || "Yourbrand Services",
        description: paymentDescription, 
        order_id: orderDetails.id,
        handler: (response: any) => {
          localStorage.setItem('razorpayPaymentId', response.razorpay_payment_id);
          localStorage.setItem('razorpayOrderId', response.razorpay_order_id);
          localStorage.setItem('razorpaySignature', response.razorpay_signature);
          localStorage.setItem('yourbrandPaymentMethod', 'Online');
          localStorage.setItem('yourbrandFinalBookingTotal', totalAmountDue.toString());

          if (isCancellationFeeMode && cancellationFeeDetails) {
            localStorage.setItem('isProcessingCancellationFee', 'true');
            localStorage.setItem('bookingIdForCancellationFee', cancellationFeeDetails.bookingId);
            localStorage.setItem('cancellationFeeAmount', cancellationFeeDetails.feeAmount.toString());
            localStorage.removeItem('yourbrandBookingDiscountCode');
            localStorage.removeItem('yourbrandBookingDiscountAmount');
            localStorage.removeItem('yourbrandAppliedPromoCodeId');
            router.push('/checkout/thank-you');
          } else {
             localStorage.removeItem('isProcessingCancellationFee');
             if (appliedPromoCode) {
              localStorage.setItem('yourbrandBookingDiscountCode', appliedPromoCode.code);
              localStorage.setItem('yourbrandBookingDiscountAmount', appliedPromoCode.calculatedDiscount.toString());
              localStorage.setItem('yourbrandAppliedPromoCodeId', appliedPromoCode.id);
            }
            if (calculatedPlatformFees.length > 0) localStorage.setItem('yourbrandAppliedPlatformFees', JSON.stringify(calculatedPlatformFees)); else localStorage.removeItem('yourbrandAppliedPlatformFees');
            router.push(`/checkout/thank-you?payment_method=razorpay&bookingId=${pendingBookingDocId}`);
          }
        },
        prefill: { name: customerNameForPrefill, email: customerEmailForPrefill, contact: customerContactForPrefill },
        notes: { 
          address: isCancellationFeeMode ? "Cancellation Fee" : `${globalSettings?.websiteName || "Yourbrand"} Service Booking`, 
          ...(isCancellationFeeMode && cancellationFeeDetails && {booking_id_cancelled: cancellationFeeDetails.humanReadableBookingId || cancellationFeeDetails.bookingId}), 
          ...(!isCancellationFeeMode && pendingBookingDocId && {type: 'booking', bookingId: pendingBookingDocId}),
          ...(!isCancellationFeeMode && {cart_item_count: cartEntries.length.toString(), applied_promo_code: appliedPromoCode?.code || "N/A"}) 
        },
        theme: { color: "#45A0A2" },
        modal: { 
          ondismiss: async () => { 
            setIsProcessingPayment(false); 
            hideLoading(); 
            if (pendingBookingDocId) {
              try {
                const bRef = doc(db, 'bookings', pendingBookingDocId);
                const bSnap = await getDoc(bRef);
                if (bSnap.exists() && bSnap.data()?.status === 'Pending Payment') {
                  await deleteDoc(bRef);
                }
              } catch (e) {
                console.error("Error cleaning up dismissed booking:", e);
              }
            }
          }
        }
      };
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', async (response: any) => { 
        toast({ title: "Payment Failed", description: response.error.description || "An error occurred.", variant: "destructive" }); 
        setIsProcessingPayment(false); 
        hideLoading(); 
        if (pendingBookingDocId) {
          try {
            const bRef = doc(db, 'bookings', pendingBookingDocId);
            const bSnap = await getDoc(bRef);
            if (bSnap.exists() && bSnap.data()?.status === 'Pending Payment') {
              await deleteDoc(bRef);
            }
          } catch (e) {
            console.error("Error cleaning up failed booking:", e);
          }
        }
      });
      rzp.open();
    } catch (error) { 
      toast({ title: "Payment Error", description: (error as Error).message || "An unexpected error occurred.", variant: "destructive" }); 
      setIsProcessingPayment(false); 
      hideLoading(); 
    }
  };

  const handleStripeCheckout = async () => {
    setIsProcessingPayment(true);
    showLoading();

    try {
      const currencyCode = appConfig?.currencyCode || 'INR';
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      if (isCancellationFeeMode && cancellationFeeDetails) {
        localStorage.setItem('isProcessingCancellationFee', 'true');
        localStorage.setItem('bookingIdForCancellationFee', cancellationFeeDetails.bookingId);
        localStorage.setItem('cancellationFeeAmount', cancellationFeeDetails.feeAmount.toString());
        localStorage.setItem('yourbrandPaymentMethod', 'Online');

        const res = await fetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'cancellation_fee',
            bookingId: cancellationFeeDetails.bookingId,
            amount: cancellationFeeDetails.feeAmount,
            currency: currencyCode,
            successUrl: `${origin}/checkout/thank-you?payment_method=stripe&session_id={CHECKOUT_SESSION_ID}&reason=cancellation_fee&bookingId=${cancellationFeeDetails.bookingId}`,
            cancelUrl: `${origin}/checkout/payment?reason=cancellation_fee&booking_id=${cancellationFeeDetails.bookingId}`,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to initiate Stripe session.');
        }

        const data = await res.json();
        router.push(data.url);
        return;
      }

      const { docRef } = await createPendingBooking();

      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'booking',
          bookingId: docRef.id,
          amount: totalAmountDue,
          currency: currencyCode,
          successUrl: `${origin}/checkout/thank-you?payment_method=stripe&session_id={CHECKOUT_SESSION_ID}&bookingId=${docRef.id}`,
          cancelUrl: `${origin}/checkout/payment`,
        }),
      });

      if (!res.ok) {
        try { await deleteDoc(doc(db, 'bookings', docRef.id)); } catch (e) {}
        const err = await res.json();
        throw new Error(err.error || 'Failed to initiate Stripe checkout.');
      }

      const data = await res.json();

      localStorage.setItem('yourbrandPaymentMethod', 'Online');
      localStorage.setItem('yourbrandFinalBookingTotal', totalAmountDue.toString());
      if (appliedPromoCode) {
        localStorage.setItem('yourbrandBookingDiscountCode', appliedPromoCode.code);
        localStorage.setItem('yourbrandBookingDiscountAmount', appliedPromoCode.calculatedDiscount.toString());
        localStorage.setItem('yourbrandAppliedPromoCodeId', appliedPromoCode.id);
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

  const handlePaymentAction = async () => {
    if (!paymentMethod && !isCancellationFeeMode) { toast({ title: "Payment Method Required", description: "Please select a payment method.", variant: "destructive" }); return; }
    setIsProcessingPayment(true); showLoading();

    if (paymentMethod === 'Pay After Service' && !isCancellationFeeMode) {
        localStorage.setItem('yourbrandPaymentMethod', 'Pay After Service');
        localStorage.setItem('yourbrandFinalBookingTotal', totalAmountDue.toString());
        if (appliedPromoCode) {
            localStorage.setItem('yourbrandBookingDiscountCode', appliedPromoCode.code);
            localStorage.setItem('yourbrandBookingDiscountAmount', appliedPromoCode.calculatedDiscount.toString());
            localStorage.setItem('yourbrandAppliedPromoCodeId', appliedPromoCode.id);
        } else {
            localStorage.removeItem('yourbrandBookingDiscountCode');
            localStorage.removeItem('yourbrandBookingDiscountAmount');
            localStorage.removeItem('yourbrandAppliedPromoCodeId');
        }
        if (calculatedPlatformFees.length > 0) localStorage.setItem('yourbrandAppliedPlatformFees', JSON.stringify(calculatedPlatformFees)); else localStorage.removeItem('yourbrandAppliedPlatformFees');
        
        router.push('/checkout/thank-you'); 
        return; 
    }

    const razorpayEnabled = appConfig.enableRazorpay !== false && !!appConfig.razorpayKeyId;
    const stripeEnabled = appConfig.enableStripe === true && !!appConfig.stripePublishableKey;

    if (!onlinePaymentEnabled || (!razorpayEnabled && !stripeEnabled)) {
        const errorMsg = isCancellationFeeMode ? "Online Payment Required" : "Online Payments Disabled";
        toast({ title: errorMsg, description: "Online payments are currently not available or configured.", variant: "destructive" });
        setIsProcessingPayment(false); hideLoading(); return;
    }

    if (razorpayEnabled && stripeEnabled) {
        // If both are enabled, trigger gateway selection dialog
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
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    ...(isCancellationFeeMode ? [{ label: "My Bookings", href: "/my-bookings" }] : [
      { label: "Cart", href: "/cart" },
      { label: "Schedule", href: "/checkout/schedule" },
      { label: "Address", href: "/checkout/address" },
    ]),
    { label: isCancellationFeeMode ? "Pay Cancellation Fee" : "Payment Details" },
  ];

  if (!isMounted || isLoadingCartDetails || isLoadingAppSettings) {
     return (
      <div className="max-w-2xl mx-auto">
        <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
        {!isCancellationFeeMode && <CheckoutStepper currentStepId="checkout" />}
        <Card className="shadow-lg">
          <CardHeader><CardTitle className="text-2xl font-headline text-center">Complete Your Booking</CardTitle><CardDescription className="text-center">Loading payment details...</CardDescription></CardHeader>
          <CardContent className="space-y-6 flex justify-center items-center min-h-[300px]"><Loader2 className="h-12 w-12 animate-spin text-primary" /></CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-between gap-2 mt-4"><Button variant="outline" disabled className="w-full sm:w-auto"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button><Button size="lg" disabled className="w-full sm:w-auto"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...</Button></CardFooter>
        </Card>
      </div>
    );
  }

  const basePaymentOptions = [
    { value: 'online', label: 'Pay Online (UPI, Cards, Net Banking, Wallets)', icon: CreditCard, online: true, available: onlinePaymentEnabled },
    { value: 'Pay After Service', label: 'Pay After Service', icon: HandCoins, online: false, available: payAfterServiceEnabled && !isCancellationFeeMode },
  ];
  const currentAvailablePaymentOptions = basePaymentOptions.filter(option => option.available);

  return (
    <div className="max-w-2xl mx-auto">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      {!isCancellationFeeMode && <CheckoutStepper currentStepId="checkout" />}
      <Card className="shadow-lg">
        <CardHeader>
            <CardTitle className="text-2xl font-headline text-center">
                {isCancellationFeeMode ? "Pay Cancellation Fee" : "Complete Your Booking"}
            </CardTitle>
            <CardDescription className="text-center">
                {isCancellationFeeMode 
                    ? `Securely pay the cancellation fee for Booking ID: ${cancellationFeeDetails?.humanReadableBookingId || cancellationFeeDetails?.bookingId}.`
                    : "Choose payment method. All online transactions are secure."
                }
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {onlinePaymentEnabled && paymentMethod !== 'Pay After Service' && !isCancellationFeeMode && cartEntries.length > 0 && (
            <Alert className="bg-primary/10 border-primary/30"><Info className="h-5 w-5 text-primary" /><AlertTitle className="font-semibold text-primary">Online Payment via Razorpay</AlertTitle><AlertDescription className="text-primary/80">You will be redirected to Razorpay's secure gateway.</AlertDescription></Alert>
          )}
          {isCancellationFeeMode && (
            <Alert className="bg-destructive/10 border-destructive/30">
                <Ban className="h-5 w-5 text-destructive" />
                <AlertTitle className="font-semibold text-destructive">Cancellation Fee Payment</AlertTitle>
                <AlertDescription className="text-destructive/80">
                    You are paying a cancellation fee of {symbol}{cancellationFeeDetails?.feeAmount.toFixed(decimals)} for Booking ID: <strong>{cancellationFeeDetails?.humanReadableBookingId || cancellationFeeDetails?.bookingId}</strong>.
                </AlertDescription>
            </Alert>
          )}
          {(cartEntries.length > 0 || isCancellationFeeMode) && (
            <>
              {!isCancellationFeeMode && (<>
                <div className="space-y-2"><Label htmlFor="discountCode" className="text-md font-medium">Promo Code</Label>
                  <div className="flex space-x-2">
                    <Input id="discountCode" placeholder="Enter code" value={promoCodeInput} onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())} disabled={isProcessingPayment || isApplyingPromo || !!appliedPromoCode} className="h-10"/>
                    {!appliedPromoCode ? (<Button variant="outline" onClick={handleApplyPromoCode} disabled={isProcessingPayment || isApplyingPromo || !promoCodeInput.trim()} className="h-10">{isApplyingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}</Button>) : (<Button variant="ghost" onClick={() => handleRemovePromoCode()} disabled={isProcessingPayment || isApplyingPromo} className="h-10 text-destructive hover:text-destructive"><XCircle className="mr-1.5 h-4 w-4"/> Remove</Button>)}
                  </div>
                  {appliedPromoCode && (<p className="text-xs text-green-600 flex items-center mt-1.5"><CheckCircle className="h-3.5 w-3.5 mr-1" />Code "{appliedPromoCode.code}" applied! Discount: {symbol}{appliedPromoCode.calculatedDiscount.toFixed(decimals)}</p>)}
                </div>
                <div className="mt-3 pt-3 border-t"><Label className="text-sm font-medium block mb-2 flex items-center"><ListFilter className="h-4 w-4 mr-1.5 text-muted-foreground"/>Available Offers:</Label>
                  {isLoadingPromos ? (<div className="flex items-center text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /><span>Checking for offers...</span></div>) : availablePromoCodesToDisplay.length > 0 ? (<div className="flex flex-wrap gap-2">{availablePromoCodesToDisplay.map(promo => (<Badge key={promo.id} variant="outline" className="cursor-pointer hover:bg-accent/20" onClick={() => handleSelectAvailablePromo(promo.code)} title={`Min. booking: ${symbol}${promo.minBookingAmount || 0}. Uses: ${promo.usesCount}/${promo.maxUses || '∞'}`}>{promo.code} - {promo.discountType === 'percentage' ? `${promo.discountValue}% OFF` : `${symbol}${promo.discountValue} OFF`}</Badge>))}</div>) : (<p className="text-xs text-muted-foreground">{allFetchedPromoCodes.length > 0 ? "No offers currently applicable." : "No active promo codes."}</p>)}
                </div>
              </>)}
              {currentAvailablePaymentOptions.length > 0 ? (
                <div className="mt-4"><h3 className="text-lg font-semibold mb-3">Select Payment Method</h3>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-3">
                    {currentAvailablePaymentOptions.map(method => { const Icon = method.icon; return (<Label key={method.value} htmlFor={`payment-${method.value}`} className={`flex items-center space-x-3 border rounded-xl p-4 hover:bg-accent/50 cursor-pointer transition-all ${paymentMethod === method.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-input bg-background'} ${isProcessingPayment ? 'opacity-50 cursor-not-allowed' : ''}`} onClick={() => !isProcessingPayment && setPaymentMethod(method.value)}><RadioGroupItem value={method.value} id={`payment-${method.value}`} disabled={isProcessingPayment}/><Icon className="h-5 w-5 text-primary" /><span className="font-medium text-foreground">{method.label}</span></Label>);})}
                    </RadioGroup>
                </div>
              ) : (<Alert variant="destructive" className="mt-4"><AlertTitle>No Payment Methods Available</AlertTitle><AlertDescription>Contact support or try later. Admin may need to enable a payment option.</AlertDescription></Alert>)}
              
              <div className="border-t pt-4 space-y-2 mt-4">
                {!isCancellationFeeMode ? (
                    <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Items Total (Displayed Prices):</span><span>{symbol}{sumOfDisplayedItemPrices.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span></div>
                        {discountAmount > 0 && (<div className="flex justify-between text-green-600"><span>Discount ({appliedPromoCode?.code || 'Applied'}):</span><span>- {symbol}{discountAmount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span></div>)}
                        {visitingCharge > 0 && (<div className="flex justify-between text-primary"><span className="text-primary">Visiting Charge (Displayed):</span><span>+ {symbol}{(((categoryOverrides && typeof categoryOverrides.visitingChargeAmount === 'number') ? categoryOverrides.visitingChargeAmount : appConfig.visitingChargeAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span></div>)}
                        {calculatedPlatformFees.map((fee, index) => ( <div key={index} className="flex justify-between"><span className="text-muted-foreground flex items-center"><HandCoins className="mr-1 h-3.5 w-3.5 text-muted-foreground"/> {fee.name}{fee.taxRatePercentOnFee > 0 && <span className="text-xs ml-1">(incl. tax)</span>}</span><span>+ {symbol}{(fee.calculatedFeeAmount + fee.taxAmountOnFee).toFixed(decimals)}</span></div> ))}
                        <div className="flex justify-between items-center">
                            <div className="flex items-center text-muted-foreground">{effectiveTaxRateDisplay}
                            <Dialog open={isTaxBreakdownOpen} onOpenChange={setIsTaxBreakdownOpen}><DialogTrigger asChild><Button variant="ghost" size="icon" className="h-5 w-5 ml-1 p-0"><Info className="h-3.5 w-3.5 text-muted-foreground hover:text-primary"/></Button></DialogTrigger><DialogContent className="w-[90vw] sm:max-w-md max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Tax Breakdown</DialogTitle></DialogHeader><TaxBreakdownDisplay items={taxBreakdownItems} visitingCharge={visitingChargeBreakdown} platformFees={calculatedPlatformFees} subTotalBeforeDiscount={subTotal} totalDiscount={discountAmount} totalTax={taxAmount} grandTotal={totalAmountDue} defaultTaxRatePercent={appConfig.visitingChargeTaxPercent || 0} /><DialogClose asChild className="mt-2"><Button variant="outline" className="w-full">Close</Button></DialogClose></DialogContent></Dialog>
                            </div><span>+ {symbol}{taxAmount.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>
                        </div>
                    </>
                ) : (
                    cancellationFeeDetails && (
                        <div className="flex justify-between font-semibold text-md">
                            <span>Cancellation Fee:</span>
                            <span>{symbol}{cancellationFeeDetails.feeAmount.toFixed(decimals)}</span>
                        </div>
                    )
                )}
                 <div className="flex justify-between text-lg font-semibold pt-1 border-t mt-1"><span>Total Amount Due:</span><span className="text-primary">{symbol}{totalAmountDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                 {paymentMethod === 'Pay After Service' && payAfterServiceEnabled && !isCancellationFeeMode && (<p className="text-sm text-muted-foreground mt-1 text-right">You will be charged after service.</p>)}
              </div>
            </>
          )}
          {(cartEntries.length === 0 && !isLoadingCartDetails && !isLoadingAppSettings && !isCancellationFeeMode) && (<div className="text-center py-6"><p className="text-muted-foreground">Your cart is empty.</p><Link href="/cart" passHref className="mt-4 inline-block"><Button variant="outline">Return to Cart</Button></Link></div>)}
          {policyMessage && !isCancellationFeeMode && cartEntries.length > 0 && (<Alert variant="default" className="text-xs bg-primary/5 border-primary/20 mt-4"><Info className="h-4 w-4 text-primary" /><AlertDescription className="text-primary/90">{policyMessage}</AlertDescription></Alert>)}
        </CardContent>
        <CardFooter className="flex flex-col gap-4 mt-4">
          {!isCancellationFeeMode && cartEntries.length > 0 && (
            <p className="text-xs text-muted-foreground text-center sm:text-right w-full">
              By placing this order, you agree to our{" "}
              <button 
                type="button" 
                onClick={() => setShowPolicyModal(true)} 
                className="text-primary hover:underline font-semibold focus:outline-none"
              >
                Cancellation Policy
              </button>.
            </p>
          )}
          <div className="flex flex-col sm:flex-row justify-between gap-2 w-full">
            <Link href={isCancellationFeeMode ? "/my-bookings" : "/checkout/address"} passHref className="w-full sm:w-auto hidden md:block">
              <Button variant="outline" disabled={isProcessingPayment} className="w-full sm:w-auto">
                <ArrowLeft className="mr-2 h-4 w-4" /> {isCancellationFeeMode ? "Back to My Bookings" : "Back to Address"}
              </Button>
            </Link>
            <Button
              size="lg"
              onClick={handlePaymentAction}
              disabled={ (isCancellationFeeMode ? !cancellationFeeDetails : cartEntries.length === 0) || isLoadingCartDetails || isLoadingAppSettings || currentAvailablePaymentOptions.length === 0 || (!paymentMethod && !isCancellationFeeMode) || isProcessingPayment}
              className="w-full sm:w-auto text-white"
            >
              {isProcessingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" /> : null}
              {isProcessingPayment ? 'Processing...' : (isCancellationFeeMode ? 'Pay Cancellation Fee' : (paymentMethod === 'Pay After Service' ? 'Confirm Booking' : 'Confirm Booking & Pay'))}
              {!isProcessingPayment && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Dialog open={isGatewayDialogOpen} onOpenChange={setIsGatewayDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center">Choose Payment Gateway</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button 
              className="py-6 flex items-center justify-between text-left font-semibold text-md border-2 border-primary/20 hover:border-primary hover:bg-primary/5 rounded-xl h-auto w-full"
              variant="outline"
              onClick={async () => {
                setIsGatewayDialogOpen(false);
                await handleRazorpayCheckout();
              }}
            >
              <span className="flex flex-col">
                <span className="font-bold text-foreground">Cards, UPI, NetBanking</span>
                <span className="text-xs text-muted-foreground font-normal mt-0.5">Secure payment via Razorpay</span>
              </span>
              <ArrowRight className="h-5 w-5 text-primary ml-4 shrink-0" />
            </Button>

            <Button 
              className="py-6 flex items-center justify-between text-left font-semibold text-md border-2 border-primary/20 hover:border-primary hover:bg-primary/5 rounded-xl h-auto w-full"
              variant="outline"
              onClick={async () => {
                setIsGatewayDialogOpen(false);
                await handleStripeCheckout();
              }}
            >
              <span className="flex flex-col">
                <span className="font-bold text-foreground">Stripe Checkout</span>
                <span className="text-xs text-muted-foreground font-normal mt-0.5">International cards, Link & Google Pay</span>
              </span>
              <ArrowRight className="h-5 w-5 text-primary ml-4 shrink-0" />
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
                        before the scheduled service start time will receive a <strong>100% cancellation charge (No Refund / {symbol}{Number(0).toFixed(decimals)} Refund)</strong>.
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
    </div>
  );
}
