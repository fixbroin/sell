

"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import AppImage from '@/components/ui/AppImage';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import QuantitySelector from '@/components/shared/QuantitySelector';
import { Trash2, ShoppingCart, ArrowRight, Home, Loader2,Percent, Info } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { FirestoreService, UserCart, PriceVariant } from '@/types/firestore';
import { getCartEntries, saveCartEntries, syncCartToFirestore, saveActiveCheckoutEntries, type CartEntry } from '@/lib/cartManager';
import { db } from '@/lib/firebase'; 
import { doc, getDoc, onSnapshot } from '@/lib/mysqlDb';
import { useToast } from '@/hooks/use-toast';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter, usePathname } from 'next/navigation';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import TaxBreakdownDisplay from '@/components/shared/TaxBreakdownDisplay';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { formatCurrency } from '@/lib/utils'; 
import { useAuth as useAuthHook } from '@/hooks/useAuth'; 
import { getGuestId } from '@/lib/guestIdManager'; 
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { Badge } from '@/components/ui/badge';
export interface CartItem extends FirestoreService {
  quantity: number;
  categoryId?: string;
  categoryName?: string;
  visitingChargeAmount?: number;
  minimumBookingAmount?: number;
  minimumBookingPolicyDescription?: string;
}

// Helper to derive base price
const getBasePrice = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
  if (isTaxInclusive && taxPercent && taxPercent > 0) {
    return displayedPrice / (1 + taxPercent / 100);
  }
  return displayedPrice;
};

// --- START: CORRECTED TIERED PRICING LOGIC ---
const getPriceForNthUnit = (service: CartItem, n: number): number => {
  if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0 || n <= 0) {
    return service.discountedPrice ?? service.price;
  }

  const sortedVariants = [...service.priceVariants].sort((a, b) => a.fromQuantity - b.fromQuantity);

  const applicableTier = sortedVariants.find(tier => {
    const start = tier.fromQuantity;
    const end = tier.toQuantity ?? Infinity;
    return n >= start && n <= end;
  });

  if (applicableTier) {
    return applicableTier.price;
  }
  
  const lastApplicableTier = sortedVariants.slice().reverse().find(tier => n >= tier.fromQuantity);
  if (lastApplicableTier) {
    return lastApplicableTier.price;
  }
  
  return service.discountedPrice ?? service.price;
};

const calculateIncrementalTotalPrice = (item: CartItem): number => {
    if (!item.hasPriceVariants || !item.priceVariants || item.priceVariants.length === 0) {
        const unitPrice = item.discountedPrice ?? item.price;
        return unitPrice * item.quantity;
    }
    
    let total = 0;
    for (let i = 1; i <= item.quantity; i++) {
        total += getPriceForNthUnit(item, i);
    }
    return total;
};

const getPriceDisplayInfo = (service: CartItem, quantity: number, symbol: string = '₹', decimals: number = 2, code: string = 'INR') => {
    if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0) {
        const unitSaving = service.discountedPrice && service.discountedPrice < service.price ? service.price - service.discountedPrice : 0;
        const totalSaving = unitSaving * (quantity > 0 ? quantity : 1);
        return {
            mainPrice: formatCurrency(service.discountedPrice ?? service.price, symbol, decimals, code),
            priceSuffix: unitSaving > 0 ? formatCurrency(service.price, symbol, decimals, code) : null,
            promoText: unitSaving > 0 ? `Save ${formatCurrency(totalSaving, symbol, 0, code)}!` : null,
        };
    }

    const sortedVariants = [...service.priceVariants].sort((a, b) => a.fromQuantity - b.fromQuantity);
    const nextQuantity = quantity + 1;
    let promoText = null;

    const currentPriceForNext = getPriceForNthUnit(service, nextQuantity);
    const nextCheaperTier = sortedVariants.find(v => v.fromQuantity >= nextQuantity && v.price < currentPriceForNext);
    
    if (nextCheaperTier) {
        const needed = nextCheaperTier.fromQuantity - quantity;
        promoText = `Add ${needed} more to unlock ${formatCurrency(nextCheaperTier.price, symbol, decimals, code)} price!`;
    } else {
        const finalTier = sortedVariants[sortedVariants.length - 1];
        if (quantity >= finalTier.fromQuantity) {
            promoText = `Price continues at ${formatCurrency(finalTier.price, symbol, decimals, code)} each.`;
        }
    }
    
    const displayPrice = getPriceForNthUnit(service, nextQuantity);
    
    return {
        mainPrice: formatCurrency(displayPrice, symbol, decimals, code),
        priceSuffix: quantity > 0 ? 'per next unit' : 'onwards',
        promoText,
    };
};
// --- END: CORRECTED TIERED PRICING LOGIC ---


function CartPageContent() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isLoadingCart, setIsLoadingCart] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [isCheckingOutCategory, setIsCheckingOutCategory] = useState<string | null>(null);
  const [openTaxBreakdownCategoryId, setOpenTaxBreakdownCategoryId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuthHook(); 
  const currentPathname = usePathname();

  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const { showLoading } = useLoading();
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadCartItems = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) setIsLoadingCart(true);
    const entries = getCartEntries();
    if (entries.length === 0) {
      setCartItems([]);
      setIsLoadingCart(false);
      if (user?.uid) await syncCartToFirestore(user.uid, []);
      return;
    }

    // Optimization: Cache category lookups to avoid redundant reads
    const subCatCache: Record<string, any> = {};
    const catCache: Record<string, any> = {};

    try {
      const loadedCartItemsPromises = entries.map(async (entry) => {
        const serviceDocRef = doc(db, "adminServices", entry.serviceId);
        const serviceSnap = await getDoc(serviceDocRef);
        if (serviceSnap.exists()) {
          const serviceData = serviceSnap.data() as FirestoreService;
          const price = typeof serviceData.price === 'number' ? serviceData.price : 0;
          const discountedPrice = typeof serviceData.discountedPrice === 'number' ? serviceData.discountedPrice : undefined;
          
          let categoryId = serviceData.parentCategoryId || 'unknown';
          let categoryName = 'Other Services';

          // 1. Resolve Category ID (from sub-category)
          if (!serviceData.parentCategoryId && serviceData.subCategoryId) {
              if (subCatCache[serviceData.subCategoryId]) {
                  categoryId = subCatCache[serviceData.subCategoryId].parentId;
              } else {
                  const subCatRef = doc(db, 'adminSubCategories', serviceData.subCategoryId);
                  const subCatSnap = await getDoc(subCatRef);
                  if (subCatSnap.exists()) {
                      const sd = subCatSnap.data();
                      subCatCache[serviceData.subCategoryId] = sd;
                      categoryId = sd.parentId;
                  }
              }
          }

          // 2. Resolve Category Name
          if (categoryId !== 'unknown') {
              if (catCache[categoryId]) {
                  categoryName = catCache[categoryId].name;
              } else {
                  const catRef = doc(db, 'adminCategories', categoryId);
                  const catSnap = await getDoc(catRef);
                  if (catSnap.exists()) {
                      const cd = catSnap.data();
                      catCache[categoryId] = cd;
                      categoryName = cd.name;
                  }
              }
          }

          return {
            ...serviceData,
            id: serviceSnap.id,
            quantity: entry.quantity,
            categoryId,
            categoryName,
            price,
            isTaxInclusive: serviceData.isTaxInclusive === true,
            discountedPrice,
            taxPercent: serviceData.taxPercent,
            hasPriceVariants: serviceData.hasPriceVariants === true,
            priceVariants: serviceData.priceVariants || [],
            hasMinQuantity: serviceData.hasMinQuantity === true,
            minQuantity: serviceData.minQuantity ?? 0,
            visitingChargeAmount: categoryId !== 'unknown' ? catCache[categoryId]?.visitingChargeAmount : undefined,
            minimumBookingAmount: categoryId !== 'unknown' ? catCache[categoryId]?.minimumBookingAmount : undefined,
            minimumBookingPolicyDescription: categoryId !== 'unknown' ? catCache[categoryId]?.minimumBookingPolicyDescription : undefined,
          } as CartItem;
        }
        console.warn(`Service with ID ${entry.serviceId} not found. Removing from cart.`);
        return null;
      });

      const resolvedItems = await Promise.all(loadedCartItemsPromises);
      const validItems = resolvedItems.filter((item): item is CartItem => item !== null);

      setCartItems(validItems);

      if (validItems.length !== entries.length) {
        const validEntries = validItems.map(item => ({ serviceId: item.id, quantity: item.quantity }));
        saveCartEntries(validEntries);
        if (user?.uid) await syncCartToFirestore(user.uid, validEntries);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new StorageEvent('storage', { key: 'yourbrandUserCart' }));
        }
      }

    } catch (error) {
      console.error("Error loading cart items from Firestore:", error);
      toast({
        title: "Error",
        description: "Could not load cart details. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingCart(false);
    }
  }, [toast, user?.uid]);

  useEffect(() => {
    if (!isMounted) return;
    
    loadCartItems(true);
    
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'yourbrandUserCart') {
        loadCartItems();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
        window.removeEventListener('storage', handleStorageChange);
    };

  }, [isMounted, toast, user, loadCartItems]);

  const updateStoredCart = (updatedCartItems: CartItem[]) => {
    const entriesToSave: CartEntry[] = updatedCartItems.map(item => ({
      serviceId: item.id,
      quantity: item.quantity,
    }));
    saveCartEntries(entriesToSave);
    if (user?.uid) {
        syncCartToFirestore(user.uid, entriesToSave);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key: 'yourbrandUserCart' }));
    }
  };

  const handleQuantityChange = (itemId: string, newQuantity: number) => {
    const itemBeingChanged = cartItems.find(item => item.id === itemId);
    if (!itemBeingChanged) return;

    const oldQuantity = itemBeingChanged.quantity;

    const updatedItems = cartItems.map(item =>
        item.id === itemId ? { ...item, quantity: newQuantity } : item
      ).filter(item => item.quantity > 0);

    setCartItems(updatedItems);
    updateStoredCart(updatedItems);
    
    const quantityChange = Math.abs(newQuantity - oldQuantity);

    if (newQuantity === 0) {
      toast({ title: "Item Removed", description: `${itemBeingChanged.name} removed from cart.` });
      logUserActivity(
        'removeFromCart',
        { serviceId: itemBeingChanged.id, serviceName: itemBeingChanged.name, quantity: quantityChange },
        user?.uid,
        !user ? getGuestId() : null,
        user?.displayName
      );
    } else if (newQuantity > oldQuantity) {
      toast({ title: "Cart Updated", description: `${itemBeingChanged.name} quantity updated to ${newQuantity}.` });
       logUserActivity(
        'addToCart',
        { serviceId: itemBeingChanged.id, serviceName: itemBeingChanged.name, quantity: quantityChange, price: itemBeingChanged.price },
        user?.uid,
        !user ? getGuestId() : null,
        user?.displayName
      );
    } else {
       logUserActivity(
        'removeFromCart',
        { serviceId: itemBeingChanged.id, serviceName: itemBeingChanged.name, quantity: quantityChange },
        user?.uid,
        !user ? getGuestId() : null,
        user?.displayName
      );
    }
  };

  const handleRemoveItem = (itemId: string) => {
    const itemToRemove = cartItems.find(item => item.id === itemId);
    if (!itemToRemove) return;

    const updatedItems = cartItems.filter(item => item.id !== itemId);
    setCartItems(updatedItems);
    updateStoredCart(updatedItems);
    toast({ title: "Item Removed", description: `${itemToRemove.name} removed from your cart.` });
    logUserActivity(
        'removeFromCart',
        { serviceId: itemToRemove.id, serviceName: itemToRemove.name, quantity: itemToRemove.quantity },
        user?.uid,
        !user ? getGuestId() : null,
        user?.displayName
      );
  };

  const groupedCart = useMemo(() => {
    const groups: Record<string, { 
        categoryId: string, 
        categoryName: string, 
        items: CartItem[], 
        itemsTotal: number,
        subTotal: number,
        estimatedTax: number,
        visitingCharge: number,
        total: number,
        policyMessage: string | null,
        taxBreakdownItems: any[],
        visitingChargeBreakdown: any | null,
        effectiveTaxRateDisplay: string
    }> = {};

    cartItems.forEach(item => {
       const catId = item.categoryId || 'unknown';
       if (!groups[catId]) {
           groups[catId] = { 
               categoryId: catId, 
               categoryName: item.categoryName || 'Other', 
               items: [], 
               itemsTotal: 0,
               subTotal: 0,
               estimatedTax: 0,
               visitingCharge: 0,
               total: 0,
               policyMessage: null,
               taxBreakdownItems: [],
               visitingChargeBreakdown: null,
               effectiveTaxRateDisplay: "Est. Tax"
           };
       }
       
       const group = groups[catId];
       group.items.push(item);
       
       const displayedPriceForQuantity = calculateIncrementalTotalPrice(item);
       group.itemsTotal += displayedPriceForQuantity;

       const itemTaxRatePercent = (item.taxPercent !== undefined && item.taxPercent > 0) ? item.taxPercent : 0;
       const basePriceForQuantity = getBasePrice(displayedPriceForQuantity, item.isTaxInclusive, itemTaxRatePercent);
       group.subTotal += basePriceForQuantity;

       const itemTaxAmount = basePriceForQuantity * (itemTaxRatePercent / 100);
       group.estimatedTax += itemTaxAmount;

       group.taxBreakdownItems.push({
           name: item.name,
           quantity: item.quantity,
           pricePerUnit: displayedPriceForQuantity / item.quantity,
           itemSubtotal: basePriceForQuantity,
           taxPercent: itemTaxRatePercent,
           taxAmount: itemTaxAmount,
           isTaxInclusive: item.isTaxInclusive,
           isDefaultRate: false,
       });
    });

    // Finalize each group's calculations (visiting charges, total tax, etc.)
    Object.values(groups).forEach(group => {
        let calculatedBaseVisitingCharge = 0;
        let displayedVisitingChargeAmount = 0;
        let currentPolicyMessage: string | null = null;

        const firstItem = group.items[0];
        const vcAmount = (firstItem && typeof firstItem.visitingChargeAmount === 'number') ? firstItem.visitingChargeAmount : appConfig.visitingChargeAmount;
        const minBooking = (firstItem && typeof firstItem.minimumBookingAmount === 'number') ? firstItem.minimumBookingAmount : appConfig.minimumBookingAmount;
        const policyDesc = (firstItem && firstItem.minimumBookingPolicyDescription) ? firstItem.minimumBookingPolicyDescription : appConfig.minimumBookingPolicyDescription;

        if (appConfig.enableMinimumBookingPolicy && typeof minBooking === 'number' && typeof vcAmount === 'number') {
            if (group.itemsTotal > 0 && group.itemsTotal < minBooking) {
                displayedVisitingChargeAmount = vcAmount;
                calculatedBaseVisitingCharge = getBasePrice(displayedVisitingChargeAmount, appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent);
                if (policyDesc) {
                    const symbol = appConfig.currencySymbol || "₹";
                    const escapedSymbol = (symbol || "₹").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const patternVc = new RegExp(`(?:₹|\\$|${escapedSymbol})?{VISITING_CHARGE}`, 'g');
                    const patternMin = new RegExp(`(?:₹|\\$|${escapedSymbol})?{MINIMUM_BOOKING_AMOUNT}`, 'g');
                    const normalizedPolicy = policyDesc
                        .replace(patternMin, "{MINIMUM_BOOKING_AMOUNT}")
                        .replace(patternVc, "{VISITING_CHARGE}");
                    currentPolicyMessage = normalizedPolicy
                        .replace(/{MINIMUM_BOOKING_AMOUNT}/g, `${symbol}${minBooking}`)
                        .replace(/{VISITING_CHARGE}/g, `${symbol}${vcAmount}`)
                        .replace("{MINIMUM_BOOKING_AMOUNT}", `${symbol}${minBooking}`)
                        .replace("{VISITING_CHARGE}", `${symbol}${vcAmount}`);
                }
            }
        }
        group.visitingCharge = calculatedBaseVisitingCharge;
        group.policyMessage = currentPolicyMessage;

        let visitingChargeTaxAmount = 0;
        let visitingChargeTaxPercentForBreakdown = 0;
        if (appConfig.enableTaxOnVisitingCharge && calculatedBaseVisitingCharge > 0 && appConfig.visitingChargeTaxPercent > 0) {
            visitingChargeTaxAmount = calculatedBaseVisitingCharge * (appConfig.visitingChargeTaxPercent / 100);
            group.estimatedTax += visitingChargeTaxAmount;
            visitingChargeTaxPercentForBreakdown = appConfig.visitingChargeTaxPercent;
        }

        group.visitingChargeBreakdown = displayedVisitingChargeAmount > 0 ? {
            amount: displayedVisitingChargeAmount,
            baseAmount: calculatedBaseVisitingCharge,
            taxPercent: visitingChargeTaxPercentForBreakdown,
            taxAmount: visitingChargeTaxAmount,
            isTaxInclusive: appConfig.isVisitingChargeTaxInclusive || false,
        } : null;

        // Effective Tax Rate Display Logic
        let allItemsHaveSameTax = true;
        let firstTaxRate: number | undefined = group.taxBreakdownItems[0]?.taxPercent;
        group.taxBreakdownItems.forEach(t => { if(t.taxPercent !== firstTaxRate) allItemsHaveSameTax = false; });

        if (calculatedBaseVisitingCharge > 0 && appConfig.enableTaxOnVisitingCharge && appConfig.visitingChargeTaxPercent > 0) {
            if (!(allItemsHaveSameTax && appConfig.visitingChargeTaxPercent === firstTaxRate)) {
                allItemsHaveSameTax = false;
            }
        } else if (calculatedBaseVisitingCharge > 0 && (!appConfig.enableTaxOnVisitingCharge || (appConfig.visitingChargeTaxPercent || 0) <= 0)) {
            if (allItemsHaveSameTax && firstTaxRate !== 0) {
                allItemsHaveSameTax = false;
            }
        }

        if (allItemsHaveSameTax && firstTaxRate !== undefined && firstTaxRate > 0) {
            group.effectiveTaxRateDisplay = `Tax (${firstTaxRate.toFixed(1)}%)`;
        } else if (group.estimatedTax > 0) {
            group.effectiveTaxRateDisplay = "Total Tax";
        } else {
            group.effectiveTaxRateDisplay = "Tax (0%)";
        }

        group.total = group.subTotal + group.visitingCharge + group.estimatedTax;
    });

    return Object.values(groups);
  }, [cartItems, appConfig]);

  const handleProceedToSchedule = (categoryId: string, categoryName: string, items: CartItem[]) => {
    showLoading();
    setIsCheckingOutCategory(categoryId);
    localStorage.setItem('yourbrandActiveCheckoutCategory', categoryId);
    localStorage.setItem('yourbrandActiveCheckoutCategoryName', categoryName);
    
    // Save only these items for the checkout flow
    saveActiveCheckoutEntries(items.map(i => ({ serviceId: i.id, quantity: i.quantity })));
    
    // Clear any previous checkout-specific data
    localStorage.removeItem('yourbrandScheduledDate');
    localStorage.removeItem('yourbrandScheduledTimeSlot');
    localStorage.removeItem('yourbrandEstimatedEndTime');
    localStorage.removeItem('yourbrandCustomerAddress');
    localStorage.removeItem('yourbrandAppliedPromoCode');
    localStorage.removeItem('yourbrandBookingDiscountCode');
    localStorage.removeItem('yourbrandBookingDiscountAmount');
    localStorage.removeItem('yourbrandAppliedPromoCodeId');

    logUserActivity(
        'checkoutStep',
        { checkoutStepName: 'cart_proceed_to_schedule', pageUrl: currentPathname, categoryId, categoryName },
        user?.uid,
        !user ? getGuestId() : null
      );
    router.push('/checkout');
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Your Cart" },
  ];

  if (!isMounted || isLoadingCart || isLoadingAppSettings) {
    return (
      <div className="container mx-auto px-4 py-8 text-center flex flex-col items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading your cart...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-6 sm:py-8 max-w-4xl">
      <Breadcrumbs items={breadcrumbItems} className="mb-4 sm:mb-6" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-2">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-headline font-semibold text-foreground">Your Cart</h1>
        <Link href="/" passHref>
          <Button variant="outline" size="sm" className="hidden md:flex">
            <Home className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>

      {groupedCart.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <h2 className="text-xl sm:text-2xl font-semibold mb-2">Your cart is empty</h2>
          <p className="text-muted-foreground mb-6 text-sm sm:text-base">Looks like you haven't added any services yet.</p>
          <Link href="/categories" passHref>
            <Button>Browse Services</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedCart.length > 1 && (
            <Alert className="bg-primary/10 border-primary/30">
              <Info className="h-5 w-5 text-primary" />
              <AlertDescription className="text-primary/90 font-medium">
                You have services from different categories. For the best service experience, please checkout one category at a time.
              </AlertDescription>
            </Alert>
          )}

          {groupedCart.map((group) => (
            <Card key={group.categoryId} className="shadow-md border-t-4 border-t-primary overflow-hidden">
              <CardHeader className="bg-secondary/20 pb-4">
                <CardTitle className="text-xl sm:text-2xl font-headline flex items-center">
                  <span className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded mr-3 uppercase tracking-wider font-bold">Category</span>
                  {group.categoryName}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-4">
                <div className="divide-y divide-border/50">
                  {group.items.map(item => {
                    const { mainPrice, priceSuffix, promoText } = getPriceDisplayInfo(item, item.quantity, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode);
                    const escapedSymbol = (appConfig?.currencySymbol || "₹").replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const nonPriceRegex = new RegExp(`[^\\d${escapedSymbol}.,]`, 'g');
                    const priceRegex = new RegExp(`[\\d${escapedSymbol}.,]`, 'g');
                    return (
                      <div key={item.id} className="p-3 sm:p-4 hover:bg-accent/5 transition-colors">
                        
                        {/* MOBILE LAYOUT */}
                        <div className="flex flex-col md:hidden w-full gap-3">
                          <div className="flex flex-row w-full gap-3">
                            <div className="flex-1 flex flex-col">
                              <Link href={`/service/${item.slug}`} className="hover:text-primary transition-colors">
                                <h3 className="font-bold text-base leading-tight">{item.name}</h3>
                                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                              </Link>
                              <div className="flex items-baseline gap-2 mt-2">
                                <p className="text-lg font-bold">{mainPrice}</p>
                                {priceSuffix && (
                                  <p className="text-sm text-muted-foreground">
                                    <span className="line-through">{priceSuffix.replace(nonPriceRegex, "")}</span>{" "}{priceSuffix.replace(priceRegex, "")}
                                  </p>
                                )}
                              </div>
                              {promoText && (
                                <Badge className="bg-green-600 text-white text-[10px] font-semibold px-2 py-1 rounded mt-1 flex items-center gap-1 w-fit">
                                  {!item.hasPriceVariants && <Percent className="w-3 h-3" strokeWidth={2.75} />} {promoText}
                                </Badge>
                              )}
                              {item.hasMinQuantity && item.minQuantity && item.minQuantity > 1 && (
                                <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold mt-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 w-fit">
                                  Min. {item.minQuantity} units required
                                </div>
                              )}
                            </div>
                            <Link href={`/service/${item.slug}`} className="flex-shrink-0 w-24 h-24 relative">
                              <AppImage src={item.imageUrl || "/default-image.png"} alt={item.name} fill className="rounded-lg object-cover" />
                            </Link>
                          </div>
                          <div className="flex items-center justify-between w-full gap-3">
                            <Button variant="ghost" size="sm" className="text-destructive bg-destructive/10 hover:bg-destructive hover:text-white active:bg-destructive/90 text-xs" onClick={() => handleRemoveItem(item.id)}>
                              <Trash2 className="mr-1 h-4 w-4" /> Remove
                            </Button>
                            <QuantitySelector initialQuantity={item.quantity} onQuantityChange={(newQuantity) => handleQuantityChange(item.id, newQuantity)} minQuantity={0} enforcedMinQuantity={item.hasMinQuantity ? item.minQuantity : 0} maxQuantity={item.maxQuantity} />
                          </div>
                        </div>

                        {/* DESKTOP LAYOUT */}
                        <div className="hidden md:flex flex-row items-center w-full gap-4">
                          <Link href={`/service/${item.slug}`} className="relative w-24 h-24 flex-shrink-0">
                            <AppImage src={item.imageUrl || "/default-image.png"} alt={item.name} fill className="object-cover rounded-lg shadow-sm" />
                          </Link>
                          <div className="flex-1 flex flex-col pr-4">
                            <Link href={`/service/${item.slug}`} className="hover:text-primary transition-colors">
                              <h3 className="font-bold text-lg leading-tight text-foreground line-clamp-1">{item.name}</h3>
                              <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{item.description}</p>
                            </Link>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <p className="text-lg font-bold">{mainPrice}</p>
                              {priceSuffix && (
                                <p className="text-sm text-muted-foreground">
                                  <span className="line-through">{priceSuffix.replace(nonPriceRegex, "")}</span>{" "}{priceSuffix.replace(priceRegex, "")}
                                </p>
                              )}
                              {promoText && (
                                <Badge className="bg-green-600 text-white text-xs font-semibold px-2 py-0.5 rounded ml-2">
                                  {!item.hasPriceVariants && <Percent className="w-3 h-3 mr-1 inline" strokeWidth={2.75} />}{promoText}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-3 flex-shrink-0 w-32">
                            <QuantitySelector initialQuantity={item.quantity} onQuantityChange={(newQuantity) => handleQuantityChange(item.id, newQuantity)} minQuantity={0} enforcedMinQuantity={item.hasMinQuantity ? item.minQuantity : 0} maxQuantity={item.maxQuantity} />
                            <Button variant="ghost" size="sm" className="text-destructive bg-destructive/10 hover:bg-destructive hover:text-white h-8 px-3" onClick={() => handleRemoveItem(item.id)}>
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                            </Button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 p-4 sm:p-3 flex flex-col items-stretch gap-4 border-t">
                
                {/* Summary Table inside Card */}
                <div className="space-y-2 sm:space-y-3 text-sm sm:text-base border-b pb-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items Total:</span>
                    <span>{formatCurrency(group.itemsTotal, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode)}</span>
                  </div>
                  
                  {group.visitingCharge > 0 && (
                    <div className="flex justify-between items-center text-primary">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">Visiting Charge:</span>
                        <Dialog 
                          open={openTaxBreakdownCategoryId === group.categoryId + '_vc'} 
                          onOpenChange={(open) => setOpenTaxBreakdownCategoryId(open ? group.categoryId + '_vc' : null)}
                        >
                          <DialogTrigger asChild>
                            <button className="focus:outline-none transition-colors hover:text-primary/80">
                              <Info className="h-3.5 w-3.5"/>
                            </button>
                          </DialogTrigger>
                          <DialogContent className="w-[90vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Charge Details - {group.categoryName}</DialogTitle>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <Alert className="bg-primary/5 border-primary/20">
                                    <Info className="h-4 w-4 text-primary" />
                                    <AlertDescription className="text-sm">
                                        {group.policyMessage}
                                    </AlertDescription>
                                </Alert>
                                <Separator />
                                <div className="space-y-2">
                                    <p className="text-sm font-medium">Visiting Charge Breakdown:</p>
                                    <div className="flex justify-between text-sm">
                                        <span>Base Charge</span>
                                        <span>{formatCurrency(group.visitingChargeBreakdown?.baseAmount, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode)}</span>
                                    </div>
                                    {group.visitingChargeBreakdown?.taxAmount > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span>Tax ({group.visitingChargeBreakdown?.taxPercent}%)</span>
                                            <span>+ {formatCurrency(group.visitingChargeBreakdown?.taxAmount, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between font-bold border-t pt-2">
                                        <span>Total Charge</span>
                                        <span>{formatCurrency(group.visitingChargeBreakdown?.amount, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode)}</span>
                                    </div>
                                </div>
                            </div>
                            <DialogClose asChild>
                              <Button variant="outline" className="w-full">Close</Button>
                            </DialogClose>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <span className="font-medium">+ {formatCurrency(group.visitingChargeBreakdown?.amount || 0, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode)}</span>
                    </div>
                  )}

                  {group.estimatedTax > 0 && (
                    <div className="flex justify-between items-center">
                      <div className="flex items-center text-muted-foreground">
                        {group.effectiveTaxRateDisplay}
                        <Dialog 
                          open={openTaxBreakdownCategoryId === group.categoryId} 
                          onOpenChange={(open) => setOpenTaxBreakdownCategoryId(open ? group.categoryId : null)}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 p-0">
                              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-primary"/>
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="w-[90vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Tax Breakdown - {group.categoryName}</DialogTitle>
                            </DialogHeader>
                            <TaxBreakdownDisplay
                              items={group.taxBreakdownItems}
                              visitingCharge={group.visitingChargeBreakdown}
                              subTotalBeforeDiscount={group.subTotal} 
                              totalDiscount={0} 
                              totalTax={group.estimatedTax}
                              grandTotal={group.total}
                              defaultTaxRatePercent={appConfig.visitingChargeTaxPercent || 0}
                            />
                            <DialogClose asChild className="mt-2">
                              <Button variant="outline" className="w-full">Close</Button>
                            </DialogClose>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <span>+ {formatCurrency(group.estimatedTax, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode)}</span>
                    </div>
                  )}

                  <Separator />
                  <div className="flex justify-between font-bold text-lg sm:text-xl">
                    <span>Subtotal:</span>
                    <span className="text-primary">{formatCurrency(group.total, appConfig.currencySymbol, appConfig.currencyDecimalPoints, appConfig.currencyCode)}</span>
                  </div>
                </div>

                {/* Policy Alert & Button */}
                <div className="flex flex-col lg:flex-row justify-between items-center gap-4 mt-2">
                  <div className="w-full lg:flex-1">
                    {group.policyMessage && (
                      <Alert variant="default" className="bg-amber-50 border-amber-200 py-3 shadow-sm">
                        <div className="flex items-start gap-3">
                          <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                          <AlertDescription className="text-amber-800 font-medium text-sm leading-snug">
                            {group.policyMessage}
                          </AlertDescription>
                        </div>
                      </Alert>
                    )}
                  </div>
                  
                  <div className="w-full lg:w-auto">
                    <Button 
                      size="lg" 
                      className="w-full lg:px-10 py-7 text-xl font-bold shadow-xl hover:shadow-primary/30 transition-all group relative overflow-hidden" 
                      onClick={() => handleProceedToSchedule(group.categoryId, group.categoryName, group.items)}
                      isLoading={isCheckingOutCategory === group.categoryId}
                      disabled={isCheckingOutCategory !== null}
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        Checkout {group.categoryName} <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
                      </span>
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CartPage() {
  return (
    <ProtectedRoute>
      <CartPageContent />
    </ProtectedRoute>
  );
}
