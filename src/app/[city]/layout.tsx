import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCity, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config';
import { getGlobalWebSettings } from '@/lib/webServerUtils';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

interface CityPageLayoutProps {
  params: Promise<{ city: string }>;
  children: React.ReactNode;
}

const RESERVED_SLUGS = ['api', 'admin', 'provider', 'auth', 'static', '_next'];

// Function to fetch city data by slug
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
        console.error(`[CityLayout] Error fetching city data for slug "${slug}":`, error);
        return null;
      }
    },
    [`city-layout-data-${slug}`],
    { revalidate: false, tags: ['cities', `city-${slug}`, 'global-cache'] }
  )();
});


export default function CityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
