
"use client";

import React, { useState, useEffect } from 'react';
import Link from '@/components/shared/TransitionLink';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, limit, orderBy } from '@/lib/mysqlDb';
import type { FirestoreCity, FirestoreArea, FirestoreCategory } from '@/types/firestore';
import { getCategorySearchTerm } from '@/lib/seoAdvancedUtils';

/**
 * LocalSiloLinks Component
 * 
 * This component creates a "Silo" of links for Local SEO.
 * It dynamically fetches real cities, areas, and categories to prevent 404 errors.
 */
const LocalSiloLinks = () => {
  const { settings, isLoading: isGlobalLoading } = useGlobalSettings();
  const [data, setData] = useState<{
    city: FirestoreCity | null;
    areas: FirestoreArea[];
    categories: FirestoreCategory[];
  }>({ city: null, areas: [], categories: [] });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRealSiloData = async () => {
      setIsLoading(true);
      try {
        // 1. Fetch the primary city (e.g., Bangalore)
        const citiesQuery = query(collection(db, "cities"), where("isActive", "==", true), orderBy("name"), limit(1));
        const citySnap = await getDocs(citiesQuery);
        if (citySnap.empty) return;
        const city = { id: citySnap.docs[0].id, ...citySnap.docs[0].data() } as FirestoreCity;

        // 2. Fetch top 24 active areas in that city to increase link density
        const areasQuery = query(
          collection(db, "areas"), 
          where("cityId", "==", city.id), 
          where("isActive", "==", true), 
          orderBy("name"), 
          limit(24)
        );
        const areasSnap = await getDocs(areasQuery);
        const areas = areasSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreArea));

        // 3. Fetch categories, ensuring Carpentry is prioritized
        const catsQuery = query(
          collection(db, "adminCategories"), 
          where("isActive", "==", true), 
          orderBy("order", "asc")
        );
        const catsSnap = await getDocs(catsQuery);
        let allCategories = catsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreCategory));
        
        // Move Carpentry/Carpenter to the front for maximum link juice
        const priorityCats = allCategories.filter(cat => 
          ['carpentry', 'carpenter'].includes(cat.slug?.toLowerCase() || '') || 
          ['carpentry', 'carpenter'].includes(cat.name?.toLowerCase() || '')
        );
        const otherCats = allCategories.filter(cat => !priorityCats.includes(cat));
        const categories = [...priorityCats, ...otherCats].slice(0, 12);

        setData({ city, areas, categories });
      } catch (error) {
        console.error("Error fetching dynamic silo links:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRealSiloData();
  }, []);

  if (isLoading || isGlobalLoading) {
    return (
      <div className="py-8 border-t border-border/50">
        <div className="container mx-auto px-4">
            <Skeleton className="h-6 w-48 mb-6" />
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-xl" />)}
            </div>
        </div>
      </div>
    );
  }

  if (!data.city || data.areas.length === 0 || data.categories.length === 0) {
      return null;
  }

  // Create valid combinations from real data
  // We link the i-th area with the i-th category to create diverse links
  const siloLinks = data.areas.map((area, index) => {
      const category = data.categories[index % data.categories.length];
      const searchTerm = getCategorySearchTerm(category.name);
      return {
          url: `/${data.city?.slug}/${area.slug}/${category.slug}`,
          label: `${searchTerm} in ${area.name}`,
          areaSlug: area.slug,
          areaName: area.name
      };
  });

  return (
    <div className="py-12 border-t border-border/50 bg-muted/10">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-2 mb-8">
            <div className="h-8 w-1 bg-primary rounded-full" />
            <h2 className="text-lg font-headline font-bold uppercase tracking-wider text-foreground">
                Popular Services in {data.city.name}
            </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
          {siloLinks.map((link, index) => (
            <Link 
              key={index}
              href={link.url}
              className="group flex items-center justify-between py-2 border-b border-border/30 hover:border-primary/50 transition-all"
            >
              <div className="flex items-center gap-3">
                <MapPin size={14} className="text-primary opacity-60 group-hover:opacity-100 transition-opacity" />
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {link.label}
                </span>
              </div>
              <ArrowRight size={14} className="text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </Link>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground/70">Browse by Area:</span>
            {data.areas.slice(0, 6).map((area) => {
                const areaUrl = `/${data.city?.slug}/${area.slug}`;
                return (
                    <Link 
                        key={area.id} 
                        href={areaUrl}
                        className="hover:text-primary transition-colors underline decoration-dotted underline-offset-4"
                    >
                        {area.name}
                    </Link>
                );
            })}
            <Link 
                href="/sitemap" 
                className="text-primary font-medium hover:underline"
            >
                View All Locations →
            </Link>
        </div>
      </div>
    </div>
  );
};

export default LocalSiloLinks;
