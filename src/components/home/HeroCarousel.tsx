"use client";

import * as React from "react";
import AppImage from '@/components/ui/AppImage';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi
} from "@/components/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { Button } from "@/components/ui/button";
import type { FirestoreSlide, SlideButtonLinkType } from "@/types/firestore";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaySquare, ChevronRight, ChevronLeft } from "lucide-react";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { defaultAppSettings } from '@/config/appDefaults';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useEffect, useMemo } from 'react';
import { useLoading } from '@/contexts/LoadingContext';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { cn } from "@/lib/utils";

export function HeroCarousel() {
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [slides, setSlides] = useState<FirestoreSlide[]>([]);
  const [isLoadingSlides, setIsLoadingSlides] = useState(() => !getCache('hero-slides', true));
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  
  const { user, triggerAuthRedirect } = useAuth();
  const router = useRouter();
  const { showLoading } = useLoading();

  const autoplayEnabled = !isLoadingAppSettings ? (appConfig.enableCarouselAutoplay ?? defaultAppSettings.enableCarouselAutoplay) : defaultAppSettings.enableCarouselAutoplay;
  const autoplayDelay = !isLoadingAppSettings ? (appConfig.carouselAutoplayDelay ?? defaultAppSettings.carouselAutoplayDelay) : defaultAppSettings.carouselAutoplayDelay;

  const emblaPlugins = useMemo(() => {
    if (autoplayEnabled && slides.length > 1) {
      return [Autoplay({ 
        delay: autoplayDelay, 
        stopOnInteraction: false,
        stopOnMouseEnter: false, 
      })];
    }
    return [];
  }, [autoplayEnabled, autoplayDelay, slides.length]);

  // Load slides with smart caching and version check
  useEffect(() => {
    // Initial Hydration from Cache
    const cached = getCache<FirestoreSlide[]>('hero-slides', true);
    if (cached) setSlides(cached);

    const fetchSlides = async () => {
      try {
        // Smart Cache check
        const remoteVersions = await getRemoteCacheVersions();
        const remoteVersion = remoteVersions.content || 0;
        
        const localVersion = parseInt(localStorage.getItem('hero-slides-version') || "0");
        
        if (cached && remoteVersion <= localVersion) {
          setIsLoadingSlides(false);
          return;
        }

        const res = await fetch('/api/hero-slides');
        if (res.ok) {
          const fetchedSlides = await res.json() as FirestoreSlide[];
          setSlides(fetchedSlides);
          setCache('hero-slides', fetchedSlides, true);
          localStorage.setItem('hero-slides-version', remoteVersion.toString());
          
          // --- PRE-LOAD IMAGES FOR CACHING ---
          if (typeof window !== 'undefined') {
              fetchedSlides.forEach(slide => {
                  if (slide.imageUrl) {
                      const img = new Image();
                      img.src = slide.imageUrl;
                  }
              });
          }
        }
        setIsLoadingSlides(false);
      } catch (err) {
        console.error("Error fetching slides:", err);
        setIsLoadingSlides(false);
      }
    };

    fetchSlides();
  }, []);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    api.on("select", () => {
      setCurrent(api.selectedScrollSnap());
    });
  }, [api]);

  const handleSlideNavigation = useCallback((type?: SlideButtonLinkType | null, value?: string | null) => {
    if (!type || !value) return;
    
    let intendedHref = '#';
    switch (type) {
      case 'category': intendedHref = `/category/${value}`; break;
      case 'subcategory': intendedHref = `/category/${value}`; break;
      case 'service': intendedHref = `/service/${value}`; break;
      case 'url': intendedHref = value; break;
    }
    
    if (intendedHref.startsWith('http')) {
      window.open(intendedHref, '_blank');
    } else if (intendedHref !== '#') {
      showLoading(); 
      if (!user) triggerAuthRedirect(intendedHref);
      else router.push(intendedHref);
    }
  }, [user, triggerAuthRedirect, router, showLoading]);

  if (isLoadingSlides && slides.length === 0) {
    return (
      <div className="relative h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] w-full overflow-hidden rounded-xl bg-muted animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>
    );
  }

  if (!slides.length) return null;

  return (
    <div className="relative group">
      <Carousel
        setApi={setApi}
        plugins={emblaPlugins}
        className="w-full"
        opts={{ loop: slides.length > 1 }}
      >
        <CarouselContent className="ml-0">
          {slides.map((slide, index) => {
            const isActive = current === index;
            const hasText = slide.title?.trim() || slide.description?.trim() || slide.buttonText?.trim();

            return (
              <CarouselItem key={slide.id} className="pl-0">
                <div 
                  className={cn(
                    "relative w-full h-[180px] sm:h-[250px] md:h-[300px] lg:h-[400px] xl:h-[450px] overflow-hidden rounded-xl transition-all duration-700",
                    !slide.buttonText && slide.buttonLinkValue ? "cursor-pointer" : ""
                  )}
                  onClick={(!slide.buttonText && slide.buttonLinkValue) ? () => handleSlideNavigation(slide.buttonLinkType, slide.buttonLinkValue) : undefined}
                >
                  {/* Image Layer with Ken Burns effect */}
                  <div className={cn(
                     "absolute inset-0 transition-transform ease-linear",
                     isActive ? "scale-110" : "scale-100"
                  )} style={{ transitionDuration: '10000ms' }}>                    <AppImage
                        src={slide.imageUrl}
                        alt={slide.title || "Yourbrand Promotion"}
                        fill
                        priority={index === 0}
                        loading={index === 0 ? "eager" : "lazy"}
                        sizes="100vw"
                        className="object-cover"
                    />
                  </div>

                  {/* Dark Overlay with Dynamic Depth - Only show if has text */}
                  {hasText && (
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  )}

                  {/* Content Layer with Staggered Animations */}
                  {hasText && (
                    <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-10 md:p-16 lg:p-20 text-center sm:text-left">
                      <div className="max-w-2xl mx-auto sm:mx-0 space-y-2 sm:space-y-4">
                        {slide.title?.trim() && (
                          <h2 className={cn(
                              "text-xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white leading-[1.1] tracking-tighter drop-shadow-2xl transition-all duration-700 delay-100",
                              isActive ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
                          )}>
                            {slide.title}
                          </h2>
                        )}

                        {slide.description?.trim() && (
                          <p className={cn(
                              "text-[10px] sm:text-lg md:text-xl text-white/80 font-medium max-w-lg transition-all duration-700 delay-300 drop-shadow-md line-clamp-2 mx-auto sm:mx-0",
                              isActive ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
                          )}>
                            {slide.description}
                          </p>
                        )}

                        {slide.buttonText?.trim() && (
                          <div className={cn(
                              "pt-1 sm:pt-2 transition-all duration-700 delay-500",
                              isActive ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
                          )}>
                            <Button 
                                size="sm"
                                className="h-8 sm:h-14 px-4 sm:px-10 rounded-full bg-primary hover:bg-primary/90 text-white font-bold text-[10px] sm:text-lg shadow-2xl shadow-primary/40 group/btn mx-auto sm:mx-0"
                                onClick={(e) => { 
                                    e.stopPropagation(); 
                                    handleSlideNavigation(slide.buttonLinkType, slide.buttonLinkValue); 
                                }}
                            >
                                {slide.buttonText}
                                <ChevronRight className="ml-1 sm:ml-2 h-3 w-3 sm:h-5 sm:w-5 transition-transform group-hover/btn:translate-x-1" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        {/* Premium Navigation Controls */}
        {slides.length > 1 && (
          <>
            <div className="absolute top-1/2 -translate-y-1/2 left-4 md:left-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20"
                    onClick={() => api?.scrollPrev()}
                    aria-label="Previous slide"
                >
                    <ChevronLeft className="h-6 w-6" />
                </Button>
            </div>
            <div className="absolute top-1/2 -translate-y-1/2 right-4 md:right-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20"
                    onClick={() => api?.scrollNext()}
                    aria-label="Next slide"
                >
                    <ChevronRight className="h-6 w-6" />
                </Button>
            </div>
          </>
        )}
      </Carousel>

      {/* Premium Animated Progress Indicators - Overlaying the image at the bottom */}
      {slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-2">
            {slides.map((_, i) => (
                <button
                    key={i}
                    onClick={() => api?.scrollTo(i)}
                    className={cn(
                        "h-1.5 transition-all duration-500 rounded-full",
                        current === i ? "w-8 bg-primary shadow-sm shadow-primary/20" : "w-2 bg-white/40 hover:bg-white/70"
                    )}
                    aria-label={`Go to slide ${i + 1}`}
                />
            ))}
        </div>
      )}
    </div>
  );
}
