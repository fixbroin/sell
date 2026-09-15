
"use client";

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { replacePlaceholders } from '@/lib/seoUtils';
import { doc, getDoc, collection, query, where, limit, getDocs, orderBy, Timestamp, documentId, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, FirestoreSEOSettings, FirestoreCity, FirestoreArea, FeaturesConfiguration, FirestoreService, FirestoreCategory, HomepageAd, AdPlacement } from '@/types/firestore';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { useLoading } from '@/contexts/LoadingContext';
import AppImage from '@/components/ui/AppImage';
import { Card, CardContent } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import { Star, Clock, ListChecks, Loader2, FileText, ShoppingCart, Users, Ban, Percent, Info } from 'lucide-react';
import AdBannerCard from '@/components/shared/AdBannerCard';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { getCache, setCache } from '@/lib/client-cache';
import Autoplay from "embla-carousel-autoplay";
import * as React from "react";
import QuantitySelector from '../shared/QuantitySelector';
import { getCartEntries, saveCartEntries, syncCartToFirestore } from '@/lib/cartManager';
import { useToast } from '@/hooks/use-toast';
import { getGuestId } from '@/lib/guestIdManager';
import { logUserActivity } from '@/lib/activityLogger';
import { Badge } from '@/components/ui/badge';
import type { HomepageData } from '@/lib/homepageUtils';
import { LazySection } from '@/components/shared/LazySection';
import CategoryCard from './CategoryCard';
import HomeCategoriesSection from '@/components/home/HomeCategoriesSection';

const isBot = (): boolean => {
  if (typeof window === 'undefined') return true;
  const botPatterns = [
      'bot', 'crawler', 'spider', 'crawling', 'googlebot', 'bingbot', 'yandexbot', 
      'slurp', 'duckduckbot', 'baiduspider', 'adsbot', 'mediapartners-google',
      'lighthouse', 'gtmetrix', 'pingdom', 'facebookexternalhit', 'whatsapp', 'linkedinbot'
  ];
  const ua = navigator.userAgent.toLowerCase();
  return botPatterns.some(pattern => ua.includes(pattern));
};

// Lazy load components
const HeroCarousel = dynamic(() => import('@/components/home/HeroCarousel').then((mod) => mod.HeroCarousel), {
  loading: () => <Skeleton className="h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] w-full rounded-lg" />,
});



const HomeBlogSection = dynamic(() => import('@/components/home/HomeBlogSection'), {
  loading: () => (
    <div className="flex w-full space-x-4 p-1 pb-3 overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="w-[250px] sm:w-[280px] flex-shrink-0 snap-start">
            <Skeleton className="h-32 sm:h-36 w-full" />
            <CardContent className="p-2 sm:p-3">
              <Skeleton className="h-4 w-3/4 mb-2" />
              <Skeleton className="h-3 w-full" />
               <Skeleton className="h-3 w-1/2 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
  )
});

const WhyChooseUs = dynamic(() => import('@/components/home/WhyChooseUs'), {
  loading: () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-lg" />)}
    </div>
  ),
});

const Testimonials = dynamic(() => import('@/components/home/Testimonials'), {
  loading: () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-56 w-full rounded-lg" />)}
    </div>
  ),
});

const ExploreByLocation = dynamic(() => import('@/components/shared/ExploreByLocation'), {
    loading: () => <Skeleton className="h-64 w-full rounded-xl" />
});

const SectionHeader: React.FC<{ 
  title: string; 
  icon?: React.ReactNode; 
  subtitle?: string; 
  centered?: boolean;
  isH1?: boolean;
}> = ({ title, icon, subtitle, centered = true, isH1 = false }) => {
  const TitleTag = isH1 ? 'h1' : 'h2';
  return (
    <div className={cn("mb-8 md:mb-12", centered ? "text-center" : "text-left")}>
        <TitleTag className={cn(
          "font-headline font-semibold text-foreground flex items-center gap-2", 
          isH1 ? "text-2xl md:text-4xl" : "text-xl md:text-3xl",
          centered ? "justify-center" : "justify-start"
        )}>
            {icon} {title}
        </TitleTag>
        {subtitle && <p className="text-muted-foreground mt-2 text-sm md:text-base max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  );
};

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";

const defaultFeaturesConfig: FeaturesConfiguration = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  showCustomServiceButton: false,
  homepageCategoryVisibility: {},
  ads: [],
};

interface HomePageClientProps {
  citySlug?: string;
  areaSlug?: string;
  breadcrumbItems?: BreadcrumbItem[];
  initialData?: HomepageData;
  initialH1Title?: string;
}

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

const HomepageServiceCard: React.FC<{ service: FirestoreService }> = ({ service }) => {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const router = useRouter();
  const { showLoading } = useLoading();
  const { user, triggerAuthRedirect } = useAuth();
  const [quantity, setQuantity] = useState(0);
  const { toast } = useToast();
  const currentPathname = usePathname();

  useEffect(() => {
    const syncQuantity = () => {
      const cartEntries = getCartEntries();
      const existingEntry = cartEntries.find(entry => entry.serviceId === service.id);
      setQuantity(existingEntry ? existingEntry.quantity : 0);
    };

    syncQuantity();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'yourbrandUserCart' || event.key === null) {
        syncQuantity();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [service.id]);

  const updateCart = (newQuantity: number) => {
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
    if(user?.uid) syncCartToFirestore(user.uid, cartEntries);

    window.dispatchEvent(new StorageEvent('storage', { key: 'yourbrandUserCart' }));
  };

  const handleQuantityChange = (newQuantity: number) => {
    const oldQuantity = quantity;
    if (newQuantity > 0 && oldQuantity === 0 && !user) {
      triggerAuthRedirect(currentPathname);
      return;
    }
    setQuantity(newQuantity);
    updateCart(newQuantity);
    
    if (newQuantity > oldQuantity) {
      toast({ title: "Cart Updated", description: `${service.name} quantity updated.` });
      logUserActivity('addToCart', { serviceId: service.id, serviceName: service.name, quantity: newQuantity - oldQuantity, price: service.price }, user?.uid, !user ? getGuestId() : null);
    } else if (newQuantity < oldQuantity) {
      if (newQuantity === 0) toast({ title: "Item Removed", description: `${service.name} removed from cart.` });
      logUserActivity('removeFromCart', { serviceId: service.id, serviceName: service.name, quantity: oldQuantity - newQuantity }, user?.uid, !user ? getGuestId() : null);
    }
  };

  const handleInitialAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (service.maxQuantity !== undefined && service.maxQuantity !== null && 1 > service.maxQuantity) {
        toast({ title: "Unavailable", description: `This service is currently not available.`});
        return;
    }
    const newQuantity = service.hasMinQuantity && service.minQuantity ? service.minQuantity : 1;
    handleQuantityChange(newQuantity);
  };

  const formatTaskTime = (value?: number | null, unit?: 'hours' | 'minutes' | null): string | null => {
    if (value === undefined || value === null || !unit) return null;
    if (value <= 0) return null;
    return `${value} ${unit}`;
  };
  const taskTimeDisplay = formatTaskTime(service.taskTimeValue, service.taskTimeUnit);

  const { mainPrice, priceSuffix, promoText } = getPriceDisplayInfo(service, quantity, symbol, decimals, code);

  const isAvailable = service.maxQuantity === undefined || service.maxQuantity === null || service.maxQuantity > 0;
  
  return (
    <Link 
      href={`/service/${service.slug}`}
      onClick={(e: React.MouseEvent) => {
        if (currentPathname === `/service/${service.slug}`) {
          e.preventDefault();
        } else {
          showLoading();
        }
      }}
      className="block h-full"
    >
      <Card className="cursor-pointer h-full flex flex-col hover:shadow-lg transition-shadow">
          <div className="relative w-full aspect-square bg-muted border-b border-border overflow-hidden rounded-t-lg">
              <AppImage src={service.imageUrl || "/default-image.png"} alt={service.name} fill sizes="200px" className="object-cover" />
          </div>
          <CardContent className="p-2 flex-grow flex flex-col justify-between">
              <div className="flex-grow">
                  <h4 className="text-xs sm:text-sm font-semibold truncate text-foreground group-hover:text-primary">{service.name}</h4>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-2">
                  <div className="flex items-center gap-1" title="Members required"><Users className="h-3.5 w-3.5 text-primary"/><span>{service.membersRequired || 1}</span></div>
                  {taskTimeDisplay && (<div className="flex items-center gap-1" title={`Estimated time: ${taskTimeDisplay}`}><Clock className="h-3.5 w-3.5 text-primary" /><span>{taskTimeDisplay}</span></div>)}
                  {service.rating > 0 && (<div className="flex items-center gap-1" title={`${service.rating.toFixed(1)} rating`}><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /><span>{service.rating.toFixed(1)}</span></div>)}
                  {service.reviewCount !== undefined && service.reviewCount > 0 && <span className="text-muted-foreground/80">({service.reviewCount})</span>}
              </div>
            </div>
              <div className="flex items-center justify-between mt-2">
               <div className="flex items-center gap-2">
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
                  </div>
                  {service.hasMinQuantity && service.minQuantity && service.minQuantity > 1 && (
                    <div className="flex items-center gap-1 text-[10px] text-amber-600 font-bold bg-amber-50 px-1 py-0.5 rounded border border-amber-100 w-fit">
                      Min. {service.minQuantity} units
                    </div>
                  )}
                </div>

                  {!isAvailable ? (
                      <Button size="sm" className="h-7 px-2 text-xs" disabled><Ban className="mr-1.5 h-3 w-3"/>Unavailable</Button>
                  ) : quantity === 0 ? (
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.preventDefault(); handleInitialAdd(e); }} >
                          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Add
                      </Button>
                  ) : (
                    <div onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} >
                      <QuantitySelector 
                          initialQuantity={quantity} 
                          onQuantityChange={handleQuantityChange}
                          minQuantity={0}
                          enforcedMinQuantity={service.hasMinQuantity ? service.minQuantity : 0}
                          maxQuantity={service.maxQuantity}
                      /> 
                    </div>
                  )}
              </div>
          </CardContent>
      </Card>
    </Link>
  );
};

const HomepageServiceCarousel: React.FC<{ services: FirestoreService[] }> = ({ services }) => {
  const plugin = React.useRef(Autoplay({ 
    delay: 3000, 
    stopOnInteraction: false, 
    stopOnMouseEnter: false, 
    stopOnLastSnap: false,
  }));

  return (
    <Carousel
      opts={{
          align: "start",
          loop: true,
      }}
      plugins={[plugin.current]}
      className="w-full"
    >
      <CarouselContent className="-ml-2 md:-ml-4">
        {services.map((service) => (
          <CarouselItem key={service.id} className="pl-2 md:pl-4 basis-[70%] sm:basis-1/2 md:basis-1/3 lg:basis-1/4 xl:basis-1/5">
            <div className="h-full">
              <HomepageServiceCard service={service} />
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden sm:flex" />
      <CarouselNext className="hidden sm:flex" />
    </Carousel>
  );
};

export default function HomePageClient({ citySlug, areaSlug, breadcrumbItems, initialData, initialH1Title }: HomePageClientProps) {
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const { settings } = useGlobalSettings();
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const isVisitorBot = React.useRef(isBot());
  const [structuredData, setStructuredData] = useState<Record<string, any> | null>(() => getCache<Record<string, any>>('structuredData', true) || null);
  const [seoSettings, setSeoSettings] = useState<FirestoreSEOSettings | null>(() => initialData?.seoSettings || getCache<FirestoreSEOSettings>('seoSettings', true) || null);
  const [pageH1, setPageH1] = useState<string | undefined>(() => initialH1Title || initialData?.seoSettings.homepageH1 || getCache<string>('pageH1', true) || undefined);
  const { showLoading } = useLoading();

  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfiguration>(() => initialData?.featuresConfig || getCache<FeaturesConfiguration>('featuresConfig', true) || defaultFeaturesConfig);
  const [popularServices, setPopularServices] = useState<FirestoreService[]>(() => initialData?.popularServices || getCache<FirestoreService[]>('popularServices', true) || []);
  const [recentServices, setRecentServices] = useState<FirestoreService[]>(() => initialData?.recentServices || getCache<FirestoreService[]>('recentServices', true) || []);
  const [categoryWiseServicesData, setCategoryWiseServicesData] = useState<Array<{category: FirestoreCategory, services: FirestoreService[] }>>(() => initialData?.categoryWiseServices || getCache<Array<{category: FirestoreCategory, services: FirestoreService[] }>>('categoryWiseServices', true) || []);
  const [activeAds, setActiveAds] = useState<HomepageAd[]>(() => (initialData?.featuresConfig.ads || getCache<FeaturesConfiguration>('featuresConfig', true)?.ads || []).filter(ad => ad.isActive).sort((a, b) => a.order - b.order));
  
  const [isLoadingPageData, setIsLoadingPageData] = useState(() => !initialData && !getCache('pageH1', true));
  const [isLoadingFeaturesConfig, setIsLoadingFeaturesConfig] = useState(() => !initialData && !getCache('featuresConfig', true));
  const [isLoadingPopular, setIsLoadingPopular] = useState(() => !initialData && !getCache('popularServices', true));
  const [isLoadingRecent, setIsLoadingRecent] = useState(() => !initialData && !getCache('recentServices', true));
  const [isLoadingCategoryWise, setIsLoadingCategoryWise] = useState(() => !initialData && !getCache('categoryWiseServices', true));
  const [citiesWithAreas, setCitiesWithAreas] = useState<FirestoreCity[]>(() => initialData?.citiesWithAreas || getCache<FirestoreCity[]>('citiesWithAreas', true) || []);

  const fetchPageSpecificData = useCallback(async () => {
    // If it's a bot, we don't need to do extra SEO/LD+JSON fetches on client
    // because the server already rendered the metadata and JSON-LD.
    if (isVisitorBot.current && !isAdmin) {
        setIsLoadingPageData(false);
        return;
    }

    const cachedH1 = getCache<string>('pageH1');
    const cachedSeoSettings = getCache<FirestoreSEOSettings>('seoSettings');
    const cachedStructuredData = getCache<Record<string, any>>('structuredData');
    
    if (initialData && !citySlug && !areaSlug) {
        setPageH1(initialH1Title || initialData.seoSettings.homepageH1);
        setIsLoadingPageData(false);
        return;
    }

    if (cachedH1 && cachedSeoSettings && cachedStructuredData && !initialData) {
        setPageH1(cachedH1);
        setSeoSettings(cachedSeoSettings);
        setStructuredData(cachedStructuredData);
        setIsLoadingPageData(false);
        return;
    }
    
    setIsLoadingPageData(true);
    try {
      let currentSeoSettings = seoSettings;
      if (!currentSeoSettings) {
          const settingsDocRef = doc(db, 'seoSettings', 'global');
          const docSnap = await getDoc(settingsDocRef);
          if (docSnap.exists()) {
            currentSeoSettings = docSnap.data() as FirestoreSEOSettings;
            setSeoSettings(currentSeoSettings);
            setCache('seoSettings', currentSeoSettings);
          }
      }

      if (!currentSeoSettings) return;

      const fetchedSeoSettings = currentSeoSettings;
      let currentH1 = initialH1Title || fetchedSeoSettings.homepageH1;
      let fetchedCityData: FirestoreCity | null = null;
      let fetchedAreaData: FirestoreArea | null = null;
      let currentCityNameForLd = fetchedSeoSettings.structuredDataLocality;

      if (citySlug) {
        try {
            const cityQuery = query(collection(db, 'cities'), where('slug', '==', citySlug), where('isActive', '==', true), limit(1));
            const citySnap = await getDocs(cityQuery);
            if (!citySnap.empty) {
                fetchedCityData = {id: citySnap.docs[0].id, ...(citySnap.docs[0].data() as Omit<FirestoreCity, 'id'>)} as FirestoreCity;
                currentH1 = initialH1Title || fetchedCityData.h1_title || fetchedSeoSettings.homepageH1?.replace("Yourbrand", fetchedCityData.name) || `Services in ${fetchedCityData.name}`;
                currentCityNameForLd = fetchedCityData.name;
            }
        } catch (e) { console.error("Error fetching city data for H1/LD:", e); }
      }

      if (citySlug && areaSlug && fetchedCityData) {
        try {
            const areaQuery = query(collection(db, 'areas'), where('slug', '==', areaSlug), where('cityId', '==', fetchedCityData.id), where('isActive', '==', true), limit(1));
            const areaSnap = await getDocs(areaQuery);
            if (!areaSnap.empty) {
                fetchedAreaData = {id: areaSnap.docs[0].id, ...(areaSnap.docs[0].data() as Omit<FirestoreArea, 'id'>)} as FirestoreArea;
                currentH1 = initialH1Title || fetchedAreaData.h1_title || `Services in ${fetchedAreaData.name}, ${fetchedCityData.name}`;
            }
        } catch (e) { console.error("Error fetching area data for H1/LD:", e); }
      }
      setPageH1(currentH1);
      setCache('pageH1', currentH1);

      const siteName = fetchedSeoSettings.siteName || 'Yourbrand';
      const defaultOgImage = (process.env.NEXT_PUBLIC_BASE_URL || 'https://yourdomain') + '/android-chrome-512x512.png';

      let webSettingsData: GlobalWebSettings | null = null;
      try {
        const webSettingsDocRef = doc(db, "webSettings", "global");
        const webSettingsSnap = await getDoc(webSettingsDocRef);
        if (webSettingsSnap.exists()) {
          webSettingsData = webSettingsSnap.data() as GlobalWebSettings;
        }
      } catch (e) { console.error("Error fetching webSettings for LD+JSON:", e); }

      const ogImage = webSettingsData?.websiteIconUrl || webSettingsData?.logoUrl || fetchedSeoSettings.structuredDataImage || defaultOgImage;
      const pageUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://yourdomain';
      let specificPageUrl = pageUrl;
      if (citySlug && areaSlug) specificPageUrl = `${pageUrl}/${citySlug}/${areaSlug}`;
      else if (citySlug) specificPageUrl = `${pageUrl}/${citySlug}`;

      const ldData: Record<string, any> = {
        '@context': 'https://schema.org',
        '@type': fetchedSeoSettings.structuredDataType || 'LocalBusiness',
        name: fetchedAreaData?.name ? `${siteName} - ${fetchedAreaData.name}, ${fetchedCityData?.name}` : (fetchedCityData?.name ? `${siteName} - ${fetchedCityData.name}` : (fetchedSeoSettings.structuredDataName || siteName)),
        image: ogImage,
        url: specificPageUrl,
        telephone: webSettingsData?.contactMobile || fetchedSeoSettings.structuredDataTelephone,
        // Brand-level rating for the homepage
        aggregateRating: {
          "@type": "AggregateRating",
          "ratingValue": fetchedSeoSettings.fallbackRatingValue || "4.8",
          "reviewCount": fetchedSeoSettings.fallbackReviewCount || "1250"
        }
      };
      if (webSettingsData?.contactEmail) ldData.email = webSettingsData.contactEmail;

      const addressData: Record<string, any> = { '@type': 'PostalAddress' };
      if (fetchedAreaData?.name) addressData.addressLocality = fetchedAreaData.name;
      else if (fetchedCityData?.name) addressData.addressLocality = fetchedCityData.name;
      else if (fetchedSeoSettings.structuredDataLocality) addressData.addressLocality = fetchedSeoSettings.structuredDataLocality;

      if (fetchedCityData?.name && fetchedAreaData?.name) addressData.addressRegion = fetchedCityData.name;
      else if (fetchedSeoSettings.structuredDataRegion) addressData.addressRegion = fetchedSeoSettings.structuredDataRegion;

      if (fetchedSeoSettings.structuredDataStreetAddress) addressData.streetAddress = fetchedSeoSettings.structuredDataStreetAddress;
      if (fetchedSeoSettings.structuredDataPostalCode) addressData.postalCode = fetchedSeoSettings.structuredDataPostalCode;
      addressData.addressCountry = fetchedSeoSettings.structuredDataCountry || 'IN';

      if (Object.keys(addressData).length > 1) {
          ldData.address = addressData;
      }

      if (fetchedSeoSettings.socialProfileUrls) {
        const sameAsUrls = Object.values(fetchedSeoSettings.socialProfileUrls).filter(url => url && url.trim() !== '');
        if (sameAsUrls.length > 0) {
          ldData.sameAs = sameAsUrls;
        }
      }
      setStructuredData(ldData);
      setCache('structuredData', ldData);
      setIsLoadingPageData(false);
    } catch (error) {
      console.error("Error in fetchPageSpecificData:", error);
      setIsLoadingPageData(false);
    }
  }, [citySlug, areaSlug, initialData, seoSettings, initialH1Title]);

  const setupRealtimeListeners = useCallback(() => {
    // CRITICAL: We only want real-time listeners for ADMINS to see live changes.
    // Regular visitors should ONLY use the cached data from initialData.
    if (isVisitorBot.current || !isAdmin) {
        setIsLoadingFeaturesConfig(false);
        setIsLoadingPopular(false);
        setIsLoadingRecent(false);
        return () => {}; // No-op cleanup
    }

    // 1. Features Config Listener (Admins Only)
    const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
    const unsubscribeConfig = onSnapshot(configDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const config = { ...defaultFeaturesConfig, ...(docSnap.data() as Partial<FeaturesConfiguration>) };
        setFeaturesConfig(config);
        setCache('featuresConfig', config, true);
        setActiveAds((config.ads || []).filter(ad => ad.isActive).sort((a, b) => a.order - b.order));
        setIsLoadingFeaturesConfig(false);
      }
    }, (error) => console.error("Error listening to features config:", error));

    // 2. Popular Services Listener
    const popularQuery = query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("rating", "desc"), orderBy("reviewCount", "desc"), limit(10));
    const unsubscribePopular = onSnapshot(popularQuery, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FirestoreService, 'id'>) } as FirestoreService));
      setPopularServices(data);
      setCache('popularServices', data, true);
      setIsLoadingPopular(false);
    }, (error) => console.error("Error listening to popular services:", error));

    // 3. Recent Services Listener
    const recentQuery = query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("createdAt", "desc"), limit(10));
    const unsubscribeRecent = onSnapshot(recentQuery, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<FirestoreService, 'id'>) } as FirestoreService));
      setRecentServices(data);
      setCache('recentServices', data, true);
      setIsLoadingRecent(false);
    }, (error) => console.error("Error listening to recent services:", error));

    return () => {
      unsubscribeConfig();
      unsubscribePopular();
      unsubscribeRecent();
    };
  }, []);

  useEffect(() => {
    setIsMounted(true);
    if (initialData) {
      setCache('featuresConfig', initialData.featuresConfig, true);
      setCache('popularServices', initialData.popularServices, true);
      setCache('recentServices', initialData.recentServices, true);
      setCache('categoryWiseServices', initialData.categoryWiseServices, true);
      setCache('seoSettings', initialData.seoSettings, true);
      setCache('citiesWithAreas', initialData.citiesWithAreas, true);
    }
    
    if (!isLoadingAppSettings) {
      fetchPageSpecificData();
    }

    const cleanupListeners = setupRealtimeListeners();

    return () => {
      if (cleanupListeners) cleanupListeners();
    };
  }, [isLoadingAppSettings, initialData, fetchPageSpecificData, setupRealtimeListeners]);

  // CATEGORY WISE SERVICES (Still manual fetch as it involves complex multi-step queries)
  const fetchCategoryWiseData = useCallback(async (currentFeaturesConfig: FeaturesConfiguration) => {
    if (!currentFeaturesConfig.showCategoryWiseServices) return;
    
    // If we have initialData or it's a bot, we don't need to re-fetch this on client
    if (initialData?.categoryWiseServices || isVisitorBot.current) {
        setIsLoadingCategoryWise(false);
        return;
    }

    try {
        const enabledCategoryIds = Object.entries(currentFeaturesConfig.homepageCategoryVisibility || {})
            .filter(([, isVisible]) => isVisible)
            .map(([catId]) => catId);

        if (enabledCategoryIds.length > 0) {
            const categoriesQuery = query(collection(db, "adminCategories"), where(documentId(), "in", enabledCategoryIds), where("isActive", "==", true), orderBy("order", "asc"));
            const categoriesSnapshot = await getDocs(categoriesQuery);
            const enabledCategories = categoriesSnapshot.docs.map(d => ({...d.data(), id: d.id } as FirestoreCategory));
            
            const categoryServicesPromises = enabledCategories.map(async (cat) => {
                    const subCategoriesSnapshot = await getDocs(query(collection(db, "adminSubCategories"), where("parentId", "==", cat.id), where("isActive", "==", true)));
                const subCategoryIds = subCategoriesSnapshot.docs.map(subDoc => subDoc.id);

                let servicesForCategory: FirestoreService[] = [];
                if (subCategoryIds.length > 0) {
                        const servicesQuery = query(collection(db, "adminServices"), where("isActive", "==", true), where("subCategoryId", "in", subCategoryIds), orderBy("name", "asc"));
                        const servicesSnapshot = await getDocs(servicesQuery);
                        servicesForCategory = servicesSnapshot.docs
                            .map(sDoc => ({...sDoc.data() as Omit<FirestoreService, 'id'>, id: sDoc.id} as FirestoreService))
                            .sort((a, b) => (a.order || 0) - (b.order || 0))
                            .slice(0, 10);
                }
                return { category: cat, services: servicesForCategory };
            });
            const resolvedCategoryServices = (await Promise.all(categoryServicesPromises)).filter(cs => cs.services.length > 0);
            setCategoryWiseServicesData(resolvedCategoryServices);
            setCache('categoryWiseServices', resolvedCategoryServices, true);
        } else {
            setCategoryWiseServicesData([]);
        }
    } catch (e) { console.error("Error fetching category-wise services:", e); }
    setIsLoadingCategoryWise(false);
  }, []);

  useEffect(() => {
      if (featuresConfig) {
          fetchCategoryWiseData(featuresConfig);
      }
  }, [featuresConfig, fetchCategoryWiseData]);

  const handleSimpleNavigation = useCallback((intendedHref: string) => {
    showLoading();
    router.push(intendedHref);
  }, [router, showLoading]);

  const handleViewAllCategoriesClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      handleSimpleNavigation("/categories");
  }, [handleSimpleNavigation]);

  const handleBookServiceCtaClick = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
      if (e) e.preventDefault();
      handleSimpleNavigation("/categories");
  }, [handleSimpleNavigation]);

  const displayHeroCarousel = isLoadingAppSettings ? true : (appConfig.enableHeroCarousel ?? true);
  const finalH1 = pageH1 || initialH1Title || (citySlug || areaSlug 
    ? `Professional Home Services in ${areaSlug || citySlug}`.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    : "Discover Our Services");
  
  const renderAdsByPlacement = (placement: AdPlacement) => {
    const adsForPlacement = activeAds.filter(ad => ad.placement === placement);
    if (adsForPlacement.length === 0) return null;
    return (
      <div className="container mx-auto px-0 md:px-4 my-2 md:my-4 space-y-2">
        {adsForPlacement.map(ad => <AdBannerCard key={ad.id} ad={ad} />)}
      </div>
    );
  };
  
  const renderServiceSection = (title: string, services: FirestoreService[], icon: React.ReactNode, isLoadingSection: boolean, placementForAdsAfter?: AdPlacement) => {
    if (isLoadingSection && services.length === 0) { // Only show skeleton if no cached data available
      return (
        <section className="py-8 md:py-10">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground flex items-center justify-center">
              {icon} {title}
            </h2>
            <div className="flex w-full space-x-4 p-1 pb-3 overflow-hidden">
                {[...Array(5)].map((_, i) => (
                  <Card key={i} className="w-[200px] sm:w-[220px] flex-shrink-0 snap-start">
                    <Skeleton className="h-28 sm:h-32 w-full" />
                    <CardContent className="p-2 sm:p-3">
                      <Skeleton className="h-4 w-3/4 mb-1" />
                      <Skeleton className="h-3 w-1/2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
          </div>
        </section>
      );
    }
    if (services.length === 0 && !isLoadingSection) return null; 
    return (
        <>
        <section className="py-8 md:py-10">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 md:mb-12 text-foreground flex items-center justify-center">
                    {icon} {title}
                </h2>
                <HomepageServiceCarousel services={services} />
            </div>
        </section>
        {placementForAdsAfter && renderAdsByPlacement(placementForAdsAfter)}
        </>
    );
  };

  if (!isMounted || isLoadingPageData) { // Simplified initial skeleton
    return (
        <div className="flex flex-col">
            <div className="container mx-auto px-4 pt-4 md:pt-6 mb-4 md:mb-6">
                <Skeleton className="h-5 w-1/3" />
            </div>
            <section className="py-6 md:py-10">
                <div className="container mx-auto px-4">
                    <Skeleton className="h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] w-full rounded-lg" />
                </div>
            </section>
            <div className="container mx-auto px-4 my-6 md:my-8"><Skeleton className="h-24 w-full rounded-lg" /></div>
            <section className="py-8 md:py-10 bg-secondary/30">
                <div className="container mx-auto px-4">
                    <div className="text-center mb-8 md:mb-12"><Skeleton className="h-8 w-1/2 mx-auto mb-2" /><Skeleton className="h-4 w-3/4 mx-auto" /></div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-4">
                        {[...Array(6)].map((_, i) => (<div key={i} className="overflow-hidden h-full flex flex-col group"><Skeleton className="w-full aspect-square bg-muted" /><div className="p-3 text-center"><Skeleton className="h-5 w-3/4 mx-auto bg-muted mt-1" /></div></div>))}
                    </div>
                </div>
            </section>
        </div>
    );
  }

  return (
    <>
      {structuredData && <JsonLdScript data={structuredData} idSuffix={citySlug || areaSlug || 'homepage'} />}
      <div className="flex flex-col">
        {breadcrumbItems && breadcrumbItems.length > 0 && (
            <div className="container mx-auto px-4 pt-4 md:pt-6">
               <Breadcrumbs items={breadcrumbItems} />
            </div>
        )}
        {displayHeroCarousel && (
          <section className="py-6 md:py-10">
            <div className="container mx-auto px-4 overflow-hidden">
              <HeroCarousel />
            </div>
          </section>
        )}
        {renderAdsByPlacement('AFTER_HERO_CAROUSEL')}

        <section className="py-8 md:py-10 bg-secondary/30">
          <div className="container mx-auto px-4">
            <SectionHeader 
                title={finalH1} 
                isH1={true}
                subtitle={`Discover a wide range of services to meet your needs${citySlug ? ` in ${citySlug.charAt(0).toUpperCase() + citySlug.slice(1).replace(/-/g, ' ')}` : ''}${areaSlug ? `, ${areaSlug.charAt(0).toUpperCase() + areaSlug.slice(1).replace(/-/g, ' ')}` : ''}.`}
            />
            <HomeCategoriesSection initialCategories={initialData?.allCategories} />
            
            <div className="text-center mt-8 md:mt-12">
              <Button
                variant="outline"
                size="lg"
                onClick={handleViewAllCategoriesClick}
              >
                View All Categories
              </Button>
            </div>
          </div>
        </section>
        
        {featuresConfig.showMostPopularServices && (
            <LazySection>
                {renderServiceSection("Most Popular Services", popularServices, <Star className="h-6 w-6 text-yellow-500" />, isLoadingPopular, 'AFTER_POPULAR_SERVICES')}
            </LazySection>
        )}
        {featuresConfig.showRecentlyAddedServices && (
            <LazySection>
                {renderServiceSection("Recently Added Services", recentServices, <Clock className="h-6 w-6 text-blue-500" />, isLoadingRecent, 'AFTER_RECENTLY_ADDED_SERVICES')}
            </LazySection>
        )}
        
        {featuresConfig.showCategoryWiseServices && (
            <LazySection>
                <section className="py-8 md:py-10">
                    <div className="container mx-auto px-4">
                        <SectionHeader title="Services By Category" icon={<ListChecks className="h-6 w-6 text-green-500" />} />
                        
                        {(isLoadingCategoryWise && categoryWiseServicesData.length === 0) ? (
                            <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : categoryWiseServicesData.length > 0 ? (
                            categoryWiseServicesData.map(catGroup => (
                                <div key={catGroup.category.id} className="mb-8">
                                    <h3 className="text-xl font-semibold mb-4 text-left text-foreground border-l-4 border-primary pl-3">{catGroup.category.name}</h3>
                                    {catGroup.services.length > 0 ? (
                                        <HomepageServiceCarousel services={catGroup.services} />
                                    ) : ( <p className="text-sm text-muted-foreground ml-4">No services currently available in this category.</p> )}
                                </div>
                            ))
                        ) : (<p className="text-center text-muted-foreground">No category-specific services to display currently.</p>)}
                    </div>
                </section>
                {renderAdsByPlacement('AFTER_CATEGORY_SECTIONS')}
            </LazySection>
        )}

        <LazySection>
            <section className="py-8 md:py-10">
            <div className="container mx-auto px-4">
                <SectionHeader title="Why Choose Yourbrand?" />
                <WhyChooseUs />
            </div>
            </section>
        </LazySection>

        <LazySection>
            <section className="py-8 md:py-10 bg-secondary/30">
            <div className="container mx-auto px-4">
                <SectionHeader title="What Our Customers Say" />
                <Testimonials />
            </div>
            </section>
        </LazySection>
        
        {featuresConfig.showBlogSection && (
            <LazySection>
                <HomeBlogSection />
            </LazySection>
        )}
        
        {/* New "Explore by Location" Section */}
        <LazySection>
            <ExploreByLocation 
                initialData={initialData?.citiesWithAreas} 
                categories={initialData?.allCategories}
            />
        </LazySection>
        
        <LazySection>
            <section className="py-12 md:py-16 bg-background">
                <div className="container mx-auto px-4">
                    <div className="max-w-4xl mx-auto text-center">
                        <h2 className="text-2xl md:text-3xl font-headline font-semibold mb-6 text-foreground">
                            Home Services in Bangalore
                        </h2>
                        <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground">
                            <p>
                                Yourbrand is your one-stop solution for all <strong>home services in Bangalore</strong>. Whether you are looking for a <strong>carpenter near me</strong>, a professional <strong>plumber in Bangalore</strong>, or an <strong>electrician in Whitefield</strong>, we have you covered. Our platform connects you with verified, background-checked experts for over 50+ services including AC repair, house cleaning, painting, and appliance maintenance.
                            </p>
                            <p>
                                We currently serve all major localities in Bangalore, including <strong>Whitefield, HSR Layout, Koramangala, Indiranagar, Electronic City, and Jayanagar</strong>. With upfront pricing, same-day service availability, and a 99.9% satisfaction guarantee, Yourbrand is Bangalore's most trusted home maintenance partner.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </LazySection>

        {renderAdsByPlacement('BEFORE_FOOTER_CTA')}
        <section className="py-8 md:py-10 text-center bg-primary text-primary-foreground">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-headline font-semibold mb-4">
              {settings.homepageContent?.footerCTA?.title || "Ready to get started?"}
            </h2>
            <p className="text-lg mb-6 max-w-xl mx-auto">
              {settings.homepageContent?.footerCTA?.subtitle || "Book your service today and experience the Yourbrand difference."}
            </p>
            <Button
              size="lg"
              variant="secondary"
              className="bg-background text-primary hover:bg-background/90"
              onClick={() => {
                if (settings.homepageContent?.footerCTA?.buttonLink) {
                    showLoading();
                    router.push(settings.homepageContent.footerCTA.buttonLink);
                } else {
                    handleBookServiceCtaClick();
                }
              }}
            >
              {settings.homepageContent?.footerCTA?.buttonText || "Book a Service"}
            </Button>
          </div>
        </section>
      </div>
    </>
  );
}
