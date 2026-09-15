
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import AppImage from '@/components/ui/AppImage';
import Link from 'next/link';
import type { FirestoreService, FirestoreReview, ClientServiceData, FirestoreCategory, FirestoreSubCategory, ServiceFaqItem, PriceVariant } from '@/types/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, ShoppingCart, ArrowLeft, Home as HomeIcon, CheckCircle, Percent,ShieldCheck, Clock, Loader2, MessageSquare, MinusCircle, PlusCircle, Ban, HelpCircle, Users, AlertCircle, Info, XCircle, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import QuantitySelector from '@/components/shared/QuantitySelector';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { getCartEntries, saveCartEntries, syncCartToFirestore } from '@/lib/cartManager';
import { getIconComponent } from '@/lib/iconMap';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy, Timestamp, doc, onSnapshot, type DocumentSnapshot, getDoc } from '@/lib/mysqlDb';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import StickyCartContinueButton from '@/components/category/StickyCartContinueButton';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { logUserActivity } from '@/lib/activityLogger';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { getCache, setCache } from '@/lib/client-cache';
import { useLoading } from '@/contexts/LoadingContext';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, getTimestampMillis, formatCurrency } from '@/lib/utils';
import { LazySection } from '@/components/shared/LazySection';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

interface ServiceDetailPageClientProps {
  serviceSlug: string;
  initialServiceData?: ClientServiceData | null;
  initialH1Title?: string;
}

const generateAiHint = (hint?: string, name?: string): string => {
  if (hint && hint.trim() !== '') {
    return hint.trim().split(/\s+/).slice(0, 2).join(' ');
  }
  if (name && name.trim() !== '') {
    return name.trim().toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  }
  return "service detail";
};

interface ServicePageCache {
  service: ClientServiceData | null;
  h1Title: string | null;
  breadcrumbs: BreadcrumbItem[];
  reviews?: FirestoreReview[];
}

// --- START: TIERED PRICING LOGIC ---
const getPriceForNthUnit = (service: FirestoreService | ClientServiceData, n: number): number => {
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

const getPriceDisplayInfo = (service: FirestoreService | ClientServiceData, quantity: number, symbol: string = '₹', decimals: number = 2, code: string = 'INR') => {
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

export default function ServiceDetailPageClient({
  serviceSlug,
  initialServiceData,
  initialH1Title,
}: ServiceDetailPageClientProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const router = useRouter();
  const { toast } = useToast();
  const { user, triggerAuthRedirect } = useAuth();
  const currentPathname = usePathname();
  const isAdmin = currentPathname?.startsWith('/admin');
  
  const cacheKey = `service-data-${serviceSlug}`;

  const [service, setService] = useState<ClientServiceData | null>(initialServiceData || getCache<ServicePageCache>(cacheKey, true)?.service || null);
  const [h1Title, setH1Title] = useState<string | null>(initialH1Title || (initialServiceData ? (initialServiceData.h1_title || initialServiceData.name) : (getCache<ServicePageCache>(cacheKey, true)?.h1Title || null)));
  const [quantity, setQuantity] = useState(0);
  const [isLoading, setIsLoading] = useState(() => !initialServiceData && !getCache(cacheKey, true));
  const [serviceReviews, setServiceReviews] = useState<FirestoreReview[]>(() => getCache<ServicePageCache>(cacheKey, true)?.reviews || []);
  const [isLoadingReviews, setIsLoadingReviews] = useState(() => !getCache<ServicePageCache>(cacheKey, true)?.reviews);
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[]>(() => getCache<ServicePageCache>(cacheKey, true)?.breadcrumbs || []);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    if (initialServiceData) {
        const crumbs: BreadcrumbItem[] = [
            { label: "Home", href: "/" },
            ...(initialServiceData.parentCategoryName && initialServiceData.parentCategorySlug ? [{ label: initialServiceData.parentCategoryName, href: `/category/${initialServiceData.parentCategorySlug}` }] : []),
            { label: initialServiceData.name }
        ];
        setBreadcrumbItems(crumbs);
        setCache(cacheKey, {
            service: initialServiceData,
            h1Title: initialH1Title || initialServiceData.name,
            breadcrumbs: crumbs,
        }, true);
    }
  }, [initialServiceData, cacheKey, initialH1Title]);

  // NEW: Synchronization effect for quantity
  useEffect(() => {
    if (!isMounted || !service?.id) return;

    const syncQuantity = () => {
      const entries = getCartEntries();
      const item = entries.find(e => e.serviceId === service.id);
      setQuantity(item?.quantity || 0);
    };

    syncQuantity();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'yourbrandUserCart' || e.key === null) syncQuantity();
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [isMounted, service?.id]);

  const processServiceData = useCallback(async (serviceDocSnap: DocumentSnapshot): Promise<ClientServiceData | null> => {
    if (!serviceDocSnap.exists()) {
      console.error('Service not found or inactive in Firestore:', serviceSlug);
      toast({ title: "Not Found", description: "Service details could not be found or it's currently unavailable.", variant: "destructive" });
      return null;
    }

    const firestoreServiceData = { id: serviceDocSnap.id, ...serviceDocSnap.data() } as FirestoreService;

    let parentCategoryName: string | undefined;
    let parentCategorySlug: string | undefined;
    let parentCategoryId: string | undefined;

    if (firestoreServiceData.subCategoryId) {
        const subCatDoc = await getDoc(doc(db, "adminSubCategories", firestoreServiceData.subCategoryId));
        if (subCatDoc.exists()) {
            const subCategory = subCatDoc.data() as FirestoreSubCategory | undefined;
            if (subCategory && subCategory.parentId) { 
                parentCategoryId = subCategory.parentId;
                const catDoc = await getDoc(doc(db, "adminCategories", subCategory.parentId));
                if (catDoc.exists()) {
                    const category = catDoc.data() as FirestoreCategory | undefined;
                    if (category) { 
                        parentCategoryName = category.name;
                        parentCategorySlug = category.slug;
                    }
                }
            }
        }
    }

    const processedData: ClientServiceData = {
        ...firestoreServiceData,
        isTaxInclusive: firestoreServiceData.isTaxInclusive === true,
        id: serviceDocSnap.id,
        parentCategoryName,
        parentCategorySlug,
        parentCategoryId,
        createdAt: (() => {
            const millis = getTimestampMillis(firestoreServiceData.createdAt);
            return millis ? new Date(millis).toISOString() : String(firestoreServiceData.createdAt || '');
        })(),
        updatedAt: (() => {
            const millis = getTimestampMillis(firestoreServiceData.updatedAt);
            return millis ? new Date(millis).toISOString() : String(firestoreServiceData.updatedAt || '');
        })(),
        taskTimeValue: firestoreServiceData.taskTimeValue,
        taskTimeUnit: firestoreServiceData.taskTimeUnit,
        includedItems: firestoreServiceData.includedItems,
        excludedItems: firestoreServiceData.excludedItems,
        allowPayLater: firestoreServiceData.allowPayLater,
        serviceFaqs: firestoreServiceData.serviceFaqs,
    };
    return processedData;
  }, [serviceSlug, toast]);


  const fetchReviewsForService = useCallback(async (serviceId: string) => {
    setIsLoadingReviews(true);
    try {
      const reviewsCollectionRef = collection(db, "adminReviews");
      const qReviews = query(
        reviewsCollectionRef,
        where("serviceId", "==", serviceId),
        where("status", "==", "Approved"),
        orderBy("createdAt", "desc")
      );
      const reviewsSnapshot = await getDocs(qReviews);
      const fetchedReviews = reviewsSnapshot.docs.map(docSnap => ({ ...docSnap.data(), id: docSnap.id } as FirestoreReview));
      setServiceReviews(fetchedReviews);
      
      const cachedData = getCache<ServicePageCache>(cacheKey, true);
      if (cachedData) {
        setCache(cacheKey, {...cachedData, reviews: fetchedReviews }, true);
      }

    } catch (error) {
      console.error("Error fetching reviews:", error);
      toast({ title: "Error", description: "Could not load service reviews.", variant: "destructive" });
    } finally {
      setIsLoadingReviews(false);
    }
  }, [toast, cacheKey]);

  useEffect(() => {
    if (!isMounted || !serviceSlug) {
      if (!serviceSlug) setIsLoading(false);
      return;
    }
    
    if (initialServiceData) {
        // We already have data from server props, but we still need to set breadcrumbs and fetch reviews
        const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
        if (initialServiceData.parentCategoryName && initialServiceData.parentCategorySlug) {
          crumbs.push({ label: initialServiceData.parentCategoryName, href: `/category/${initialServiceData.parentCategorySlug}` });
        }
        crumbs.push({ label: initialServiceData.name });
        
        setBreadcrumbItems(crumbs);
        setIsLoading(false);
        fetchReviewsForService(initialServiceData.id);
        
        // Optionally update cache
        setCache(cacheKey, {
            service: initialServiceData,
            h1Title: initialH1Title || initialServiceData.name,
            breadcrumbs: crumbs,
        }, true);
        return;
    }

    const cachedData = getCache<ServicePageCache>(cacheKey, true);
    if(cachedData) {
        setService(cachedData.service);
        setH1Title(cachedData.h1Title);
        setBreadcrumbItems(cachedData.breadcrumbs);
        setServiceReviews(cachedData.reviews || []);
        setIsLoading(false);
        setIsLoadingReviews(!cachedData.reviews);
        if (cachedData.service?.id) {
          if (!cachedData.reviews) fetchReviewsForService(cachedData.service.id);
        }
        return;
    }

    setIsLoading(true);

    const servicesCollectionRef = collection(db, "adminServices");
    const qService = query(servicesCollectionRef, where("slug", "==", serviceSlug), where("isActive", "==", true), limit(1));

    // CRITICAL: Only use realtime listeners for ADMINS.
    // Regular visitors use the server-cached data.
    if (!isAdmin) {
        const fetchServiceOneTime = async () => {
            try {
                const querySnapshot = await getDocs(qService);
                if (!querySnapshot.empty) {
                    const processed = await processServiceData(querySnapshot.docs[0]);
                    if (processed) {
                        setService(processed);
                        setH1Title(processed.h1_title || processed.name);
                        fetchReviewsForService(processed.id);
                    }
                }
            } catch (e) { console.error(e); }
            setIsLoading(false);
        };
        fetchServiceOneTime();
        return () => {};
    }

    const unsubscribe = onSnapshot(qService, async (querySnapshot) => {
      if (querySnapshot.empty) {
        setService(null);
        setH1Title("Service Not Found");
        setBreadcrumbItems([{ label: "Home", href: "/" }, { label: "Service Not Found" }]);
        setIsLoading(false);
        toast({ title: "Not Found", description: "Service not found or inactive.", variant: "destructive" });
        return;
      }

      const serviceDocSnap = querySnapshot.docs[0];
      const processedServiceData = await processServiceData(serviceDocSnap);

      if (processedServiceData) {
        const finalH1 = processedServiceData.h1_title || processedServiceData.name;
        const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
        if (processedServiceData.parentCategoryName && processedServiceData.parentCategorySlug) {
          crumbs.push({ label: processedServiceData.parentCategoryName, href: `/category/${processedServiceData.parentCategorySlug}` });
        }
        crumbs.push({ label: processedServiceData.name });
        
        setService(processedServiceData);
        setH1Title(finalH1);
        setBreadcrumbItems(crumbs);
        
        setCache(cacheKey, {
            service: processedServiceData,
            h1Title: finalH1,
            breadcrumbs: crumbs,
        }, true);

        fetchReviewsForService(processedServiceData.id);
      } else {
        setService(null);
        setH1Title("Error Loading Service");
        setBreadcrumbItems([{ label: "Home", href: "/" }, { label: "Error" }]);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error with onSnapshot for service:", error);
      toast({ title: "Error", description: "Could not retrieve service details.", variant: "destructive" });
      setService(null);
      setH1Title("Error Loading Service");
      setIsLoading(false);
    });

    return () => unsubscribe();

  }, [isMounted, serviceSlug, toast, processServiceData, fetchReviewsForService, cacheKey]);


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

  const handleInitialAddToCart = () => {
    if (!service) return;
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

  const { showLoading } = useLoading();
  const handleNavigation = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    const intendedHref = `/service/${serviceSlug}`;
    if (intendedHref !== currentPathname) {
      e.preventDefault();
      showLoading();
      router.push(intendedHref);
    }
  }, [serviceSlug, currentPathname, showLoading, router]);

  const formatTaskTime = (value?: number | null, unit?: 'hours' | 'minutes' | null): string | null => {
    if (value === undefined || value === null || !unit) return null;
    if (value <= 0) return null;
    return `${value} ${unit}`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-2 sm:px-4 py-8 flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!service || !h1Title) {
    return (
      <div className="container mx-auto px-2 sm:px-4 py-8 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <p className="text-lg sm:text-xl text-muted-foreground mb-4">Service not found or it is unavailable.</p>
        <Link href="/" passHref>
          <Button variant="outline">Go back to Home</Button>
        </Link>
      </div>
    );
  }

  const IconComponent = getIconComponent(undefined);
  const { mainPrice, priceSuffix, promoText } = getPriceDisplayInfo(service, quantity, symbol, decimals, code);
  
  const displayServiceImageUrl = service.imageUrl && service.imageUrl.trim() !== '' ? service.imageUrl : "/default-image.png";
  const aiHintValue = generateAiHint(service.imageHint, service.name);
  const taskTimeDisplay = formatTaskTime(service.taskTimeValue, service.taskTimeUnit);
  const isAvailable = service.maxQuantity === undefined || service.maxQuantity === null || service.maxQuantity > 0;

  return (
    <div className="container mx-auto px-2 sm:px-4 py-6 sm:py-8 pb-24">
      {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}
      <nav className="mb-4 sm:mb-6 hidden md:flex items-center justify-between">
        <Button variant="outline" onClick={() => router.back()} className="flex items-center text-xs sm:text-sm">
          <ArrowLeft className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Back
        </Button>
        <Link href="/" passHref>
           <Button variant="outline" className="flex items-center text-xs sm:text-sm">
             <HomeIcon className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Home
           </Button>
        </Link>
      </nav>

      <Card className="overflow-hidden shadow-xl mb-6 sm:mb-10 border-none">
        <div className="grid md:grid-cols-2 gap-0">
          <div className="relative w-full aspect-square overflow-hidden md:rounded-l-xl border-b border-border/50">
            <AppImage
              src={displayServiceImageUrl}
              alt={service.name}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-cover"
              data-ai-hint={aiHintValue}
              priority 
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== "/default-image.png") {
                  target.src = "/default-image.png";
                }
              }}
            />
          </div>

          <div className="flex flex-col bg-card">
            <CardHeader className="p-3 sm:p-4">
              <div className="flex items-start justify-between">
                <h1 className="text-2xl sm:text-3xl font-headline font-bold text-foreground leading-tight">{h1Title}</h1>
                {(!service.imageUrl || service.imageUrl.trim() === '') && <IconComponent className="h-10 w-10 sm:h-12 sm:w-12 text-primary ml-4 shrink-0" />}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:text-base mt-2">
                 <div className="flex items-center text-muted-foreground font-medium">
                    <Users className="mr-1.5 h-4 w-4 sm:h-5 sm:w-5 text-primary" /> {service.membersRequired || 1} Member(s)
                  </div>
                {service.rating > 0 && (
                  <div className="flex items-center">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`h-4 w-4 sm:h-5 sm:w-5 ${i < Math.floor(service.rating) ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}/>
                    ))}
                    <span className="ml-1.5 text-foreground font-semibold">({service.rating.toFixed(1)})</span>
                  </div>
                )}
                {service.reviewCount !== undefined && service.reviewCount > 0 && (
                   <span className="text-muted-foreground font-medium">· {service.reviewCount} reviews</span>
                )}
                {taskTimeDisplay && (
                  <div className="flex items-center text-muted-foreground font-medium">
                    <Clock className="mr-1.5 h-4 w-4 sm:h-5 sm:w-5 text-primary" /> {taskTimeDisplay}
                  </div>
                )}
              </div>
            </CardHeader>

            <div className="px-4 pb-4 space-y-4">
               <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 bg-primary/5 p-3 rounded-lg border border-primary/10">
                    <p className="text-2xl sm:text-3xl font-bold text-foreground">{mainPrice}</p>
                    {priceSuffix && (
                      <p className="text-lg sm:text-xl text-muted-foreground font-medium">
                        {priceSuffix.includes(symbol) || /\d/.test(priceSuffix) ? (
                          <span className="line-through">{priceSuffix}</span>
                        ) : (
                          priceSuffix
                        )}
                      </p>
                    )}
                    {promoText && (
                      <Badge className="bg-green-600 text-white text-sm sm:text-base font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                        {!service.hasPriceVariants && <Percent className="w-4 h-4" strokeWidth={3} />} {promoText}
                      </Badge>
                    )}
                </div>

                {service.hasMinQuantity && service.minQuantity && service.minQuantity > 1 && (
                    <div className="flex items-center gap-2 text-sm sm:text-base text-amber-700 font-bold bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
                        <AlertCircle className="h-5 w-5 flex-shrink-0" />
                        <span>This service requires a minimum of {service.minQuantity} units per booking.</span>
                    </div>
                )}

                <div className="w-full">
                  {!isMounted ? (
                    <Skeleton className="h-12 w-full rounded-md" />
                  ) : !isAvailable ? (
                    <Button size="lg" className="w-full text-sm sm:text-base" disabled>
                      <Ban className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> Currently Unavailable
                    </Button>
                  ) : quantity === 0 ? (
                    <Button size="lg" className="w-full text-sm sm:text-base h-12 shadow-md hover:shadow-lg transition-all" onClick={handleInitialAddToCart}>
                      <ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart
                    </Button>
                  ) : (
                    <div className="w-full flex items-center justify-between bg-muted/50 p-2 rounded-xl border border-border/50">
                      <span className="text-xs sm:text-sm font-bold text-foreground ml-2">Quantity:</span>
                      <QuantitySelector initialQuantity={quantity} onQuantityChange={handleQuantityChange} minQuantity={0} enforcedMinQuantity={service.hasMinQuantity ? service.minQuantity : 0} maxQuantity={service.maxQuantity}/>
                    </div>
                  )}
                </div>
            </div>

            <CardContent className="p-2 sm:p-4 pt-0 flex-grow space-y-6">
              <div className="space-y-4 border-t border-border/60 pt-4">
  <p className="text-base sm:text-lg text-foreground/90 leading-relaxed font-medium">
    {service.description}
  </p>

  {service.shortDescription && (
    <div className="border-t border-border/60 pt-4">
      <p className="text-sm sm:text-base text-muted-foreground font-medium border-l-4 border-green-500 pl-4">
        {service.shortDescription}
      </p>
    </div>
  )}
</div>

              {/* WHY CHOOSE THIS SERVICE - COLOR CODED (GREEN) */}
              {service.serviceHighlights && service.serviceHighlights.length > 0 && (
                <div className="p-4 sm:p-3 rounded-xl bg-accent/10 border border-accent/20">
                  <h4 className="text-lg sm:text-xl font-headline font-bold text-accent mb-3 flex items-center">
                    <CheckCircle className="mr-2 h-5 w-5 sm:h-6 sm:w-6" /> Why choose this service?
                  </h4>
                  <ul className="grid grid-cols-1 gap-2">
                    {service.serviceHighlights.map((highlight, index) => (
                      <li key={index} className="flex items-start text-sm sm:text-base text-foreground/80 font-medium">
                        <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-3 text-accent flex-shrink-0 mt-0.5"/> {highlight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
{/* PLEASE NOTE - COLOR CODED (AMBER/WARNING) */}
{service.fullDescription && (
  <div className="p-4 sm:p-3 rounded-xl bg-amber-50 border border-amber-200">
    <h4 className="text-lg sm:text-xl font-headline font-bold text-amber-700 mb-4 flex items-center">
      <AlertCircle className="mr-2 h-5 w-5 sm:h-6 sm:w-6" />
      Please Note
    </h4>

    <ul className="space-y-2">
      {service.fullDescription
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line, index) => (
          <li
            key={index}
            className="flex items-start text-sm sm:text-base text-amber-900/80 font-medium"
          >
            <Info className="h-4 w-4 sm:h-5 sm:w-5 mr-3 text-amber-600 flex-shrink-0 mt-0.5" />
            <span>{line}</span>
          </li>
        ))}
    </ul>
  </div>
)}


              {/* WHAT'S INCLUDED - COLOR CODED (BLUE/PRIMARY) */}
              {service.includedItems && service.includedItems.length > 0 && (
                <div className="p-4 sm:p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <h4 className="text-lg sm:text-xl font-headline font-bold text-primary mb-3 flex items-center">
                    <PlusCircle className="mr-2 h-5 w-5 sm:h-6 sm:w-6" /> What's Included:
                  </h4>
                  <ul className="grid grid-cols-1 gap-2">
                    {service.includedItems.map((item, index) => (
                      <li key={`inc-${index}`} className="flex items-start text-sm sm:text-base text-foreground/80 font-medium">
                        <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-3 text-primary flex-shrink-0 mt-0.5"/>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* WHAT'S NOT INCLUDED - COLOR CODED (RED/DESTRUCTIVE) */}
              {service.excludedItems && service.excludedItems.length > 0 && (
                <div className="p-4 sm:p-3 rounded-xl bg-destructive/5 border border-destructive/15">
                  <h4 className="text-lg sm:text-xl font-headline font-bold text-destructive mb-3 flex items-center">
                    <Ban className="mr-2 h-5 w-5 sm:h-6 sm:w-6" /> What's Not Included:
                  </h4>
                  <ul className="grid grid-cols-1 gap-2">
                    {service.excludedItems.map((item, index) => (
                      <li key={`exc-${index}`} className="flex items-start text-sm sm:text-base text-muted-foreground font-medium">
                        <XCircle className="h-4 w-4 sm:h-5 sm:w-5 mr-3 text-destructive/60 flex-shrink-0 mt-0.5"/>{item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              

            </CardContent>
          </div>
        </div>
      </Card>

      {/* FAQ SECTION */}
      {service.serviceFaqs && service.serviceFaqs.length > 0 && (
        <LazySection>
            <Card className="shadow-lg border-none bg-card mt-8 sm:mt-12 overflow-hidden">
            <CardHeader className="p-4 sm:p-3 bg-primary/5">
                <CardTitle className="text-2xl sm:text-3xl font-headline font-bold flex items-center">
                <HelpCircle className="mr-3 h-6 w-6 sm:h-8 sm:w-8 text-primary"/>Frequently Asked Questions
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-3">
                <Accordion type="single" collapsible className="w-full">
                {service.serviceFaqs.map((faq, index) => (
                    <AccordionItem value={`faq-${index}`} key={faq.id || `s-faq-item-${index}`} className="border-b last:border-0 border-muted">
                    <AccordionTrigger className="text-left text-base sm:text-lg font-bold py-4 hover:no-underline hover:text-primary transition-colors">
                        {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm sm:text-base text-muted-foreground whitespace-pre-wrap leading-relaxed pb-6">
                        {faq.answer}
                    </AccordionContent>
                    </AccordionItem>
                ))}
                </Accordion>
            </CardContent>
            </Card>
        </LazySection>
      )}

      {/* REVIEWS SECTION - Vertical Scrollable Layout based on user image */}
      {(serviceReviews.length > 0 || isLoadingReviews) && (
        <LazySection>
            <Card className="shadow-lg border border-border bg-card mt-8 sm:mt-12 overflow-hidden">
                <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-2xl font-headline font-bold flex items-center text-foreground/90">
                        <MessageSquare className="mr-2 h-6 w-6 text-primary"/> Customer Reviews
                    </CardTitle>
                    {serviceReviews.length > 0 && (
                    <p className="text-sm sm:text-base text-primary font-medium mt-1">
                        {serviceReviews.length} review(s) for this service.
                    </p>
                    )}
                </CardHeader>
                <CardContent className="p-2 pt-2">
                {/* Simulated Input field as per reference image */}
                <div className="mb-6 p-3 border border-border rounded-md bg-muted/5 text-muted-foreground text-sm">
                    great experience.
                </div>

                {isLoadingReviews ? (
                    <div className="space-y-4">
                    {[...Array(2)].map((_, i) => ( 
                        <div key={i} className="p-4 border rounded-xl animate-pulse">
                        <div className="flex items-center justify-between mb-2">
                            <div className="h-6 w-1/3 bg-muted rounded"></div>
                            <div className="h-4 w-12 bg-muted rounded"></div>
                        </div>
                        <div className="h-4 w-full bg-muted rounded mb-2"></div>
                        </div>
                    ))}
                    </div>
                ) : serviceReviews.length > 0 ? (
                    <ScrollArea className="h-[400px]">
                    <div className="space-y-4 pb-4">
                        {serviceReviews.map(review => (
                        <div key={review.id} className="p-4 border border-border rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-2">
                                <p className="font-bold text-sm sm:text-base text-foreground/90">{review.userName}</p>
                                <div className="flex items-center">
                                {[...Array(5)].map((_, i) => (
                                    <Star 
                                    key={i} 
                                    className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                                    />
                                ))}
                                </div>
                            </div>
                            <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">{review.comment}</p>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium mt-2">
                                <ShieldCheckIcon className="h-3.5 w-3.5 text-green-500" />
                                <span>Verified Customer</span>
                            </div>
                        </div>
                        ))}
                    </div>
                    </ScrollArea>
                ) : ( 
                    <p className="text-muted-foreground text-center py-8 text-base">No reviews yet for this service.</p> 
                )}
                </CardContent>
            </Card>
        </LazySection>
      )}

      <StickyCartContinueButton />
    </div>
  );
}
