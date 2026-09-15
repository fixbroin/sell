
import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; // Import the helper
import { getGlobalWebSettings } from '@/lib/webServerUtils';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

interface CategoryPageLayoutProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

const getCategoryData = cache(async (slug: string): Promise<FirestoreCategory | null> => {
  return unstable_cache(
    async () => {
      try {
        const catRef = adminDb.collection('adminCategories');
        const q = catRef.where('slug', '==', slug).where('isActive', '==', true).limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() } as FirestoreCategory;
      } catch (error) {
        console.error('Error fetching category data for metadata:', error);
        return null;
      }
    },
    [`category-layout-data-${slug}`],
    { revalidate: false, tags: ['categories', `category-${slug}`, 'global-cache'] }
  )();
});

export async function generateMetadata(
  { params }: CategoryPageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const { slug } = await params;
  const categoryData = await getCategoryData(slug);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Yourbrand";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); // Use the helper


  if (!categoryData) {
    return {
      title: `Category Not Found${defaultSuffix}`,
      description: 'The category you are looking for does not exist.',
      openGraph: {
        title: `Category Not Found${defaultSuffix}`,
        description: 'The category you are looking for does not exist.',
        siteName: siteName,
      }
    };
  }

  const titleData = { categoryName: categoryData.name };
  const title = categoryData.seo_title || replacePlaceholders(seoSettings.categoryPageTitlePattern, titleData) || `${categoryData.name}${defaultSuffix}`;
  const description = categoryData.seo_description || replacePlaceholders(seoSettings.categoryPageDescriptionPattern, titleData) || seoSettings.defaultMetaDescription || `Services in ${categoryData.name}`;
  const keywordsStr = categoryData.seo_keywords || replacePlaceholders(seoSettings.categoryPageKeywordsPattern, titleData) || seoSettings.defaultMetaKeywords;
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = categoryData.imageUrl || ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/category/${slug}`;

  return {
    title,
    description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: ogImage ? [{ url: ogImage }] : [],
      siteName,
      type: 'website', 
    },
  };
}

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
