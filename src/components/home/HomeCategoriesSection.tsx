"use client";

import { useState, useEffect } from 'react';
import CategoryCard from './CategoryCard';
import type { FirestoreCategory } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query, where } from '@/lib/mysqlDb';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { getCache, setCache } from '@/lib/client-cache';

const getItemsLimit = (width: number): number => {
  if (width < 640) return 5; // Mobile
  if (width < 1024) return 9; // Tablet
  return 11; // Desktop
};

interface HomeCategoriesSectionProps {
  initialCategories?: FirestoreCategory[];
}

const HomeCategoriesSection = ({ initialCategories }: HomeCategoriesSectionProps) => {
  const [categories, setCategories] = useState<FirestoreCategory[]>(initialCategories || []);
  const [isLoading, setIsLoading] = useState(!initialCategories || initialCategories.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [itemsLimit, setItemsLimit] = useState(getItemsLimit(typeof window !== 'undefined' ? window.innerWidth : 1024));

  useEffect(() => {
    const handleResize = () => {
      setItemsLimit(getItemsLimit(window.innerWidth));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (initialCategories && initialCategories.length > 0) {
      setCategories(initialCategories);
      setIsLoading(false);
      return;
    }

    const cachedCats = getCache<FirestoreCategory[]>('home_categories', true);
    if (cachedCats && cachedCats.length > 0) {
      setCategories(cachedCats);
      setIsLoading(false);
    }

    const fetchCategories = async () => {
      if (!cachedCats || cachedCats.length === 0) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const categoriesCollectionRef = collection(db, "adminCategories");
        const q = query(categoriesCollectionRef, where("isActive", "==", true), orderBy("order", "asc"));
        const data = await getDocs(q);
        const fetchedCategories = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
        setCategories(fetchedCategories);
        setCache('home_categories', fetchedCategories, true);
      } catch (err) {
        console.error("Error fetching categories for grid: ", err);
        setError("Failed to load categories.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategories();
  }, [initialCategories]);

  const displayedCategories = showAll ? categories : categories.slice(0, itemsLimit);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-y-10 gap-x-4 md:gap-x-6 lg:gap-x-8">
        {[...Array(itemsLimit + 1)].map((_, i) => (
          <div className="flex flex-col items-center gap-4" key={i}>
            <Skeleton className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 lg:w-48 lg:h-48 rounded-full bg-muted" />
            <Skeleton className="h-6 w-24 bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive font-medium py-10">{error}</p>;
  }

  if (categories.length === 0) {
    return <p className="text-center text-muted-foreground py-10">No categories available at the moment.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-6 md:gap-6">
        {displayedCategories.map((category, index) => (
          <CategoryCard key={category.id} category={category} priority={index < 6} index={index} />
        ))}

        {!showAll && categories.length > itemsLimit && (
          <div 
            className="flex flex-col items-center group cursor-pointer transition-all duration-500"
            onClick={() => setShowAll(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowAll(true); }}
          >
            <div className="relative mb-4">
                <div className="absolute inset-[-10px] rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 blur-2xl bg-gradient-to-tr from-primary/30 to-teal-400/30" />
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44 xl:w-48 xl:h-48 rounded-full flex items-center justify-center bg-card border-2 border-border/40 shadow-lg group-hover:shadow-3xl group-hover:border-primary/60 group-hover:-translate-y-3 transition-all duration-500 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-teal-400/10 group-hover:from-primary/20 group-hover:to-teal-400/20 transition-all" />
                    <ArrowDown className="h-10 w-10 sm:h-12 sm:w-12 md:h-16 md:w-16 lg:h-20 lg:w-20 text-primary group-hover:scale-110 transition-transform relative z-10" />
                    <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-white/25 to-transparent rotate-45 group-hover:translate-x-[15%] group-hover:translate-y-[15%] transition-transform duration-1000" />
                </div>
            </div>
            <h3 className="text-sm sm:text-base md:text-xl font-black text-foreground text-center group-hover:text-primary transition-all duration-300 transform group-hover:scale-110 tracking-tight">
                More
            </h3>
          </div>
        )}

        {showAll && categories.length > itemsLimit && (
           <div 
            className="flex flex-col items-center group cursor-pointer transition-all duration-500"
            onClick={() => setShowAll(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShowAll(false); }}
          >
             <div className="relative mb-4">
                <div className="absolute inset-[-10px] rounded-full opacity-0 group-hover:opacity-100 transition-all duration-700 blur-2xl bg-gradient-to-tr from-destructive/30 to-rose-400/30" />
                <div className="relative w-24 h-24 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44 xl:w-48 xl:h-48 rounded-full flex items-center justify-center bg-card border-2 border-border/40 shadow-lg group-hover:shadow-3xl group-hover:border-destructive/60 group-hover:-translate-y-3 transition-all duration-500 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-destructive/10 to-rose-400/10 group-hover:from-destructive/20 group-hover:to-rose-400/20 transition-all" />
                    <ArrowUp className="h-10 w-10 sm:h-12 sm:h-12 md:h-16 md:w-16 text-destructive group-hover:scale-110 transition-transform relative z-10" />
                    <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-gradient-to-br from-white/25 to-transparent rotate-45 group-hover:translate-x-[15%] group-hover:translate-y-[15%] transition-transform duration-1000" />
                </div>
            </div>
            <h3 className="text-sm sm:text-base md:text-xl font-black text-foreground text-center group-hover:text-destructive transition-all duration-300 transform group-hover:scale-110 tracking-tight">
                Less
            </h3>
          </div>
        )}
      </div>
    </>
  );
};

export default HomeCategoriesSection;
