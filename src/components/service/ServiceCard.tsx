
"use client";

import { useState, useEffect, useCallback } from 'react';
import AppImage from '@/components/ui/AppImage';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, ShoppingCart, Clock, Users, Ban, Percent, ChevronRight, Info } from 'lucide-react';
import type { FirestoreService } from '@/types/firestore';
import QuantitySelector from '@/components/shared/QuantitySelector';
import { getCartEntries, saveCartEntries, syncCartToFirestore } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { formatCurrency } from '@/lib/utils';

interface ServiceCardProps {
  service: FirestoreService;
  priority?: boolean;
}

const generateAiHint = (hint?: string, name?: string): string => {
  if (hint && hint.trim() !== '') {
    return hint.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  if (name && name.trim() !== '') {
    return name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  }
  return "service";
};

// --- START: TIERED PRICING LOGIC ---
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

  if (applicableTier) {
    return applicableTier.price;
  }
  
  const lastApplicableTier = sortedVariants.slice().reverse().find(tier => n >= tier.fromQuantity);
  if (lastApplicableTier) {
    return lastApplicableTier.price;
  }

  return service.discountedPrice ?? service.price;
};

const getPriceDisplayInfo = (service: FirestoreService, quantity: number, symbol: string = '₹', decimals: number = 2, code: string = 'INR') => {
    if (!service.hasPriceVariants || !service.priceVariants || service.priceVariants.length === 0) {
        const unitSaving = service.discountedPrice && service.discountedPrice < service.price ? service.price - service.discountedPrice : 0;
        const totalSaving = unitSaving * (quantity > 0 ? quantity : 1);
        
        return {
            mainPrice: formatCurrency(service.discountedPrice ?? service.price, symbol, decimals, code),
            priceSuffix: unitSaving > 0 ? formatCurrency(service.price, symbol, decimals, code) : null,
            promoText: unitSaving > 0 ? `Save ${formatCurrency(totalSaving, symbol, decimals, code)}!` : null,
        };
    }

    const sortedVariants = [...service.priceVariants].sort((a, b) => a.fromQuantity - b.fromQuantity);
    const nextQuantity = quantity + 1;
    const currentPriceForNext = getPriceForNthUnit(service, nextQuantity);
    const nextCheaperTier = sortedVariants.find(v => v.fromQuantity >= nextQuantity && v.price < currentPriceForNext);

    let promoText = null;
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

const ServiceCard: React.FC<ServiceCardProps> = ({ service, priority = false }) => {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [quantity, setQuantity] = useState(0);
  const { toast } = useToast();
  const router = useRouter();
  const { user, triggerAuthRedirect } = useAuth();
  const currentPathname = usePathname();
  const { showLoading } = useLoading();

  useEffect(() => {
    const syncQuantity = () => {
      const cartEntries = getCartEntries();
      const existingEntry = cartEntries.find(entry => entry.serviceId === service.id);
      setQuantity(existingEntry ? existingEntry.quantity : 0);
    };

    syncQuantity();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'yourbrandUserCart' || e.key === null) syncQuantity();
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [service.id]);

  const updateCartAndShowToast = (newQuantity: number, action: 'added' | 'updated' | 'removed') => {
    if (!service) return;
    const cartEntries = getCartEntries();
    const existingEntryIndex = cartEntries.findIndex(entry => entry.serviceId === service.id);
    const oldQuantity = existingEntryIndex > -1 ? cartEntries[existingEntryIndex].quantity : 0;
    
    const quantityChange = Math.abs(newQuantity - oldQuantity);
    
    if (newQuantity > 0) {
      if (existingEntryIndex > -1) {
        cartEntries[existingEntryIndex].quantity = newQuantity;
      } else {
        cartEntries.push({ serviceId: service.id, quantity: newQuantity });
      }
    } else {
      if (existingEntryIndex > -1) {
        cartEntries.splice(existingEntryIndex, 1);
      }
    }
    saveCartEntries(cartEntries);
    if (user?.uid) {
        syncCartToFirestore(user.uid, cartEntries);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key: 'yourbrandUserCart' }));
    }
    
    if (action === 'added' || (action === 'updated' && newQuantity > oldQuantity)) {
      toast({ title: "Cart Updated", description: `${service.name} (x${newQuantity}) in your cart.` });
      logUserActivity(
        'addToCart',
        { serviceId: service.id, serviceName: service.name, quantity: quantityChange, price: service.price },
        user?.uid,
        !user ? getGuestId() : null
      );
    } else if (action === 'removed' || (action === 'updated' && newQuantity < oldQuantity)) {
      if (newQuantity === 0) {
        toast({ title: "Item Removed", description: `${service.name} removed from cart.` });
      }
      logUserActivity(
        'removeFromCart',
        { serviceId: service.id, serviceName: service.name, quantity: quantityChange },
        user?.uid,
        !user ? getGuestId() : null
      );
    }
  };

  const handleInitialAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      triggerAuthRedirect(currentPathname);
      return;
    }
    const newQuantity = service.hasMinQuantity && service.minQuantity ? service.minQuantity : 1;
    setQuantity(newQuantity);
    updateCartAndShowToast(newQuantity, 'added');
  };

  const handleQuantityChange = (newQuantity: number) => {
    const oldQuantity = quantity;
    if (newQuantity > 0 && oldQuantity === 0 && !user) {
      triggerAuthRedirect(currentPathname);
      return;
    }
    setQuantity(newQuantity);
    
    if (newQuantity === 0 && oldQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'removed');
    } else if (newQuantity > 0 && oldQuantity === 0) {
        updateCartAndShowToast(newQuantity, 'added');
    } else if (newQuantity > 0) {
      updateCartAndShowToast(newQuantity, 'updated');
    }
  };

  const handleNavigation = useCallback(() => {
    const intendedHref = `/service/${service.slug}`;
    if (intendedHref !== currentPathname) {
      showLoading();
      router.push(intendedHref);
    }
  }, [service.slug, currentPathname, showLoading, router]);

  const taskTimeDisplay = service.taskTimeValue && service.taskTimeUnit ? `${service.taskTimeValue}${service.taskTimeUnit.charAt(0)}` : null;
  const displayImageUrl = service.imageUrl && service.imageUrl.trim() !== '' ? service.imageUrl : "/default-image.png";
  const aiHintValue = generateAiHint(service.imageHint, service.name);
  
  const { mainPrice, priceSuffix, promoText } = getPriceDisplayInfo(service, quantity, symbol, decimals, code);
  
  const isAvailable = service.maxQuantity === undefined || service.maxQuantity === null || service.maxQuantity > 0;

  return (
    <div className="relative block my-2 w-full group">
    <Link 
      href={`/service/${service.slug}`}
      onClick={(e: React.MouseEvent) => {
        if (currentPathname === `/service/${service.slug}`) {
          e.preventDefault();
        } else {
          showLoading();
        }
      }}
      className="relative flex p-3 gap-3 bg-card border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 w-full cursor-pointer"
    >
        {/* Mobile-only Layout Container */}
        <div className="flex flex-row md:hidden w-full gap-3">
          {/* Left Side (Details) - Mobile */}
          <div className="flex-1 flex flex-col">
            <h3 className="font-bold text-base font-headline leading-tight text-foreground line-clamp-3 group-hover:text-primary transition-colors">{service.name}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{service.description}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                <div className="flex items-center gap-1" title="Members required"><Users className="h-3.5 w-3.5 text-primary"/><span>{service.membersRequired || 1}</span></div>
                {taskTimeDisplay && (<div className="flex items-center gap-1" title={`Estimated time: ${taskTimeDisplay}`}><Clock className="h-3.5 w-3.5 text-primary" /><span>{taskTimeDisplay}</span></div>)}
                {service.rating > 0 && (<div className="flex items-center gap-1" title={`${service.rating.toFixed(1)} rating`}><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /><span>{service.rating.toFixed(1)}</span></div>)}
            </div>
            <div className="flex flex-wrap items-baseline gap-2 mt-2">
                <p className="text-lg font-bold text-foreground">{mainPrice}</p>
                {priceSuffix && (
                     <p className="text-sm text-muted-foreground">
                       {priceSuffix.includes(symbol) || /\d/.test(priceSuffix) ? (
                         <span className="line-through">{priceSuffix}</span>
                       ) : (
                         priceSuffix
                       )}
                     </p>
                )}
                 {promoText && (
                          <Badge 
                            className="bg-green-600 text-white text-[10px] font-semibold px-2 py-1 rounded mt-1 flex items-center gap-1">
                               {!service.hasPriceVariants && (
                                <Percent className="w-3 h-3" strokeWidth={2.75} />
                                )} {promoText}
                         </Badge>
                )}
                {service.hasMinQuantity && service.minQuantity && service.minQuantity > 1 && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold mt-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 w-fit">
                    <Info className="h-3 w-3" /> Min. {service.minQuantity} units required
                  </div>
                )}
            </div>
            <div className="text-sm text-primary font-medium mt-1 flex items-center">
                View Details <ChevronRight className="h-3 w-3 ml-0.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
          {/* Right Side (Image & Actions) - Mobile */}
          <div className="flex flex-col items-center justify-between flex-shrink-0 w-28">
            <div className="relative w-full h-28">
                <AppImage src={displayImageUrl} alt={service.name} fill sizes="112px" className="object-cover rounded-lg group-hover:scale-105 transition-transform duration-500" data-ai-hint={aiHintValue} priority={priority}/>
            </div>
            <div className="w-full mt-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                {!isAvailable ? (
                    <Button size="sm" className="h-9 rounded-md px-4 w-full" disabled><Ban className="mr-1.5 h-4 w-4"/>Unavailable</Button>
                ) : quantity === 0 ? (
                    <Button size="sm" className="h-9 rounded-md px-4 w-full" onClick={(e) => { e.preventDefault(); handleInitialAddToCart(e); }}>
                        <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Add
                    </Button>
                ) : (
                    <QuantitySelector initialQuantity={quantity} onQuantityChange={handleQuantityChange} minQuantity={0} enforcedMinQuantity={service.hasMinQuantity ? service.minQuantity : 0} maxQuantity={service.maxQuantity}/>
                )}
            </div>
          </div>
        </div>

        {/* Desktop Layout */}
        <div className="hidden md:flex flex-row items-center w-full gap-4">
            <div className="relative w-40 h-40 flex-shrink-0">
                <AppImage
                    src={displayImageUrl}
                    alt={service.name}
                    fill
                    sizes="128px"
                    className="object-cover rounded-lg group-hover:scale-105 transition-transform duration-500"
                    data-ai-hint={aiHintValue}
                    priority={priority}
                />
            </div>
            <div className="flex-1 flex flex-col self-stretch">
                <h3 className="font-bold text-lg leading-tight text-foreground line-clamp-2 group-hover:text-primary transition-colors">{service.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{service.description}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground mt-2">
                    <div className="flex items-center gap-1" title="Members required"><Users className="h-3.5 w-3.5 text-primary"/><span>{service.membersRequired || 1}</span></div>
                    {taskTimeDisplay && (<div className="flex items-center gap-1" title={`Estimated time: ${taskTimeDisplay}`}><Clock className="h-3.5 w-3.5 text-primary" /><span>{taskTimeDisplay}</span></div>)}
                    {service.rating > 0 && (<div className="flex items-center gap-1" title={`${service.rating.toFixed(1)} rating`}><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /><span>{service.rating.toFixed(1)}</span></div>)}
                    {service.reviewCount !== undefined && service.reviewCount > 0 && <span className="text-muted-foreground/80">({service.reviewCount})</span>}
                </div>
                <div className="flex-grow"></div>
                <div className="flex items-end justify-between">
                     <div>
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <p className="text-xl font-bold text-foreground">{mainPrice}</p>
                            {priceSuffix && (
                                <p className="text-base text-muted-foreground">
                                  {priceSuffix.includes(symbol) || /\d/.test(priceSuffix) ? (
                                    <span className="line-through">{priceSuffix}</span>
                                  ) : (
                                    priceSuffix
                                  )}
                                </p>
                            )}
                            
                            {promoText && (
                              <Badge 
                                className="bg-green-600 text-white text-sm font-semibold px-2 py-1 rounded mt-1 flex items-center gap-1">
                                   {!service.hasPriceVariants && (
                                   <Percent className="w-4 h-4" strokeWidth={2.75} />
                                  )}{promoText}
                             </Badge>
                            )}
                            {service.hasMinQuantity && service.minQuantity && service.minQuantity > 1 && (
                              <div className="flex items-center gap-1.5 text-xs text-amber-600 font-bold mt-1 bg-amber-50 px-2 py-1 rounded border border-amber-100 w-fit">
                                <Info className="h-4 w-4" /> Min. {service.minQuantity} units required
                              </div>
                            )}
                        </div>
                        <div className="text-sm text-primary font-medium mt-1 flex items-center">
                            View Details <ChevronRight className="h-4 w-4 ml-0.5 group-hover:translate-x-1 transition-transform" />
                        </div>
                     </div>
                </div>
            </div>
             {/* Desktop Add to Cart Button */}
            <div className="flex flex-col items-center justify-center pl-4 w-32" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                 {!isAvailable ? (
                    <Button size="lg" className="h-10 rounded-md w-full" disabled><Ban className="mr-1.5 h-4 w-4"/>Unavailable</Button>
                 ) : quantity === 0 ? (
                    <Button size="lg" className="h-10 rounded-md w-full" onClick={(e) => { e.preventDefault(); handleInitialAddToCart(e); }}>
                        <ShoppingCart className="mr-1.5 h-4 w-4" />Add
                    </Button>
                 ) : (
                    <QuantitySelector initialQuantity={quantity} onQuantityChange={handleQuantityChange} minQuantity={0} enforcedMinQuantity={service.hasMinQuantity ? service.minQuantity : 0} maxQuantity={service.maxQuantity}/>
                 )}
            </div>
        </div>
    </Link>
    </div>
  );
};

export default ServiceCard;
