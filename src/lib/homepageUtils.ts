// src/lib/homepageUtils.ts
'use server';

import { adminDb } from './firebaseAdmin';
import type { 
    FeaturesConfiguration, 
    FirestoreService, 
    FirestoreCategory, 
    GlobalWebSettings, 
    FirestoreCity, 
    FirestoreArea, 
    FirestoreSEOSettings,
    FirestoreSubCategory,
    CityCategorySeoSetting,
    AreaCategorySeoSetting
} from '@/types/firestore';
import { serializeFirestoreData } from './serializeUtils';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';

export interface HomepageData {
    featuresConfig: FeaturesConfiguration;
    popularServices: FirestoreService[];
    recentServices: FirestoreService[];
    categoryWiseServices: Array<{ category: FirestoreCategory, services: FirestoreService[] }>;
    seoSettings: FirestoreSEOSettings;
    webSettings: GlobalWebSettings | null;
    citiesWithAreas: Array<FirestoreCity & { areas: FirestoreArea[] }>;
    allCategories: FirestoreCategory[];
}

export const getHomepageData = cache(async (): Promise<HomepageData> => {
    return unstable_cache(
        async () => {
            try {
                // Fetch Features Configuration, Global Settings, Cities, and ALL Categories in parallel
                const [featuresConfigDoc, seoSettingsDoc, webSettingsDoc, citiesSnapshot, allCatsSnapshot] = await Promise.all([
                    adminDb.collection('webSettings').doc('featuresConfiguration').get(),
                    adminDb.collection('seoSettings').doc('global').get(),
                    adminDb.collection('webSettings').doc('global').get(),
                    adminDb.collection('cities').where('isActive', '==', true).get(),
                    adminDb.collection('adminCategories').where('isActive', '==', true).orderBy('order', 'asc').get()
                ]);

                const featuresConfig = featuresConfigDoc.exists 
                    ? serializeFirestoreData<FeaturesConfiguration>(featuresConfigDoc.data())
                    : {
                        showMostPopularServices: true,
                        showRecentlyAddedServices: true,
                        showCategoryWiseServices: true,
                        showBlogSection: true,
                        showCustomServiceButton: false,
                        homepageCategoryVisibility: {},
                        ads: [],
                     } as FeaturesConfiguration;

                const seoSettings = seoSettingsDoc.exists
                    ? serializeFirestoreData<FirestoreSEOSettings>(seoSettingsDoc.data())
                    : {} as FirestoreSEOSettings;

                const webSettings = webSettingsDoc.exists
                    ? serializeFirestoreData<GlobalWebSettings>(webSettingsDoc.data())
                    : null;

                const allCategories = allCatsSnapshot.docs.map(doc => ({ ...serializeFirestoreData<Omit<FirestoreCategory, 'id'>>(doc.data() as any), id: doc.id } as FirestoreCategory));

                const citiesData = citiesSnapshot.docs.map(doc => ({ ...serializeFirestoreData<Omit<FirestoreCity, 'id'>>(doc.data() as any), id: doc.id } as FirestoreCity));
                citiesData.sort((a, b) => a.name.localeCompare(b.name));
                
                // Fetch all active areas in a single query instead of looping (N+1 reads optimization)
                const allAreasSnapshot = await adminDb.collection('areas')
                    .where('isActive', '==', true)
                    .get();
                
                const allAreas = allAreasSnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        name: data.name,
                        slug: data.slug,
                        cityId: data.cityId,
                        isActive: data.isActive
                    } as FirestoreArea;
                });
                allAreas.sort((a, b) => a.name.localeCompare(b.name));

                // Group areas by cityId
                const areasByCityId = new Map<string, FirestoreArea[]>();
                allAreas.forEach(area => {
                    if (area.cityId) {
                        if (!areasByCityId.has(area.cityId)) {
                            areasByCityId.set(area.cityId, []);
                        }
                        areasByCityId.get(area.cityId)!.push(area);
                    }
                });

                const citiesWithAreas = citiesData.map(city => ({
                    ...city,
                    areas: areasByCityId.get(city.id) || []
                }));

                const promises: Promise<FirestoreService[] | { category: FirestoreCategory; services: FirestoreService[] }[]>[] = [];

                // 1. Popular Services
                if (featuresConfig.showMostPopularServices) {
                    promises.push(
                        adminDb.collection('adminServices')
                            .where('isActive', '==', true)
                            .orderBy('rating', 'desc')
                            .orderBy('reviewCount', 'desc')
                            .limit(10)
                            .get()
                            .then(snap => snap.docs.map(doc => ({ id: doc.id, ...serializeFirestoreData<Omit<FirestoreService, 'id'>>(doc.data() as any) } as FirestoreService)))
                    );
                } else {
                    promises.push(Promise.resolve([] as FirestoreService[]));
                }

                // 2. Recent Services
                if (featuresConfig.showRecentlyAddedServices) {
                    promises.push(
                        adminDb.collection('adminServices')
                            .where('isActive', '==', true)
                            .orderBy('createdAt', 'desc')
                            .limit(10)
                            .get()
                            .then(snap => snap.docs.map(doc => ({ id: doc.id, ...serializeFirestoreData<Omit<FirestoreService, 'id'>>(doc.data() as any) } as FirestoreService)))
                    );
                } else {
                    promises.push(Promise.resolve([] as FirestoreService[]));
                }

                // 3. Category Wise Services
                if (featuresConfig.showCategoryWiseServices) {
                    const enabledCategoryIds = Object.entries(featuresConfig.homepageCategoryVisibility || {})
                        .filter(([, isVisible]) => isVisible)
                        .map(([catId]) => catId);

                    if (enabledCategoryIds.length > 0) {
                        promises.push(
                            adminDb.collection('adminCategories')
                                .where('__name__', 'in', enabledCategoryIds)
                                .where('isActive', '==', true)
                                .orderBy('order', 'asc')
                                .get()
                                .then(async categoriesSnapshot => {
                                    const enabledCategories = categoriesSnapshot.docs.map(d => ({ ...serializeFirestoreData<Omit<FirestoreCategory, 'id'>>(d.data() as any), id: d.id } as FirestoreCategory));
                                    
                                    const categoryServicesPromises = enabledCategories.map(async (cat) => {
                                        const subCategoriesSnapshot = await adminDb.collection('adminSubCategories')
                                            .where('parentId', '==', cat.id)
                                            .where('isActive', '==', true)
                                            .get();
                                        
                                        const subCategoryIds = subCategoriesSnapshot.docs.map(subDoc => subDoc.id);

                                        let servicesForCategory: FirestoreService[] = [];
                                        if (subCategoryIds.length > 0) {
                                            const chunks = [];
                                            for (let i = 0; i < subCategoryIds.length; i += 10) {
                                                chunks.push(subCategoryIds.slice(i, i + 10));
                                            }

                                            const servicesPromises = chunks.map(chunk => 
                                                adminDb.collection('adminServices')
                                                    .where('isActive', '==', true)
                                                    .where('subCategoryId', 'in', chunk)
                                                    .orderBy('name', 'asc')
                                                    .limit(10)
                                                    .get()
                                            );

                                            const servicesSnapshots = await Promise.all(servicesPromises);
                                            servicesForCategory = servicesSnapshots.flatMap(snap => 
                                                snap.docs.map(sDoc => ({ ...serializeFirestoreData<Omit<FirestoreService, 'id'>>(sDoc.data() as any), id: sDoc.id } as FirestoreService))
                                            )
                                            .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name))
                                            .slice(0, 10);
                                        }
                                        return { category: cat, services: servicesForCategory };
                                    });
                                    
                                    const results = await Promise.all(categoryServicesPromises);
                                    return results.filter(cs => cs.services.length > 0);
                                })
                        );
                    } else {
                        promises.push(Promise.resolve([] as { category: FirestoreCategory; services: FirestoreService[] }[]));
                    }
                } else {
                    promises.push(Promise.resolve([] as { category: FirestoreCategory; services: FirestoreService[] }[]));
                }

                const [popularServices, recentServices, categoryWiseServices] = await Promise.all([
                    promises[0] as Promise<FirestoreService[]>,
                    promises[1] as Promise<FirestoreService[]>,
                    promises[2] as Promise<{ category: FirestoreCategory; services: FirestoreService[] }[]>,
                ]);

                return {
                    featuresConfig,
                    popularServices,
                    recentServices,
                    categoryWiseServices,
                    seoSettings,
                    webSettings,
                    citiesWithAreas,
                    allCategories
                };

            } catch (error) {
                console.error("Error in getHomepageData:", error);
                throw error;
            }
        },
        ['homepage-data'],
        { revalidate: 1,
 tags: ['global', 'cities', 'categories', 'services', 'global-cache'] }
    )();
});

export interface FullCategoryData {
    category: FirestoreCategory;
    subCategories: Array<FirestoreSubCategory & { services: FirestoreService[] }>;
    seoSettings: FirestoreSEOSettings;
    cityCategorySeo?: CityCategorySeoSetting | null;
    areaCategorySeo?: AreaCategorySeoSetting | null;
    availableAreas?: Array<{ id: string, name: string, slug: string, latitude?: number | string, longitude?: number | string }>;
    availableCities?: Array<{ id: string, name: string, slug: string }>;
    areaData?: FirestoreArea | null;
}

export const getCategoryFullData = cache(async (categorySlug: string, citySlug?: string, areaSlug?: string): Promise<FullCategoryData | null> => {
    return unstable_cache(
        async () => {
            try {
                const [categorySnapshot, seoSettingsDoc] = await Promise.all([
                    adminDb.collection('adminCategories')
                        .where('slug', '==', categorySlug)
                        .where('isActive', '==', true)
                        .limit(1)
                        .get(),
                    adminDb.collection('seoSettings').doc('global').get()
                ]);

                if (categorySnapshot.empty) return null;

                const categoryDoc = categorySnapshot.docs[0];
                const category = { id: categoryDoc.id, ...serializeFirestoreData<Omit<FirestoreCategory, 'id'>>(categoryDoc.data() as any) } as FirestoreCategory;

                const seoSettings = seoSettingsDoc.exists
                    ? serializeFirestoreData<FirestoreSEOSettings>(seoSettingsDoc.data())
                    : {} as FirestoreSEOSettings;

                const subCategoriesSnapshot = await adminDb.collection('adminSubCategories')
                    .where('parentId', '==', category.id)
                    .where('isActive', '==', true)
                    .orderBy('order', 'asc')
                    .get();

                const subCategories = subCategoriesSnapshot.docs.map(doc => ({ 
                    id: doc.id, 
                    ...serializeFirestoreData<Omit<FirestoreSubCategory, 'id'>>(doc.data() as any) 
                } as FirestoreSubCategory)).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

                const subCategoriesWithServices = await Promise.all(subCategories.map(async (subCat) => {
                    const servicesSnapshot = await adminDb.collection('adminServices')
                        .where('subCategoryId', '==', subCat.id)
                        .where('isActive', '==', true)
                        .orderBy('name', 'asc')
                        .get();
                    
                    const services = servicesSnapshot.docs.map(doc => ({ 
                        id: doc.id, 
                        ...serializeFirestoreData<Omit<FirestoreService, 'id'>>(doc.data() as any) 
                    } as FirestoreService))
                    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));

                    return { ...subCat, services };
                }));

                let cityCategorySeo: CityCategorySeoSetting | null = null;
                let areaCategorySeo: AreaCategorySeoSetting | null = null;
                let availableAreas: Array<{ id: string, name: string, slug: string }> = [];
                let availableCities: Array<{ id: string, name: string, slug: string }> = [];

                if (!citySlug) {
                    const citiesSnapshot = await adminDb.collection('cities').where('isActive', '==', true).orderBy('name', 'asc').get();
                    availableCities = citiesSnapshot.docs.map(doc => {
                        const data = doc.data();
                        return { id: doc.id, name: data.name, slug: data.slug };
                    });
                }

                let areaDataObj: FirestoreArea | null = null;

                if (citySlug) {
                    const citySnapshot = await adminDb.collection('cities').where('slug', '==', citySlug).limit(1).get();
                    if (!citySnapshot.empty) {
                        const cityId = citySnapshot.docs[0].id;
                        
                        // Fetch areas for interlinking
                        const areasSnapshot = await adminDb.collection('areas')
                            .where('cityId', '==', cityId)
                            .where('isActive', '==', true)
                            .orderBy('name', 'asc')
                            .get();
                        
                        availableAreas = areasSnapshot.docs.map(doc => {
                            const data = doc.data();
                            return { 
                                id: doc.id, 
                                name: data.name, 
                                slug: data.slug,
                                latitude: data.latitude,
                                longitude: data.longitude
                            };
                        });

                        const cityCategorySeoSnapshot = await adminDb.collection('cityCategorySeoSettings')
                            .where('cityId', '==', cityId)
                            .where('categoryId', '==', category.id)
                            .limit(1)
                            .get();
                        if (!cityCategorySeoSnapshot.empty) {
                            cityCategorySeo = serializeFirestoreData<CityCategorySeoSetting>(cityCategorySeoSnapshot.docs[0].data());
                        }

                        if (areaSlug) {
                            const areaSnapshot = await adminDb.collection('areas').where('slug', '==', areaSlug).where('cityId', '==', cityId).limit(1).get();
                            if (!areaSnapshot.empty) {
                                const areaDoc = areaSnapshot.docs[0];
                                areaDataObj = { id: areaDoc.id, ...serializeFirestoreData<Omit<FirestoreArea, 'id'>>(areaDoc.data() as any) } as FirestoreArea;
                                const areaId = areaDoc.id;
                                const areaCategorySeoSnapshot = await adminDb.collection('areaCategorySeoSettings')
                                    .where('areaId', '==', areaId)
                                    .where('categoryId', '==', category.id)
                                    .limit(1)
                                    .get();
                                if (!areaCategorySeoSnapshot.empty) {
                                    areaCategorySeo = serializeFirestoreData<AreaCategorySeoSetting>(areaCategorySeoSnapshot.docs[0].data());
                                }
                            }
                        }
                    }
                }

                return {
                    category,
                    subCategories: subCategoriesWithServices,
                    seoSettings,
                    cityCategorySeo,
                    areaCategorySeo,
                    availableAreas,
                    availableCities,
                    areaData: areaDataObj
                };
            } catch (error) {
                console.error(`Error in getCategoryFullData for slug ${categorySlug}:`, error);
                return null;
            }
        },
        [`category-data-${categorySlug}-${citySlug || 'no-city'}-${areaSlug || 'no-area'}`],
        { revalidate: 1,
 tags: ['categories', 'services', `category-${categorySlug}`, 'seo-settings', 'global-cache'] }
    )();
});

export const getAggregateRating = cache(async (): Promise<{ ratingValue: string, reviewCount: number } | null> => {
    return unstable_cache(
        async () => {
            try {
                // Read from pre-calculated stats to save massive reads
                const statsDoc = await adminDb.collection('appConfiguration').doc('stats').get();
                if (statsDoc.exists) {
                    const data = statsDoc.data();
                    if (data?.ratingValue && data?.reviewCount) {
                        return {
                            ratingValue: String(data.ratingValue),
                            reviewCount: Number(data.reviewCount)
                        };
                    }
                }

                // Fallback to calculation ONLY if stats doc doesn't have it
                const snapshot = await adminDb.collection('adminServices')
                    .where('isActive', '==', true)
                    .where('rating', '>', 0)
                    .get();

                if (snapshot.empty) return null;

                let totalRating = 0;
                let totalReviews = 0;

                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.rating && data.reviewCount) {
                        totalRating += (data.rating * data.reviewCount);
                        totalReviews += data.reviewCount;
                    }
                });

                if (totalReviews === 0) return null;

                return {
                    ratingValue: (totalRating / totalReviews).toFixed(1),
                    reviewCount: totalReviews
                };
            } catch (error) {
                console.error("Error calculating aggregate rating:", error);
                return null;
            }
        },
        ['aggregate-rating'],
        { revalidate: 1,
 tags: ['services', 'global-cache'] }
    )();
});
