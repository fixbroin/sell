"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, PackageSearch, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CityCategorySeoSetting, AreaCategorySeoSetting, FirestoreCategory, FirestoreCity, FirestoreArea } from '@/types/firestore';
import CityCategorySeoForm, { type CityCategorySeoFormData } from '@/components/admin/CityCategorySeoForm';
import AreaCategorySeoForm, { type AreaCategorySeoFormData } from '@/components/admin/AreaCategorySeoForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, where, getDoc, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { useAuth } from '@/hooks/useAuth';
import { executeDbClearTable, executeBulkOverridesSeoGenerate, executeBulkDeleteByAreaAction, executeBulkDeleteByCategoryAction } from '@/app/actions/dbActions';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { getCache, setCache } from '@/lib/client-cache';
import { getAdminCategories, getCities, getAreas, getCityCategorySeoSettings, getAreaCategorySeoSettings } from '@/lib/webServerUtils';
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { generateFreeCityCategorySeoData, generateFreeAreaCategorySeoData, getNearbyAreasSorted } from "@/lib/seoGenerator";

const generateSeoSlug = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).join('/');
};

export default function SeoOverridesPage() {
  const [activeTab, setActiveTab] = useState<string>("city-category");
  const [cityCategorySettings, setCityCategorySettings] = useState<CityCategorySeoSetting[]>([]);
  const [areaCategorySettings, setAreaCategorySettings] = useState<AreaCategorySeoSetting[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [areas, setAreas] = useState<FirestoreArea[]>([]);
  const [cityDisplayLimit, setCityDisplayLimit] = useState(500);
  const [areaDisplayLimit, setAreaDisplayLimit] = useState(500);
  const [cityCategoryFilterId, setCityCategoryFilterId] = useState<string>("all");
  const [areaCategoryFilterId, setAreaCategoryFilterId] = useState<string>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<CityCategorySeoSetting | AreaCategorySeoSetting | null>(null);
  const [formType, setFormType] = useState<'cityCategory' | 'areaCategory' | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const { adminPermissions } = useAuth();

  const cityCatSeoRef = collection(db, "cityCategorySeoSettings");
  const areaCatSeoRef = collection(db, "areaCategorySeoSettings");

  // Batch Generation State
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchCityId, setBatchCityId] = useState<string>("all");
  const [batchCategoryId, setBatchCategoryId] = useState<string>("all");
  const [batchOverwrite, setBatchOverwrite] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchStatus, setBatchStatus] = useState("");

  // Delete All State
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteStatus, setDeleteStatus] = useState("");

  // Bulk Delete State
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkDeleteType, setBulkDeleteType] = useState<"area" | "category" | "">("");
  const [bulkDeleteAreaId, setBulkDeleteAreaId] = useState<string>("");
  const [bulkDeleteCategoryId, setBulkDeleteCategoryId] = useState<string>("");
  const [bulkDeleteRunning, setBulkDeleteRunning] = useState(false);

  const resolveUniqueSlug = async (collectionRef: any, baseSlug: string, currentId?: string): Promise<string> => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collectionRef,
        where("slug", "==", uniqueSlug),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        isUnique = true;
      } else {
        const docSnap = querySnapshot.docs[0];
        if (currentId && docSnap.id === currentId) {
          isUnique = true;
        } else {
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
    }
    return uniqueSlug;
  };

  const handleStartBatch = async () => {
    setBatchRunning(true);
    setBatchProgress(0);
    setBatchStatus("Initializing server-side bulk generation...");

    try {
      setBatchProgress(20);
      setBatchStatus("Running bulk SEO generation on database server (this takes about 2-5 seconds)...");

      const result = await executeBulkOverridesSeoGenerate({
        activeTab: activeTab as "city-category" | "area-category",
        batchCityId,
        batchCategoryId,
        batchOverwrite
      });

      setBatchProgress(100);

      toast({
        title: "Batch Generation Completed!",
        description: `Successfully processed all combinations. Created: ${result.createdCount}, Updated: ${result.updatedCount}, Skipped: ${result.skippedCount}.`,
        className: "bg-green-100 border-green-300 text-green-700"
      });

      setIsBatchOpen(false);
      await triggerRefresh('seo-settings');
      await fetchData(true);
    } catch (err) {
      console.error("Error in batch generation:", err);
      toast({ title: "Batch Failed", description: (err as Error).message || "An error occurred.", variant: "destructive" });
    } finally {
      setBatchRunning(false);
    }
  };

  const handleDeleteAll = async () => {
    setDeleteRunning(true);
    setDeleteProgress(0);
    setDeleteStatus("Initializing deletion...");

    try {
      const targetSettings = activeTab === "city-category" ? cityCategorySettings : areaCategorySettings;
      const collectionRef = activeTab === "city-category" ? cityCatSeoRef : areaCatSeoRef;
      const total = targetSettings.length;

      if (total === 0) {
        toast({ title: "No overrides", description: "There are no overrides to delete in this tab.", variant: "destructive" });
        setDeleteRunning(false);
        return;
      }

      setDeleteStatus(`Clearing all overrides from the ${activeTab === 'city-category' ? 'cityCategorySeoSettings' : 'areaCategorySeoSettings'} table...`);
      setDeleteProgress(50);

      const targetTable = activeTab === "city-category" ? "cityCategorySeoSettings" : "areaCategorySeoSettings";
      await executeDbClearTable(targetTable);

      setDeleteProgress(100);

      toast({
        title: "All Overrides Deleted",
        description: `Successfully deleted all ${total} overrides in the ${activeTab === 'city-category' ? 'City-Category' : 'Area-Category'} section.`,
        className: "bg-green-100 border-green-300 text-green-700"
      });

      setIsDeleteAllOpen(false);
      await triggerRefresh('seo-settings');
      await fetchData(true);
    } catch (err) {
      console.error("Error deleting all overrides:", err);
      toast({ title: "Delete Failed", description: (err as Error).message || "An error occurred.", variant: "destructive" });
    } finally {
      setDeleteRunning(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!bulkDeleteType) {
      toast({ title: "Validation Error", description: "Please select a deletion type.", variant: "destructive" });
      return;
    }

    if (bulkDeleteType === 'area' && !bulkDeleteAreaId) {
      toast({ title: "Validation Error", description: "Please select a target area.", variant: "destructive" });
      return;
    }

    if (bulkDeleteType === 'category' && !bulkDeleteCategoryId) {
      toast({ title: "Validation Error", description: "Please select a target category.", variant: "destructive" });
      return;
    }

    setBulkDeleteRunning(true);

    try {
      if (bulkDeleteType === 'area') {
        const areaName = areas.find(a => a.id === bulkDeleteAreaId)?.name || "Selected Area";
        await executeBulkDeleteByAreaAction(bulkDeleteAreaId);
        toast({
          title: "Bulk Delete Success",
          description: `Successfully deleted Area-Category overrides for area: ${areaName}.`,
          className: "bg-green-100 border-green-300 text-green-700"
        });
      } else {
        const catName = categories.find(c => c.id === bulkDeleteCategoryId)?.name || "Selected Category";
        await executeBulkDeleteByCategoryAction(bulkDeleteCategoryId);
        toast({
          title: "Bulk Delete Success",
          description: `Successfully deleted City-Category and Area-Category overrides for category: ${catName}.`,
          className: "bg-green-100 border-green-300 text-green-700"
        });
      }

      setIsBulkDeleteOpen(false);
      setBulkDeleteType("");
      setBulkDeleteAreaId("");
      setBulkDeleteCategoryId("");
      await triggerRefresh('seo-settings');
      await triggerRefresh('sitemap');
      await fetchData(true);
    } catch (err) {
      console.error("Error running bulk delete:", err);
      toast({ title: "Delete Failed", description: (err as Error).message || "An error occurred.", variant: "destructive" });
    } finally {
      setBulkDeleteRunning(false);
    }
  };

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      let cachedCats = getCache<FirestoreCategory[]>('admin-cats-for-seo', true);
      let cachedCities = getCache<FirestoreCity[]>('admin-cities-for-seo', true);
      let cachedAreas = getCache<FirestoreArea[]>('admin-areas-for-seo', true);

      if (forceRefresh || !cachedCats || !cachedCities || !cachedAreas) {
        const [fetchedCats, fetchedCities, fetchedAreas] = await Promise.all([
          getAdminCategories(),
          getCities(),
          getAreas()
        ]);

        cachedCats = fetchedCats;
        cachedCities = fetchedCities;
        cachedAreas = fetchedAreas;

        setCache('admin-cats-for-seo', fetchedCats, true);
        setCache('admin-cities-for-seo', fetchedCities, true);
        setCache('admin-areas-for-seo', fetchedAreas, true);
      }

      setCategories(cachedCats);
      setCities(cachedCities);
      setAreas(cachedAreas);

      // ALWAYS load settings fresh from server on page reload/navigation to avoid stale caches
      const [fetchedCitySeo, fetchedAreaSeo] = await Promise.all([
        getCityCategorySeoSettings(),
        getAreaCategorySeoSettings()
      ]);

      setCityCategorySettings(fetchedCitySeo);
      setAreaCategorySettings(fetchedAreaSeo);
      setCityDisplayLimit(500);
      setAreaDisplayLimit(500);
    } catch (error) {
      console.error("Error fetching SEO override data:", error);
      toast({ title: "Error", description: "Could not load SEO override data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddSetting = (type: 'cityCategory' | 'areaCategory') => {
    setEditingSetting(null);
    setFormType(type);
    setIsFormOpen(true);
  };

  const handleEditSetting = async (setting: CityCategorySeoSetting | AreaCategorySeoSetting, type: 'cityCategory' | 'areaCategory') => {
    setIsSubmitting(true);
    const collectionRef = type === 'cityCategory' ? cityCatSeoRef : areaCatSeoRef;
    try {
      const docRef = doc(collectionRef, setting.id!);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setEditingSetting({ id: docSnap.id, ...docSnap.data() } as any);
        setFormType(type);
        setIsFormOpen(true);
      } else {
        toast({ title: "Error", description: "SEO Override not found.", variant: "destructive" });
      }
    } catch (err) {
      console.error("Error loading override details:", err);
      toast({ title: "Error", description: "Failed to load override details.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSetting = async (id: string, type: 'cityCategory' | 'areaCategory') => {
    setIsSubmitting(true);
    const collectionRef = type === 'cityCategory' ? cityCatSeoRef : areaCatSeoRef;
    try {
      const setting = type === 'cityCategory' 
        ? cityCategorySettings.find(s => s.id === id)
        : areaCategorySettings.find(s => s.id === id);
      await deleteDoc(doc(collectionRef, id));
      await triggerRefresh('seo-settings');
      
      if (setting) {
        const city = cities.find(c => c.id === setting.cityId);
        const category = categories.find(c => c.id === setting.categoryId);
        if (type === 'cityCategory') {
          if (city?.slug && category?.slug) {
            await submitToGoogleIndexing('city-category', { citySlug: city.slug, categorySlug: category.slug }, false);
          }
        } else {
          const area = areas.find(a => a.id === (setting as AreaCategorySeoSetting).areaId);
          if (city?.slug && area?.slug && category?.slug) {
            await submitToGoogleIndexing('area-category', { citySlug: city.slug, areaSlug: area.slug, categorySlug: category.slug }, false);
          }
        }
      }
      
      toast({ title: "Success", description: "SEO override deleted successfully." });
      await fetchData(true); // Force refresh
    } catch (error) {
      toast({ title: "Error", description: "Could not delete SEO override.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (setting: CityCategorySeoSetting | AreaCategorySeoSetting, type: 'cityCategory' | 'areaCategory') => {
    setIsSubmitting(true);
    const collectionRef = type === 'cityCategory' ? cityCatSeoRef : areaCatSeoRef;
    try {
        await updateDoc(doc(collectionRef, setting.id!), { isActive: !setting.isActive, updatedAt: Timestamp.now() });
        await triggerRefresh('seo-settings');
        
        const city = cities.find(c => c.id === setting.cityId);
        const category = categories.find(c => c.id === setting.categoryId);
        if (type === 'cityCategory') {
          if (city?.slug && category?.slug) {
            await submitToGoogleIndexing('city-category', { citySlug: city.slug, categorySlug: category.slug }, !setting.isActive);
          }
        } else {
          const area = areas.find(a => a.id === (setting as AreaCategorySeoSetting).areaId);
          if (city?.slug && area?.slug && category?.slug) {
            await submitToGoogleIndexing('area-category', { citySlug: city.slug, areaSlug: area.slug, categorySlug: category.slug }, !setting.isActive);
          }
        }
        
        toast({ title: "Success", description: "Status updated."});
        await fetchData(true);
    } catch (error) {
        toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleCityCategoryFormSubmit = async (data: CityCategorySeoFormData & { id?: string }) => {
    setIsSubmitting(true);
    const city = cities.find(c => c.id === data.cityId);
    const category = categories.find(c => c.id === data.categoryId);
    if (!city || !category) {
      toast({ title: "Error", description: "Selected city or category not found.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const basePayload: Omit<CityCategorySeoSetting, 'id' | 'createdAt' | 'updatedAt'> = {
        cityId: data.cityId,
        cityName: city.name,
        categoryId: data.categoryId,
        categoryName: category.name,
        slug: data.slug || generateSeoSlug([city.slug, category.slug]),
        h1_title: data.h1_title,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        meta_keywords: data.meta_keywords,
        seo_content: data.seo_content,
        faqs: data.faqs,
        imageHint: data.imageHint,
        isActive: data.isActive,
    };

    try {
      if (data.id) { 
        await updateDoc(doc(cityCatSeoRef, data.id), { ...basePayload, updatedAt: Timestamp.now() });
      } else { 
        const q = query(cityCatSeoRef, where("cityId", "==", data.cityId), where("categoryId", "==", data.categoryId));
        const snap = await getDocs(q);
        if (!snap.empty) {
           toast({ title: "Duplicate Entry", description: "An SEO override for this city and category already exists.", variant: "destructive"});
           setIsSubmitting(false); return;
        }
        await addDoc(cityCatSeoRef, { ...basePayload, createdAt: Timestamp.now() });
      }
      await triggerRefresh('seo-settings');
      if (city.slug && category.slug) {
        await submitToGoogleIndexing('city-category', { citySlug: city.slug, categorySlug: category.slug }, basePayload.isActive);
      }
      toast({ title: "Success", description: "City-Category SEO setting saved." });
      setIsFormOpen(false); 
      await fetchData(true);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Could not save setting.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAreaCategoryFormSubmit = async (data: AreaCategorySeoFormData & { id?: string }) => {
    setIsSubmitting(true);
    const city = cities.find(c => c.id === data.cityId);
    const area = areas.find(a => a.id === data.areaId);
    const category = categories.find(c => c.id === data.categoryId);
    if (!city || !area || !category) {
      toast({ title: "Error", description: "Selected city, area, or category not found.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const basePayload: Omit<AreaCategorySeoSetting, 'id' | 'createdAt' | 'updatedAt'> = {
      cityId: data.cityId, cityName: city.name, areaId: data.areaId, areaName: area.name,
      categoryId: data.categoryId, categoryName: category.name,
      slug: data.slug || generateSeoSlug([city.slug, area.slug, category.slug]),
      h1_title: data.h1_title, meta_title: data.meta_title, meta_description: data.meta_description,
      meta_keywords: data.meta_keywords,
      seo_content: data.seo_content,
      faqs: data.faqs,
      imageHint: data.imageHint, isActive: data.isActive,
    };

    try {
      if (data.id) { 
        await updateDoc(doc(areaCatSeoRef, data.id), { ...basePayload, updatedAt: Timestamp.now() });
      } else { 
        const q = query(areaCatSeoRef, where("areaId", "==", data.areaId), where("categoryId", "==", data.categoryId));
        const snap = await getDocs(q);
        if (!snap.empty) {
           toast({ title: "Duplicate Entry", description: "An SEO override for this area and category already exists.", variant: "destructive"});
           setIsSubmitting(false); return;
        }
        await addDoc(areaCatSeoRef, { ...basePayload, createdAt: Timestamp.now() });
      }
      await triggerRefresh('seo-settings');
      if (city.slug && area.slug && category.slug) {
        await submitToGoogleIndexing('area-category', { citySlug: city.slug, areaSlug: area.slug, categorySlug: category.slug }, basePayload.isActive);
      }
      toast({ title: "Success", description: "Area-Category SEO setting saved." });
      setIsFormOpen(false); 
      await fetchData(true);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Could not save setting.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };


  const filteredCitySettings = cityCategoryFilterId === 'all'
    ? cityCategorySettings
    : cityCategorySettings.filter(s => s.categoryId === cityCategoryFilterId);

  const filteredAreaSettings = areaCategoryFilterId === 'all'
    ? areaCategorySettings
    : areaCategorySettings.filter(s => s.categoryId === areaCategoryFilterId);

  if (!isMounted || isLoading) {
    return (
      <div className="space-y-6">
        <Card><CardHeader><Skeleton className="h-8 w-1/2" /><Skeleton className="h-4 w-3/4 mt-2" /></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Zap className="mr-2 h-6 w-6 text-primary" />Advanced SEO Overrides</CardTitle>
          <CardDescription>Manage specific SEO settings for City-Category and Area-Category combinations.</CardDescription>
        </CardHeader>
      </Card>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="city-category">City-Category SEO</TabsTrigger>
          <TabsTrigger value="area-category">Area-Category SEO</TabsTrigger>
        </TabsList>
        <TabsContent value="city-category">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div><CardTitle>City-Category Specific Settings</CardTitle><CardDescription>Overrides for /[city]/category/[categorySlug] pages.</CardDescription></div>
              <div className="flex flex-wrap md:flex-nowrap gap-2 shrink-0">
                <PermissionGuard moduleId="seo_overrides" action="create">
                  <Button variant="outline" onClick={() => { setFormType('cityCategory'); setIsBatchOpen(true); }} disabled={isSubmitting || cities.length === 0}><Zap className="mr-2 h-4 w-4 text-amber-500" />Batch Generate (Free)</Button>
                  {cityCategorySettings.length > 0 && (
                    <>
                      <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => { setBulkDeleteType('category'); setIsBulkDeleteOpen(true); }} disabled={isSubmitting}>
                        <Trash2 className="mr-2 h-4 w-4"/>Bulk Delete
                      </Button>
                      <Button variant="destructive" onClick={() => setIsDeleteAllOpen(true)} disabled={isSubmitting}>
                        <Trash2 className="mr-2 h-4 w-4"/>Delete All
                      </Button>
                    </>
                  )}
                  <Button onClick={() => handleAddSetting('cityCategory')} disabled={isSubmitting || cities.length === 0 || categories.length === 0}><PlusCircle className="mr-2 h-4 w-4"/>Add New</Button>
                </PermissionGuard>
              </div>
            </CardHeader>
            <CardContent>
              {cityCategorySettings.length > 0 && (
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <span className="text-sm font-medium text-muted-foreground">Filter by Category:</span>
                  <Select value={cityCategoryFilterId} onValueChange={setCityCategoryFilterId}>
                    <SelectTrigger className="w-[220px] h-9">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id!}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cityCategoryFilterId !== 'all' && (
                    <Button variant="ghost" size="sm" onClick={() => setCityCategoryFilterId('all')} className="h-9">Reset</Button>
                  )}
                </div>
              )}

              {cityCategorySettings.length === 0 ? (
                 <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No City-Category SEO overrides found.</p></div>
              ) : filteredCitySettings.length === 0 ? (
                 <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No overrides found for the selected category.</p></div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>City</TableHead><TableHead>Category</TableHead><TableHead>Slug Segment</TableHead><TableHead>H1 Title</TableHead><TableHead className="text-center">Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {filteredCitySettings.slice(0, cityDisplayLimit).map(setting => (
                      <TableRow key={setting.id}>
                        <TableCell>{setting.cityName}</TableCell><TableCell>{setting.categoryName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{setting.slug}</TableCell>
                        <TableCell className="text-xs max-w-xs truncate" title={setting.h1_title}>{setting.h1_title || "Not set"}</TableCell>
                        <TableCell className="text-center"><Switch checked={setting.isActive} onCheckedChange={() => handleToggleActive(setting, 'cityCategory')} disabled={isSubmitting || !hasActionPermission(adminPermissions, 'seo_overrides', 'write')}/></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <PermissionGuard moduleId="seo_overrides" action="write">
                              <Button variant="outline" size="icon" onClick={() => handleEditSetting(setting, 'cityCategory')} disabled={isSubmitting}><Edit className="h-4 w-4"/></Button>
                            </PermissionGuard>
                            <PermissionGuard moduleId="seo_overrides" action="delete">
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Delete Confirmation</AlertDialogTitle><AlertDialogDescription>Delete SEO override for {setting.cityName} - {setting.categoryName}?</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteSetting(setting.id!, 'cityCategory')} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </PermissionGuard>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {filteredCitySettings.length > cityDisplayLimit && (
                <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground border-t pt-4">
                  <div>
                    Showing first {Math.min(cityDisplayLimit, filteredCitySettings.length)} of {filteredCitySettings.length} overrides.
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setCityDisplayLimit(prev => prev + 500)}>
                      Load More (+500)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setCityDisplayLimit(filteredCitySettings.length)}>
                      Load All ({filteredCitySettings.length})
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="area-category">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div><CardTitle>Area-Category Specific Settings</CardTitle><CardDescription>Overrides for /[city]/[area]/[categorySlug] pages.</CardDescription></div>
              <div className="flex flex-wrap md:flex-nowrap gap-2 shrink-0">
                <PermissionGuard moduleId="seo_overrides" action="create">
                  <Button variant="outline" onClick={() => { setFormType('areaCategory'); setIsBatchOpen(true); }} disabled={isSubmitting || cities.length === 0}><Zap className="mr-2 h-4 w-4 text-amber-500" />Batch Generate (Free)</Button>
                  {areaCategorySettings.length > 0 && (
                    <>
                      <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => { setBulkDeleteType(''); setIsBulkDeleteOpen(true); }} disabled={isSubmitting}>
                        <Trash2 className="mr-2 h-4 w-4"/>Bulk Delete
                      </Button>
                      <Button variant="destructive" onClick={() => setIsDeleteAllOpen(true)} disabled={isSubmitting}>
                        <Trash2 className="mr-2 h-4 w-4"/>Delete All
                      </Button>
                    </>
                  )}
                  <Button onClick={() => handleAddSetting('areaCategory')} disabled={isSubmitting || cities.length === 0 || areas.length === 0 || categories.length === 0}><PlusCircle className="mr-2 h-4 w-4"/>Add New</Button>
                </PermissionGuard>
              </div>
            </CardHeader>
            <CardContent>
              {areaCategorySettings.length > 0 && (
                <div className="flex items-center gap-2 mb-4 pb-2 border-b">
                  <span className="text-sm font-medium text-muted-foreground">Filter by Category:</span>
                  <Select value={areaCategoryFilterId} onValueChange={setAreaCategoryFilterId}>
                    <SelectTrigger className="w-[220px] h-9">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id!}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {areaCategoryFilterId !== 'all' && (
                    <Button variant="ghost" size="sm" onClick={() => setAreaCategoryFilterId('all')} className="h-9">Reset</Button>
                  )}
                </div>
              )}

              {areaCategorySettings.length === 0 ? (
                  <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No Area-Category SEO overrides found.</p></div>
              ) : filteredAreaSettings.length === 0 ? (
                  <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No overrides found for the selected category.</p></div>
              ) : (
                  <Table>
                      <TableHeader><TableRow><TableHead>City</TableHead><TableHead>Area</TableHead><TableHead>Category</TableHead><TableHead>Slug Segment</TableHead><TableHead>H1 Title</TableHead><TableHead className="text-center">Active</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                      {filteredAreaSettings.slice(0, areaDisplayLimit).map(setting => (
                          <TableRow key={setting.id}>
                          <TableCell>{setting.cityName}</TableCell><TableCell>{setting.areaName}</TableCell><TableCell>{setting.categoryName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{setting.slug}</TableCell>
                          <TableCell className="text-xs max-w-xs truncate" title={setting.h1_title}>{setting.h1_title || "Not set"}</TableCell>
                          <TableCell className="text-center"><Switch checked={setting.isActive} onCheckedChange={() => handleToggleActive(setting, 'areaCategory')} disabled={isSubmitting || !hasActionPermission(adminPermissions, 'seo_overrides', 'write')}/></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <PermissionGuard moduleId="seo_overrides" action="write">
                                <Button variant="outline" size="icon" onClick={() => handleEditSetting(setting, 'areaCategory')} disabled={isSubmitting}><Edit className="h-4 w-4"/></Button>
                              </PermissionGuard>
                              <PermissionGuard moduleId="seo_overrides" action="delete">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader><AlertDialogTitle>Delete Confirmation</AlertDialogTitle><AlertDialogDescription>Delete SEO override for {setting.areaName} - {setting.categoryName}?</AlertDialogDescription></AlertDialogHeader>
                                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteSetting(setting.id!, 'areaCategory')} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </PermissionGuard>
                            </div>
                          </TableCell>
                          </TableRow>
                      ))}
                      </TableBody>
                  </Table>
              )}

              {filteredAreaSettings.length > areaDisplayLimit && (
                <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground border-t pt-4">
                  <div>
                    Showing first {Math.min(areaDisplayLimit, filteredAreaSettings.length)} of {filteredAreaSettings.length} overrides.
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setAreaDisplayLimit(prev => prev + 500)}>
                      Load More (+500)
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setAreaDisplayLimit(filteredAreaSettings.length)}>
                      Load All ({filteredAreaSettings.length})
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) { setEditingSetting(null); setFormType(null); } }}}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-3 pb-4 border-b">
            <DialogTitle>{editingSetting ? 'Edit' : 'Add New'} {formType === 'cityCategory' ? 'City-Category' : 'Area-Category'} SEO Setting</DialogTitle>
            <DialogDescription>Fill in the details for the SEO override.</DialogDescription>
          </DialogHeader>
          <div className="p-3">
            {cities.length === 0 || categories.length === 0 || (formType === 'areaCategory' && areas.length === 0) ? (
                 <div className="py-8 text-center"><PackageSearch className="mx-auto h-10 w-10 text-muted-foreground mb-3" /><p className="text-destructive">Cannot add settings: Cities, Categories (and Areas for area-specific) must exist first.</p></div>
            ) : formType === 'cityCategory' ? (
              <CityCategorySeoForm
                onSubmit={handleCityCategoryFormSubmit}
                initialData={editingSetting as CityCategorySeoSetting | null}
                existingSettings={cityCategorySettings}
                cities={cities}
                categories={categories}
                onCancel={() => { setIsFormOpen(false); setEditingSetting(null); setFormType(null); }}
                isSubmitting={isSubmitting}
              />
            ) : formType === 'areaCategory' ? (
              <AreaCategorySeoForm
                onSubmit={handleAreaCategoryFormSubmit}
                initialData={editingSetting as AreaCategorySeoSetting | null}
                existingSettings={areaCategorySettings}
                cities={cities}
                areas={areas}
                categories={categories}
                onCancel={() => { setIsFormOpen(false); setEditingSetting(null); setFormType(null); }}
                isSubmitting={isSubmitting}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBatchOpen} onOpenChange={(open) => { if (!batchRunning) setIsBatchOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Batch Generate Free SEO Overrides</DialogTitle>
            <DialogDescription>
              Automatically generate and save spinned local SEO copy for all selected combinations. This operates entirely client-side for free.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target City</label>
              <Select value={batchCityId} onValueChange={setBatchCityId} disabled={batchRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Select City" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cities</SelectItem>
                  {cities.map(c => (
                    <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Target Category</label>
              <Select value={batchCategoryId} onValueChange={setBatchCategoryId} disabled={batchRunning}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id!}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="overwrite" 
                checked={batchOverwrite} 
                onCheckedChange={(checked) => setBatchOverwrite(!!checked)}
                disabled={batchRunning}
              />
              <label htmlFor="overwrite" className="text-sm font-medium leading-none cursor-pointer">
                Overwrite existing custom overrides
              </label>
            </div>

            {batchRunning && (
              <div className="space-y-2 pt-4">
                <Progress value={batchProgress} className="w-full" />
                <p className="text-xs text-muted-foreground animate-pulse">{batchStatus}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsBatchOpen(false)} disabled={batchRunning}>
              Cancel
            </Button>
            <Button onClick={handleStartBatch} disabled={batchRunning}>
              {batchRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {batchRunning ? "Generating..." : "Start Batch Generation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteAllOpen} onOpenChange={(open) => { if (!deleteRunning) setIsDeleteAllOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-6 w-6" /> Danger: Delete All Overrides?
            </DialogTitle>
            <DialogDescription>
              Are you absolutely sure you want to delete **ALL** SEO overrides in the current **{activeTab === 'city-category' ? 'City-Category' : 'Area-Category'}** tab? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {deleteRunning && (
              <div className="space-y-2 pt-2">
                <Progress value={deleteProgress} className="w-full" />
                <p className="text-xs text-muted-foreground animate-pulse">{deleteStatus}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsDeleteAllOpen(false)} disabled={deleteRunning}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={deleteRunning}>
              {deleteRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {deleteRunning ? "Deleting..." : "Yes, Delete All"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkDeleteOpen} onOpenChange={(open) => { if (!bulkDeleteRunning) setIsBulkDeleteOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-6 w-6" /> Bulk Delete SEO Overrides
            </DialogTitle>
            <DialogDescription>
              Delete SEO overrides selectively by Area or by Category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Delete by Filter Type</label>
              <Select value={bulkDeleteType} onValueChange={(val: any) => setBulkDeleteType(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select deletion type..." />
                </SelectTrigger>
                <SelectContent>
                  {activeTab === 'area-category' && (
                    <SelectItem value="area">Delete by Area</SelectItem>
                  )}
                  <SelectItem value="category">Delete by Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {bulkDeleteType === 'area' && activeTab === 'area-category' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Area</label>
                <Select value={bulkDeleteAreaId} onValueChange={setBulkDeleteAreaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose Area..." />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map(area => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name} ({cities.find(c => c.id === area.cityId)?.name || 'Unknown City'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {bulkDeleteType === 'category' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Category</label>
                <Select value={bulkDeleteCategoryId} onValueChange={setBulkDeleteCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose Category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {bulkDeleteRunning && (
              <div className="pt-2 animate-pulse text-xs text-muted-foreground">
                Executing bulk deletion from database...
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => {
              setIsBulkDeleteOpen(false);
              setBulkDeleteType("");
              setBulkDeleteAreaId("");
              setBulkDeleteCategoryId("");
            }} disabled={bulkDeleteRunning}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteRunning || !bulkDeleteType || (bulkDeleteType === 'area' && !bulkDeleteAreaId) || (bulkDeleteType === 'category' && !bulkDeleteCategoryId)}>
              {bulkDeleteRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {bulkDeleteRunning ? "Delete Selected" : "Delete Selected"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
