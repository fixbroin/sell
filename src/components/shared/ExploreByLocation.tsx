
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy } from '@/lib/mysqlDb';
import type { FirestoreCity, FirestoreArea, FirestoreCategory } from '@/types/firestore';
import { Loader2, Tag } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import Link from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface CityWithAreas extends FirestoreCity {
  areas: FirestoreArea[];
}

interface ExploreByLocationProps {
  initialData?: CityWithAreas[];
  categories?: FirestoreCategory[];
}

export default function ExploreByLocation({ initialData, categories = [] }: ExploreByLocationProps) {
  const [citiesWithAreas, setCitiesWithAreas] = useState<CityWithAreas[]>(initialData || []);
  const [allCategories, setAllCategories] = useState<FirestoreCategory[]>(categories);
  const [isLoading, setIsLoading] = useState(!initialData || categories.length === 0);
  const [areaLimits, setAreaLimits] = useState<Record<string, number>>({});
  const { showLoading } = useLoading();
  const router = useRouter();

  useEffect(() => {
    if (initialData && categories.length > 0) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const promises: Promise<any>[] = [];
        
        if (!initialData) {
            promises.push(
                getDocs(query(collection(db, "cities"), where("isActive", "==", true), orderBy("name")))
                .then(async (citiesSnapshot) => {
                    const citiesData = citiesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreCity));
                    const enrichedCitiesPromises = citiesData.map(async (city) => {
                        const areasSnapshot = await getDocs(query(collection(db, "areas"), where("cityId", "==", city.id), where("isActive", "==", true), orderBy("name")));
                        const areasData = areasSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreArea));
                        return { ...city, areas: areasData };
                    });
                    return await Promise.all(enrichedCitiesPromises);
                })
            );
        } else {
            promises.push(Promise.resolve(initialData));
        }

        if (categories.length === 0) {
            promises.push(
                getDocs(query(collection(db, "adminCategories"), where("isActive", "==", true), orderBy("order", "asc")))
                .then(snap => snap.docs.map(d => ({ ...d.data(), id: d.id } as FirestoreCategory)))
            );
        } else {
            promises.push(Promise.resolve(categories));
        }

        const [resolvedCitiesData, resolvedCategories] = await Promise.all(promises);
        setCitiesWithAreas(resolvedCitiesData);
        setAllCategories(resolvedCategories);

      } catch (error) {
        console.error("Error fetching locations/categories for SEO section:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [initialData, categories]);

  const handleNav = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    showLoading();
    router.push(href);
  };
  
  if (isLoading) {
    return (
      <section className="py-8 md:py-10">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 text-foreground">Explore Services Near You</h2>
          <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        </div>
      </section>
    );
  }

  if (citiesWithAreas.length === 0 || allCategories.length === 0) {
    return null; 
  }

  return (
    <section className="py-12 md:py-16 bg-muted/30 overflow-x-hidden border-t">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-headline font-semibold text-foreground mb-3">
                Explore Services Near You
            </h2>
            <p className="text-muted-foreground">Find verified professionals for every home need in your locality.</p>
        </div>

        <Accordion type="multiple" className="w-full max-w-5xl mx-auto space-y-4">
          {citiesWithAreas.map((city) => (
            <AccordionItem value={city.id} key={city.id} className="border bg-card rounded-xl px-4 md:px-6 overflow-hidden shadow-sm">
              <AccordionTrigger className="text-lg md:text-xl font-bold hover:no-underline py-4">
                <div className="flex items-center gap-2">
                    <span className="text-foreground">In {city.name}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                
                {/* 1. Category Tags for City */}
                <div className="mb-8">
                    <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Tag className="h-4 w-4" /> Popular in {city.name}
                    </h4>
                    <div className="flex flex-wrap gap-2 md:gap-3">
                        {allCategories.map(cat => (
                            <Link 
                                key={`${city.id}-${cat.id}`} 
                                href={`/${city.slug}/category/${cat.slug}`}
                                onClick={(e) => handleNav(e, `/${city.slug}/category/${cat.slug}`)}
                            >
                                <Badge variant="secondary" className="px-3 py-1.5 md:px-4 md:py-2 text-sm font-medium hover:bg-primary hover:text-white transition-all cursor-pointer">
                                    {cat.name} in {city.name}
                                </Badge>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* 2. Area Tags */}
                {city.areas.length > 0 && (
                    <div>
                        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Localities in {city.name}</h4>
                        <Accordion type="single" collapsible className="w-full">
                            {city.areas.slice(0, areaLimits[city.id] || 30).map(area => (
                                <AccordionItem key={area.id} value={area.id} className="border-none">
                                    <AccordionTrigger className="text-sm font-medium py-2 hover:text-primary transition-colors">
                                        {area.name}
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 pb-4">
                                        <div className="flex flex-wrap gap-2">
                                            {allCategories
                                                .filter(cat => {
                                                    // Always include Carpentry or high-priority categories
                                                    const isPriority = ['carpentry', 'carpenter'].includes(cat.slug?.toLowerCase() || '') || 
                                                                     ['carpentry', 'carpenter'].includes(cat.name?.toLowerCase() || '');
                                                    return isPriority || allCategories.indexOf(cat) < 8;
                                                })
                                                .slice(0, 12) // Slightly increased limit but prioritized
                                                .map(cat => (
                                                <Link 
                                                    key={`${area.id}-${cat.id}`} 
                                                    href={`/${city.slug}/${area.slug}/${cat.slug}`}
                                                    onClick={(e) => handleNav(e, `/${city.slug}/${area.slug}/${cat.slug}`)}
                                                >
                                                    <Badge variant="outline" className="px-2 py-1 text-xs hover:border-primary hover:text-primary transition-all cursor-pointer">
                                                        {cat.name} in {area.name}
                                                    </Badge>
                                                </Link>
                                            ))}
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            ))}
                        </Accordion>

                        {city.areas.length > (areaLimits[city.id] || 30) && (
                            <div className="mt-4 flex justify-center gap-2 pt-2 border-t">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setAreaLimits(prev => ({ ...prev, [city.id]: (prev[city.id] || 30) + 50 }))}
                                >
                                    Load More Localities (+50)
                                </Button>
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => setAreaLimits(prev => ({ ...prev, [city.id]: city.areas.length }))}
                                >
                                    Load All ({city.areas.length})
                                </Button>
                            </div>
                        )}
                    </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
