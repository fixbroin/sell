// src/lib/revalidateUtils.ts
'use server';

import { revalidateTag, revalidatePath } from 'next/cache';
import { adminDb } from './firebaseAdmin';
import { FieldValue } from './mysqlDbAdmin';
import { clearSitemapCache } from '@/app/sitemap-helper';

/**
 * Smart Trigger: Tells the server to clear the cache for specific data
 * so that the next request pulls fresh data from Firestore.
 * Also increments the global cache version in Firestore to signal clients.
 */
export async function triggerRefresh(tag: 'services' | 'categories' | 'cities' | 'bookings' | 'users' | 'content' | 'blog' | 'global' | 'withdrawal-referral-config' | 'withdrawal-provider-config' | 'promo-usage' | string) {
  try {
    try {
      (revalidateTag as any)(tag, 'max');
    } catch (e) {
      // Ignore Next.js internal revalidateTag profile mismatch
    }
    
    // Purge static HTML pages cache globally only for changes affecting public layout/content
    const isPublicContentChange = [
      'services', 'categories', 'cities', 'locations', 'content', 'blog', 'faqs',
      'global', 'app-settings', 'web-settings', 'seo-settings', 'marketing-settings', 'global-cache'
    ].includes(tag) || tag.startsWith('blog-') || tag.startsWith('service-');

    if (isPublicContentChange) {
      revalidatePath('/', 'layout');
    }
    
    // Bump the global cache version (1 write)
    // Only bump "global" if the change is truly global (settings/SEO)
    // This prevents every user login/booking from forcing all visitors to re-read settings.
    const isGlobalChange = ['global', 'app-settings', 'web-settings', 'seo-settings', 'marketing-settings', 'global-cache'].includes(tag);
    
    const versionDoc = adminDb.collection('appConfiguration').doc('cacheVersions');
    const updates: any = {
        [tag]: FieldValue.increment(1),
        updatedAt: new Date()
    };
    
    if (isGlobalChange) {
        updates.global = FieldValue.increment(1);
    }
    
    await versionDoc.set(updates, { merge: true });

    if (tag === 'sitemap' || tag === 'global-cache' || isGlobalChange) {
      clearSitemapCache();
    }

    console.log(`[SmartSync] Cache invalidated for tag: ${tag} and version bumped (Global: ${isGlobalChange}).`);
    return { success: true };
  } catch (error) {
    console.error(`[SmartSync] Failed to invalidate tag: ${tag}`, error);
    return { success: false };
  }
}
