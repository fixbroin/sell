
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from '@/lib/mysqlDb';
import type { FirestoreReview } from '@/types/firestore';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import * as React from "react";
import { Skeleton } from '@/components/ui/skeleton';
import { getCache, setCache } from '@/lib/client-cache';

const Testimonials = () => {
  const [testimonials, setTestimonials] = useState<FirestoreReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const plugin = React.useRef(Autoplay({ 
    delay: 5000, 
    stopOnInteraction: false,
    stopOnMouseEnter: false, 
    stopOnLastSnap: false,
  }));

  useEffect(() => {
    const cachedReviews = getCache<FirestoreReview[]>('home_testimonials', false);
    if (cachedReviews && cachedReviews.length > 0) {
      setTestimonials(cachedReviews);
      setIsLoading(false);
    }

    const fetchReviews = async () => {
      if (!cachedReviews || cachedReviews.length === 0) {
        setIsLoading(true);
      }
      try {
        const reviewsRef = collection(db, "adminReviews");
        const q = query(
          reviewsRef,
          where("status", "==", "Approved"),
          where("rating", "in", [4, 5]),
          orderBy("createdAt", "desc"),
          limit(40)
        );
        const snapshot = await getDocs(q);
        const fetchedReviews = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreReview));
        
        const uniqueReviews: FirestoreReview[] = [];
        const seenNames = new Set<string>();
        
        for (const review of fetchedReviews) {
          const nameKey = (review.userName || '').trim().toLowerCase();
          if (nameKey && !seenNames.has(nameKey)) {
            uniqueReviews.push(review);
            seenNames.add(nameKey);
          }
          if (uniqueReviews.length >= 12) break;
        }

        setTestimonials(uniqueReviews);
        setCache('home_testimonials', uniqueReviews, false);

      } catch (error) {
        console.error("Error fetching testimonials:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReviews();
  }, []);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="flex flex-col shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center space-x-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-grow">
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-full mb-1" />
              <Skeleton className="h-3 w-5/6" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (testimonials.length === 0) {
    return null; // Don't render the section if there are no testimonials
  }

  return (
     <Carousel
      opts={{
          align: "start",
          loop: testimonials.length > 3,
      }}
      plugins={[plugin.current]}
      className="w-full"
    >
      <CarouselContent>
        {testimonials.map((testimonial) => (
          <CarouselItem key={testimonial.id} className="pl-4 basis-full sm:basis-1/2 lg:basis-1/3">
            <div className="p-1 h-full">
              <Card className="flex flex-col h-full shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start w-full gap-3">
                    <Avatar className="shrink-0">
                      {testimonial.userAvatarUrl ? (
                        <AvatarImage src={testimonial.userAvatarUrl} alt={testimonial.userName} data-ai-hint="person avatar" />
                      ) : (
                        <AvatarFallback>{testimonial.userName ? testimonial.userName.charAt(0).toUpperCase() : 'A'}</AvatarFallback>
                      )}
                    </Avatar>
                    
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-md font-headline truncate shrink-0 max-w-[120px]">
                          {testimonial.userName}
                        </CardTitle>

                        <p
                          className="text-[10px] text-primary font-bold uppercase tracking-tight whitespace-nowrap truncate max-w-[140px]"
                          title={testimonial.serviceName}
                        >
                          {testimonial.serviceName}
                        </p>
                      </div>
                      
                      <div className="flex items-center mt-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${i < testimonial.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground/30'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-muted-foreground italic leading-relaxed">"{testimonial.comment}"</p>
                </CardContent>
                <CardFooter className="pt-0 pb-4">
                   <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                      <span>Verified Customer</span>
                   </div>
                </CardFooter>
              </Card>
            </div>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="hidden md:flex" />
      <CarouselNext className="hidden md:flex" />
    </Carousel>
  );
};

export default Testimonials;
