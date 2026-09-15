
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, ImageIcon as ImageIconLucide, ExternalLink, ListChecks, ShoppingBag, PackageSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { FeaturesConfiguration, HomepageAd, FirestoreCategory, FirestoreService, AdPlacement, AdActionType } from '@/types/firestore';
import AdForm, { type AdFormData } from './AdForm';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { nanoid } from 'nanoid';
import AppImage from '@/components/ui/AppImage'; // For displaying ad image in table
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";

const defaultFeaturesConfig: FeaturesConfiguration = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  homepageCategoryVisibility: {},
  ads: [],
};

interface AdsManagementTabProps {
  allCategories: FirestoreCategory[];
  allServices: FirestoreService[];
  isLoadingPrerequisites: boolean;
}

export default function AdsManagementTab({ allCategories, allServices, isLoadingPrerequisites }: AdsManagementTabProps) {
  const { toast } = useToast();
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfiguration>(defaultFeaturesConfig);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<HomepageAd | null>(null);

  const loadConfig = useCallback(async () => {
    setIsLoadingConfig(true);
    try {
      const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
      const docSnap = await getDoc(configDocRef);
      if (docSnap.exists()) {
        setFeaturesConfig({ ...defaultFeaturesConfig, ...(docSnap.data() as FeaturesConfiguration) });
      } else {
        setFeaturesConfig(defaultFeaturesConfig);
      }
    } catch (error) {
      console.error("Error loading features configuration:", error);
      toast({ title: "Error", description: "Could not load ad configuration.", variant: "destructive" });
      setFeaturesConfig(defaultFeaturesConfig);
    } finally {
      setIsLoadingConfig(false);
    }
  }, [toast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSaveConfig = async (updatedAds: HomepageAd[]) => {
    setIsSaving(true);
    try {
      const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
      const newConfig: Partial<FeaturesConfiguration> = {
        ...featuresConfig, // Preserve other feature settings
        ads: updatedAds,
        updatedAt: Timestamp.now(),
      };
      await setDoc(configDocRef, newConfig, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      setFeaturesConfig(prev => ({ ...prev, ads: updatedAds })); // Update local state
      toast({ title: "Success", description: "Ad configuration saved." });
      return true;
    } catch (error) {
      console.error("Error saving ad configuration:", error);
      toast({ title: "Error", description: "Could not save ad configuration.", variant: "destructive" });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddAd = () => {
    setEditingAd(null);
    setIsFormOpen(true);
  };

  const handleEditAd = (ad: HomepageAd) => {
    setEditingAd(ad);
    setIsFormOpen(true);
  };

  const handleDeleteAd = async (adId: string) => {
    const currentAds = featuresConfig.ads || [];
    const updatedAds = currentAds.filter(ad => ad.id !== adId);
    // Here, we should also delete the image from storage if it's a Firebase Storage URL
    const adToDelete = currentAds.find(ad => ad.id === adId);
    if (adToDelete?.imageUrl && adToDelete.imageUrl.includes("firebasestorage.googleapis.com")) {
      // Add image deletion logic from Firebase Storage (similar to CategoryForm)
      // For brevity, skipping in this example, but it's important.
    }
    await handleSaveConfig(updatedAds);
  };

  const handleToggleAdActive = async (adId: string, currentIsActive: boolean) => {
    const currentAds = featuresConfig.ads || [];
    const updatedAds = currentAds.map(ad =>
      ad.id === adId ? { ...ad, isActive: !currentIsActive, updatedAt: Timestamp.now() } : ad
    );
    await handleSaveConfig(updatedAds);
  };

  const handleFormSubmit = async (formData: AdFormData, adId?: string) => {
    const currentAds = [...(featuresConfig.ads || [])];
    const newAdData: HomepageAd = {
      id: adId || nanoid(),
      name: formData.name,
      imageUrl: formData.imageUrl || "", // Assuming imageUrl from form is final (uploaded or manual URL)
      imageHint: formData.imageHint,
      actionType: formData.actionType as AdActionType,
      targetValue: formData.targetValue,
      placement: formData.placement as AdPlacement,
      order: formData.order,
      isActive: formData.isActive,
      createdAt: adId ? (currentAds.find(ad => ad.id === adId)?.createdAt || Timestamp.now()) : Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    if (adId) { // Editing
      const adIndex = currentAds.findIndex(ad => ad.id === adId);
      if (adIndex > -1) currentAds[adIndex] = newAdData;
    } else { // Adding new
      currentAds.push(newAdData);
    }
    
    const success = await handleSaveConfig(currentAds);
    if (success) {
      setIsFormOpen(false);
      setEditingAd(null);
    }
  };

  if (isLoadingConfig || isLoadingPrerequisites) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center"><ImageIconLucide className="mr-2 h-5 w-5"/>Ad Banners Management</CardTitle><CardDescription>Manage promotional ad banners for your homepage.</CardDescription></CardHeader>
        <CardContent className="space-y-4 p-3"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></CardContent>
      </Card>
    );
  }

  const currentAdsList = featuresConfig.ads || [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center"><ImageIconLucide className="mr-2 h-5 w-5"/>Ad Banners Management</CardTitle>
          <CardDescription>Manage promotional ad banners for your homepage.</CardDescription>
        </div>
        <Button onClick={handleAddAd} disabled={isSaving}>
          <PlusCircle className="mr-2 h-4 w-4" /> Add New Ad
        </Button>
      </CardHeader>
      <CardContent>
        {currentAdsList.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No ad banners configured yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Placement</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-center">Order</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentAdsList.map((ad) => (
                <TableRow key={ad.id}>
                  <TableCell>
                    <div className="w-16 h-10 relative rounded-md overflow-hidden bg-muted">
                      {ad.imageUrl ? (
                        <AppImage src={ad.imageUrl} alt={ad.name} fill sizes="64px" className="object-contain" aiHint={ad.imageHint || "ad banner"}/>
                      ) : (<ImageIconLucide className="h-6 w-6 text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />)}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{ad.name}</TableCell>
                  <TableCell><Badge variant="outline">{ad.placement.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}</Badge></TableCell>
                  <TableCell className="text-xs max-w-[150px] truncate" title={`${ad.actionType}: ${ad.targetValue}`}>
                    <span className="font-semibold capitalize">{ad.actionType}:</span> {ad.targetValue}
                  </TableCell>
                  <TableCell className="text-center">{ad.order}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={ad.isActive} onCheckedChange={() => handleToggleAdActive(ad.id, ad.isActive)} disabled={isSaving} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="icon" onClick={() => handleEditAd(ad)} disabled={isSaving}><Edit className="h-4 w-4"/></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSaving}><Trash2 className="h-4 w-4"/></Button></AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Confirm Deletion</AlertDialogTitle><AlertDialogDescription>Delete ad "{ad.name}"?</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteAd(ad.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
       {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSaving) { setIsFormOpen(open); if (!open) setEditingAd(null); } }}>
        <DialogContent className="w-[90vw] max-w-lg md:max-w-2xl lg:max-w-3xl max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-3 pb-4 border-b">
            <DialogTitle>{editingAd ? 'Edit Ad Banner' : 'Add New Ad Banner'}</DialogTitle>
          </DialogHeader>
          <AdForm
            key={editingAd ? editingAd.id : 'new-ad'}
            initialData={editingAd}
            onSubmit={handleFormSubmit}
            onCancel={() => { setIsFormOpen(false); setEditingAd(null); }}
            allCategories={allCategories}
            allServices={allServices}
            isSubmitting={isSaving}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}
