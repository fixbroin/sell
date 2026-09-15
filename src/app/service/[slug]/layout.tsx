
import type { Metadata, ResolvingMetadata } from 'next';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreService, FirestoreCategory, FirestoreSubCategory, FirestoreSEOSettings, GlobalWebSettings } from '@/types/firestore';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; // Import the helper
import { getGlobalWebSettings } from '@/lib/webServerUtils';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

interface ServicePageLayoutProps {
  params: Promise<{ slug: string }>;
  children: React.ReactNode;
}

interface ServicePageData extends FirestoreService {
  categoryName?: string;
  categorySlug?: string;
  subCategoryName?: string;
}

const getServicePageData = cache(async (slug: string): Promise<ServicePageData | null> => {
  return unstable_cache(
    async () => {
      try {
        const servRef = adminDb.collection('adminServices');
        const q = servRef.where('slug', '==', slug).where('isActive', '==', true).limit(1);
        const snapshot = await q.get();
        if (snapshot.empty) return null;

        const serviceDoc = snapshot.docs[0];
        if (!serviceDoc.exists) return null;

        const serviceData = { id: serviceDoc.id, ...serviceDoc.data() } as ServicePageData;

        if (serviceData.subCategoryId) {
          const subCatDoc = await adminDb.collection('adminSubCategories').doc(serviceData.subCategoryId).get();
          if (subCatDoc.exists) {
            const subCategory = subCatDoc.data() as FirestoreSubCategory | undefined; 
            if (subCategory) { 
              serviceData.subCategoryName = subCategory.name;
              if (subCategory.parentId) {
                const catDoc = await adminDb.collection('adminCategories').doc(subCategory.parentId).get();
                if (catDoc.exists) {
                  const category = catDoc.data() as FirestoreCategory | undefined; 
                  if (category) { 
                    serviceData.categoryName = category.name;
                    serviceData.categorySlug = category.slug;
                  }
                }
              }
            }
          }
        }
        return serviceData;
      } catch (error) {
        console.error('Error fetching service data for metadata:', error);
        return null;
      }
    },
    [`service-layout-data-${slug}`],
    { revalidate: false, tags: ['services', `service-${slug}`, 'global-cache'] }
  )();
});

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
