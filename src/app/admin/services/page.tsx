"use client";

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import AppImage from '@/components/ui/AppImage';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PlusCircle, Edit, Trash2, ShoppingBag, Loader2, Search, Copy } from "lucide-react";
import type { FirestoreService, FirestoreSubCategory, FirestoreTax, FirestoreCategory } from '@/types/firestore';
import ServiceForm from '@/components/admin/ServiceForm';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, query, Timestamp, where } from '@/lib/mysqlDb';
import { ref as storageRef, deleteObject } from '@/lib/mysqlStorage';
import { useToast } from "@/hooks/use-toast";
import { getIconComponent } from '@/lib/iconMap';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { Switch } from '@/components/ui/switch';
import { Input } from "@/components/ui/input";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { getCache, setCache } from '@/lib/client-cache';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { formatCurrency } from '@/lib/utils';
import { getAdminServices, getAdminCategories, getAdminSubCategories, getTaxes } from '@/lib/webServerUtils';

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const isFirebaseStorageUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.trim().length > 0;
};

export default function AdminServicesPage() {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [services, setServices] = useState<FirestoreService[]>([]);
  const [parentCategories, setParentCategories] = useState<FirestoreCategory[]>([]);
  const [subCategories, setSubCategories] = useState<FirestoreSubCategory[]>([]);
  const [taxes, setTaxes] = useState<FirestoreTax[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<FirestoreService | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true); // Combined loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();
  const { adminPermissions } = useAuth();

  const servicesCollectionRef = collection(db, "adminServices");
  const categoriesCollectionRef = collection(db, "adminCategories");
  const subCategoriesCollectionRef = collection(db, "adminSubCategories");
  const taxesCollectionRef = collection(db, "taxes");

  const fetchData = async (forceRefresh?: boolean) => {
    setIsLoadingData(true);
    try {
      let fetchedCats: FirestoreCategory[] = [];
      let fetchedSubCats: FirestoreSubCategory[] = [];
      let fetchedServices: FirestoreService[] = [];
      let fetchedTaxes: FirestoreTax[] = [];

      try {
        const catData = await getDocs(query(categoriesCollectionRef, orderBy("order", "asc")));
        fetchedCats = catData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCategory));
      } catch (e) {
        console.error("Error fetching categories:", e);
      }

      try {
        const subCatData = await getDocs(query(subCategoriesCollectionRef, orderBy("order", "asc")));
        fetchedSubCats = subCatData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreSubCategory));
      } catch (e) {
        console.error("Error fetching sub-categories:", e);
      }

      try {
        const serviceData = await getDocs(query(servicesCollectionRef, orderBy("name", "asc")));
        fetchedServices = serviceData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreService));
      } catch (e) {
        console.error("Error fetching services:", e);
      }

      try {
        const taxData = await getDocs(taxesCollectionRef);
        fetchedTaxes = taxData.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreTax));
      } catch (e) {
        console.error("Error fetching taxes:", e);
      }

      setParentCategories(fetchedCats);
      setSubCategories(fetchedSubCats);
      setServices(fetchedServices);
      setTaxes(fetchedTaxes);

    } catch (error) {
      console.error("Error fetching prerequisite data: ", error);
      toast({
        title: "Error",
        description: "Could not fetch required data for services.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchData(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddService = () => {
    setEditingService(null);
    setIsCloning(false);
    setIsFormOpen(true);
  };

  const handleEditService = (service: FirestoreService) => {
    setEditingService(service);
    setIsCloning(false);
    setIsFormOpen(true);
  };

  const handleCloneService = (service: FirestoreService) => {
    setEditingService(service);
    setIsCloning(true);
    setIsFormOpen(true);
  };

  const handleToggleActive = async (service: FirestoreService) => {
    setIsSubmitting(true);
    try {
        await updateDoc(doc(db, "adminServices", service.id), { 
          isActive: !service.isActive, 
          updatedAt: Timestamp.now() 
        });
        setServices(prev => prev.map(s => s.id === service.id ? { ...s, isActive: !s.isActive } : s));
        toast({ title: "Status Updated", description: `Service "${service.name}" ${!service.isActive ? "enabled" : "disabled"}.` });
        await triggerRefresh('services');
        await triggerRefresh('global-cache');
        await triggerRefresh('sitemap');
        // Notify Google Indexing API
        await submitToGoogleIndexing('service', service.slug, !service.isActive);
    } catch (_error) {
        toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleTogglePayLater = async (service: FirestoreService) => {
    setIsSubmitting(true);
    try {
        await updateDoc(doc(db, "adminServices", service.id), { 
          allowPayLater: !service.allowPayLater, 
          updatedAt: Timestamp.now() 
        });
        setServices(prev => prev.map(s => s.id === service.id ? { ...s, allowPayLater: !service.allowPayLater } : s));
        toast({ title: "Pay Later Updated", description: `Pay later for "${service.name}" ${!service.allowPayLater ? "enabled" : "disabled"}.` });
        await triggerRefresh('services');
        await triggerRefresh('global-cache');
        await triggerRefresh('sitemap');
        // Removed global-cache trigger to save reads
    } catch (error) {
        toast({ title: "Error", description: "Could not update pay later status.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteService = async (serviceId: string) => {
    setIsSubmitting(true);
    try {
      const serviceDocRef = doc(db, "adminServices", serviceId);
      const serviceSnap = await getDoc(serviceDocRef);
      const serviceData = serviceSnap.data() as FirestoreService | undefined;

      if (serviceData?.imageUrl && isFirebaseStorageUrl(serviceData.imageUrl)) {
        try {
          const imageToDeleteRef = storageRef(storage, serviceData.imageUrl);
          await deleteObject(imageToDeleteRef);
        } catch (imgError: unknown) { console.warn("Error deleting image: ", imgError); }
      }
      await deleteDoc(serviceDocRef);
      await triggerRefresh('services'); // SmartSync: Invalidate cache
      await triggerRefresh('sitemap');
      if (serviceData?.slug) {
        await submitToGoogleIndexing('service', serviceData.slug, false);
      }
      setServices(prev => prev.filter(serv => serv.id !== serviceId));
      toast({ title: "Success", description: "Service deleted successfully." });
    } catch (error) {
      console.error("Error deleting service: ", error);
      toast({ title: "Error", description: "Could not delete service.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreService, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    const selectedTax = taxes.find(t => t.id === data.taxId);

    // Resolve slug uniqueness dynamically
    let baseSlug = data.slug || generateSlug(data.name);
    let finalSlug = baseSlug;
    let counter = 1;
    let isSlugUnique = false;
    
    while (!isSlugUnique) {
      const existing = services.find(s => s.slug === finalSlug && s.id !== data.id);
      if (!existing) {
        isSlugUnique = true;
      } else {
        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    const payloadForFirestore: Partial<FirestoreService> = {
      name: data.name, 
      slug: finalSlug, 
      subCategoryId: data.subCategoryId, 
      description: data.description,
      price: data.price,
      isTaxInclusive: data.isTaxInclusive, 
      discountedPrice: data.discountedPrice === null ? null : data.discountedPrice,
      hasPriceVariants: data.hasPriceVariants,
      priceVariants: data.priceVariants,
      rating: Number(data.rating || 0), 
      reviewCount: Number(data.reviewCount || 0),
      hasMinQuantity: data.hasMinQuantity,
      minQuantity: data.hasMinQuantity ? Number(data.minQuantity || 0) : null,
      maxQuantity: data.maxQuantity === null ? null : Number(data.maxQuantity),
      order: Number(data.order || 0),
      isActive: data.isActive === undefined ? true : data.isActive,
      imageUrl: data.imageUrl || "", 
      imageHint: data.imageHint || "", 
      shortDescription: data.shortDescription === null ? null : data.shortDescription,
      fullDescription: data.fullDescription === null ? null : data.fullDescription, 
      serviceHighlights: data.serviceHighlights || [],
      taxId: data.taxId, 
      taxName: selectedTax?.taxName, 
      taxPercent: selectedTax?.taxPercent,
      h1_title: data.h1_title || null, 
      seo_title: data.seo_title || null,
      seo_description: data.seo_description || null, 
      seo_keywords: data.seo_keywords || null,
      taskTimeValue: data.taskTimeValue === null ? null : data.taskTimeValue,
      taskTimeUnit: data.taskTimeUnit === null ? null : data.taskTimeUnit,
      includedItems: data.includedItems || [],
      excludedItems: data.excludedItems || [],
      allowPayLater: data.allowPayLater,
      serviceFaqs: data.serviceFaqs || [],
      membersRequired: data.membersRequired === null ? null : data.membersRequired,
    };

    try {
      if (data.id) { // Editing existing service
        const serviceDoc = doc(db, "adminServices", data.id);
        const updateData = { ...payloadForFirestore, updatedAt: Timestamp.now() };
        const { id: _, ...dataToSave } = updateData as { id?: string } & typeof updateData;
        await updateDoc(serviceDoc, dataToSave);
        toast({ title: "Success", description: "Service updated successfully." });
      } else { // Adding new service
        const newServicePayload = { ...payloadForFirestore, createdAt: Timestamp.now() };
        await addDoc(servicesCollectionRef, newServicePayload as FirestoreService); // Cast to ensure type compatibility for addDoc
        toast({ title: "Success", description: "Service added successfully." });
      }
      await triggerRefresh('services'); // SmartSync: Invalidate main services cache
      await triggerRefresh('global-cache');
      if (data.slug) {
        await triggerRefresh(`service-${data.slug}`); // Invalidate specific service page cache
      }
      await triggerRefresh('sitemap');
      if (payloadForFirestore.slug) {
        await submitToGoogleIndexing('service', payloadForFirestore.slug, payloadForFirestore.isActive);
      }
      setIsFormOpen(false); setEditingService(null); await fetchData(true);
    } catch (_error) {
      console.error("Error saving service: ", _error);
      toast({ title: "Error", description: (_error as Error).message || "Could not save service.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const nextOrder = useMemo(() => {
    if (services.length === 0) return 0;
    return Math.max(...services.map(s => s.order || 0)) + 1;
  }, [services]);

  const groupedServices = useMemo(() => {
    if (!parentCategories.length) return [];
    
    const search = searchQuery.toLowerCase();

    return parentCategories
      .map(parent => {
        const relevantSubCategories = subCategories
          .filter(sub => sub.parentId === parent.id)
          .sort((a, b) => a.order - b.order);

        const subCategoriesWithTheirServices = relevantSubCategories.map(subCat => {
          const servicesForSubCat = services
            .filter(service => {
              if (service.subCategoryId !== subCat.id) return false;
              if (!search) return true;
              
              return (
                service.name.toLowerCase().includes(search) ||
                (subCat.name || "").toLowerCase().includes(search) ||
                (parent.name || "").toLowerCase().includes(search) ||
                (service.slug || "").toLowerCase().includes(search)
              );
            })
            .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
          return { ...subCat, services: servicesForSubCat };
        });
        return { ...parent, subCategories: subCategoriesWithTheirServices };
      })
      .sort((a,b) => a.order - b.order);
  }, [parentCategories, subCategories, services, searchQuery]);


  if (!isMounted) {
     return (
      <div className="space-y-6">
        <Card><CardHeader><CardTitle className="animate-pulse h-8 w-1/2 bg-muted rounded"></CardTitle><CardDescription className="animate-pulse h-4 w-3/4 bg-muted rounded mt-2"></CardDescription></CardHeader>
          <CardContent><Skeleton className="h-64 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><ShoppingBag className="mr-2 h-6 w-6 text-primary" /> Manage Services</CardTitle>
            <CardDescription>Add, edit, or delete services. Grouped by category and sub-category.</CardDescription>
          </div>
          <PermissionGuard moduleId="services" action="create">
            <Button onClick={handleAddService} disabled={isSubmitting || isLoadingData || parentCategories.length === 0 || subCategories.length === 0} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Service
            </Button>
          </PermissionGuard>
        </CardHeader>
        <CardContent>
           <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search by name, sub-category, or category..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                />
            </div>
        </CardContent>
      </Card>

      {isLoadingData ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-2">Loading all service data...</p>
        </div>
      ) : parentCategories.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-muted-foreground py-10">Please add parent categories first to organize services.</CardContent></Card>
      ) : groupedServices.every(pg => pg.subCategories.every(sg => sg.services.length === 0)) && services.length === 0 ? (
           <Card><CardContent className="pt-6 text-center text-muted-foreground py-10">No services found. Add one to get started.</CardContent></Card>
      ) : (
        <Accordion type="multiple" className="w-full space-y-4">
          {groupedServices.map((parentGroup) => (
            (parentGroup.subCategories.length > 0 || services.some(s => parentCategories.find(pc => pc.id === subCategories.find(sc => sc.id === s.subCategoryId)?.parentId)?.id === parentGroup.id)) && (
            <AccordionItem value={parentGroup.id} key={parentGroup.id} className="border rounded-lg bg-card shadow-sm">
              <AccordionTrigger className="px-6 py-4 text-lg font-semibold hover:no-underline">
                {parentGroup.name}
              </AccordionTrigger>
              <AccordionContent className="px-6 pb-6 pt-0 space-y-4">
                {parentGroup.subCategories.length === 0 && (<p className="text-sm text-muted-foreground pl-1">No sub-categories under {parentGroup.name}.</p>)}
                {parentGroup.subCategories.map((subCatGroup) => (
                  (subCatGroup.services.length > 0) && (
                  <div key={subCatGroup.id} className="pt-2">
                    <h4 className="text-md font-medium text-primary/80 mb-3 border-b pb-2">{subCatGroup.name}</h4>
                    {subCatGroup.services.length === 0 ? (
                      <p className="text-xs text-muted-foreground pl-1">No services under {subCatGroup.name}.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px] p-2">Img</TableHead>
                            <TableHead className="p-2">Name</TableHead>
                            <TableHead className="p-2 text-center">Order</TableHead>
                            <TableHead className="p-2">Slug</TableHead>
                            <TableHead className="text-right p-2">Price ({symbol})</TableHead>
                            <TableHead className="text-right p-2">Tax</TableHead>
                            <TableHead className="text-center p-2">Pay Later</TableHead>
                            <TableHead className="text-center p-2">Active</TableHead>
                            <TableHead className="text-right min-w-[100px] p-2">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {subCatGroup.services.map((service) => {
                            const IconComponent = getIconComponent(undefined);
                            return (
                              <TableRow key={service.id}>
                                <TableCell className="p-2">
                                  {service.imageUrl ? (
                                    <div className="w-8 h-8 relative rounded-sm overflow-hidden">
                                      <AppImage src={service.imageUrl} alt={service.name} fill sizes="32px" className="object-cover" aiHint={service.imageHint || "service"}/>
                                    </div>
                                  ) : ( <IconComponent className="h-5 w-5 text-muted-foreground" /> )}
                                </TableCell>
                                <TableCell className="font-medium p-2 text-xs">{service.name}</TableCell>
                                <TableCell className="text-center p-2 text-xs text-muted-foreground">{service.order || 0}</TableCell>
                                <TableCell className="p-2 text-xs text-muted-foreground">{service.slug}</TableCell>
                                <TableCell className="text-right p-2 text-xs">
                                  <div>{formatCurrency(service.price, symbol, decimals, code)}</div>
                                  {service.discountedPrice && (
                                    <div className="text-[10px] text-green-600 font-semibold">
                                      Disc: {formatCurrency(service.discountedPrice, symbol, decimals, code)}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="text-right p-2 text-xs">
                                  {service.taxName ? `${service.taxName} (${service.taxPercent}%)` : 'N/A'}
                                </TableCell>
                                <TableCell className="text-center p-2">
                                  <Switch 
                                    checked={service.allowPayLater === undefined ? true : service.allowPayLater}
                                    onCheckedChange={() => handleTogglePayLater(service)}
                                    disabled={isSubmitting || !hasActionPermission(adminPermissions, 'services', 'write')}
                                    className="scale-75"
                                  />
                                </TableCell>
                                <TableCell className="text-center p-2">
                                  <Switch 
                                    checked={service.isActive === undefined ? true : service.isActive}
                                    onCheckedChange={() => handleToggleActive(service)}
                                    disabled={isSubmitting || !hasActionPermission(adminPermissions, 'services', 'write')}
                                    className="scale-75"
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <div className="flex items-center justify-end gap-1">
                                    <PermissionGuard moduleId="services" action="write">
                                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleEditService(service)} disabled={isSubmitting}><Edit className="h-3.5 w-3.5" /></Button>
                                    </PermissionGuard>
                                    <PermissionGuard moduleId="services" action="create">
                                      <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => handleCloneService(service)} disabled={isSubmitting} title="Clone Service"><Copy className="h-3.5 w-3.5" /></Button>
                                    </PermissionGuard>
                                    <PermissionGuard moduleId="services" action="delete">
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild><Button variant="destructive" size="icon" className="h-7 w-7" disabled={isSubmitting}><Trash2 className="h-3.5 w-3.5" /></Button></AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete &quot;{service.name}&quot;.</AlertDialogDescription></AlertDialogHeader>
                                          <AlertDialogFooter><AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteService(service.id)} disabled={isSubmitting} className="bg-destructive hover:bg-destructive/90">{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </PermissionGuard>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                  )
                ))}
                 {parentGroup.subCategories.every(sg => sg.services.length === 0) && (<p className="text-sm text-muted-foreground pl-1 mt-2">No services found under any sub-category of {parentGroup.name}.</p>)}
              </AccordionContent>
            </AccordionItem>
            )
          ))}
        </Accordion>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) { setEditingService(null); setIsCloning(false); } } }}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-2xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-3 pb-4 border-b">
            <DialogTitle>{editingService ? (isCloning ? 'Clone Service' : 'Edit Service') : 'Add New Service'}</DialogTitle>
            <DialogDescription>
              {editingService ? (isCloning ? 'Adjust details to create a new cloned service.' : 'Update details.') : 'Fill in details for a new service.'}
            </DialogDescription>
          </DialogHeader>
          {(parentCategories.length === 0 && !editingService && !isLoadingData) || (subCategories.length === 0 && !editingService && !isLoadingData) ? (
             <div className="p-3 py-8 text-center"><p className="text-destructive">{(parentCategories.length === 0 && "No parent categories exist. ")}{(subCategories.length === 0 && "No sub-categories exist. ")}</p><p className="text-muted-foreground text-sm mt-2">Please add categories/sub-categories first.</p></div>
          ) : (
            <ServiceForm 
              onSubmit={handleFormSubmit} 
              initialData={isCloning && editingService ? { ...editingService, id: undefined } : editingService} 
              parentCategories={parentCategories} 
              subCategories={subCategories} 
              taxes={taxes} 
              allServices={services} 
              onCancel={() => { setIsFormOpen(false); setEditingService(null); setIsCloning(false); }} 
              isSubmitting={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
