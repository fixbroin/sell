"use client";

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import AppImage from '@/components/ui/AppImage';
import { CheckCircle2, XCircle, Star, Phone, ShieldCheck, Clock, MapPin, Sparkles, ArrowRight } from 'lucide-react';
import type { FirestoreCity, FirestoreArea, FirestoreService, AreaServiceSeoSetting, FaqItem } from '@/types/firestore';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

interface AreaServiceSeoPageClientProps {
  cityData: FirestoreCity;
  areaData: FirestoreArea;
  serviceData: FirestoreService;
  seoOverride: AreaServiceSeoSetting | null;
  seoContent?: string;
  faqs?: FaqItem[];
  breadcrumbItems: { name: string; url?: string }[];
  cityAreas?: FirestoreArea[];
}

export default function AreaServiceSeoPageClient({
  cityData,
  areaData,
  serviceData,
  seoOverride,
  seoContent = "",
  faqs = [],
  breadcrumbItems,
  cityAreas = []
}: AreaServiceSeoPageClientProps) {
  const router = useRouter();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";

  const h1Title = seoOverride?.h1_title || `${serviceData.name} in ${areaData.name}, ${cityData.name}`;
  const customSeoContent = seoContent;

  // visual breadcrumbs mapping
  const visualBreadcrumbs = [
    { label: "Home", href: "/" },
    { label: cityData.name, href: `/${cityData.slug}` },
    { label: areaData.name, href: `/${cityData.slug}/${areaData.slug}` },
    { label: serviceData.name }
  ];

  const ratingValue = serviceData.rating || "4.8";
  const reviewCount = serviceData.reviewCount || "156";
  const cleanDescription = serviceData.description || `Professional ${serviceData.name} services in ${areaData.name}, ${cityData.name}. Trusted experts by Yourbrand.`;

  return (
    <div className="min-h-screen bg-slate-50/50 pb-16">
      {/* Breadcrumbs */}
      <div className="container mx-auto px-4 pt-4 md:pt-6">
        <Breadcrumbs items={visualBreadcrumbs} />
      </div>

      <div className="container mx-auto px-4 mt-6">
        {/* Split Hero / Service Card */}
        <Card className="overflow-hidden border-none shadow-xl shadow-slate-100 bg-white rounded-2xl">
          <CardContent className="p-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
              {/* Left Column: Details */}
              <div className="p-3 md:p-10 lg:col-span-7 flex flex-col justify-between order-2 lg:order-1">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary mb-4">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Best Local Services in {areaData.name}</span>
                  </div>

                  <h1 className="text-2xl md:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-4">
                    {h1Title}
                  </h1>

                  {/* Ratings */}
                  <div className="flex items-center gap-2 mb-6">
                    <div className="flex items-center text-amber-500">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-current" />
                      ))}
                    </div>
                    <span className="font-bold text-sm text-slate-800">{ratingValue}</span>
                    <span className="text-xs text-slate-400">({reviewCount} reviews)</span>
                  </div>

                  <p className="text-slate-600 text-base md:text-lg mb-8 leading-relaxed">
                    {cleanDescription}
                  </p>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">100% Verified Experts</p>
                        <p className="text-xs text-slate-400">Trained & background-checked</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Prompt & Reliable</p>
                        <p className="text-xs text-slate-400">Arrives exactly on time</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Price & CTA Button */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-6 border-t border-slate-100">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-0.5">Price Starts From</span>
                    <div className="flex items-baseline gap-2">
                      {serviceData.price ? (
                        <>
                          <span className="text-2xl md:text-3xl font-extrabold text-slate-900">
                            {symbol}{serviceData.discountedPrice || serviceData.price}
                          </span>
                          {serviceData.discountedPrice && (
                            <span className="text-sm text-slate-400 line-through">
                              {symbol}{serviceData.price}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-lg md:text-xl font-bold text-slate-700">Flexible Pricing</span>
                      )}
                    </div>
                  </div>

                  <Link href={`/service/${serviceData.slug}`} className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto px-8 py-6 rounded-xl font-bold text-base shadow-lg shadow-primary/25 hover:shadow-primary/35 transition-all group flex items-center justify-center gap-2">
                      <span>Book Service Now</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right Column: Image Banner */}
              <div className="relative min-h-[300px] lg:col-span-5 bg-slate-900 overflow-hidden order-1 lg:order-2">
                <AppImage
                  src={serviceData.imageUrl || "/default-image.png"}
                  alt={h1Title}
                  fill
                  className="object-cover opacity-90 transition-transform duration-500 hover:scale-105"
                  sizes="(max-width: 1024px) 100vw, 40vw"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent lg:bg-gradient-to-l" />
                <div className="absolute bottom-6 left-6 right-6 text-white lg:hidden">
                  <span className="text-xs font-semibold text-primary-foreground/90 uppercase tracking-wider block mb-1">Yourbrand Local Service</span>
                  <h3 className="text-xl font-extrabold tracking-tight">{serviceData.name}</h3>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dynamic Inclusions & Exclusions */}
        {((serviceData.includedItems && serviceData.includedItems.length > 0) || (serviceData.excludedItems && serviceData.excludedItems.length > 0)) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            {/* Inclusions */}
            {serviceData.includedItems && serviceData.includedItems.length > 0 && (
              <Card className="border-none shadow-md shadow-slate-100 bg-white rounded-xl">
                <CardContent className="p-3">
                  <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                    What's Included
                  </h3>
                  <ul className="space-y-3">
                    {serviceData.includedItems.map((item: string, idx: number) => (
                      <li key={idx} className="flex gap-2.5 items-start text-sm text-slate-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 mt-2" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Exclusions */}
            {serviceData.excludedItems && serviceData.excludedItems.length > 0 && (
              <Card className="border-none shadow-md shadow-slate-100 bg-white rounded-xl">
                <CardContent className="p-3">
                  <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-rose-500 shrink-0" />
                    What's Excluded
                  </h3>
                  <ul className="space-y-3">
                    {serviceData.excludedItems.map((item: string, idx: number) => (
                      <li key={idx} className="flex gap-2.5 items-start text-sm text-slate-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0 mt-2" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Custom Long Form HTML SEO Content */}
        {customSeoContent && (
          <Card className="border-none shadow-md shadow-slate-100 bg-white rounded-xl mt-8">
            <CardContent className="p-3 md:p-8">
              <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-6 flex items-center gap-2 pb-3 border-b">
                <Sparkles className="h-5 w-5 text-primary" />
                Service Details in {areaData.name}
              </h2>
              <div 
                className="prose prose-slate max-w-none text-slate-600 text-sm md:text-base leading-relaxed space-y-4"
                dangerouslySetInnerHTML={{ __html: customSeoContent }}
              />
            </CardContent>
          </Card>
        )}

        {/* Collapsible Accordion FAQs */}
        {faqs.length > 0 && (
          <Card className="border-none shadow-md shadow-slate-100 bg-white rounded-xl mt-8">
            <CardContent className="p-3 md:p-8">
              <h2 className="text-lg md:text-xl font-bold text-slate-900 mb-6 pb-3 border-b">
                Frequently Asked Questions
              </h2>
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, index) => (
                  <AccordionItem key={index} value={`item-${index}`} className="border-slate-100">
                    <AccordionTrigger className="text-left font-semibold text-slate-800 hover:text-primary transition-colors py-4 text-sm md:text-base">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-slate-500 text-sm leading-relaxed pb-4">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Dynamic Nearby Locations Directory */}
        {cityAreas && cityAreas.length > 0 && (
          <Card className="border-none shadow-md shadow-slate-100 bg-white rounded-xl mt-8">
            <CardContent className="p-6">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Other Areas Served for {serviceData.name} in {cityData.name}
              </h3>
              <div className="flex flex-wrap gap-2">
                {cityAreas.filter(a => a.id !== areaData.id && a.isActive).slice(0, 20).map((area) => (
                  <Link
                    key={area.id}
                    href={`/${cityData.slug}/${area.slug}/service/${serviceData.slug}`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-primary/10 hover:text-primary transition-all font-semibold"
                  >
                    {serviceData.name} in {area.name}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Localized Footer Interlinking Section */}
        <div className="mt-12 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center justify-center gap-3 p-4 rounded-xl bg-slate-100/60 border border-slate-200/50">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-semibold text-slate-600">
              Need assistance with other services in {areaData.name}?
            </span>
            <Link href={`/${cityData.slug}/${areaData.slug}`} className="text-primary font-bold text-sm hover:underline flex items-center gap-1">
              <span>View All Services</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
