
"use client";

import { useState, useEffect } from 'react';
import CategoryCard from './CategoryCard';
import type { FirestoreCategory } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from '@/lib/mysqlDb';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { getCache, setCache } from '@/lib/client-cache';

const CategoryGrid = () => {
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cachedCats = getCache<FirestoreCategory[]>('category_grid', true);
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
        const q = query(categoriesCollectionRef, orderBy("order", "asc"));
        const data = await getDocs(q);
        const fetchedCategories = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
        setCategories(fetchedCategories);
        setCache('category_grid', fetchedCategories, true);
      } catch (err) {
        console.error("Error fetching categories for grid: ", err);
        setError("Failed to load categories.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCategories();
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
        {[...Array(6)].map((_, i) => (
          <Card className="overflow-hidden h-full flex flex-col group" key={i}>
            <Skeleton className="w-full aspect-square bg-muted" />
            <div className="p-3 text-center">
              <Skeleton className="h-5 w-3/4 mx-auto bg-muted mt-1" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-center text-destructive">{error}</p>;
  }

  if (categories.length === 0) {
    return <p className="text-center text-muted-foreground">No categories available at the moment.</p>;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
      {categories.map((category) => (
        <CategoryCard key={category.id} category={category} />
      ))}
    </div>
  );
};

export default CategoryGrid;
