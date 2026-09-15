import CategoryPageClient from '@/components/category/CategoryPageClient';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreService } from '@/types/firestore';
import type { BreadcrumbItem } from '@/types/ui';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { getBaseUrl } from '@/lib/config';
import { getCategoryFullData, getAggregateRating } from '@/lib/homepageUtils';
import type { Metadata, ResolvingMetadata } from 'next';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';

export const revalidate = false;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

const getCategoryDataForPage = cache(async (slug: string): Promise<{category: FirestoreCategory, aggregateRating?: any} | null> => {
  return unstable_cache(
    async () => {
      try {
        const catRef = adminDb.collection('adminCategories');
        const q = catRef.where('slug', '==', slug).where('isActive', '==', true).limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        const category = { id: doc.id, ...doc.data() } as FirestoreCategory;

        const subCatsSnap = await adminDb.collection('adminSubCategories').where('parentId', '==', category.id).get();
        const subCatIds = subCatsSnap.docs.map(d => d.id);
        
        let totalRating = 0;
        let totalReviews = 0;
        let minPrice = Infinity;
        let maxPrice = 0;

        const appConfig = await getGlobalAppSettings();
        const symbol = appConfig?.currencySymbol || "₹";

        if (subCatIds.length > 0) {
            const chunks = [];
            for (let i = 0; i < subCatIds.length; i += 10) {
                chunks.push(subCatIds.slice(i, i + 10));
            }

            const servicesPromises = chunks.map(chunk => 
                adminDb.collection('adminServices')
                    .where('isActive', '==', true)
                    .where('subCategoryId', 'in', chunk)
                    .get()
            );

            const servicesSnapshots = await Promise.all(servicesPromises);
            
            servicesSnapshots.forEach(snap => {
                snap.forEach(sDoc => {
                    const sData = sDoc.data() as FirestoreService;
                    if (sData.rating > 0 && sData.reviewCount) {
                        totalRating += (sData.rating * sData.reviewCount);
                        totalReviews += sData.reviewCount;
                    }
                    const currentPrice = sData.discountedPrice || sData.price;
                    if (currentPrice < minPrice) minPrice = currentPrice;
                    if (currentPrice > maxPrice) maxPrice = currentPrice;
                });
            });
        }

        const aggregateRating = totalReviews > 0 ? {
            ratingValue: (totalRating / totalReviews).toFixed(1),
            reviewCount: totalReviews,
            priceRange: minPrice !== Infinity ? `${symbol}${minPrice} - ${symbol}${maxPrice}` : undefined
        } : undefined;

        return { category, aggregateRating };
      } catch (error) {
        console.error('Error fetching category data for page component:', error);
        return null;
      }
    },
    [`category-summary-${slug}`],
    { revalidate: false, tags: ['categories', `category-summary-${slug}`, 'global-cache'] }
  )();
});


export async function generateMetadata(
  { params }: CategoryPageProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategoryDataForPage(slug);
  
  if (!data) return {};

  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const placeholderData = { categoryName: data.category.name };

  const title = replacePlaceholders(data.category.meta_title || data.category.metaTitle || data.category.seo_title || seoSettings.categoryPageTitlePattern, placeholderData) || `${data.category.name} Services | Yourbrand`;
  const description = replacePlaceholders(data.category.meta_description || data.category.metaDescription || data.category.seo_description || seoSettings.categoryPageDescriptionPattern, placeholderData) || `Professional ${data.category.name} services near you.`;
  const keywords = replacePlaceholders(data.category.meta_keywords || data.category.metaKeywords || data.category.seo_keywords || seoSettings.categoryPageKeywordsPattern, placeholderData).split(',').map(k => k.trim()).filter(k => k);

  const rawOgImage = data.category.imageUrl || seoSettings.structuredDataImage || `/default-image.png`;
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
      canonical: `${appBaseUrl}/category/${slug}`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/category/${slug}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
      type: 'website',
    },
  };
}

export async function generateStaticParams() {
  return [];
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  
  const [data, fullCategoryData] = await Promise.all([
    getCategoryDataForPage(slug),
    getCategoryFullData(slug)
  ]);
  
  const appBaseUrl = getBaseUrl();
  const breadcrumbItems: BreadcrumbItem[] = [{ label: "Home", href: "/" }];
  
  if (data) {
    breadcrumbItems.push({ label: data.category.name });
    
    const breadcrumbSchema = generateBreadcrumbSchema([
      { name: "Home", url: appBaseUrl },
      { name: data.category.name, url: `${appBaseUrl}/category/${slug}` }
    ]);

    const seoSettings = await getGlobalSEOSettings();
    const placeholderData = { categoryName: data.category.name };
    const h1Title = replacePlaceholders(data.category.h1_title || seoSettings.categoryPageH1Pattern, placeholderData) || `Expert ${data.category.name} Services`;

    const rawSchemaImage = data.category.imageUrl || `/android-chrome-512x512.png`;
    const schemaImage = rawSchemaImage.startsWith('http') ? rawSchemaImage : `${appBaseUrl}${rawSchemaImage.startsWith('/') ? '' : '/'}${rawSchemaImage}`;
        const catRatingValNum = parseFloat(String(data.aggregateRating?.ratingValue || seoSettings.fallbackRatingValue || "4.8")) || 4.8;
    const catReviewCountNum = parseInt(String(data.aggregateRating?.reviewCount || seoSettings.fallbackReviewCount || "6065"), 10) || 6065;

    const categorySchema = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": `${data.category.name} Services`,
      "description": data.category.seo_description || `Professional ${data.category.name} services near you.`,
      "image": schemaImage,
      "brand": {
        "@type": "Brand",
        "name": "Yourbrand"
      },
      "sku": data.category.id,
      "mpn": data.category.id,
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": catRatingValNum,
        "reviewCount": catReviewCountNum,
        "bestRating": 5,
        "worstRating": 1
      }
    };

    return (
      <>
        <JsonLdScript data={categorySchema} idSuffix={`category-${data.category.id}`} />
        <JsonLdScript data={breadcrumbSchema} idSuffix={`breadcrumb-category-${data.category.id}`} />
        <CategoryPageClient 
            categorySlug={slug} 
            breadcrumbItems={breadcrumbItems} 
            initialData={fullCategoryData || undefined}
            initialH1Title={h1Title}
        />
      </>
    );
  } else {
    breadcrumbItems.push({ label: "Category Not Found" });
    return <CategoryPageClient categorySlug={slug} breadcrumbItems={breadcrumbItems} />;
  }
}
