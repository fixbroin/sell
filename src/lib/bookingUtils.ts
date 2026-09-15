
import type { FirestoreService } from "@/types/firestore";

export const generateBookingId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'FB-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(chars.length * Math.random()));
  }
  return result;
};

export const getBasePriceForInvoice = (displayedPrice: number, isTaxInclusive: boolean, taxPercent: number): number => {
    if (!isTaxInclusive || taxPercent <= 0) return displayedPrice;
    return (displayedPrice * 100) / (100 + taxPercent);
};

export const getPriceForNthUnit = (service: FirestoreService, n: number): number => {
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

export const calculateIncrementalTotalPriceForItem = (service: FirestoreService, quantity: number): number => {
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
