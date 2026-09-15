import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, FirestoreArea, AreaCategorySeoSetting } from '@/types/firestore';
import CategoryPageClient from '@/components/category/CategoryPageClient';
import type { BreadcrumbItem } from '@/types/ui';
import { notFound } from 'next/navigation';
import type { Metadata, ResolvingMetadata } from 'next';
import { replacePlaceholders, defaultSeoValues } from '@/lib/seoUtils';
import { getGlobalSEOSettings, getAreaCategorySeoOverride } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { getCategoryFullData, getAggregateRating } from '@/lib/homepageUtils';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getCategorySearchTerm, generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';
import { getSpinnedLocalContent } from '@/lib/seoGenerator';

export const revalidate = false;

export async function generateStaticParams() {
  return [];
}

interface AreaCategoryPageProps {
  params: Promise<{ city: string; area: string; categorySlug: string }>;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

const getPageData = cache(async (citySlug: string, areaSlug: string, categorySlug: string) => {
  return unstable_cache(
    async () => {
      try {
        if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.') || areaSlug.includes('.') || categorySlug.includes('.')) return null;
        
        const citiesRef = adminDb.collection('cities');
        const cityQuery = citiesRef.where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
        const citySnapshot = await cityQuery.get();
        if (citySnapshot.empty) return null;
        const cityData = { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;

        const areasRef = adminDb.collection('areas');
        const areaQuery = areasRef.where('cityId', '==', cityData.id).where('slug', '==', areaSlug).where('isActive', '==', true).limit(1);
        const areaSnapshot = await areaQuery.get();
        if (areaSnapshot.empty) return null;
        const areaData = { id: areaSnapshot.docs[0].id, ...areaSnapshot.docs[0].data() } as FirestoreArea;

        // Get all active areas in the same city to dynamically interlink nearby areas
        const cityAreasQuery = areasRef.where('cityId', '==', cityData.id).where('isActive', '==', true);
        const cityAreasSnapshot = await cityAreasQuery.get();
        const cityAreas = cityAreasSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as FirestoreArea[];

        const categoriesRef = adminDb.collection('adminCategories');
        const categoryQuery = categoriesRef.where('slug', '==', categorySlug).limit(1);
        const categorySnapshot = await categoryQuery.get();
        if (categorySnapshot.empty) return null;
        const categoryData = { id: categorySnapshot.docs[0].id, ...categorySnapshot.docs[0].data() } as FirestoreCategory;

        let seoOverride: AreaCategorySeoSetting | null = null;
        if (areaData && categoryData) {
          seoOverride = await getAreaCategorySeoOverride(areaData.id, categoryData.id);
        }

        return { cityData, areaData, categoryData, seoOverride, cityAreas };
      } catch (error) {
        console.error(`[AreaCategoryPage] Error fetching page data:`, error);
        return null;
      }
    },
    [`area-category-data-${citySlug}-${areaSlug}-${categorySlug}`],
    { revalidate: false, tags: ['cities', 'areas', 'categories', 'seo-settings', 'global-cache'] }
  )();
});

export async function generateMetadata(
  { params }: AreaCategoryPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { city: citySlug, area: areaSlug, categorySlug } = await params;
  const pageData = await getPageData(citySlug, areaSlug, categorySlug);
  
  if (!pageData) return {};
  const { cityData, areaData, categoryData, seoOverride } = pageData;

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const searchTerm = getCategorySearchTerm(categoryData.name);
  const placeholderData = { cityName: cityData.name, areaName: areaData.name, categoryName: categoryData.name, categorySearchTerm: searchTerm };

  // PRIORITY: 1. Manual Override | 2. Global Pattern (Dynamic) | 3. Generic Category SEO
  const title = replacePlaceholders(
    seoOverride?.meta_title || seoSettings.areaCategoryPageTitlePattern || categoryData.metaTitle || categoryData.seo_title, 
    placeholderData,
    true
  ) || `Best ${searchTerm} in ${areaData.name}, ${cityData.name} | Expert ${searchTerm} Near Me`;

  const description = replacePlaceholders(
    seoOverride?.meta_description || seoSettings.areaCategoryPageDescriptionPattern || categoryData.metaDescription || categoryData.seo_description, 
    placeholderData
  ) || `Hire top-rated ${searchTerm} experts in ${areaData.name}, ${cityData.name}. Trusted professionals, transparent pricing, and quality home services near you.`;

  const keywords = (replacePlaceholders(
    seoOverride?.meta_keywords || seoSettings.areaCategoryPageKeywordsPattern || categoryData.metaKeywords || categoryData.seo_keywords, 
    placeholderData
  ) || `${searchTerm} in ${areaData.name}, best ${searchTerm} near me`).split(',').map(k => k.trim()).filter(k => k);

  const rawOgImage = categoryData.imageUrl || seoSettings.structuredDataImage || `/default-image.png`;
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
      canonical: `${appBaseUrl}/${citySlug}/${areaSlug}/${categorySlug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/${citySlug}/${areaSlug}/${categorySlug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'website',
    },
  };
}

export default async function AreaCategoryPage({ params }: AreaCategoryPageProps) {
  const { city: citySlug, area: areaSlug, categorySlug: catSlug } = await params;

  if (RESERVED_SLUGS.includes(citySlug)) {
    notFound();
  }

  const [pageData, fullCategoryData, aggregateRating, appConfig] = await Promise.all([
    getPageData(citySlug, areaSlug, catSlug),
    getCategoryFullData(catSlug, citySlug, areaSlug),
    getAggregateRating(),
    getGlobalAppSettings()
  ]);
  const symbol = appConfig?.currencySymbol || "₹";

  if (!pageData) {
    notFound();
  }
  const { cityData, areaData, categoryData, seoOverride } = pageData;

  const seoSettings = await getGlobalSEOSettings();
  const searchTerm = getCategorySearchTerm(categoryData.name);
  const placeholderData = { cityName: cityData.name, areaName: areaData.name, categoryName: categoryData.name, categorySearchTerm: searchTerm };
  
  // PRIORITY: 1. Manual Override | 2. Global Pattern (Dynamic) | 3. Generic Category SEO
  const h1Title = replacePlaceholders(
    seoOverride?.h1_title || seoSettings.areaCategoryPageH1Pattern || categoryData.h1_title, 
    placeholderData
  ) || `Best Professional ${searchTerm} in ${areaData.name}, ${cityData.name}`;

  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  breadcrumbItems.push({ label: cityData.name, href: `/${citySlug}` });
  breadcrumbItems.push({ label: areaData.name, href: `/${citySlug}/${areaSlug}` });
  breadcrumbItems.push({ label: categoryData.name });

  const appBaseUrl = getBaseUrl();
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: appBaseUrl },
    { name: cityData.name, url: `${appBaseUrl}/${citySlug}` },
    { name: areaData.name, url: `${appBaseUrl}/${citySlug}/${areaSlug}` },
    { name: categoryData.name, url: `${appBaseUrl}/${citySlug}/${areaSlug}/${catSlug}` }
  ]);

  // Generate server-rendered FAQ schema
  const areaFaqsTemplate = seoSettings.areaCategoryFaqsTemplate || defaultSeoValues.areaCategoryFaqsTemplate;
  const rawFaqs = seoOverride?.faqs || (areaFaqsTemplate && areaFaqsTemplate.length > 0 ? areaFaqsTemplate : []) || categoryData.faqs || [];
  
  const faqs = rawFaqs.map(f => ({
    question: replacePlaceholders(f.question, placeholderData),
    answer: replacePlaceholders(f.answer, placeholderData)
  }));

  const faqSchema = faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  } : null;

  const rawSchemaImage = categoryData.imageUrl || `/android-chrome-512x512.png`;
  const schemaImage = rawSchemaImage.startsWith('http') ? rawSchemaImage : `${appBaseUrl}${rawSchemaImage.startsWith('/') ? '' : '/'}${rawSchemaImage}`;
  const areaCatRatingValNum = parseFloat(String(aggregateRating?.ratingValue || seoSettings.fallbackRatingValue || "4.8")) || 4.8;
  const areaCatReviewCountNum = parseInt(String(aggregateRating?.reviewCount || seoSettings.fallbackReviewCount || "156"), 10) || 156;

  const areaCategorySchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": `${searchTerm} in ${areaData.name}, ${cityData.name}`,
    "description": seoOverride?.meta_description || categoryData.metaDescription || `Professional ${searchTerm} services in ${areaData.name}, ${cityData.name}. Trusted experts by Yourbrand.`,
    "image": schemaImage,
    "telephone": seoSettings.structuredDataTelephone,
    "priceRange": `${symbol}${symbol}`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": areaData.name,
      "addressRegion": cityData.name,
      "addressCountry": "IN"
    },
    "areaServed": {
      "@type": "AdministrativeArea",
      "name": areaData.name
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": areaCatRatingValNum,
      "reviewCount": areaCatReviewCountNum,
      "bestRating": 5,
      "worstRating": 1
    }
  };

  return (
    <>
      <JsonLdScript data={areaCategorySchema} idSuffix={`area-cat-${cityData.id}-${areaData.id}-${categoryData.id}`} />
      <JsonLdScript data={breadcrumbSchema} idSuffix={`breadcrumb-area-cat-${cityData.id}-${areaData.id}-${categoryData.id}`} />
      {faqSchema && <JsonLdScript data={faqSchema} idSuffix={`faqs-area-cat-${cityData.id}-${areaData.id}-${categoryData.id}`} />}
      <CategoryPageClient 
      categorySlug={catSlug} 
      citySlug={citySlug} 
      areaSlug={areaSlug} 
      cityName={cityData.name}
      areaName={areaData.name}
      breadcrumbItems={breadcrumbItems} 
      initialData={fullCategoryData || undefined}
      initialH1Title={h1Title}
      />
    </>
  );
}

