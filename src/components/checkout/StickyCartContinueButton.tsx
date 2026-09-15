
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ShoppingCart, Loader2 } from 'lucide-react';
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import { usePathname, useRouter } from 'next/navigation'; 
import { useAuth } from '@/hooks/useAuth'; 
import { useLoading } from '@/contexts/LoadingContext'; 

const StickyCartContinueButton = () => {
  const [cartItemCount, setCartItemCount] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter(); 
  const { user, triggerAuthRedirect } = useAuth(); 
  const { showLoading, isLoading } = useLoading(); 

  const updateCartCount = () => {
    const entries = getCartEntries();
    setCartItemCount(entries.reduce((sum, entry) => sum + entry.quantity, 0));
  };

  useEffect(() => {
    setIsMounted(true);
    updateCartCount(); 

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'yourbrandUserCart') {
        updateCartCount();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);
 
  useEffect(() => {
    if (isMounted) {
      updateCartCount();
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
        <div>
          <p className="text-sm text-muted-foreground">{cartItemCount} service(s) in cart</p>
        </div>
        <Button size="lg" onClick={(e) => handleNavigateToCart(e as any)} disabled={isLoading} aria-label="View Cart and Proceed" asChild>
          <Link href="/cart">
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                View Cart & Proceed <ShoppingCart className="ml-2 h-5 w-5" />
              </>
            )}
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default StickyCartContinueButton;
