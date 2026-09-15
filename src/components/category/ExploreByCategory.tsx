

"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from '@/lib/mysqlDb';
import type { FirestoreCity, FirestoreArea, FirestoreCategory } from '@/types/firestore';
import { Loader2, MapPin, Layers } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface ExploreByCategoryProps {
  currentCategorySlug?: string;
  currentCitySlug?: string;
  areaSlug?: string; // New prop for current area
  currentCategoryName?: string;
}

export default function ExploreByCategory({ currentCategorySlug, currentCitySlug, areaSlug, currentCategoryName }: ExploreByCategoryProps) {
  const [allCategories, setAllCategories] = useState<FirestoreCategory[]>([]);
  const [citiesWithAreas, setCitiesWithAreas] = useState<Array<FirestoreCity & { areas: FirestoreArea[] }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [areasLimit, setAreasLimit] = useState(30);
  const { showLoading } = useLoading();
  const router = useRouter();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const categoriesQuery = query(collection(db, "adminCategories"), orderBy("name"));
        const citiesQuery = query(collection(db, "cities"), where("isActive", "==", true), orderBy("name"));

        const [categoriesSnapshot, citiesSnapshot] = await Promise.all([
          getDocs(categoriesQuery),
          getDocs(citiesQuery),
        ]);
        
        const fetchedCategories = categoriesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
        const otherCategories = fetchedCategories.filter(c => c.slug !== currentCategorySlug);
        setAllCategories(otherCategories);

        const citiesData = citiesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCity));
        const enrichedCitiesPromises = citiesData.map(async (city) => {
            const areasQuery = query(collection(db, "areas"), where("cityId", "==", city.id), where("isActive", "==", true), orderBy("name"));
            const areasSnapshot = await getDocs(areasQuery);
            const areasData = areasSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreArea));
            return { ...city, areas: areasData };
        });

        const resolvedCitiesData = await Promise.all(enrichedCitiesPromises);
        setCitiesWithAreas(resolvedCitiesData);

      } catch (error) {
        console.error("Error fetching data for Explore section:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentCategorySlug]);

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    showLoading();
    router.push(href);
  };
  
  if (isLoading) {
    return (
      <section className="py-8 md:py-10">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 text-foreground">Explore More</h2>
          <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        </div>
      </section>
    );
  }

  const currentCityData = currentCitySlug ? citiesWithAreas.find(c => c.slug === currentCitySlug) : null;
  const showOtherCategories = allCategories.length > 0;
  const showCities = citiesWithAreas.length > 0;
  
  // Show "other areas" only if we are on a city-specific page and that city has other areas
  const showOtherAreas = currentCityData && currentCityData.areas.length > 1;

  if (!showOtherCategories && !showCities) {
      return null;
  }

  return (
    <section className="py-8 md:py-10 bg-muted/30 overflow-x-hidden">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 text-foreground">
          Explore More
        </h2>
        <Accordion type="multiple" className="w-full max-w-4xl mx-auto" defaultValue={['explore-areas', 'explore-cities', 'explore-categories']}>
          
          {showOtherAreas && currentCategoryName && (
            <AccordionItem value="explore-areas">
              <AccordionTrigger className="text-lg font-medium hover:no-underline">Explore {currentCategoryName} in Other Areas</AccordionTrigger>
              <AccordionContent>
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 pl-2">
                  {currentCityData!.areas
                    .filter(area => area.slug !== areaSlug) // Filter out the current area
                    .slice(0, areasLimit)
                    .map((area) => (
                    <li key={area.id}>
                      <Link href={`/${currentCityData!.slug}/${area.slug}/${currentCategorySlug}`} onClick={(e) => handleNav(e, `/${currentCityData!.slug}/${area.slug}/${currentCategorySlug}`)} className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors py-1">
                        <MapPin className="h-3.5 w-3.5 mr-2" /> {currentCategoryName} in {area.name}
                      </Link>
                    </li>
                  ))}
                </ul>

                {currentCityData!.areas.filter(area => area.slug !== areaSlug).length > areasLimit && (
                  <div className="mt-4 flex justify-center gap-2 pt-2 border-t">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setAreasLimit(prev => prev + 50)}
                    >
                      Load More Localities (+50)
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setAreasLimit(currentCityData!.areas.length)}
                    >
                      Load All ({currentCityData!.areas.filter(area => area.slug !== areaSlug).length})
                    </Button>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {showCities && currentCategoryName && (
            <AccordionItem value="explore-cities">
              <AccordionTrigger className="text-lg font-medium hover:no-underline">Explore {currentCategoryName} in Other Cities</AccordionTrigger>
              <AccordionContent>
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 pl-2">
                  {citiesWithAreas
                    .filter(city => city.slug !== currentCitySlug) // Filter out current city
                    .map((city) => (
                    <li key={city.id}>
                      <Link href={`/${city.slug}/category/${currentCategorySlug}`} onClick={(e) => handleNav(e, `/${city.slug}/category/${currentCategorySlug}`)} className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors py-1">
                        <MapPin className="h-3.5 w-3.5 mr-2" /> {currentCategoryName} in {city.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}
          
          {showOtherCategories && currentCityData && areaSlug && (
             <AccordionItem value="explore-other-categories-in-area">
              <AccordionTrigger className="text-lg font-medium hover:no-underline">All Categories in {currentCityData.areas.find(a => a.slug === areaSlug)?.name}</AccordionTrigger>
              <AccordionContent>
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 pl-2">
                  {allCategories.map(cat => (
                    <li key={cat.id}>
                      <Link href={`/${currentCityData.slug}/${areaSlug}/${cat.slug}`} onClick={(e) => handleNav(e, `/${currentCityData.slug}/${areaSlug}/${cat.slug}`)} className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors py-1">
                        <Layers className="h-3.5 w-3.5 mr-2" /> {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

          {showOtherCategories && (
            <AccordionItem value="explore-categories">
              <AccordionTrigger className="text-lg font-medium hover:no-underline">Explore Other Categories</AccordionTrigger>
              <AccordionContent>
                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-2 pl-2">
                  {allCategories.map(cat => (
                    <li key={cat.id}>
                      <Link href={`/category/${cat.slug}`} onClick={(e) => handleNav(e, `/category/${cat.slug}`)} className="flex items-center text-sm text-muted-foreground hover:text-primary transition-colors py-1">
                        <Layers className="h-3.5 w-3.5 mr-2" /> {cat.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}

        </Accordion>
      </div>
    </section>
  );
}

    