import HomePageClient from '@/components/home/HomePageClient';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreArea, FirestoreCity } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';
import { notFound } from 'next/navigation';
import { getHomepageData, getAggregateRating } from '@/lib/homepageUtils';
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';

export const revalidate = false;

interface AreaPageProps {
  params: Promise<{ city: string; area: string }>;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

const getAreaDataForPage = cache(async (citySlug: string, areaSlug: string): Promise<(FirestoreArea & { parentCityData?: FirestoreCity }) | null> => {
  return unstable_cache(
    async () => {
      try {
        if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.') || areaSlug.includes('.')) {
          return null;
        }

        const citiesRef = adminDb.collection('cities');
        const cityQuery = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
        const citySnapshot = await cityQuery.get();

        if (citySnapshot.empty) {
          return null;
        }
        const parentCityDoc = citySnapshot.docs[0];
        const parentCityData = { id: parentCityDoc.id, ...parentCityDoc.data() } as FirestoreCity;

        const areasRef = adminDb.collection('areas');
        const areaQuery = areasRef
          .where('slug', '==', areaSlug)
          .where('cityId', '==', parentCityData.id)
          .where('isActive', '==', true)
          .limit(1);
        const areaSnapshot = await areaQuery.get();

        if (areaSnapshot.empty) {
          return null;
        }
        const doc = areaSnapshot.docs[0];
        const areaData = { id: doc.id, ...doc.data() } as FirestoreArea;
        return { ...areaData, parentCityData };

      } catch (error) {
        console.error(`[AreaPage] Error fetching area data for page:`, error);
        return null;
      }
    },
    [`city-area-data-${citySlug}-${areaSlug}`],
    { revalidate: false, tags: ['cities', 'areas', `city-area-${citySlug}-${areaSlug}`, 'global-cache'] }
  )();
});


export async function generateMetadata(
  { params }: AreaPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { city: citySlug, area: areaSlug } = await params;
  const areaData = await getAreaDataForPage(citySlug, areaSlug);
  
  if (!areaData) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const placeholderData = { areaName: areaData.name, cityName: areaData.parentCityData?.name };

  const title = replacePlaceholders(areaData.seo_title || areaData.metaTitle || seoSettings.areaPageTitlePattern, placeholderData) || `${areaData.name}, ${areaData.parentCityData?.name} | Yourbrand`;
  const description = replacePlaceholders(areaData.seo_description || areaData.metaDescription || seoSettings.areaPageDescriptionPattern, placeholderData) || `Trusted home services in ${areaData.name}, ${areaData.parentCityData?.name}.`;
  const keywords = replacePlaceholders(areaData.seo_keywords || areaData.metaKeywords || seoSettings.areaPageKeywordsPattern, placeholderData).split(',').map(k => k.trim()).filter(k => k);

  const rawOgImage = areaData.imageUrl || seoSettings.structuredDataImage || `/default-image.png`;
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
      canonical: `${appBaseUrl}/${citySlug}/${areaSlug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/${citySlug}/${areaSlug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'website',
    },
  };
}

export async function generateStaticParams() {
  return [];
}

export default async function AreaHomePage({ params }: AreaPageProps) {
  const { city: citySlug, area: areaSlug } = await params;

  if (citySlug.includes('.') || areaSlug.includes('.') || RESERVED_SLUGS.includes(citySlug)) {
    notFound();
  }
  
  const [areaData, homepageData, aggregateRating, appConfig] = await Promise.all([
    getAreaDataForPage(citySlug, areaSlug),
    getHomepageData(),
    getAggregateRating(),
    getGlobalAppSettings()
  ]);
  const symbol = appConfig?.currencySymbol || "₹";
  
  if (!areaData) {
    notFound();
  }

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  breadcrumbItems.push({ label: areaData.parentCityData!.name, href: `/${citySlug}` });
  breadcrumbItems.push({ label: areaData.name });

  const seoSettings = homepageData.seoSettings;
  const appBaseUrl = getBaseUrl();
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: appBaseUrl },
    { name: areaData.parentCityData!.name, url: `${appBaseUrl}/${citySlug}` },
    { name: areaData.name, url: `${appBaseUrl}/${citySlug}/${areaSlug}` }
  ]);
  const placeholderData = { areaName: areaData.name, cityName: areaData.parentCityData?.name };

  const h1Title = replacePlaceholders(areaData.h1_title || seoSettings.areaPageH1Pattern, placeholderData) || `Expert Home Services in ${areaData.name}`;

  const rawSchemaImage = areaData.imageUrl || seoSettings.structuredDataImage || `/android-chrome-512x512.png`;
  const schemaImage = rawSchemaImage.startsWith('http') ? rawSchemaImage : `${appBaseUrl}${rawSchemaImage.startsWith('/') ? '' : '/'}${rawSchemaImage}`;

  const areaRatingValNum = parseFloat(String(aggregateRating?.ratingValue || seoSettings.fallbackRatingValue || "4.8")) || 4.8;
  const areaReviewCountNum = parseInt(String(aggregateRating?.reviewCount || seoSettings.fallbackReviewCount || "156"), 10) || 156;

  const areaSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": `Home Services in ${areaData.name}, ${areaData.parentCityData!.name}`,
    "description": areaData.seo_description || areaData.metaDescription || `Reliable home services in ${areaData.name}.`,
    "image": schemaImage,
    "telephone": seoSettings.structuredDataTelephone,
    "priceRange": `${symbol}${symbol}`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": areaData.name,
      "addressRegion": areaData.parentCityData!.name,
      "addressCountry": "IN"
    },
    "areaServed": {
      "@type": "AdministrativeArea",
      "name": areaData.name
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": areaRatingValNum,
      "reviewCount": areaReviewCountNum,
      "bestRating": 5,
      "worstRating": 1
    }
  };

  return (
    <>
      <JsonLdScript data={areaSchema} idSuffix={`area-${areaData.id}`} />
      <JsonLdScript data={breadcrumbSchema} idSuffix={`breadcrumb-area-${areaData.id}`} />
      <HomePageClient citySlug={citySlug} areaSlug={areaSlug} breadcrumbItems={breadcrumbItems} initialData={homepageData} initialH1Title={h1Title} />
    </>
  );
}
