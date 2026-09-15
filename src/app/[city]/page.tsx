import HomePageClient from '@/components/home/HomePageClient';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCity } from '@/types/firestore';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { notFound } from 'next/navigation';
import { getHomepageData, getAggregateRating } from '@/lib/homepageUtils';
import type { Metadata, ResolvingMetadata } from 'next';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';

export const revalidate = false;

interface CityPageProps {
  params: Promise<{ city: string }>;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next', 'favicon.ico'];

const getCityData = cache(async (slug: string): Promise<FirestoreCity | null> => {
  return unstable_cache(
    async () => {
      try {
        if (slug.includes('.') || RESERVED_SLUGS.includes(slug)) {
          return null;
        }
        const citiesRef = adminDb.collection('cities');
        const q = citiesRef.where('slug', '==', slug).where('isActive', '==', true).limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) {
            return null;
        }
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as FirestoreCity;
      } catch (error) {
        console.error(`[CityPage] Error fetching city data for page:`, error);
        return null;
      }
    },
    [`city-data-${slug}`],
    { revalidate: false, tags: ['cities', `city-${slug}`, 'global-cache'] }
  )();
});


export async function generateMetadata(
  { params }: CityPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { city: citySlug } = await params;
  const cityData = await getCityData(citySlug);
  
  if (!cityData) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const placeholderData = { cityName: cityData.name };

  const title = replacePlaceholders(cityData.seo_title || cityData.metaTitle || seoSettings.cityPageTitlePattern, placeholderData) || `${cityData.name} Home Services | Yourbrand`;
  const description = replacePlaceholders(cityData.seo_description || cityData.metaDescription || seoSettings.cityPageDescriptionPattern, placeholderData) || `Trusted home services in ${cityData.name}.`;
  const keywords = replacePlaceholders(cityData.seo_keywords || cityData.metaKeywords || seoSettings.cityPageKeywordsPattern, placeholderData).split(',').map(k => k.trim()).filter(k => k);

  const rawOgImage = cityData.imageUrl || seoSettings.structuredDataImage || `/default-image.png`;
  const ogImage = rawOgImage.startsWith('http') ? rawOgImage : `${appBaseUrl}${rawOgImage.startsWith('/') ? '' : '/'}${rawOgImage}`;

  return {
    title: title,
    description: description,
    keywords: keywords.length > 0 ? keywords : undefined,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${appBaseUrl}/${citySlug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/${citySlug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'website',
    },
  };
}

export async function generateStaticParams() {
  return [];
}

export default async function CityHomePage({ params }: CityPageProps) {
  const { city: citySlug } = await params;

  if (citySlug.includes('.') || RESERVED_SLUGS.includes(citySlug)) {
    notFound();
  }
  
  const [cityData, homepageData, aggregateRating, seoSettings, appConfig] = await Promise.all([
    getCityData(citySlug),
    getHomepageData(),
    getAggregateRating(),
    getGlobalSEOSettings(),
    getGlobalAppSettings()
  ]);
  const symbol = appConfig?.currencySymbol || "₹";
  
  if (!cityData) {
    notFound();
  }

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  breadcrumbItems.push({ label: cityData.name });

  const appBaseUrl = getBaseUrl();
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: appBaseUrl },
    { name: cityData.name, url: `${appBaseUrl}/${citySlug}` }
  ]);
  const placeholderData = { cityName: cityData.name };
  const h1Title = replacePlaceholders(cityData.h1_title || seoSettings.cityPageH1Pattern, placeholderData) || `Best Professional Home Services in ${cityData.name}`;

  const rawSchemaImage = cityData.imageUrl || seoSettings.structuredDataImage || `/android-chrome-512x512.png`;
  const schemaImage = rawSchemaImage.startsWith('http') ? rawSchemaImage : `${appBaseUrl}${rawSchemaImage.startsWith('/') ? '' : '/'}${rawSchemaImage}`;

  const cityRatingValNum = parseFloat(String(aggregateRating?.ratingValue || seoSettings.fallbackRatingValue || "4.8")) || 4.8;
  const cityReviewCountNum = parseInt(String(aggregateRating?.reviewCount || seoSettings.fallbackReviewCount || "15666"), 10) || 15666;

  const citySchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": `Yourbrand ${cityData.name}`,
    "url": `${appBaseUrl}/${citySlug}`,
    "description": cityData.seo_description || cityData.metaDescription || `Professional home services in ${cityData.name}. Trusted experts by Yourbrand.`,
    "telephone": seoSettings.structuredDataTelephone,
    "image": schemaImage,
    "priceRange": `${symbol}${symbol}`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": cityData.name,
      "addressRegion": seoSettings.structuredDataRegion,
      "addressCountry": "IN"
    },
    "areaServed": {
      "@type": "City",
      "name": cityData.name
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": cityRatingValNum,
      "reviewCount": cityReviewCountNum,
      "bestRating": 5,
      "worstRating": 1
    }
  };

  return (
    <>
      <JsonLdScript data={citySchema} idSuffix={`city-${cityData.id}`} />
      <JsonLdScript data={breadcrumbSchema} idSuffix={`breadcrumb-city-${cityData.id}`} />
      <div className="container mx-auto px-4 pt-4 md:pt-6">
        <Breadcrumbs items={breadcrumbItems} />
      </div>
      <HomePageClient citySlug={citySlug} initialData={homepageData} initialH1Title={h1Title} />
    </>
  );
}

