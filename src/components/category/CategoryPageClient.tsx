"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { 
  FirestoreCategory, 
  FirestoreSubCategory, 
  FirestoreService, 
  FirestoreCity, 
  FirestoreArea, 
  CityCategorySeoSetting, 
  AreaCategorySeoSetting, 
  FirestoreReview, 
  FirestoreSEOSettings,
  FaqItem
} from '@/types/firestore';
import ServiceCard from '@/components/service/ServiceCard';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home as HomeIconLucide, PackageSearch, Loader2, Construction, ChevronLeft, ChevronRight, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { getOverriddenCategoryName } from '@/lib/adminDataOverrides';
import { Skeleton } from '@/components/ui/skeleton';
import AppImage from '@/components/ui/AppImage';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, onSnapshot } from '@/lib/mysqlDb';
import { useToast } from '@/hooks/use-toast';
import StickyCartContinueButton from '@/components/category/StickyCartContinueButton';
import { useAuth } from '@/hooks/useAuth';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { replacePlaceholders, defaultSeoValues } from '@/lib/seoUtils';
import { getSpinnedLocalContent } from '@/lib/seoGenerator';
import { useLoading } from '@/contexts/LoadingContext';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { cn } from '@/lib/utils';
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig';
import SubCategoryCard from '@/components/category/SubCategoryCard';
import SubCategoryFloatingButton from '@/components/category/SubCategoryFloatingButton';
import type { FullCategoryData } from '@/lib/homepageUtils';
import { LazySection } from '@/components/shared/LazySection';
import { getCategorySearchTerm } from '@/lib/seoAdvancedUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import LocalitiesInterlinking from '@/components/category/LocalitiesInterlinking';
import CitiesInterlinking from '@/components/category/CitiesInterlinking';

interface EnrichedSubCategory extends FirestoreSubCategory {
  services: FirestoreService[];
  isLoadingServices: boolean;
  hasStartedLoading?: boolean;
}

interface CategoryPageCache {
  category: FirestoreCategory | null;
  subCategories: EnrichedSubCategory[];
  h1: string | null;
  displayH1: string | null;
  breadcrumbs: BreadcrumbItem[];
  reviews?: FirestoreReview[];
}


interface CategoryPageClientProps {
  categorySlug: string;
  citySlug?: string;
  areaSlug?: string;
  cityName?: string;
  areaName?: string;
  breadcrumbItems?: BreadcrumbItem[];
  initialData?: FullCategoryData;
  initialH1Title?: string;
}

export default function CategoryPageClient({ 
  categorySlug, 
  citySlug, 
  areaSlug, 
  cityName: propCityName,
  areaName: propAreaName,
  breadcrumbItems: initialBreadcrumbItems, 
  initialData,
  initialH1Title
}: CategoryPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading();
  const currentPathname = usePathname();
  const { featuresConfig } = useFeaturesConfig();

  const cacheKey = `category-data-${categorySlug}-${citySlug || 'none'}-${areaSlug || 'none'}`;

  const [category, setCategory] = useState<FirestoreCategory | null>(() => initialData?.category || getCache<CategoryPageCache>(cacheKey, true)?.category || null);
  const [subCategoriesWithServices, setSubCategoriesWithServices] = useState<EnrichedSubCategory[]>(() => {
    if (initialData) {
        return initialData.subCategories.map(sc => ({ ...sc, isLoadingServices: false, hasStartedLoading: true }));
    }
    return getCache<CategoryPageCache>(cacheKey, true)?.subCategories || [];
  });
  const [activeSubCategorySlug, setActiveSubCategorySlug] = useState<string | null>(() => initialData?.subCategories[0]?.slug || getCache<CategoryPageCache>(cacheKey, true)?.subCategories[0]?.slug || null);
  const [breadcrumbItems, setBreadcrumbItems] = useState<BreadcrumbItem[]>(initialBreadcrumbItems || getCache<CategoryPageCache>(cacheKey, true)?.breadcrumbs || []);
  
  const [isLoading, setIsLoading] = useState(() => !initialData && !getCache(cacheKey, true));
  const [error, setError] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [manuallyAwakenedSubCats, setManuallyAwakenedSubCats] = useState<Set<string>>(new Set());
  const pendingScrollRef = useRef<string | null>(null);

  const [seoPageH1, setSeoPageH1] = useState<string | null>(() => initialH1Title || initialData?.category.h1_title || getCache<CategoryPageCache>(cacheKey, true)?.h1 || null);
  const [displayPageH1, setDisplayPageH1] = useState<string | null>(() => initialH1Title || initialData?.category.h1_title || getCache<CategoryPageCache>(cacheKey, true)?.displayH1 || null);
  
  const [seoContent, setSeoContent] = useState<string | null>(() => {
    let raw: string | null = null;
    
    if (areaSlug) {
      if (initialData?.areaCategorySeo?.seo_content) {
        raw = initialData.areaCategorySeo.seo_content;
      } else {
        const currentAreaObj = initialData?.availableAreas?.find(a => a.slug === areaSlug);
        let fallbackNearby: Array<{ id: string; name: string; slug: string }> = [];
        if (initialData?.areaData?.nearbyAreas && initialData.areaData.nearbyAreas.length > 0) {
          fallbackNearby = [...initialData.areaData.nearbyAreas];
        }
        if (initialData?.availableAreas) {
          const currentAreaId = currentAreaObj?.id || "";
          const cityAreas = initialData.availableAreas.filter(a => a.id !== currentAreaId);
          for (const a of cityAreas) {
            if (fallbackNearby.length >= 10) break;
            if (!fallbackNearby.some(existing => existing.id === a.id)) {
              fallbackNearby.push({ id: a.id, name: a.name, slug: a.slug });
            }
          }
        }

        return getSpinnedLocalContent({
          cityName: propCityName || initialData?.availableCities?.find(c => c.slug === citySlug)?.name || citySlug?.replace(/-/g, ' ') || "Bangalore",
          areaName: propAreaName || currentAreaObj?.name || areaSlug?.replace(/-/g, ' ') || "",
          categoryName: initialData?.category.name || "Services",
          nearbyAreas: fallbackNearby
        });
      }
    } else if (citySlug) {
      if (initialData?.cityCategorySeo?.seo_content) {
        raw = initialData.cityCategorySeo.seo_content;
      } else {
        const fallbackNearby = initialData?.availableAreas ? initialData.availableAreas.slice(0, 10).map(a => ({
          id: a.id,
          name: a.name,
          slug: a.slug
        })) : [];

        return getSpinnedLocalContent({
          cityName: propCityName || initialData?.availableCities?.find(c => c.slug === citySlug)?.name || citySlug?.replace(/-/g, ' ') || "Bangalore",
          categoryName: initialData?.category.name || "Services",
          nearbyAreas: fallbackNearby
        });
      }
    } else {
        raw = initialData?.category.seo_content || null;
    }
    
    if (raw && initialData) {
        return replacePlaceholders(raw, {
            cityName: propCityName || initialData.availableCities?.find(c => c.slug === citySlug)?.name || citySlug?.replace(/-/g, ' ') || "Bangalore",
            areaName: propAreaName || initialData.availableAreas?.find(a => a.slug === areaSlug)?.name || areaSlug?.replace(/-/g, ' ') || "",
            categoryName: initialData.category.name
        });
    }
    return raw;
  });

  const [faqs, setFaqs] = useState<FaqItem[]>(() => {
    const areaFaqsTemplate = initialData?.seoSettings?.areaCategoryFaqsTemplate || defaultSeoValues.areaCategoryFaqsTemplate;
    const cityFaqsTemplate = initialData?.seoSettings?.cityCategoryFaqsTemplate || defaultSeoValues.cityCategoryFaqsTemplate;
    
    let rawFaqs: FaqItem[] = [];
    
    if (areaSlug) {
        rawFaqs = initialData?.areaCategorySeo?.faqs || 
                  (areaFaqsTemplate && areaFaqsTemplate.length > 0 ? areaFaqsTemplate : []) ||
                  initialData?.cityCategorySeo?.faqs || 
                  (cityFaqsTemplate && cityFaqsTemplate.length > 0 ? cityFaqsTemplate : []) ||
                  initialData?.category.faqs || [];
    } else if (citySlug) {
        rawFaqs = initialData?.cityCategorySeo?.faqs || 
                  (cityFaqsTemplate && cityFaqsTemplate.length > 0 ? cityFaqsTemplate : []) ||
                  initialData?.category.faqs || [];
    } else {
        rawFaqs = initialData?.category.faqs || [];
    }
    
    if (rawFaqs.length > 0 && initialData) {
        const pData = {
            cityName: propCityName || initialData.availableCities?.find(c => c.slug === citySlug)?.name || citySlug?.replace(/-/g, ' ') || "Bangalore",
            areaName: propAreaName || initialData.availableAreas?.find(a => a.slug === areaSlug)?.name || areaSlug?.replace(/-/g, ' ') || "",
            categoryName: initialData.category.name
        };
        return rawFaqs.map(f => ({
            question: replacePlaceholders(f.question, pData),
            answer: replacePlaceholders(f.answer, pData)
        }));
    }
    return rawFaqs;
  });

  const subCategoryRefs = useRef<Record<string, HTMLElement | null>>({});
  const stickyNavRef = useRef<HTMLDivElement | null>(null);
  const [loadingSubCats, setLoadingSubCats] = useState<Set<string>>(new Set());

  const [carouselApi, setCarouselApi] = useState<CarouselApi>();

  // State for scroll-responsive header sync
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);
  const [headerHeight, setHeaderHeight] = useState(64);

  const loadSubCategoryServices = useCallback(async (subCategoryId: string) => {
    if (loadingSubCats.has(subCategoryId)) return;
    
    // Check if already has data or is loading
    const currentSubCat = subCategoriesWithServices.find(sc => sc.id === subCategoryId);
    if (currentSubCat && (currentSubCat.services.length > 0 || currentSubCat.hasStartedLoading)) return;

    setLoadingSubCats(prev => new Set(prev).add(subCategoryId));
    
    try {
        const servicesRef = collection(db, "adminServices");
        const qServices = query(servicesRef, where("subCategoryId", "==", subCategoryId), where("isActive", "==", true), orderBy("name", "asc"));
        const snapshot = await getDocs(qServices);
        const services = snapshot.docs
            .map(serviceDoc => ({ id: serviceDoc.id, ...serviceDoc.data() } as FirestoreService))
            .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
        
        setSubCategoriesWithServices(prevSubCats => {
            const updated = prevSubCats.map(subCat => 
                subCat.id === subCategoryId 
                    ? { ...subCat, services, isLoadingServices: false, hasStartedLoading: true }
                    : subCat
            );
            
            // Auto-update cache for instant back-navigation
            const currentCache = getCache<CategoryPageCache>(cacheKey, true);
            if (currentCache) {
                setCache(cacheKey, { ...currentCache, subCategories: updated }, true);
            }
            return updated;
        });
    } catch (error) {
        console.error(`Error loading services for ${subCategoryId}:`, error);
    } finally {
        setLoadingSubCats(prev => {
            const next = new Set(prev);
            next.delete(subCategoryId);
            return next;
        });
    }
  }, [cacheKey, subCategoriesWithServices, loadingSubCats]);

  useEffect(() => {
    setIsMounted(true);
    
    // Measure actual header height if possible
    const headerElement = document.querySelector('[data-site-header]');
    if (headerElement) {
        setHeaderHeight(headerElement.clientHeight);
    }

    if (initialData) {
      setCache(cacheKey, {
        category: initialData.category,
        subCategories: initialData.subCategories.map(sc => ({ ...sc, isLoadingServices: false, hasStartedLoading: true })),
        h1: initialH1Title || initialData.category.h1_title || null,
        displayH1: initialH1Title || initialData.category.h1_title || null,
        breadcrumbs: initialBreadcrumbItems || []
      }, true);
    }
  }, [initialData, cacheKey, initialBreadcrumbItems, initialH1Title]);
  
  // Effect for scroll-responsive header and sub-nav bar
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const controlHeader = () => {
      const currentScrollY = window.scrollY;
      // Re-measure header if needed
      if (currentScrollY < 100) {
          const headerElement = document.querySelector('[data-site-header]');
          if (headerElement && headerElement.clientHeight > 0) {
              setHeaderHeight(headerElement.clientHeight);
          }
      }

      if (currentScrollY < lastScrollY.current || currentScrollY < 80) {
        setIsHeaderVisible(true);
      } else {
        setIsHeaderVisible(false);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener('scroll', controlHeader, { passive: true });
    return () => {
      window.removeEventListener('scroll', controlHeader);
    };
  }, []);


  useEffect(() => {
    const fetchCategoryAndSubcategories = async () => {
      if (!categorySlug || !isMounted) {
        return;
      }

      if (initialData) {
          setIsLoading(false);
          // Pre-load first subcategory services if not already there
          if (initialData.subCategories.length > 0) loadSubCategoryServices(initialData.subCategories[0].id);
          return;
      }

      // --- SmartSync: Version Checking (deduplicated client-side read) ---
      let remoteVersion = 0;
      try {
        const remoteVersions = await getRemoteCacheVersions();
        remoteVersion = remoteVersions.services || 0;
      } catch (e) { console.warn("Failed to fetch cache versions:", e); }

      const localVersionKey = `category-version-${categorySlug}`;
      const localVersion = parseInt(localStorage.getItem(localVersionKey) || "0");
      const cachedData = getCache<CategoryPageCache>(cacheKey, true);

      if (cachedData && remoteVersion <= localVersion) {
        setCategory(cachedData.category);
        setSubCategoriesWithServices(cachedData.subCategories);
        setSeoPageH1(cachedData.h1);
        setDisplayPageH1(cachedData.displayH1);
        setBreadcrumbItems(cachedData.breadcrumbs);
        setIsLoading(false);
        if (cachedData.subCategories.length > 0 && !activeSubCategorySlug) {
            setActiveSubCategorySlug(cachedData.subCategories[0].slug);
        }
        // Force-load visible ones from cache instantly
        cachedData.subCategories.forEach(sc => {
            if (sc.hasStartedLoading) loadSubCategoryServices(sc.id);
        });
        return;
      }

      setIsLoading(true);
      setError(null);


      try {
        const categoriesRef = collection(db, "adminCategories");
        const qCategory = query(categoriesRef, where("slug", "==", categorySlug), where("isActive", "==", true), limit(1));
        const categorySnapshot = await getDocs(qCategory);

        if (categorySnapshot.empty) {
          setError(`Category "${categorySlug}" not found or is not active.`);
          toast({ title: "Not Found", description: `The category "${categorySlug}" could not be found or is inactive.`, variant: "destructive"});
          setIsLoading(false);
          return;
        }

        const foundCategory = { id: categorySnapshot.docs[0].id, ...categorySnapshot.docs[0].data() } as FirestoreCategory;
        setCategory(foundCategory);
        
        const subCategoriesRef = collection(db, "adminSubCategories");
        const qSubCategories = query(subCategoriesRef, where("parentId", "==", foundCategory.id), orderBy("order", "asc"));
        const subCategoriesSnapshot = await getDocs(qSubCategories);
        
        const initialSubCats: EnrichedSubCategory[] = subCategoriesSnapshot.docs
          .map(d => ({ ...(d.data() as FirestoreSubCategory), id: d.id, services: [], isLoadingServices: true, hasStartedLoading: false }))
          .filter(subCat => subCat.isActive !== false);

        setSubCategoriesWithServices(initialSubCats);
        if (initialSubCats.length > 0) {
          setActiveSubCategorySlug(initialSubCats[0].slug);
        }

        let globalSeoSettings: FirestoreSEOSettings | undefined = undefined;
        const settingsDocRef = doc(db, 'seoSettings', 'global');
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) {
            globalSeoSettings = docSnap.data() as FirestoreSEOSettings;
        }

        if (!globalSeoSettings) {
            globalSeoSettings = {} as FirestoreSEOSettings; 
        }

        let baseH1 = foundCategory.h1_title || getOverriddenCategoryName(foundCategory.id, foundCategory.name);
        let finalDisplayH1 = baseH1;
        let fetchedCityData: FirestoreCity | null = null;
        let fetchedAreaData: FirestoreArea | null = null;

         if (citySlug) {
            const cityQuery = query(collection(db, "cities"), where("slug", "==", citySlug), where('isActive', '==', true), limit(1));
            const citySnap = await getDocs(cityQuery);
            if (!citySnap.empty) fetchedCityData = {id: citySnap.docs[0].id, ...citySnap.docs[0].data()} as FirestoreCity;
        }
        if (citySlug && areaSlug && fetchedCityData) {
             const areaQuery = query(collection(db, "areas"), where("slug", "==", areaSlug), where("cityId", "==", fetchedCityData.id), where('isActive', '==', true), limit(1));
             const areaSnap = await getDocs(areaQuery);
             if (!areaSnap.empty) fetchedAreaData = {id: areaSnap.docs[0].id, ...areaSnap.docs[0].data()} as FirestoreArea;
        }

        const dynamicBreadcrumbs = initialBreadcrumbItems || (() => {
            const crumbs: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
            if (fetchedCityData) crumbs.push({ label: fetchedCityData.name, href: `/${citySlug}` });
            if (fetchedAreaData) crumbs.push({ label: fetchedAreaData.name, href: `/${citySlug}/${areaSlug}`});
            crumbs.push({ label: getOverriddenCategoryName(foundCategory.id, foundCategory.name) });
            return crumbs;
        })();
        setBreadcrumbItems(dynamicBreadcrumbs);
       
        if (fetchedAreaData && fetchedCityData) { 
            const areaOverrideSnap = await getDocs(query(collection(db, "areaCategorySeoSettings"), where("areaId", "==", fetchedAreaData.id), where("categoryId", "==", foundCategory.id), where("isActive", "==", true), limit(1)));
            if (!areaOverrideSnap.empty) baseH1 = (areaOverrideSnap.docs[0].data() as AreaCategorySeoSetting).h1_title || baseH1;
            else if (globalSeoSettings.areaCategoryPageH1Pattern) baseH1 = replacePlaceholders(globalSeoSettings.areaCategoryPageH1Pattern, { areaName: fetchedAreaData.name, cityName: fetchedCityData.name, categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = `${baseH1}`;
        } else if (fetchedCityData) { 
            const cityOverrideSnap = await getDocs(query(collection(db, "cityCategorySeoSettings"), where("cityId", "==", fetchedCityData.id), where("categoryId", "==", foundCategory.id), where("isActive", "==", true), limit(1)));
            if (!cityOverrideSnap.empty) baseH1 = (cityOverrideSnap.docs[0].data() as CityCategorySeoSetting).h1_title || baseH1;
            else if (globalSeoSettings.cityCategoryPageH1Pattern) baseH1 = replacePlaceholders(globalSeoSettings.cityCategoryPageH1Pattern, { cityName: fetchedCityData.name, categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = `${baseH1}`;
        } else { 
            if (globalSeoSettings.categoryPageH1Pattern) baseH1 = replacePlaceholders(globalSeoSettings.categoryPageH1Pattern, { categoryName: foundCategory.name }) || baseH1;
            finalDisplayH1 = baseH1;
        }

        setSeoPageH1(baseH1); 
        setDisplayPageH1(finalDisplayH1);
        setIsLoading(false); 
        
        setCache(cacheKey, {
            category: foundCategory,
            subCategories: initialSubCats,
            h1: baseH1,
            displayH1: finalDisplayH1,
            breadcrumbs: dynamicBreadcrumbs,
        }, true);
        localStorage.setItem(localVersionKey, remoteVersion.toString());

        // Fetch services for the first subcategory immediately
        if (initialSubCats.length > 0) {
            loadSubCategoryServices(initialSubCats[0].id);
        }
        
      } catch (err: unknown) {
        console.error("Error fetching category data:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to load category details.";
        setError(errorMessage);
        setIsLoading(false);
      }
    };
    
    fetchCategoryAndSubcategories();
  }, [categorySlug, citySlug, areaSlug, isMounted, toast, initialBreadcrumbItems, cacheKey, initialData, loadSubCategoryServices]);

  const handleSubCategoryClick = useCallback((slug: string) => {
    setActiveSubCategorySlug(slug);
    
    // Pre-emptively awaken the subcategory if it's not loaded
    const subCat = subCategoriesWithServices.find(sc => sc.slug === slug);
    if (subCat && !subCat.hasStartedLoading) {
        setManuallyAwakenedSubCats(prev => new Set(prev).add(subCat.id));
        loadSubCategoryServices(subCat.id);
    }

    // Set pending scroll to be handled in useEffect after state update
    pendingScrollRef.current = slug;

    const subCatIndex = subCategoriesWithServices.findIndex(sc => sc.slug === slug);
    if (carouselApi && subCatIndex > -1) {
      carouselApi.scrollTo(subCatIndex, false);
    }
  }, [carouselApi, subCategoriesWithServices, loadSubCategoryServices]);

  // Effect to handle pending scrolls after content is forced visible and services are loaded
  useEffect(() => {
    if (pendingScrollRef.current) {
        const slug = pendingScrollRef.current;
        const subCat = subCategoriesWithServices.find(sc => sc.slug === slug);
        
        // Wait until it's ready: found, started loading (LazySection active), and services fetched
        if (subCat && subCat.hasStartedLoading && !subCat.isLoadingServices) {
            const element = subCategoryRefs.current[slug];
            
            if (element) {
                const timer = setTimeout(() => {
                    const actualHeaderOffset = isHeaderVisible ? headerHeight : 0;
                    const subNavHeight = stickyNavRef.current?.clientHeight || 80;
                    
                    // Re-measure element position in case previous sections loaded/expanded
                    const elementPosition = element.getBoundingClientRect().top;
                    const offsetPosition = elementPosition + window.pageYOffset - actualHeaderOffset - subNavHeight + 12;
                    
                    window.scrollTo({ 
                        top: offsetPosition, 
                        behavior: 'smooth' 
                    });
                    
                    // Clear pending scroll after successful execution
                    pendingScrollRef.current = null;
                }, 150); // Slightly longer delay to allow DOM to stabilize after services render
                return () => clearTimeout(timer);
            }
        }
    }
  }, [activeSubCategorySlug, subCategoriesWithServices, headerHeight, isHeaderVisible]);
  
  const handleAuthRequiredNav = (e: React.MouseEvent<HTMLElement>, intendedHref?: string, action?: () => void) => {
    e.preventDefault();
    const redirectPath = intendedHref || currentPathname;
    if (intendedHref && intendedHref !== currentPathname && !intendedHref.startsWith('#')) showLoading();

    if (!user) {
      triggerAuthRedirect(redirectPath);
    } else {
      if (action) action();
      if (intendedHref && intendedHref !== currentPathname) router.push(intendedHref);
    }
  };

  const handleSimpleNav = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>, intendedHref: string) => {
    e.preventDefault();
    if (intendedHref !== currentPathname && !intendedHref.startsWith('#')) showLoading();
    router.push(intendedHref);
  };


  if (!isMounted && !initialData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Skeleton className="h-5 w-1/2 mb-6" />
        <div className="mb-6 flex items-center justify-between"><Skeleton className="h-10 w-24" /><Skeleton className="h-10 w-24" /></div>
        <Skeleton className="h-10 w-3/4 mb-2" /><Skeleton className="h-6 w-1/2 mb-8" />
        <Skeleton className="h-12 w-full mb-6" /> 
        <div className="pt-6"><Skeleton className="h-8 w-1/3 mb-6" />
          <div className="grid grid-cols-1 gap-4">
            {[...Array(4)].map((_, i) => (<Skeleton key={i} className="h-36 w-full" />))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <PackageSearch className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold mb-2">Error Loading Category</h2>
        <p className="text-destructive mb-6">{error}</p>
        <Button variant="outline" onClick={(e) => handleSimpleNav(e, '/categories')}>View All Categories</Button>
      </div>
    );
  }
  
  if (isLoading || !category || !displayPageH1) {
     return ( 
      <div className="container mx-auto px-4 py-8 text-center min-h-[60vh] flex flex-col justify-center items-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const hasAnyServices = subCategoriesWithServices.some(sc => sc.services.length > 0 || sc.isLoadingServices);

  return (
    <div className="container mx-auto px-4 py-4 pb-24">
      {breadcrumbItems.length > 0 && <Breadcrumbs items={breadcrumbItems} />}
      <nav className="mb-1 hidden md:flex items-center justify-between">
        <Button variant="outline" onClick={() => { showLoading(); router.back(); }}>
          <ArrowLeft className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Back
        </Button>
        <Button variant="outline" onClick={(e) => handleSimpleNav(e, '/')} className="flex items-center">
          <HomeIconLucide className="mr-1 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" /> Home
        </Button>
      </nav>
      
      <h1 className="text-2xl md:text-4xl font-headline font-semibold mb-2 text-foreground">
        {displayPageH1}
      </h1>
      <p className="text-muted-foreground mb-3">
        Professional {category ? getCategorySearchTerm(category.name) : 'Services'} in {areaSlug && citySlug ? `${areaSlug.replace(/-/g, ' ')}, ${citySlug.replace(/-/g, ' ')}` : citySlug ? citySlug.replace(/-/g, ' ') : "Bangalore"}. 
        Reliable experts for all your home repair and installation needs.
      </p>

      {hasAnyServices ? (
        <>
          <div
            ref={stickyNavRef}
            className="sticky z-30 bg-background/95 backdrop-blur-md py-3 -mx-4 px-4 border-b mb-6 shadow-sm transition-all duration-300"
            style={{ 
              top: isHeaderVisible ? `${headerHeight}px` : '0px',
            }}
          >
            <Carousel setApi={setCarouselApi} opts={{ align: "start", dragFree: true }} className="w-full relative">
              <CarouselContent className="-ml-2">
                {subCategoriesWithServices.map(subCat => (
                  <CarouselItem key={subCat.id} className="pl-2 basis-auto">
                    <SubCategoryCard 
                        subCategory={subCat}
                        isActive={activeSubCategorySlug === subCat.slug}
                        onClick={() => handleSubCategoryClick(subCat.slug)}
                    />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <CarouselPrevious className="absolute -left-4 top-1/2 -translate-y-1/2 h-6 w-6 disabled:hidden" />
              <CarouselNext className="absolute -right-4 top-1/2 -translate-y-1/2 h-6 w-6 disabled:hidden" />
            </Carousel>
          </div>

          <div className="space-y-2">
          {featuresConfig.showCustomServiceButton && (
            <div
              onClick={(e) => handleAuthRequiredNav(e as React.MouseEvent<HTMLDivElement>, '/custom-service')}
              className="relative block p-3 my-2 gap-3 bg-card border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-300 w-full cursor-pointer group"
            >
              {/* MOBILE VIEW */}
              <div className="flex flex-row md:hidden w-full gap-3">
                <div className="flex-1 flex flex-col">
                  <h3 className="font-bold text-base leading-tight text-foreground group-hover:text-primary transition-colors">Need Something Else?</h3>
                  <p className="text-xs text-muted-foreground line-clamp-4 mt-1">Can&apos;t find the service you’re looking for? Tell us what you need, and we’ll do our best to arrange it for you.</p>
                </div>
                <div className="flex flex-col items-center justify-between flex-shrink-0 w-28">
                  <div className="relative w-full h-28 bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden">
                    <AppImage src="/custom.png" alt="Custom Service" fill className="object-contain p-2 transition-transform duration-300 group-hover:scale-105" />
                  </div>
                </div>
              </div>
              <div className="block md:hidden mt-3">
                <Button size="sm" className="h-9 rounded-md w-full">Request a Custom Service</Button>
              </div>
              {/* DESKTOP VIEW */}
              <div className="hidden md:flex flex-row items-center w-full gap-4">
                <div className="relative w-40 h-40 flex-shrink-0 bg-muted/30 rounded-lg flex items-center justify-center overflow-hidden">
                  <AppImage src="/custom.png" alt="Custom Service" fill className="object-contain p-3 transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="flex-1 flex flex-col justify-center pt-4">
                  <h3 className="font-bold text-lg leading-tight text-foreground group-hover:text-primary transition-colors">Need Something Else?</h3>
                  <p className="text-sm text-muted-foreground mt-3 max-w-md">Can&apos;t find the specific service you’re looking for? Tell us what you need, and we’ll do our best to arrange it for you.</p>
                </div>
                <div className="flex flex-col justify-center pl-4 w-1/4">
                    <Button size="lg" className="h-10 rounded-md w-full">Request a Custom Service</Button>
                </div>
              </div>
            </div>
          )}

            {subCategoriesWithServices.map((subCat) => (
              <div 
                key={subCat.id} 
                id={`section-${subCat.slug}`}
                ref={(el) => { 
                    subCategoryRefs.current[subCat.slug] = el;
                    // Trigger the loading when the section mounts if not already loaded
                    if (el && !subCat.hasStartedLoading) {
                        loadSubCategoryServices(subCat.id);
                    }
                }}
                className="pt-2"
                style={{
                    scrollMarginTop: `${(isHeaderVisible ? headerHeight : 0) + (stickyNavRef.current?.clientHeight || 80) + 10}px`
                } as React.CSSProperties}
              >
                <div>
                    <div className="flex items-center mb-6">
                    {subCat.imageUrl ? (
                        <div className="w-10 h-10 relative rounded-md overflow-hidden mr-3 shadow">
                            <AppImage src={subCat.imageUrl} alt={subCat.name} fill sizes="40px" className="w-full h-full object-cover" data-ai-hint={subCat.imageHint || "sub-category title"}/>
                        </div>
                    ) : null }
                    <h3 className="text-2xl font-headline font-medium text-foreground">{subCat.name}</h3>
                    </div>
                    {subCat.isLoadingServices ? (
                        <div className="grid grid-cols-1 gap-4">
                        {/* Match skeleton height to prevent jumps */}
                        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
                        </div>
                    ) : subCat.services.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {subCat.services.map((service, serviceIndex) => (
                        <ServiceCard key={service.id} service={service} priority={serviceIndex < 4} />
                        ))}
                    </div>
                    ) : (
                    <p className="text-muted-foreground text-center py-4">No services available in this sub-category yet.</p>
                    )}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="border border-border rounded-2xl p-8 sm:p-12 flex flex-col items-center justify-center text-center min-h-[400px] bg-card shadow-sm">
            <div className="bg-primary/10 p-4 rounded-full mb-6">
                <Construction className="h-12 w-12 text-primary" />
            </div>
            <h3 className="text-3xl font-headline font-bold text-foreground mb-4">Coming Soon!</h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-8 text-lg">
                We&apos;re working hard to bring trusted professionals for this category to your area. Please check back soon.
            </p>
            
            <div className="space-y-4">
                <p className="text-sm font-medium text-foreground">Are you a professional in this field?</p>
                <Link href="/provider-registration" passHref>
                    <Button size="lg" className="h-12 px-8 rounded-lg shadow-md">
                        <UserPlus className="mr-2 h-5 w-5" /> Join as a Provider
                    </Button>
                </Link>
            </div>
        </div>
      )}
      
      <SubCategoryFloatingButton 
        subCategories={subCategoriesWithServices}
        onSubCategoryClick={handleSubCategoryClick}
        activeSubCategorySlug={activeSubCategorySlug}
      />

      <StickyCartContinueButton />

      {seoContent && (
        <LazySection>
          <div className="mt-16 pt-8 border-t border-border">
            <h2 className="text-xl md:text-2xl font-headline font-semibold mb-6 text-foreground">
              About our {category ? getCategorySearchTerm(category.name) : 'Services'} in {areaSlug ? areaSlug.replace(/-/g, ' ') : citySlug ? citySlug.replace(/-/g, ' ') : "Bangalore"}
            </h2>
            <div 
              className="prose prose-sm md:prose-base max-w-none text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: seoContent }}
            />
          </div>
        </LazySection>
      )}

      {faqs && faqs.length > 0 && (
        <LazySection>
          <div className="mt-12 pt-8 border-t border-border">
            <h2 className="text-xl md:text-2xl font-headline font-semibold mb-6 text-foreground">
                Frequently Asked Questions
            </h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            
            <JsonLdScript 
              idSuffix={`faqs-${categorySlug}`}
              data={{
                "@context": "https://schema.org",
                "@type": "FAQPage",
                "mainEntity": faqs.map(faq => ({
                  "@type": "Question",
                  "name": faq.question,
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": faq.answer
                  }
                }))
              }}
            />
          </div>
        </LazySection>
      )}

      {initialData?.availableAreas && initialData.availableAreas.length > 0 && (
          <LocalitiesInterlinking 
            categoryName={category?.name || "Services"}
            categorySlug={categorySlug}
            citySlug={citySlug || "bangalore"}
            cityName={citySlug ? citySlug.charAt(0).toUpperCase() + citySlug.slice(1).replace(/-/g, ' ') : "Bangalore"}
            areas={initialData.availableAreas}
            currentAreaSlug={areaSlug}
          />
      )}

      {initialData?.availableCities && initialData.availableCities.length > 0 && (
          <CitiesInterlinking 
            categoryName={category?.name || "Services"}
            categorySlug={categorySlug}
            cities={initialData.availableCities}
          />
      )}
      
    </div>
  );
}
