
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from '@/lib/mysqlDb';
import type { FirestoreService, FirestoreSubCategory } from '@/types/firestore';
import { Loader2, ShoppingBag } from 'lucide-react';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Card, CardContent } from '@/components/ui/card';
import AppImage from '@/components/ui/AppImage';
import { useRouter } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { formatCurrency } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import Autoplay from "embla-carousel-autoplay";
import * as React from "react";
import Link from 'next/link';

interface ExploreByServiceProps {
  currentServiceId: string;
  parentCategoryId?: string;
}

const RelatedServiceCard: React.FC<{ service: FirestoreService }> = ({ service }) => {
    const { config: appConfig } = useApplicationConfig();
    const symbol = appConfig?.currencySymbol || '₹';
    const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
    const code = appConfig?.currencyCode || 'INR';
    const router = useRouter();
    const { showLoading } = useLoading();

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        showLoading();
        router.push(`/service/${service.slug}`);
    };

    return (
        <Card onClick={handleClick} className="cursor-pointer h-full flex flex-col hover:shadow-lg transition-shadow">
            <div className="relative w-full aspect-square bg-muted border-b border-border overflow-hidden rounded-t-lg">
                <AppImage src={service.imageUrl || "/default-image.png"} alt={service.name} fill sizes="200px" className="object-cover" />
            </div>
            <CardContent className="p-2 flex-grow">
                <h4 className="text-xs font-semibold truncate">{service.name}</h4>
                <p className="text-sm font-medium text-primary mt-1">{formatCurrency(service.discountedPrice ?? service.price, symbol, decimals, code)}</p>
            </CardContent>
        </Card>
    );
};

export default function ExploreByService({ currentServiceId, parentCategoryId }: ExploreByServiceProps) {
  const [relatedServices, setRelatedServices] = useState<FirestoreService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { showLoading } = useLoading();

  const plugin = React.useRef(Autoplay({ delay: 3500, stopOnInteraction: false, stopOnMouseEnter: false }));

  useEffect(() => {
    const fetchRelatedServices = async () => {
      if (!parentCategoryId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const subCatsQuery = query(collection(db, "adminSubCategories"), where("parentId", "==", parentCategoryId));
        const subCatsSnapshot = await getDocs(subCatsQuery);
        if (subCatsSnapshot.empty) {
          setRelatedServices([]);
          setIsLoading(false);
          return;
        }
        
        const subCategoryIds = subCatsSnapshot.docs.map(doc => doc.id);
        
        const servicesQuery = query(
            collection(db, "adminServices"),
            where("isActive", "==", true),
            where("subCategoryId", "in", subCategoryIds),
            orderBy("name", "asc")
        );
        const servicesSnapshot = await getDocs(servicesQuery);
        
        const related = servicesSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as FirestoreService))
            .filter(s => s.id !== currentServiceId);
            
        setRelatedServices(related);
      } catch (error) {
        console.error("Error fetching related services:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRelatedServices();
  }, [currentServiceId, parentCategoryId]);

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    showLoading();
    router.push(href);
  };

  if (isLoading) {
    return (
        <section className="py-8 md:py-10">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 text-foreground">Related Services</h2>
                <div className="flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            </div>
        </section>
    );
  }

  if (relatedServices.length === 0) {
    return null;
  }

  return (
    <section className="py-8 md:py-10 bg-muted/30 overflow-x-hidden">
      <div className="container mx-auto px-4">
        <h2 className="text-2xl md:text-3xl font-headline font-semibold text-center mb-8 text-foreground">
          Related Services
        </h2>
        <Carousel
          opts={{ align: "start", loop: relatedServices.length > 5 }}
          plugins={[plugin.current]}
          className="w-full"
        >
          <CarouselContent className="-ml-2 md:-ml-4">
            {relatedServices.map(service => (
              <CarouselItem key={service.id} className="pl-2 md:pl-4 basis-1/2 sm:basis-1/3 lg:basis-1/4 xl:basis-1/5">
                <div className="h-full p-1"><RelatedServiceCard service={service} /></div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden sm:flex" />
          <CarouselNext className="hidden sm:flex" />
        </Carousel>

        <div className="mt-12">
            <h3 className="text-xl font-semibold text-center mb-6 text-foreground">
                All Services in this Category
            </h3>
            <ul className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-x-6 gap-y-2 text-center sm:text-left">
                {relatedServices.map(service => (
                    <li key={`link-${service.id}`} className="mb-2">
                        <Link 
                            href={`/service/${service.slug}`} 
                            onClick={(e) => handleNav(e, `/service/${service.slug}`)}
                            className="text-sm text-muted-foreground hover:text-primary hover:underline transition-colors"
                        >
                            {service.name}
                        </Link>
                    </li>
                ))}
            </ul>
        </div>

      </div>
    </section>
  );
}

