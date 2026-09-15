// src/lib/seoServerUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import { defaultSeoValues } from './seoUtils';
import type { FirestoreSEOSettings, CityCategorySeoSetting, AreaCategorySeoSetting, AreaServiceSeoSetting } from '@/types/firestore';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { serializeFirestoreData } from './serializeUtils';

/**
 * Fetches global SEO settings with server-side request memoization using Admin SDK.
 * This is safe to call only from Server Components or Server Actions.
 * Uses unstable_cache for cross-request caching (24 hours).
 */
export const getGlobalSEOSettings = cache(async (): Promise<FirestoreSEOSettings> => {
  return unstable_cache(
    async () => {
      try {
        const settingsDoc = await adminDb.collection('seoSettings').doc('global').get();
        if (settingsDoc.exists) {
          return { ...defaultSeoValues, ...(settingsDoc.data() as FirestoreSEOSettings) };
        }
        return defaultSeoValues;
      } catch (error) {
        console.error('Error fetching global SEO settings via Admin SDK:', error);
        return defaultSeoValues;
      }
    },
    ['global-seo-settings'],
    { 
      revalidate: false, 
      tags: ['seo-settings', 'global-cache'] 
    }
  )();
});

/**
 * Fetches city-category specific SEO overrides.
 */
export const getCityCategorySeoOverride = cache(async (cityId: string, categoryId: string): Promise<CityCategorySeoSetting | null> => {
  return unstable_cache(
    async () => {
      try {
        const query = adminDb.collection('cityCategorySeoSettings')
          .where('cityId', '==', cityId)
          .where('categoryId', '==', categoryId)
          .where('isActive', '==', true)
          .limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
          return { id: snapshot.docs[0].id, ...serializeFirestoreData(snapshot.docs[0].data()) } as CityCategorySeoSetting;
        }
        return null;
      } catch (error) {
        console.error('Error fetching city-category SEO override:', error);
        return null;
      }
    },
    [`city-category-seo-${cityId}-${categoryId}`],
    { revalidate: false, tags: ['seo-settings', 'city-category-seo', 'global-cache'] }
  )();
});

/**
 * Fetches area-category specific SEO overrides.
 */
export const getAreaCategorySeoOverride = cache(async (areaId: string, categoryId: string): Promise<AreaCategorySeoSetting | null> => {
  return unstable_cache(
    async () => {
      try {
        const query = adminDb.collection('areaCategorySeoSettings')
          .where('areaId', '==', areaId)
          .where('categoryId', '==', categoryId)
          .where('isActive', '==', true)
          .limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
          return { id: snapshot.docs[0].id, ...serializeFirestoreData(snapshot.docs[0].data()) } as AreaCategorySeoSetting;
        }
        return null;
      } catch (error) {
        console.error('Error fetching area-category SEO override:', error);
        return null;
      }
    },
    [`area-category-seo-${areaId}-${categoryId}`],
    { revalidate: false, tags: ['seo-settings', 'area-category-seo', 'global-cache'] }
  )();
});

/**
 * Fetches area-service specific SEO overrides.
 */
export const getAreaServiceSeoOverride = cache(async (areaId: string, serviceId: string): Promise<AreaServiceSeoSetting | null> => {
  return unstable_cache(
    async () => {
      try {
        const query = adminDb.collection('areaServiceSeoSettings')
          .where('areaId', '==', areaId)
          .where('serviceId', '==', serviceId)
          .where('isActive', '==', true)
          .limit(1);
        const snapshot = await query.get();
        if (!snapshot.empty) {
          return { id: snapshot.docs[0].id, ...serializeFirestoreData(snapshot.docs[0].data()) } as AreaServiceSeoSetting;
        }
        return null;
      } catch (error) {
        console.error('Error fetching area-service SEO override:', error);
        return null;
      }
    },
    [`area-service-seo-${areaId}-${serviceId}`],
    { revalidate: false, tags: ['seo-settings', 'area-service-seo', 'global-cache'] }
  )();
});
