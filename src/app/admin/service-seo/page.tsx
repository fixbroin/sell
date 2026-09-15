"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, PackageSearch, Layers, Zap, Loader2, Search } from "lucide-react";
import type { AreaServiceSeoSetting, FirestoreCity, FirestoreArea, FirestoreService, FirestoreCategory, FirestoreSubCategory } from '@/types/firestore';
import AreaServiceSeoForm, { type AreaServiceSeoFormData } from '@/components/admin/AreaServiceSeoForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, Timestamp, where, query, getDoc, limit, orderBy } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { useAuth } from '@/hooks/useAuth';
import { executeDbClearTable, executeBulkServiceSeoGenerate, executeBulkDeleteByAreaAction, executeBulkDeleteByCategoryAction } from '@/app/actions/dbActions';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { getAdminServices, getCities, getAreas, getAreaServiceSeoSettings, getAdminCategories, getAdminSubCategories } from '@/lib/webServerUtils';
import { getCache, setCache } from '@/lib/client-cache';
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateFreeAreaServiceSeoData, getNearbyAreasSorted } from "@/lib/seoGenerator";

export default function ServiceSeoPage() {
  const [settings, setSettings] = useState<AreaServiceSeoSetting[]>([]);
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [areas, setAreas] = useState<FirestoreArea[]>([]);
  const [services, setServices] = useState<FirestoreService[]>([]);
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [displayLimit, setDisplayLimit] = useState(500);
  const [categoryFilterId, setCategoryFilterId] = useState<string>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<AreaServiceSeoSetting | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const { toast } = useToast();
  const { adminPermissions } = useAuth();

  const serviceSeoRef = collection(db, "areaServiceSeoSettings");

  // Batch Generation State
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchCityId, setBatchCityId] = useState<string>("all");
  const [batchAreaId, setBatchAreaId] = useState<string>("all");
  const [batchCategoryId, setBatchCategoryId] = useState<string>("all");
  const [batchServiceId, setBatchServiceId] = useState<string>("all");
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

  // Dialog Picker Open States
  const [isCitySearchOpen, setIsCitySearchOpen] = useState(false);
  const [isAreaSearchOpen, setIsAreaSearchOpen] = useState(false);
  const [isCategorySearchOpen, setIsCategorySearchOpen] = useState(false);
  const [isServiceSearchOpen, setIsServiceSearchOpen] = useState(false);

  // Search Query States
  const [citySearchQuery, setCitySearchQuery] = useState("");
  const [areaSearchQuery, setAreaSearchQuery] = useState("");
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");

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

      const result = await executeBulkServiceSeoGenerate({
        batchCityId,
        batchAreaId,
        batchCategoryId,
        batchServiceId,
        batchOverwrite
      });

      setBatchProgress(100);

      toast({
        title: "Batch Generation Completed!",
        description: `Successfully processed all service pages. Created: ${result.createdCount}, Updated: ${result.updatedCount}, Skipped: ${result.skippedCount}.`,
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
      const total = settings.length;

      if (total === 0) {
        toast({ title: "No overrides", description: "There are no overrides to delete.", variant: "destructive" });
        setDeleteRunning(false);
        return;
      }

      setDeleteStatus("Clearing all service-wise overrides from database...");
      setDeleteProgress(50);
      
      await executeDbClearTable('areaServiceSeoSettings');
      
      setDeleteProgress(100);

      toast({
        title: "All Overrides Deleted",
        description: `Successfully deleted all ${total} overrides.`,
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
      toast({ title: "Validation Error", description: "Please select a deletion type (Area or Category).", variant: "destructive" });
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
          description: `Successfully deleted all overrides for area: ${areaName}.`,
          className: "bg-green-100 border-green-300 text-green-700"
        });
      } else {
        const catName = categories.find(c => c.id === bulkDeleteCategoryId)?.name || "Selected Category";
        await executeBulkDeleteByCategoryAction(bulkDeleteCategoryId);
        toast({
          title: "Bulk Delete Success",
          description: `Successfully deleted all overrides for category: ${catName}.`,
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

  const generateSeoSlug = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).join('/');
  };

  const fetchData = async (forceRefresh = false) => {
    setIsLoading(true);
    try {
      let cachedCities = getCache<FirestoreCity[]>('admin-cities-for-service-seo', true);
      let cachedAreas = getCache<FirestoreArea[]>('admin-areas-for-service-seo', true);
      let cachedServices = getCache<FirestoreService[]>('admin-services-for-service-seo', true);
      let cachedCategories = getCache<FirestoreCategory[]>('admin-categories-for-service-seo', true);

      if (forceRefresh || !cachedCities || !cachedAreas || !cachedServices || !cachedCategories || !cachedServices.some(s => s.parentCategoryId !== undefined)) {
        // Fetch fresh static data from Server Actions
        const [fetchedCities, fetchedAreas, fetchedServices, fetchedCategories, fetchedSubCategories] = await Promise.all([
          getCities(),
          getAreas(),
          getAdminServices(),
          getAdminCategories(),
          getAdminSubCategories()
        ]);

        const resolvedServices = fetchedServices.map(srv => {
          if (srv.parentCategoryId) return srv;
          const subCat = fetchedSubCategories.find(sub => String(sub.id) === String(srv.subCategoryId));
          return {
            ...srv,
            parentCategoryId: subCat?.parentId || undefined
          };
        });

        cachedCities = fetchedCities;
        cachedAreas = fetchedAreas;
        cachedServices = resolvedServices;
        cachedCategories = fetchedCategories;

        // Save static lists to client memory cache
        setCache('admin-cities-for-service-seo', fetchedCities, true);
        setCache('admin-areas-for-service-seo', fetchedAreas, true);
        setCache('admin-services-for-service-seo', resolvedServices, true);
        setCache('admin-categories-for-service-seo', fetchedCategories, true);
      }

      setCities(cachedCities);
      setAreas(cachedAreas);
      setServices(cachedServices);
      setCategories(cachedCategories);

      // ALWAYS load settings fresh from server on page reload/navigation to avoid stale caches
      const fetchedSettings = await getAreaServiceSeoSettings();
      setSettings(fetchedSettings);
      setDisplayLimit(500);

    } catch (error) {
      console.error("Error loading Service-wise SEO data:", error);
      toast({ title: "Error", description: "Failed to load location, service, or override parameters.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddSetting = () => {
    setEditingSetting(null);
    setIsFormOpen(true);
  };

  const handleEditSetting = async (setting: AreaServiceSeoSetting) => {
    setIsSubmitting(true);
    try {
      const docRef = doc(serviceSeoRef, setting.id!);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setEditingSetting({ id: docSnap.id, ...docSnap.data() } as AreaServiceSeoSetting);
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

  const handleDeleteSetting = async (id: string) => {
    setIsSubmitting(true);
    try {
      const setting = settings.find(s => s.id === id);
      await deleteDoc(doc(serviceSeoRef, id));
      await triggerRefresh('seo-settings');
      await triggerRefresh('sitemap');
      if (setting?.citySlug && setting?.areaSlug && setting?.serviceSlug) {
        await submitToGoogleIndexing('area-service', { citySlug: setting.citySlug, areaSlug: setting.areaSlug, serviceSlug: setting.serviceSlug }, false);
      }
      toast({ title: "Success", description: "SEO override deleted successfully." });
      await fetchData(true);
    } catch (error) {
      toast({ title: "Error", description: "Could not delete SEO override.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (setting: AreaServiceSeoSetting) => {
    setIsSubmitting(true);
    try {
      const updatedStatus = !setting.isActive;
      await updateDoc(doc(serviceSeoRef, setting.id!), {
        isActive: updatedStatus,
        updatedAt: Timestamp.now()
      });
      await triggerRefresh('seo-settings');
      await triggerRefresh('sitemap');
      if (setting.citySlug && setting.areaSlug && setting.serviceSlug) {
        await submitToGoogleIndexing('area-service', { citySlug: setting.citySlug, areaSlug: setting.areaSlug, serviceSlug: setting.serviceSlug }, updatedStatus);
      }
      toast({ title: "Success", description: `SEO configuration ${updatedStatus ? 'activated' : 'deactivated'} successfully.` });
      await fetchData(true);
    } catch (error) {
      toast({ title: "Error", description: "Failed to update active status.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: AreaServiceSeoFormData & { id?: string }) => {
    setIsSubmitting(true);
    const city = cities.find(c => c.id === data.cityId);
    const area = areas.find(a => a.id === data.areaId);
    const service = services.find(s => s.id === data.serviceId);

    if (!city || !area || !service) {
      toast({ title: "Error", description: "Selected City, Area, or Service parameters not found.", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const payload: Omit<AreaServiceSeoSetting, 'id' | 'createdAt' | 'updatedAt'> = {
      cityId: data.cityId,
      cityName: city.name,
      citySlug: city.slug,
      areaId: data.areaId,
      areaName: area.name,
      areaSlug: area.slug,
      serviceId: data.serviceId,
      serviceName: service.name,
      serviceSlug: service.slug,
      slug: data.slug || `${city.slug}/${area.slug}/service/${service.slug}`,
      h1_title: data.h1_title,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
      meta_keywords: data.meta_keywords,
      seo_content: data.seo_content,
      faqs: data.faqs,
      isActive: data.isActive,
    };

    try {
      if (data.id) {
        await updateDoc(doc(serviceSeoRef, data.id), { ...payload, updatedAt: Timestamp.now() });
      } else {
        // Enforce uniqueness constraints
        const q = query(serviceSeoRef, where("areaId", "==", data.areaId), where("serviceId", "==", data.serviceId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          toast({ title: "Duplicate Entry", description: "An SEO configuration for this area and service already exists.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        await addDoc(serviceSeoRef, { ...payload, createdAt: Timestamp.now() });
      }
      
      await triggerRefresh('seo-settings');
      await triggerRefresh('sitemap');
      if (payload.citySlug && payload.areaSlug && payload.serviceSlug) {
        await submitToGoogleIndexing('area-service', { citySlug: payload.citySlug, areaSlug: payload.areaSlug, serviceSlug: payload.serviceSlug }, payload.isActive);
      }
      toast({ title: "Success", description: "Local Service SEO configurations saved successfully." });
      setIsFormOpen(false);
      await fetchData(true);
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message || "Could not save settings override.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSettings = categoryFilterId === 'all'
    ? settings
    : settings.filter(setting => {
        const service = services.find(s => s.id === setting.serviceId);
        return service && service.parentCategoryId === categoryFilterId;
      });

  if (!isMounted || isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-3/4 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <Layers className="mr-2 h-6 w-6 text-primary" /> Service-wise Local SEO Overrides
            </CardTitle>
            <CardDescription>
              Create dedicated local SEO landing pages linking to specific services in targeted areas (e.g. Bed dismantling in Whitefield).
            </CardDescription>
          </div>
          <div className="flex flex-wrap md:flex-nowrap gap-2 shrink-0">
            <PermissionGuard moduleId="seo_overrides" action="create">
              <Button variant="outline" onClick={() => setIsBatchOpen(true)} disabled={isSubmitting || cities.length === 0}><Zap className="mr-2 h-4 w-4 text-amber-500" />Batch Generate (Free)</Button>
              {settings.length > 0 && (
                <>
                  <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => setIsBulkDeleteOpen(true)} disabled={isSubmitting}>
                    <Trash2 className="mr-2 h-4 w-4" /> Bulk Delete
                  </Button>
                  <Button variant="destructive" onClick={() => setIsDeleteAllOpen(true)} disabled={isSubmitting}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete All
                  </Button>
                </>
              )}
              <Button onClick={handleAddSetting} disabled={isSubmitting || cities.length === 0 || services.length === 0}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Page
              </Button>
            </PermissionGuard>
          </div>
        </CardHeader>
        <CardContent>
          {settings.length > 0 && (
            <div className="flex items-center gap-2 mb-4 pb-2 border-b">
              <span className="text-sm font-medium text-muted-foreground">Filter by Category:</span>
              <Select value={categoryFilterId} onValueChange={setCategoryFilterId}>
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
              {categoryFilterId !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => setCategoryFilterId('all')} className="h-9">Reset</Button>
              )}
            </div>
          )}

          {settings.length === 0 ? (
            <div className="text-center py-12">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No Service-wise Area SEO overrides found.</p>
              <PermissionGuard moduleId="seo_overrides" action="create">
                <Button onClick={handleAddSetting} className="mt-4" variant="outline">
                  Create First Override
                </Button>
              </PermissionGuard>
            </div>
          ) : filteredSettings.length === 0 ? (
            <div className="text-center py-12">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No overrides found for the selected category.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Target Service</TableHead>
                  <TableHead>URL Path</TableHead>
                  <TableHead>H1 Heading</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSettings.slice(0, displayLimit).map((setting) => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-semibold">{setting.cityName}</TableCell>
                    <TableCell>{setting.areaName}</TableCell>
                    <TableCell className="text-primary font-medium">{setting.serviceName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">/{setting.slug}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={setting.h1_title}>
                      {setting.h1_title || "Not set"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch 
                        checked={setting.isActive !== false} 
                        onCheckedChange={() => handleToggleActive(setting)} 
                        disabled={isSubmitting || !hasActionPermission(adminPermissions, 'seo_overrides', 'write')}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <PermissionGuard moduleId="seo_overrides" action="write">
                          <Button variant="outline" size="icon" onClick={() => handleEditSetting(setting)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </PermissionGuard>
                        <PermissionGuard moduleId="seo_overrides" action="delete">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the localized SEO config for "{setting.serviceName}" in "{setting.areaName}".
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteSetting(setting.id!)} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
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

          {filteredSettings.length > displayLimit && (
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground border-t pt-4">
              <div>
                Showing first {Math.min(displayLimit, filteredSettings.length)} of {filteredSettings.length} overrides.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit(prev => prev + 500)}>
                  Load More (+500)
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit(filteredSettings.length)}>
                  Load All ({filteredSettings.length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Form Overlay Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSetting ? `Edit local SEO Config: ${editingSetting.serviceName}` : "Create Localized Service SEO Page"}</DialogTitle>
            <DialogDescription>
              Configure meta tags, long-form content, and answers that target search traffic for a specific service in a specific local area.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <AreaServiceSeoForm
              onSubmit={handleFormSubmit}
              initialData={editingSetting}
              existingSettings={settings}
              cities={cities}
              areas={areas}
              services={services}
              onCancel={() => setIsFormOpen(false)}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBatchOpen} onOpenChange={(open) => { if (!batchRunning) setIsBatchOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Batch Generate Area-Service SEO Overrides</DialogTitle>
            <DialogDescription>
              Automatically generate and save spinned local SEO copy for all selected service and area combinations. This operates entirely client-side for free.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-medium">Target City</label>
              <Dialog open={isCitySearchOpen} onOpenChange={setIsCitySearchOpen}>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsCitySearchOpen(true)}
                  disabled={batchRunning}
                  className="w-full justify-between font-normal"
                >
                  <span>{batchCityId === "all" ? "All Cities" : (cities.find(c => c.id === batchCityId)?.name || "Select City")}</span>
                  <span className="text-xs text-slate-400">▼</span>
                </Button>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Target City</DialogTitle>
                    <DialogDescription>Search and select the target city for batch generation.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search city..."
                        className="pl-8"
                        value={citySearchQuery}
                        onChange={(e) => setCitySearchQuery(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        <Button
                          variant={batchCityId === "all" ? "secondary" : "ghost"}
                          className="w-full justify-start text-left h-auto py-2 px-3"
                          onClick={() => {
                            setBatchCityId("all");
                            setBatchAreaId("all");
                            setIsCitySearchOpen(false);
                            setCitySearchQuery("");
                          }}
                        >
                          All Cities
                        </Button>
                        {cities
                          .filter(c => c.name.toLowerCase().includes(citySearchQuery.toLowerCase()))
                          .map((city) => (
                            <Button
                              key={city.id}
                              variant={batchCityId === city.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2 px-3"
                              onClick={() => {
                                setBatchCityId(city.id!);
                                setBatchAreaId("all");
                                setIsCitySearchOpen(false);
                                setCitySearchQuery("");
                              }}
                            >
                              {city.name}
                            </Button>
                          ))}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-medium">Target Area</label>
              <Dialog open={isAreaSearchOpen} onOpenChange={setIsAreaSearchOpen}>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsAreaSearchOpen(true)}
                  disabled={batchRunning}
                  className="w-full justify-between font-normal"
                >
                  <span>{batchAreaId === "all" ? "All Areas" : (areas.find(a => a.id === batchAreaId)?.name || "Select Area")}</span>
                  <span className="text-xs text-slate-400">▼</span>
                </Button>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Target Area</DialogTitle>
                    <DialogDescription>Search and select the target area for batch generation.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search area..."
                        className="pl-8"
                        value={areaSearchQuery}
                        onChange={(e) => setAreaSearchQuery(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        <Button
                          variant={batchAreaId === "all" ? "secondary" : "ghost"}
                          className="w-full justify-start text-left h-auto py-2 px-3"
                          onClick={() => {
                            setBatchAreaId("all");
                            setIsAreaSearchOpen(false);
                            setAreaSearchQuery("");
                          }}
                        >
                          All Areas
                        </Button>
                        {(batchCityId === "all" ? areas : areas.filter(a => String(a.cityId) === String(batchCityId)))
                          .filter(a => a.name.toLowerCase().includes(areaSearchQuery.toLowerCase()))
                          .map((area) => (
                            <Button
                              key={area.id}
                              variant={batchAreaId === area.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2 px-3"
                              onClick={() => {
                                setBatchAreaId(area.id!);
                                setIsAreaSearchOpen(false);
                                setAreaSearchQuery("");
                              }}
                            >
                              {area.name}
                            </Button>
                          ))}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-medium">Target Category</label>
              <Dialog open={isCategorySearchOpen} onOpenChange={setIsCategorySearchOpen}>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsCategorySearchOpen(true)}
                  disabled={batchRunning}
                  className="w-full justify-between font-normal"
                >
                  <span>{batchCategoryId === "all" ? "All Categories" : (categories.find(c => c.id === batchCategoryId)?.name || "Select Category")}</span>
                  <span className="text-xs text-slate-400">▼</span>
                </Button>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Target Category</DialogTitle>
                    <DialogDescription>Search and select the target category for batch generation.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search category..."
                        className="pl-8"
                        value={categorySearchQuery}
                        onChange={(e) => setCategorySearchQuery(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        <Button
                          variant={batchCategoryId === "all" ? "secondary" : "ghost"}
                          className="w-full justify-start text-left h-auto py-2 px-3"
                          onClick={() => {
                            setBatchCategoryId("all");
                            setBatchServiceId("all");
                            setIsCategorySearchOpen(false);
                            setCategorySearchQuery("");
                          }}
                        >
                          All Categories
                        </Button>
                        {categories
                          .filter(c => c.name.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                          .map((cat) => (
                            <Button
                              key={cat.id}
                              variant={batchCategoryId === cat.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2 px-3"
                              onClick={() => {
                                setBatchCategoryId(cat.id!);
                                setBatchServiceId("all");
                                setIsCategorySearchOpen(false);
                                setCategorySearchQuery("");
                              }}
                            >
                              {cat.name}
                            </Button>
                          ))}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-2 flex flex-col">
              <label className="text-sm font-medium">Target Service</label>
              <Dialog open={isServiceSearchOpen} onOpenChange={setIsServiceSearchOpen}>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setIsServiceSearchOpen(true)}
                  disabled={batchRunning}
                  className="w-full justify-between font-normal"
                >
                  <span>{batchServiceId === "all" ? "All Services" : (services.find(s => s.id === batchServiceId)?.name || "Select Service")}</span>
                  <span className="text-xs text-slate-400">▼</span>
                </Button>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Target Service</DialogTitle>
                    <DialogDescription>Search and select the target service for batch generation.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search service..."
                        className="pl-8"
                        value={serviceSearchQuery}
                        onChange={(e) => setServiceSearchQuery(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        <Button
                          variant={batchServiceId === "all" ? "secondary" : "ghost"}
                          className="w-full justify-start text-left h-auto py-2 px-3"
                          onClick={() => {
                            setBatchServiceId("all");
                            setIsServiceSearchOpen(false);
                            setServiceSearchQuery("");
                          }}
                        >
                          All Services
                        </Button>
                        {(batchCategoryId === "all" ? services : services.filter(s => String(s.parentCategoryId) === String(batchCategoryId)))
                          .filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase()))
                          .map((srv) => (
                            <Button
                              key={srv.id}
                              variant={batchServiceId === srv.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2 px-3"
                              onClick={() => {
                                setBatchServiceId(srv.id!);
                                setIsServiceSearchOpen(false);
                                setServiceSearchQuery("");
                              }}
                            >
                              {srv.name}
                            </Button>
                          ))}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
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
              Are you absolutely sure you want to delete **ALL** service-wise local SEO overrides? This action cannot be undone.
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
                  <SelectItem value="area">Delete by Area</SelectItem>
                  <SelectItem value="category">Delete by Category</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {bulkDeleteType === 'area' && (
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
