// src/lib/bookingPricingServer.ts
import { adminDb } from '@/lib/firebaseAdmin';
import { calculateIncrementalTotalPriceForItem, getBasePriceForInvoice } from './bookingUtils';
import type { FirestoreService, FirestorePromoCode, AppliedPlatformFeeItem } from '@/types/firestore';

export interface CartInputItem {
  serviceId: string;
  quantity: number;
}

export interface CalculateServerBookingOptions {
  cartEntries: CartInputItem[];
  promoCode?: string;
  categoryId?: string;
}

export interface ServerBookingCalculationResult {
  services: any[];
  subTotal: number;
  visitingCharge: number;
  taxAmount: number;
  platformFeeTotal: number;
  appliedPlatformFees: AppliedPlatformFeeItem[];
  discountAmount: number;
  discountCode?: string;
  totalAmount: number;
  currency: string;
}

/**
 * Authoritative Server-Side Pricing Engine
 * Recalculates service prices, taxes, visiting charges, platform fees, and validated promo discounts.
 * Eliminates client price tampering.
 */
export async function calculateServerBookingTotal(
  options: CalculateServerBookingOptions
): Promise<ServerBookingCalculationResult> {
  const { cartEntries, promoCode, categoryId } = options;

  if (!Array.isArray(cartEntries) || cartEntries.length === 0) {
    throw new Error('Cart is empty.');
  }

  // 1. Fetch App Configuration
  const appConfigSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
  const appConfig = appConfigSnap.exists ? (appConfigSnap.data() as any) : {};
  const currency = appConfig.currencyCode || 'INR';

  // 2. Fetch and resolve each service from database
  let baseSubTotal = 0;
  let totalItemTax = 0;
  let sumOfDisplayedItemPrices = 0;
  const resolvedServices: any[] = [];

  for (const entry of cartEntries) {
    if (!entry.serviceId || !entry.quantity || entry.quantity < 1) continue;

    const serviceDoc = await adminDb.collection('adminServices').doc(entry.serviceId).get();
    if (!serviceDoc.exists) {
      throw new Error(`Service "${entry.serviceId}" does not exist in catalog.`);
    }

    const serviceData = serviceDoc.data() as FirestoreService;
    const qty = Math.max(1, Math.floor(entry.quantity));
    const displayedPrice = calculateIncrementalTotalPriceForItem(serviceData, qty);
    sumOfDisplayedItemPrices += displayedPrice;

    const taxRate = (serviceData.taxPercent || 0) > 0 ? serviceData.taxPercent || 0 : 0;
    const isTaxInclusive = serviceData.isTaxInclusive === true;
    const basePrice = getBasePriceForInvoice(displayedPrice, isTaxInclusive, taxRate);
    const taxAmount = basePrice * (taxRate / 100);

    baseSubTotal += basePrice;
    totalItemTax += taxAmount;

    resolvedServices.push({
      serviceId: entry.serviceId,
      name: serviceData.name,
      quantity: qty,
      pricePerUnit: displayedPrice / qty,
      discountedPricePerUnit: serviceData.discountedPrice || null,
      isTaxInclusive,
      taxPercentApplied: taxRate,
      taxAmountForItem: taxAmount,
      _basePriceForBooking: basePrice / qty,
      imageUrl: serviceData.imageUrl || null,
    });
  }

  if (resolvedServices.length === 0) {
    throw new Error('No valid services found in cart.');
  }

  // 3. Category Overrides (visiting charge & minimum booking amount)
  let customVisitingCharge: number | undefined;
  let customMinBooking: number | undefined;

  if (categoryId) {
    try {
      const catDoc = await adminDb.collection('adminCategories').doc(categoryId).get();
      if (catDoc.exists) {
        const catData = catDoc.data();
        if (typeof catData?.visitingChargeAmount === 'number') {
          customVisitingCharge = catData.visitingChargeAmount;
        }
        if (typeof catData?.minimumBookingAmount === 'number') {
          customMinBooking = catData.minimumBookingAmount;
        }
      }
    } catch (e) {
      console.warn('Error fetching category overrides:', e);
    }
  }

  const vcAmount = typeof customVisitingCharge === 'number' ? customVisitingCharge : (appConfig.visitingChargeAmount || 0);
  const minBooking = typeof customMinBooking === 'number' ? customMinBooking : (appConfig.minimumBookingAmount || 0);

  // 4. Visiting Charge Calculation
  let baseVisitingCharge = 0;
  let visitingChargeTax = 0;

  if (appConfig.enableMinimumBookingPolicy && minBooking > 0 && vcAmount > 0) {
    if (sumOfDisplayedItemPrices < minBooking) {
      const isVcTaxInclusive = !!appConfig.isVisitingChargeTaxInclusive;
      const vcTaxPercent = appConfig.visitingChargeTaxPercent || 0;
      baseVisitingCharge = getBasePriceForInvoice(vcAmount, isVcTaxInclusive, vcTaxPercent);
      if (appConfig.enableTaxOnVisitingCharge && vcTaxPercent > 0) {
        visitingChargeTax = baseVisitingCharge * (vcTaxPercent / 100);
      }
    }
  }

  // 5. Platform Fees Calculation
  const appliedPlatformFees: AppliedPlatformFeeItem[] = [];
  let totalBasePlatformFees = 0;
  let totalTaxOnPlatformFees = 0;

  const rawPlatformFees = appConfig.platformFees;
  const platformFeesList: any[] = Array.isArray(rawPlatformFees)
    ? rawPlatformFees
    : (rawPlatformFees && typeof rawPlatformFees === 'object' ? Object.values(rawPlatformFees) : []);

  const isPlatformFeeGloballyEnabled = appConfig.enablePlatformFee !== false;

  // Platform fees apply when enabled and visiting charge is not applied (matching client rules across checkout & admin)
  if (isPlatformFeeGloballyEnabled && baseVisitingCharge === 0 && platformFeesList.length > 0) {
    for (const fee of platformFeesList) {
      if (!fee || fee.isActive === false || fee.isActive === 'false') continue;

      let feeAmount = 0;
      if (fee.type === 'percentage') {
        feeAmount = (sumOfDisplayedItemPrices * (Number(fee.value) || 0)) / 100;
      } else {
        feeAmount = Number(fee.value) || 0;
      }

      const taxRate = typeof fee.feeTaxRatePercent === 'number'
        ? fee.feeTaxRatePercent
        : (typeof fee.taxRate === 'number' ? fee.taxRate : 0);
      const taxAmount = (feeAmount * taxRate) / 100;

      appliedPlatformFees.push({
        name: fee.name || 'Platform Fee',
        type: fee.type || 'fixed',
        valueApplied: Number(fee.value) || 0,
        calculatedFeeAmount: Number(feeAmount.toFixed(2)),
        taxRatePercentOnFee: taxRate,
        taxAmountOnFee: Number(taxAmount.toFixed(2)),
        amount: Number((feeAmount + taxAmount).toFixed(2)),
      });

      totalBasePlatformFees += feeAmount;
      totalTaxOnPlatformFees += taxAmount;
    }
  }

  // 6. Server-Side Promo Code Validation
  let calculatedDiscount = 0;
  let appliedPromoCodeStr: string | undefined;

  if (promoCode && promoCode.trim()) {
    const cleanCode = promoCode.trim().toUpperCase();
    try {
      const promoQuery = await adminDb.collection('adminPromoCodes').where('code', '==', cleanCode).limit(1).get();
      if (!promoQuery.empty) {
        const promoDoc = promoQuery.docs[0];
        const promoData = promoDoc.data() as FirestorePromoCode;

        const isPromoActive = promoData.isActive !== false;
        let isNotExpired = true;

        const validUntil = promoData.validUntil || promoData.endDate;
        if (validUntil) {
          const expiryMillis = (validUntil as any).toDate 
            ? (validUntil as any).toDate().getTime() 
            : ((validUntil as any).seconds ? (validUntil as any).seconds * 1000 : new Date(validUntil as any).getTime());
          if (!isNaN(expiryMillis) && expiryMillis < Date.now()) {
            isNotExpired = false;
          }
        }

        const minAmount = promoData.minBookingAmount || (promoData as any).minOrderAmount || 0;
        const meetsMinimumOrder = !minAmount || sumOfDisplayedItemPrices >= minAmount;

        if (isPromoActive && isNotExpired && meetsMinimumOrder) {
          if (promoData.discountType === 'percentage') {
            calculatedDiscount = (sumOfDisplayedItemPrices * (promoData.discountValue || 0)) / 100;
          } else {
            calculatedDiscount = promoData.discountValue || 0;
          }

          calculatedDiscount = Math.min(calculatedDiscount, sumOfDisplayedItemPrices);
          appliedPromoCodeStr = cleanCode;
        }
      }
    } catch (e) {
      console.warn('Error validating promo code on server:', e);
    }
  }

  // 7. Final Authoritative Total
  const totalTax = totalItemTax + visitingChargeTax + totalTaxOnPlatformFees;
  const platformFeeTotal = totalBasePlatformFees + totalTaxOnPlatformFees;
  const totalAmount = Math.max(0, baseSubTotal + baseVisitingCharge + totalBasePlatformFees + totalTax - calculatedDiscount);

  return {
    services: resolvedServices,
    subTotal: Number(baseSubTotal.toFixed(2)),
    visitingCharge: Number(baseVisitingCharge.toFixed(2)),
    taxAmount: Number(totalTax.toFixed(2)),
    platformFeeTotal: Number(platformFeeTotal.toFixed(2)),
    appliedPlatformFees,
    discountAmount: Number(calculatedDiscount.toFixed(2)),
    discountCode: appliedPromoCodeStr,
    totalAmount: Number(totalAmount.toFixed(2)),
    currency,
  };
}
