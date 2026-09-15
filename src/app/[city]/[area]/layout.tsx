import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreArea, FirestoreCity, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import { getGlobalWebSettings } from '@/lib/webServerUtils';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

interface AreaPageLayoutProps {
  params: Promise<{ city: string; area: string }>;
  children: React.ReactNode;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

const getAreaData = cache(async (citySlug: string, areaSlug: string): Promise<(FirestoreArea & { parentCityData?: FirestoreCity }) | null> => {
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
        const parentCityData = { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;

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
        console.error(`[AreaLayout] Error fetching area data for city "${citySlug}", area "${areaSlug}":`, error);
        return null;
      }
    },
    [`area-layout-data-${citySlug}-${areaSlug}`],
    { revalidate: false, tags: ['cities', 'areas', `city-${citySlug}`, `area-${areaSlug}`, 'global-cache'] }
  )();
});

export async function generateMetadata(
  { params }: AreaPageLayoutProps,
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;
  const { city: citySlug, area: areaSlug } = await params;

  if (citySlug.includes('.') || areaSlug.includes('.') || RESERVED_SLUGS.includes(citySlug)) {
    return {
      title: 'Not Found',
      description: 'The requested resource was not found.',
    };
  }

  const areaData = await getAreaData(citySlug, areaSlug);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Yourbrand";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); 

  if (!areaData || !areaData.parentCityData) {
    return {
      title: `Area Not Found${defaultSuffix}`,
      description: 'The area page you are looking for does not exist.',
    };
  }

  const placeholderData = {
    areaName: areaData.name,
    cityName: areaData.parentCityData.name,
    siteName: siteName,
  };

  // Use area's direct SEO fields first, then fall back to patterns
  const title = areaData.seo_title?.trim() ? areaData.seo_title :
                replacePlaceholders(seoSettings.areaPageTitlePattern, placeholderData) || 
                `${areaData.name}, ${areaData.parentCityData.name}${defaultSuffix}`;

  const description = areaData.seo_description?.trim() ? areaData.seo_description :
                      replacePlaceholders(seoSettings.areaPageDescriptionPattern, placeholderData) || 
                      `Find home services in ${areaData.name}, ${areaData.parentCityData.name}. ${seoSettings.defaultMetaDescription}`;
                      
  const keywordsStr = areaData.seo_keywords?.trim() ? areaData.seo_keywords :
                      replacePlaceholders(seoSettings.areaPageKeywordsPattern, placeholderData) || 
                      seoSettings.defaultMetaKeywords;
  const keywords = keywordsStr?.split(',').map(k => k.trim()).filter(k => k);
  
  const ogImageFromWebSettings = webSettings?.websiteIconUrl || webSettings?.logoUrl;
  const ogImage = ogImageFromWebSettings || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${citySlug}/${areaSlug}`;

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
      siteName: siteName,
      type: 'website',
    },
  };
}

export default function AreaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
