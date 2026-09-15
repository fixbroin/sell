// src/app/actions/dbActions.ts
'use server';

import fs from 'fs';
import path from 'path';
import { getPool, getDocInternal, getDocsInternal, addDocInternal, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';

// Fast server-side in-memory cache for high-frequency configuration reads
const docCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds cache for static config reads

function getCachedDoc(fullPath: string) {
  const cached = docCache.get(fullPath);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }
  return null;
}

function setCachedDoc(fullPath: string, data: any) {
  docCache.set(fullPath, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function clearDocCache(pathPrefix?: string) {
  if (!pathPrefix) {
    docCache.clear();
    return;
  }
  for (const key of docCache.keys()) {
    if (key.includes(pathPrefix) || key.startsWith(pathPrefix)) {
      docCache.delete(key);
    }
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error: any) {
      const msg = (error?.message || '').toLowerCase();
      const code = error?.code || '';
      const isRetryable = code === 'ECONNRESET' || code === 'PROTOCOL_CONNECTION_LOST' || code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'ER_LOCK_WAIT_TIMEOUT' || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('enetunreach') || msg.includes('connection lost') || msg.includes('lock wait timeout');
      if (isRetryable && attempt < retries) {
        attempt++;
        (globalThis as any)._mysqlPool = undefined;
        await new Promise(r => setTimeout(r, 300 * attempt));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Execution failed after retries");
}

export async function executeDbGetDoc(path: string, docId?: string) {
  return withRetry(async () => {
    try {
      const fullPath = docId ? `${path}/${docId}` : path;
      const isCacheable = fullPath.startsWith('webSettings') || fullPath.startsWith('seoSettings') || fullPath.startsWith('appConfiguration');
      
      if (isCacheable) {
        const cached = getCachedDoc(fullPath);
        if (cached) return cached;
      }

      const pool = await getPool();
      const result = await getDocInternal(pool, path, docId);

      if (isCacheable) {
        setCachedDoc(fullPath, result);
      }
      return result;
    } catch (error: any) {
      console.error(`Error in executeDbGetDoc on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbGetDocs(path: string, constraints: any[] = []) {
  return withRetry(async () => {
    try {
      const isCacheable = (path === 'adminCategories' || path === 'adminSubCategories' || path === 'adminServices' || path === 'adminSlideshows' || path === 'webSettings' || path === 'adminReviews' || path === 'blogPosts') && constraints.length === 0;
      const cacheKey = `getDocs:${path}:${JSON.stringify(constraints)}`;

      if (isCacheable) {
        const cached = getCachedDoc(cacheKey);
        if (cached) return cached;
      }

      const pool = await getPool();
      const result = await getDocsInternal(pool, path, constraints);

      if (isCacheable) {
        setCachedDoc(cacheKey, result);
      }
      return result;
    } catch (error: any) {
      console.error(`Error in executeDbGetDocs on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbAddDoc(path: string, data: any) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      return await addDocInternal(pool, path, data);
    } catch (error: any) {
      console.error(`Error in executeDbAddDoc on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbSetDoc(path: string, docId: string, data: any, options: any = {}) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      await setDocInternal(pool, path, docId, data, options);
      return { success: true };
    } catch (error: any) {
      console.error(`Error in executeDbSetDoc on ${path}/${docId}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbUpdateDoc(path: string, docId: string, data: any) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      await updateDocInternal(pool, path, docId, data);
      return { success: true };
    } catch (error: any) {
      console.error(`Error in executeDbUpdateDoc on ${path}/${docId}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbDeleteDoc(path: string, docId?: string) {
  return withRetry(async () => {
    try {
      clearDocCache();
      const pool = await getPool();
      await deleteDocInternal(pool, path, docId);
      return { success: true };
    } catch (error: any) {
      console.error(`Error in executeDbDeleteDoc on ${path}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

export async function executeDbBatch(operations: any[]) {
  return withRetry(async () => {
    clearDocCache();
    const pool = await getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const op of operations) {
        if (op.action === 'setDoc') {
          await setDocInternal(conn, op.collection, op.id, op.data, op.options);
        } else if (op.action === 'updateDoc') {
          await updateDocInternal(conn, op.collection, op.id, op.data);
        } else if (op.action === 'deleteDoc') {
          await deleteDocInternal(conn, op.collection, op.id);
        }
      }

      await conn.commit();
      return { success: true };
    } catch (error: any) {
      await conn.rollback();
      console.error("Error in executeDbBatch:", error);
      throw new Error(error.message || 'Database transaction error');
    } finally {
      conn.release();
    }
  });
}

export async function executeDbClearTable(tableName: string) {
  return withRetry(async () => {
    try {
      const allowedTables = ['areaServiceSeoSettings', 'cityCategorySeoSettings', 'areaCategorySeoSettings', 'cities', 'areas'];
      if (!allowedTables.includes(tableName)) {
        throw new Error("Unauthorized table clear operation");
      }
      clearDocCache(tableName);
      const pool = await getPool();
      await pool.query(`DELETE FROM \`${tableName}\``);
      return { success: true };
    } catch (error: any) {
      console.error(`Error in executeDbClearTable on ${tableName}:`, error);
      throw new Error(error.message || 'Database error');
    }
  });
}

// ----------------------------------------------------
// Server-Side Bulk SEO Generation Optimizations
// ----------------------------------------------------

import { 
  generateFreeAreaServiceSeoData, 
  generateFreeCityCategorySeoData, 
  generateFreeAreaCategorySeoData, 
  getNearbyAreasSorted 
} from "@/lib/seoGenerator";
import { nanoid } from 'nanoid';

function generateSeoSlug(parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
    .join('/');
}

export async function executeBulkServiceSeoGenerate(params: {
  batchCityId: string;
  batchAreaId: string;
  batchCategoryId: string;
  batchServiceId: string;
  batchOverwrite: boolean;
}) {
  return withRetry(async () => {
    const { batchCityId, batchAreaId, batchCategoryId, batchServiceId, batchOverwrite } = params;
    const pool = await getPool();

    // 1. Fetch fresh datasets from MySQL
    const citiesRaw = await getDocsInternal(pool, 'cities', []);
    const cities = citiesRaw.map((c: any) => ({ id: c.id, ...c.data }));

    const areasRaw = await getDocsInternal(pool, 'areas', []);
    const areas = areasRaw.map((a: any) => ({ id: a.id, ...a.data }));

    const servicesRaw = await getDocsInternal(pool, 'adminServices', []);
    const services = servicesRaw.map((s: any) => ({ id: s.id, ...s.data }));

    const subCatsRaw = await getDocsInternal(pool, 'adminSubCategories', []);
    const subCategories = subCatsRaw.map((sc: any) => ({ id: sc.id, ...sc.data }));

    const categoriesRaw = await getDocsInternal(pool, 'adminCategories', []);
    const categories = categoriesRaw.map((c: any) => ({ id: c.id, ...c.data }));

    const existingRaw = await getDocsInternal(pool, 'areaServiceSeoSettings', []);
    const existingSettings = existingRaw.map((e: any) => ({ id: e.id, ...e.data }));

    // Resolve parentCategoryId for services using subCategoryId -> parentId lookup
    const resolvedServices = services.map((srv: any) => {
      if (srv.parentCategoryId) return srv;
      const subCat = subCategories.find((sub: any) => String(sub.id) === String(srv.subCategoryId));
      return {
        ...srv,
        parentCategoryId: subCat?.parentId || undefined
      };
    });

    // 2. Filter targets
    const targetCities = batchCityId === "all" ? cities : cities.filter((c: any) => String(c.id) === String(batchCityId));
    let targetServices = resolvedServices.filter((s: any) => s.isActive !== false);
    if (batchCategoryId !== "all") {
      targetServices = targetServices.filter((s: any) => String(s.parentCategoryId) === String(batchCategoryId));
    }
    if (batchServiceId !== "all") {
      targetServices = targetServices.filter((s: any) => String(s.id) === String(batchServiceId));
    }

    const allActiveAreas = areas.filter((a: any) => a.isActive !== false);
    const cityIds = targetCities.map((c: any) => String(c.id));
    let targetAreas = allActiveAreas.filter((a: any) => cityIds.includes(String(a.cityId)));
    if (batchAreaId !== "all") {
      targetAreas = targetAreas.filter((a: any) => String(a.id) === String(batchAreaId));
    }

    if (targetAreas.length === 0 || targetServices.length === 0) {
      return { success: true, createdCount: 0, updatedCount: 0, skippedCount: 0 };
    }

    // 3. Build lookup maps for performance
    const existingMap = new Map<string, any>();
    for (const setting of existingSettings) {
      existingMap.set(`${setting.areaId}_${setting.serviceId}`, setting);
    }

    const slugToDocIdMap = new Map<string, string>();
    for (const setting of existingSettings) {
      slugToDocIdMap.set(setting.slug, setting.id);
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const inserts: any[] = [];
    const updates: any[] = [];

    const getUniqueSlugServer = (baseSlug: string, existingId?: string) => {
      let uniqueSlug = baseSlug;
      let counter = 1;
      while (true) {
        const matchingDocId = slugToDocIdMap.get(uniqueSlug);
        if (!matchingDocId || matchingDocId === existingId) {
          break;
        }
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }
      slugToDocIdMap.set(uniqueSlug, existingId || 'new-pending-insert');
      return uniqueSlug;
    };

    for (const area of targetAreas) {
      const areaId = area.id;
      const areaName = area.name;
      const cityId = area.cityId;
      const city = cities.find((c: any) => String(c.id) === String(cityId));
      if (!city) continue;
      const cityName = city.name;

      const fallbackNearby = getNearbyAreasSorted(area, allActiveAreas.filter((a: any) => String(a.cityId) === String(cityId)), 10);

      for (const service of targetServices) {
        const serviceId = service.id;
        const serviceName = service.name;

        const existing = existingMap.get(`${areaId}_${serviceId}`);
        if (existing && !batchOverwrite) {
          skippedCount++;
          continue;
        }

        let categoryName = "Home Services";
        if (service.parentCategoryId) {
          const catObj = categories.find((c: any) => String(c.id) === String(service.parentCategoryId));
          if (catObj) {
            categoryName = catObj.name;
          }
        }

        const result = generateFreeAreaServiceSeoData(cityName, areaName, categoryName, serviceName, fallbackNearby);
        const baseSlug = generateSeoSlug([city.slug, area.slug, 'service', service.slug]);
        const finalSlug = getUniqueSlugServer(baseSlug, existing?.id);

        const payload: any = {
          cityId: String(cityId),
          cityName,
          citySlug: city.slug || "",
          areaId: String(areaId),
          areaName,
          areaSlug: area.slug || "",
          serviceId: String(serviceId),
          serviceName,
          serviceSlug: service.slug || "",
          slug: finalSlug,
          h1_title: result.h1_title,
          meta_title: result.seo_title,
          meta_description: result.seo_description,
          meta_keywords: result.seo_keywords,
          seo_content: result.seo_content,
          faqs: result.faqs,
          isActive: true
        };

        if (existing) {
          updates.push({ id: existing.id, data: { ...existing, ...payload, updatedAt: new Date() } });
          updatedCount++;
        } else {
          const newId = nanoid(20);
          inserts.push({ id: newId, data: { ...payload, createdAt: new Date() } });
          createdCount++;
        }
      }
    }

    // 4. Perform bulk inserts/updates inside transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const chunkSize = 200;
      for (let i = 0; i < inserts.length; i += chunkSize) {
        const chunk = inserts.slice(i, i + chunkSize);
        const valuesSql = chunk.map(() => "(?, ?, NOW(), NOW())").join(", ");
        const params: any[] = [];
        for (const item of chunk) {
          params.push(item.id, JSON.stringify(item.data));
        }
        await conn.query(`INSERT INTO areaServiceSeoSettings (id, data, createdAt, updatedAt) VALUES ${valuesSql}`, params);
      }

      for (const item of updates) {
        await conn.query(`UPDATE areaServiceSeoSettings SET data = ?, updatedAt = NOW() WHERE id = ?`, [JSON.stringify(item.data), item.id]);
      }

      await conn.commit();
    } catch (txError) {
      await conn.rollback();
      throw txError;
    } finally {
      conn.release();
    }

    clearDocCache('areaServiceSeoSettings');

    return { success: true, createdCount, updatedCount, skippedCount };
  });
}

export async function executeBulkOverridesSeoGenerate(params: {
  activeTab: "city-category" | "area-category";
  batchCityId: string;
  batchCategoryId: string;
  batchOverwrite: boolean;
}) {
  return withRetry(async () => {
    const { activeTab, batchCityId, batchCategoryId, batchOverwrite } = params;
    const pool = await getPool();

    // 1. Fetch fresh lists
    const citiesRaw = await getDocsInternal(pool, 'cities', []);
    const cities = citiesRaw.map((c: any) => ({ id: c.id, ...c.data }));

    const areasRaw = await getDocsInternal(pool, 'areas', []);
    const areas = areasRaw.map((a: any) => ({ id: a.id, ...a.data }));

    const categoriesRaw = await getDocsInternal(pool, 'adminCategories', []);
    const categories = categoriesRaw.map((c: any) => ({ id: c.id, ...c.data }));

    const servicesRaw = await getDocsInternal(pool, 'adminServices', []);
    const services = servicesRaw.map((s: any) => ({ id: s.id, ...s.data }));

    const targetCities = batchCityId === "all" ? cities : cities.filter((c: any) => String(c.id) === String(batchCityId));
    const targetCategories = batchCategoryId === "all" ? categories : categories.filter((c: any) => String(c.id) === String(batchCategoryId));

    const allActiveAreas = areas.filter((a: any) => a.isActive !== false);

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const inserts: any[] = [];
    const updates: any[] = [];

    if (activeTab === "city-category") {
      const existingRaw = await getDocsInternal(pool, 'cityCategorySeoSettings', []);
      const existingSettings = existingRaw.map((e: any) => ({ id: e.id, ...e.data }));

      const existingMap = new Map<string, any>();
      for (const setting of existingSettings) {
        existingMap.set(`${setting.cityId}_${setting.categoryId}`, setting);
      }

      const slugToDocIdMap = new Map<string, string>();
      for (const setting of existingSettings) {
        slugToDocIdMap.set(setting.slug, setting.id);
      }

      const getUniqueSlugServer = (baseSlug: string, existingId?: string) => {
        let uniqueSlug = baseSlug;
        let counter = 1;
        while (true) {
          const matchingDocId = slugToDocIdMap.get(uniqueSlug);
          if (!matchingDocId || matchingDocId === existingId) {
            break;
          }
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }
        slugToDocIdMap.set(uniqueSlug, existingId || 'new-pending-insert');
        return uniqueSlug;
      };

      for (const city of targetCities) {
        const cityId = city.id;
        const cityName = city.name;
        const cityAreas = allActiveAreas.filter((a: any) => String(a.cityId) === String(cityId));

        for (const category of targetCategories) {
          const categoryId = category.id;
          const categoryName = category.name;

          const existing = existingMap.get(`${cityId}_${categoryId}`);
          if (existing && !batchOverwrite) {
            skippedCount++;
            continue;
          }

          const categoryServices = services.filter((s: any) => String(s.parentCategoryId) === String(categoryId) && s.isActive !== false);
          const serviceNames = categoryServices.slice(0, 10).map((s: any) => s.name);

          const result = generateFreeCityCategorySeoData(cityName, categoryName, serviceNames, cityAreas);
          const baseSlug = generateSeoSlug([city.slug, category.slug]);
          const finalSlug = getUniqueSlugServer(baseSlug, existing?.id);

          const payload: any = {
            cityId: String(cityId),
            cityName,
            categoryId: String(categoryId),
            categoryName,
            slug: finalSlug,
            h1_title: result.h1_title,
            meta_title: result.seo_title,
            meta_description: result.seo_description,
            meta_keywords: result.seo_keywords,
            seo_content: result.seo_content,
            faqs: result.faqs,
            imageHint: result.imageHint,
            isActive: true
          };

          if (existing) {
            updates.push({ id: existing.id, data: { ...existing, ...payload, updatedAt: new Date() } });
            updatedCount++;
          } else {
            const newId = nanoid(20);
            inserts.push({ id: newId, data: { ...payload, createdAt: new Date() } });
            createdCount++;
          }
        }
      }

      // Execute in MySQL Transaction
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const chunkSize = 200;
        for (let i = 0; i < inserts.length; i += chunkSize) {
          const chunk = inserts.slice(i, i + chunkSize);
          const valuesSql = chunk.map(() => "(?, ?, NOW(), NOW())").join(", ");
          const params: any[] = [];
          for (const item of chunk) params.push(item.id, JSON.stringify(item.data));
          await conn.query(`INSERT INTO cityCategorySeoSettings (id, data, createdAt, updatedAt) VALUES ${valuesSql}`, params);
        }
        for (const item of updates) {
          await conn.query(`UPDATE cityCategorySeoSettings SET data = ?, updatedAt = NOW() WHERE id = ?`, [JSON.stringify(item.data), item.id]);
        }
        await conn.commit();
      } catch (txError) {
        await conn.rollback();
        throw txError;
      } finally {
        conn.release();
      }
      clearDocCache('cityCategorySeoSettings');

    } else {
      // Area-Category
      const existingRaw = await getDocsInternal(pool, 'areaCategorySeoSettings', []);
      const existingSettings = existingRaw.map((e: any) => ({ id: e.id, ...e.data }));

      const existingMap = new Map<string, any>();
      for (const setting of existingSettings) {
        existingMap.set(`${setting.areaId}_${setting.categoryId}`, setting);
      }

      const slugToDocIdMap = new Map<string, string>();
      for (const setting of existingSettings) {
        slugToDocIdMap.set(setting.slug, setting.id);
      }

      const getUniqueSlugServer = (baseSlug: string, existingId?: string) => {
        let uniqueSlug = baseSlug;
        let counter = 1;
        while (true) {
          const matchingDocId = slugToDocIdMap.get(uniqueSlug);
          if (!matchingDocId || matchingDocId === existingId) {
            break;
          }
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }
        slugToDocIdMap.set(uniqueSlug, existingId || 'new-pending-insert');
        return uniqueSlug;
      };

      const cityIds = targetCities.map((c: any) => String(c.id));
      const targetAreas = allActiveAreas.filter((a: any) => cityIds.includes(String(a.cityId)));

      for (const area of targetAreas) {
        const areaId = area.id;
        const areaName = area.name;
        const cityId = area.cityId;
        const city = cities.find((c: any) => String(c.id) === String(cityId));
        if (!city) continue;
        const cityName = city.name;

        const fallbackNearby = getNearbyAreasSorted(area, allActiveAreas.filter((a: any) => String(a.cityId) === String(cityId)), 10);

        for (const category of targetCategories) {
          const categoryId = category.id;
          const categoryName = category.name;

          const existing = existingMap.get(`${areaId}_${categoryId}`);
          if (existing && !batchOverwrite) {
            skippedCount++;
            continue;
          }

          const categoryServices = services.filter((s: any) => String(s.parentCategoryId) === String(categoryId) && s.isActive !== false);
          const serviceNames = categoryServices.slice(0, 10).map((s: any) => s.name);

          const result = generateFreeAreaCategorySeoData(cityName, areaName, categoryName, serviceNames, fallbackNearby);
          const baseSlug = generateSeoSlug([city.slug, area.slug, category.slug]);
          const finalSlug = getUniqueSlugServer(baseSlug, existing?.id);

          const payload: any = {
            cityId: String(cityId),
            cityName,
            areaId: String(areaId),
            areaName,
            categoryId: String(categoryId),
            categoryName,
            slug: finalSlug,
            h1_title: result.h1_title,
            meta_title: result.seo_title,
            meta_description: result.seo_description,
            meta_keywords: result.seo_keywords,
            seo_content: result.seo_content,
            faqs: result.faqs,
            imageHint: result.imageHint,
            isActive: true
          };

          if (existing) {
            updates.push({ id: existing.id, data: { ...existing, ...payload, updatedAt: new Date() } });
            updatedCount++;
          } else {
            const newId = nanoid(20);
            inserts.push({ id: newId, data: { ...payload, createdAt: new Date() } });
            createdCount++;
          }
        }
      }

      // Execute in MySQL Transaction
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const chunkSize = 200;
        for (let i = 0; i < inserts.length; i += chunkSize) {
          const chunk = inserts.slice(i, i + chunkSize);
          const valuesSql = chunk.map(() => "(?, ?, NOW(), NOW())").join(", ");
          const params: any[] = [];
          for (const item of chunk) params.push(item.id, JSON.stringify(item.data));
          await conn.query(`INSERT INTO areaCategorySeoSettings (id, data, createdAt, updatedAt) VALUES ${valuesSql}`, params);
        }
        for (const item of updates) {
          await conn.query(`UPDATE areaCategorySeoSettings SET data = ?, updatedAt = NOW() WHERE id = ?`, [JSON.stringify(item.data), item.id]);
        }
        await conn.commit();
      } catch (txError) {
        await conn.rollback();
        throw txError;
      } finally {
        conn.release();
      }
      clearDocCache('areaCategorySeoSettings');
    }

    return { success: true, createdCount, updatedCount, skippedCount };
  });
}

export async function executeBulkDeleteByAreaAction(areaId: string) {
  return withRetry(async () => {
    try {
      const pool = await getPool();
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        
        // 1. Delete from areaServiceSeoSettings
        await conn.query(
          "DELETE FROM `areaServiceSeoSettings` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.areaId')) = ?",
          [areaId]
        );
        
        // 2. Delete from areaCategorySeoSettings
        await conn.query(
          "DELETE FROM `areaCategorySeoSettings` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.areaId')) = ?",
          [areaId]
        );

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
      clearDocCache('areaServiceSeoSettings');
      clearDocCache('areaCategorySeoSettings');
      return { success: true };
    } catch (error: any) {
      console.error("Error in executeBulkDeleteByAreaAction:", error);
      throw new Error(error.message || 'Database deletion error');
    }
  });
}

export async function executeBulkDeleteByCategoryAction(categoryId: string) {
  return withRetry(async () => {
    try {
      const pool = await getPool();
      
      // 1. Fetch subcategories and services to map the category to serviceIds
      const [subCategoriesRaw, servicesRaw] = await Promise.all([
        getDocsInternal(pool, 'adminSubCategories', []),
        getDocsInternal(pool, 'adminServices', [])
      ]);
      
      const subCatIds = subCategoriesRaw
        .map((doc: any) => ({ id: doc.id, ...doc.data }))
        .filter((sc: any) => String(sc.parentId) === String(categoryId))
        .map((sc: any) => String(sc.id));
        
      const serviceIds = servicesRaw
        .map((doc: any) => ({ id: doc.id, ...doc.data }))
        .filter((srv: any) => subCatIds.includes(String(srv.subCategoryId)))
        .map((srv: any) => String(srv.id));

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        
        // 2. Delete from cityCategorySeoSettings
        await conn.query(
          "DELETE FROM `cityCategorySeoSettings` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.categoryId')) = ?",
          [categoryId]
        );
        
        // 3. Delete from areaCategorySeoSettings
        await conn.query(
          "DELETE FROM `areaCategorySeoSettings` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.categoryId')) = ?",
          [categoryId]
        );

        // 4. Delete from areaServiceSeoSettings (matching serviceIds)
        if (serviceIds.length > 0) {
          const placeholders = serviceIds.map(() => '?').join(', ');
          await conn.query(
            `DELETE FROM \`areaServiceSeoSettings\` WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.serviceId')) IN (${placeholders})`,
            serviceIds
          );
        }

        await conn.commit();
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
      clearDocCache('cityCategorySeoSettings');
      clearDocCache('areaCategorySeoSettings');
      clearDocCache('areaServiceSeoSettings');
      return { success: true };
    } catch (error: any) {
      console.error("Error in executeBulkDeleteByCategoryAction:", error);
      throw new Error(error.message || 'Database deletion error');
    }
  });
}

export async function getProviderBookingCountsAction(providerId: string) {
  return withRetry(async () => {
    try {
      const pool = await getPool();
      
      const queryStr = `
        SELECT 
          JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) as status,
          COUNT(*) as count
        FROM bookings 
        WHERE JSON_UNQUOTE(JSON_EXTRACT(data, '$.providerId')) = ?
        GROUP BY JSON_UNQUOTE(JSON_EXTRACT(data, '$.status'))
      `;
      
      const [rows]: any = await pool.query(queryStr, [providerId]);
      
      let completed = 0;
      let newRequests = 0;
      let ongoing = 0;
      let other = 0;
      
      rows.forEach((row: any) => {
        const status = row.status;
        const count = parseInt(row.count, 10) || 0;
        
        if (status === 'Completed') {
          completed += count;
        } else if (status === 'AssignedToProvider' || status === 'Rescheduled') {
          newRequests += count;
        } else if (status === 'ProviderAccepted' || status === 'InProgressByProvider') {
          ongoing += count;
        } else {
          other += count;
        }
      });
      
      return {
        completed,
        newRequests,
        ongoing,
        other,
        total: completed + newRequests + ongoing + other
      };
    } catch (error: any) {
      console.error("Error in getProviderBookingCountsAction:", error);
      return { completed: 0, newRequests: 0, ongoing: 0, other: 0, total: 0 };
    }
  });
}

const getFetchCachePath = () => {
  const possiblePaths = [
    path.join(process.cwd(), '.next', 'cache', 'fetch-cache'),
    path.join(process.cwd(), '.next', 'standalone', '.next', 'cache', 'fetch-cache'),
    path.join(process.cwd(), 'cache', 'fetch-cache'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return possiblePaths[0];
};

function getDirInfo(dirPath: string): { size: number; count: number } {
  let size = 0;
  let count = 0;
  try {
    if (!fs.existsSync(dirPath)) {
      return { size, count };
    }
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        const nested = getDirInfo(filePath);
        size += nested.size;
        count += nested.count;
      } else {
        size += stat.size;
        count++;
      }
    }
  } catch (err) {
    console.error("Error reading dir info:", err);
  }
  return { size, count };
}

function deleteDirContent(dirPath: string) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(filePath);
    }
  }
}

export async function executeGetNextCacheStatus() {
  try {
    const cachePath = getFetchCachePath();
    const info = getDirInfo(cachePath);
    return {
      success: true,
      exists: fs.existsSync(cachePath),
      path: cachePath,
      size: info.size,
      count: info.count,
    };
  } catch (error: any) {
    console.error("Error in executeGetNextCacheStatus:", error);
    return { success: false, error: error.message, exists: false, size: 0, count: 0, path: "" };
  }
}

export async function executeClearNextCache() {
  try {
    const cachePath = getFetchCachePath();
    if (fs.existsSync(cachePath)) {
      deleteDirContent(cachePath);
    }
    return { success: true, message: "Next.js disk fetch cache cleared successfully." };
  } catch (error: any) {
    console.error("Error in executeClearNextCache:", error);
    return { success: false, error: error.message };
  }
}

