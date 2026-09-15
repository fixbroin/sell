
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Loader2 } from 'lucide-react';
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import { usePathname, useRouter } from 'next/navigation'; 
import { useAuth } from '@/hooks/useAuth'; 
import { useLoading } from '@/contexts/LoadingContext'; 
import { db } from '@/lib/firebase';
import { doc, getDoc } from '@/lib/mysqlDb';
import type { FirestoreService } from '@/types/firestore';
import { formatCurrency } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

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

const StickyCartContinueButton = () => {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [cartItemCount, setCartItemCount] = useState(0);
  const [totalPrice, setTotalPrice] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const pathname = usePathname();
  const router = useRouter(); 
  const { user, triggerAuthRedirect } = useAuth(); 
  const { showLoading, isLoading } = useLoading(); 
  
  const updateCartState = async () => {
    setIsLoadingPrice(true);
    const entries = getCartEntries();
    const totalItems = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    setCartItemCount(totalItems);

    if (totalItems > 0) {
        let calculatedTotal = 0;
        try {
            const servicePromises = entries.map(entry => getDoc(doc(db, "adminServices", entry.serviceId)));
            const serviceDocs = await Promise.all(servicePromises);
            
            entries.forEach((entry, index) => {
                const serviceDoc = serviceDocs[index];
                if (serviceDoc.exists()) {
                    const serviceData = serviceDoc.data() as FirestoreService;
                    calculatedTotal += calculateIncrementalTotalPriceForItem(serviceData, entry.quantity);
                }
            });
            setTotalPrice(calculatedTotal);
        } catch (error) {
            console.error("Error calculating total price for sticky cart:", error);
            setTotalPrice(0); // Reset on error
        }
    } else {
        setTotalPrice(0);
    }
    setIsLoadingPrice(false);
  };

  useEffect(() => {
    setIsMounted(true);
    updateCartState();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'yourbrandUserCart') {
        updateCartState();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
 
  useEffect(() => {
    if (isMounted) {
      updateCartState();
    }
  }, [isMounted, pathname]); 


  const handleNavigateToCart = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const intendedHref = "/cart";
    showLoading();
    if (!user) {
      triggerAuthRedirect(intendedHref);
    } else {
      router.push(intendedHref);
    }
  };


  if (!isMounted || cartItemCount === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 w-full px-2 py-1 bg-background/90 backdrop-blur-sm border-t border-border shadow-lg z-40">
      <div className="flex items-center justify-between w-full max-w-screen-xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2 pl-5 sm:pl-0">
  

  {isLoadingPrice ? (
    <div className="h-5 w-20 bg-muted rounded-md animate-pulse"></div>
  ) : (
    <span className="font-bold text-lg text-primary">
      {formatCurrency(totalPrice, symbol, decimals, code)}
    </span>
  )}
  <span className="text-sm text-muted-foreground">
    {cartItemCount} service(s)
  </span>
</div>
        <Link href="/cart" onClick={handleNavigateToCart} passHref>
          <Button size="lg" disabled={isLoading} aria-label="View Cart and Proceed">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ShoppingCart className="mr-2 h-5 w-5" /> View Cart & Proceed
              </>
            )}
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default StickyCartContinueButton;
