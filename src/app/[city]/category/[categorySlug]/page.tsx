import CategoryPageClient from '@/components/category/CategoryPageClient';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, CityCategorySeoSetting } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';
import { notFound } from 'next/navigation';
import { getCategoryFullData, getAggregateRating } from '@/lib/homepageUtils';
import type { Metadata, ResolvingMetadata } from 'next';
import { replacePlaceholders, defaultSeoValues } from '@/lib/seoUtils';
import { getGlobalSEOSettings, getCityCategorySeoOverride } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';

export const revalidate = false;

export async function generateStaticParams() {
  return [];
}
 // Persistent Cache

interface PageProps {
  params: Promise<{ city: string; categorySlug: string }>;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

const getPageData = cache(async (citySlug: string, categorySlug: string): Promise<{ city: FirestoreCity | null; category: FirestoreCategory | null; seoOverride: CityCategorySeoSetting | null }> => {
  return unstable_cache(
    async () => {
      if (RESERVED_SLUGS.includes(citySlug) || citySlug.includes('.') || categorySlug.includes('.')) {
        return { city: null, category: null, seoOverride: null };
      }

      let cityData: FirestoreCity | null = null;
      let categoryData: FirestoreCategory | null = null;

      try {
        const cityQuery = adminDb.collection('cities').where('slug', '==', citySlug).where('isActive', '==', true).limit(1);
        const citySnapshot = await cityQuery.get();
        if (!citySnapshot.empty) {
          const doc = citySnapshot.docs[0];
          cityData = { id: doc.id, ...doc.data() } as FirestoreCity;
        }
      } catch (error) {
        console.error(`[CityCategoryPage] Page: Error fetching city data for slug ${citySlug}:`, error);
      }

      try {
        const categoryQuery = adminDb.collection('adminCategories').where('slug', '==', categorySlug).limit(1);
        const categorySnapshot = await categoryQuery.get();
        if (!categorySnapshot.empty) {
          const doc = categorySnapshot.docs[0];
          categoryData = { id: doc.id, ...doc.data() } as FirestoreCategory;
        }
      } catch (error) {
        console.error(`[CityCategoryPage] Page: Error fetching category data for slug ${categorySlug}:`, error);
      }

      let seoOverride: CityCategorySeoSetting | null = null;
      if (cityData && categoryData) {
        seoOverride = await getCityCategorySeoOverride(cityData.id, categoryData.id);
      }

      return { city: cityData, category: categoryData, seoOverride };
    },
    [`city-category-data-${citySlug}-${categorySlug}`],
    { revalidate: false, tags: ['cities', 'categories', 'seo-settings', `city-cat-${citySlug}-${categorySlug}`, 'global-cache'] }
  )();
});


export async function generateMetadata(
  { params }: PageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { city: citySlug, categorySlug } = await params;
  const { city: cityData, category: categoryData, seoOverride } = await getPageData(citySlug, categorySlug);

  if (!cityData || !categoryData) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const placeholderData = { cityName: cityData.name, categoryName: categoryData.name };

  // PRIORITY: 1. Manual Override | 2. Global Pattern (Dynamic) | 3. Generic Category SEO
  const title = replacePlaceholders(
    seoOverride?.meta_title || seoSettings.cityCategoryPageTitlePattern || categoryData.metaTitle || categoryData.seo_title, 
    placeholderData,
    true
  ) || `Best ${categoryData.name} Services in ${cityData.name} | Professional ${categoryData.name} Near Me`;

  const description = replacePlaceholders(
    seoOverride?.meta_description || seoSettings.cityCategoryPageDescriptionPattern || categoryData.metaDescription || categoryData.seo_description, 
    placeholderData
  ) || `Hire the best professional ${categoryData.name} services in ${cityData.name}. Trusted experts, transparent pricing, and high-quality home solutions near you.`;

  const keywords = (replacePlaceholders(
    seoOverride?.meta_keywords || seoSettings.cityCategoryPageKeywordsPattern || categoryData.metaKeywords || categoryData.seo_keywords, 
    placeholderData
  ) || `${categoryData.name} in ${cityData.name}, best ${categoryData.name} near me`).split(',').map(k => k.trim()).filter(k => k);

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
      canonical: `${appBaseUrl}/${citySlug}/category/${categorySlug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/${citySlug}/category/${categorySlug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'website',
    },
  };
}

export default async function CityCategoryPage({ params }: PageProps) {
  const { city: citySlugParam, categorySlug: categorySlugParam } = await params;

  if (RESERVED_SLUGS.includes(citySlugParam)) {
    notFound();
  }

  const [pageData, fullCategoryData, aggregateRating, appConfig] = await Promise.all([
    getPageData(citySlugParam, categorySlugParam),
    getCategoryFullData(categorySlugParam, citySlugParam),
    getAggregateRating(),
    getGlobalAppSettings()
  ]);
  const symbol = appConfig?.currencySymbol || "₹";

  const { city: cityData, category: categoryData, seoOverride } = pageData;

  if (!cityData || !categoryData) {
    notFound();
  }

  const seoSettings = await getGlobalSEOSettings();
  const placeholderData = { cityName: cityData.name, categoryName: categoryData.name };
  
  // PRIORITY: 1. Manual Override | 2. Global Pattern (Dynamic) | 3. Generic Category SEO
  const h1Title = replacePlaceholders(
    seoOverride?.h1_title || seoSettings.cityCategoryPageH1Pattern || categoryData.h1_title, 
    placeholderData
  ) || `Best Professional ${categoryData.name} Services in ${cityData.name}`;

  const appBaseUrl = getBaseUrl();
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  breadcrumbItems.push({ label: cityData.name, href: `/${citySlugParam}` });
  breadcrumbItems.push({ label: categoryData.name });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: appBaseUrl },
    { name: cityData.name, url: `${appBaseUrl}/${citySlugParam}` },
    { name: categoryData.name, url: `${appBaseUrl}/${citySlugParam}/category/${categorySlugParam}` }
  ]);

  // Generate server-rendered FAQ schema
  const cityFaqsTemplate = seoSettings.cityCategoryFaqsTemplate || defaultSeoValues.cityCategoryFaqsTemplate;
  const rawFaqs = seoOverride?.faqs || (cityFaqsTemplate && cityFaqsTemplate.length > 0 ? cityFaqsTemplate : []) || categoryData.faqs || [];
  
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
  const cityCatRatingValNum = parseFloat(String(aggregateRating?.ratingValue || seoSettings.fallbackRatingValue || "4.8")) || 4.8;
  const cityCatReviewCountNum = parseInt(String(aggregateRating?.reviewCount || seoSettings.fallbackReviewCount || "16656"), 10) || 16656;

  const categoryCitySchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "name": `${categoryData.name} in ${cityData.name}`,
    "description": seoOverride?.meta_description || categoryData.metaDescription || `Professional ${categoryData.name} services in ${cityData.name}. Trusted home maintenance and repairs by Yourbrand.`,
    "image": schemaImage,
    "telephone": seoSettings.structuredDataTelephone,
    "priceRange": `${symbol}${symbol}`,
    "address": {
      "@type": "PostalAddress",
      "addressLocality": cityData.name,
      "addressRegion": "Karnataka",
      "addressCountry": "IN"
    },
    "areaServed": {
      "@type": "City",
      "name": cityData.name
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": cityCatRatingValNum,
      "reviewCount": cityCatReviewCountNum,
      "bestRating": 5,
      "worstRating": 1
    }
  };

  return (
    <>
      <JsonLdScript data={categoryCitySchema} idSuffix={`city-cat-${cityData.id}-${categoryData.id}`} />
      <JsonLdScript data={breadcrumbSchema} idSuffix={`breadcrumb-city-cat-${cityData.id}-${categoryData.id}`} />
      {faqSchema && <JsonLdScript data={faqSchema} idSuffix={`faqs-city-cat-${cityData.id}-${categoryData.id}`} />}
      <CategoryPageClient 
      categorySlug={categorySlugParam} 
      citySlug={citySlugParam} 
      cityName={cityData.name}
      breadcrumbItems={breadcrumbItems} 
      initialData={fullCategoryData || undefined}
      initialH1Title={h1Title}
      />
    </>
  );
}

