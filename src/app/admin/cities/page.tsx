
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, MapPin, CheckCircle, XCircle, PackageSearch, Globe } from "lucide-react"; // Added PackageSearch, Globe
import type { FirestoreCity } from '@/types/firestore';
import CityForm from '@/components/admin/CityForm';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, where, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { executeDbClearTable } from '@/app/actions/dbActions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { calculateNearbyCities } from '@/lib/locationUtils';
import { generateFreeCitySeoData } from "@/lib/seoGenerator";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Zap } from "lucide-react";

const generateSlug = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

export default function AdminCitiesPage() {
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<FirestoreCity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const citiesCollectionRef = collection(db, "cities");

  // Batch SEO States
  const [isBatchSeoOpen, setIsBatchSeoOpen] = useState(false);
  const [batchSeoOverwrite, setBatchSeoOverwrite] = useState(false);
  const [batchSeoRunning, setBatchSeoRunning] = useState(false);
  const [batchSeoProgress, setBatchSeoProgress] = useState(0);
  const [batchSeoStatus, setBatchSeoStatus] = useState("");

  // Country/State Import States
  const [isCountryImportOpen, setIsCountryImportOpen] = useState(false);
  const [importType, setImportType] = useState<'country' | 'state'>('country');
  const [countryInput, setCountryInput] = useState("");
  const [stateInput, setStateInput] = useState("");
  const [onlyMajorCities, setOnlyMajorCities] = useState(true);
  const [isSearchingCountry, setIsSearchingCountry] = useState(false);
  const [fetchedCities, setFetchedCities] = useState<any[]>([]);
  const [selectedCities, setSelectedCities] = useState<Record<string, boolean>>({});
  const [isImportingCities, setIsImportingCities] = useState(false);
  const [importCitiesProgress, setImportCitiesProgress] = useState(0);

  // Delete All States
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [displayLimit, setDisplayLimit] = useState(500);

  const handleCountrySearch = async () => {
    if (!countryInput) return;
    setIsSearchingCountry(true);
    setFetchedCities([]);
    setSelectedCities({});

    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(countryInput)}&featuretype=country&limit=1`;
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'Yourbrand-Admin-App/1.0'
        }
      });
      const data = await response.json();

      if (data && data.length > 0) {
        const osmId = data[0].osm_id;
        const osmType = data[0].osm_type;

        if (osmType !== 'relation') {
          await fetchCitiesByCountryNameDirectly(data[0].display_name || countryInput);
          return;
        }

        const areaId = 3600000000 + osmId;
        const placeFilter = onlyMajorCities ? 'node["place"="city"]' : 'node["place"~"city|town"]';

        const overpassQuery = `
          [out:json][timeout:30];
          area(${areaId})->.searchArea;
          (
            ${placeFilter}(area.searchArea);
          );
          out body;
        `;

        const token = await auth.currentUser?.getIdToken();
        const overpassResponse = await fetch('/api/admin/overpass', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ query: overpassQuery })
        });
        const overpassData = await overpassResponse.json();

        if (overpassData && overpassData.elements) {
          processFetchedCities(overpassData.elements);
        } else {
          toast({ title: "No Cities Found", description: "No cities returned from OSM query.", variant: "info" });
        }
      } else {
        toast({ title: "Country Not Found", description: "Could not find that country.", variant: "warning" });
      }
    } catch (error) {
      console.error("Country search error:", error);
      await fetchCitiesByCountryNameDirectly(countryInput);
    } finally {
      setIsSearchingCountry(false);
    }
  };

  const fetchCitiesByCountryNameDirectly = async (name: string) => {
    try {
      const placeFilter = onlyMajorCities ? 'node["place"="city"]' : 'node["place"~"city|town"]';
      const overpassQuery = `
        [out:json][timeout:30];
        area["name"~"${name}",i]["boundary"="administrative"]["admin_level"="2"]->.searchArea;
        (
          ${placeFilter}(area.searchArea);
        );
        out body;
      `;

      const tokenDirect = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/overpass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenDirect}`
        },
        body: JSON.stringify({ query: overpassQuery })
      });
      const data = await response.json();

      if (data && data.elements) {
        processFetchedCities(data.elements);
      } else {
        toast({ title: "No Cities Found", description: "No cities found for this country.", variant: "info" });
      }
    } catch (err) {
      console.error("Direct Overpass query error:", err);
      toast({ title: "Error", description: "Failed to search cities. Please check connection.", variant: "destructive" });
    }
  };

  const handleStateSearch = async () => {
    if (!stateInput) return;
    setIsSearchingCountry(true);
    setFetchedCities([]);
    setSelectedCities({});

    try {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(stateInput)}&limit=1`;
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'Yourbrand-Admin-App/1.0'
        }
      });
      const data = await response.json();

      if (data && data.length > 0) {
        const osmId = data[0].osm_id;
        const osmType = data[0].osm_type;

        if (osmType !== 'relation') {
          await fetchCitiesByStateNameDirectly(data[0].display_name || stateInput);
          return;
        }

        const areaId = 3600000000 + osmId;
        const placeFilter = onlyMajorCities ? 'node["place"="city"]' : 'node["place"~"city|town"]';

        const overpassQuery = `
          [out:json][timeout:30];
          area(${areaId})->.searchArea;
          (
            ${placeFilter}(area.searchArea);
          );
          out body;
        `;

        const token = await auth.currentUser?.getIdToken();
        const overpassResponse = await fetch('/api/admin/overpass', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ query: overpassQuery })
        });
        const overpassData = await overpassResponse.json();

        if (overpassData && overpassData.elements) {
          processFetchedCities(overpassData.elements);
        } else {
          toast({ title: "No Cities Found", description: "No cities or towns returned from OSM query.", variant: "info" });
        }
      } else {
        toast({ title: "State Not Found", description: "Could not find that state/province.", variant: "warning" });
      }
    } catch (error) {
      console.error("State search error:", error);
      await fetchCitiesByStateNameDirectly(stateInput);
    } finally {
      setIsSearchingCountry(false);
    }
  };

  const fetchCitiesByStateNameDirectly = async (name: string) => {
    try {
      const placeFilter = onlyMajorCities ? 'node["place"="city"]' : 'node["place"~"city|town"]';
      const overpassQuery = `
        [out:json][timeout:30];
        area["name"~"${name}",i]["boundary"="administrative"]["admin_level"="4"]->.searchArea;
        (
          ${placeFilter}(area.searchArea);
        );
        out body;
      `;

      const tokenDirect = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/overpass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenDirect}`
        },
        body: JSON.stringify({ query: overpassQuery })
      });
      const data = await response.json();

      if (data && data.elements) {
        processFetchedCities(data.elements);
      } else {
        toast({ title: "No Cities Found", description: "No cities or towns found for this state.", variant: "info" });
      }
    } catch (err) {
      console.error("Direct state Overpass query error:", err);
      toast({ title: "Error", description: "Failed to search cities. Please check connection.", variant: "destructive" });
    }
  };

  const handleSearch = () => {
    if (importType === 'country') {
      handleCountrySearch();
    } else {
      handleStateSearch();
    }
  };

  const processFetchedCities = (elements: any[]) => {
    const list: any[] = [];
    const seenNames = new Set<string>();

    elements.forEach((el: any) => {
      const name = el.tags?.name;
      if (!name) return;

      const lat = el.lat;
      const lon = el.lon;
      if (!lat || !lon) return;

      const key = name.toLowerCase().trim();
      if (seenNames.has(key)) return;
      seenNames.add(key);

      const alreadyExists = cities.some(c => c.name.toLowerCase().trim() === key);

      list.push({
        name,
        latitude: lat,
        longitude: lon,
        alreadyExists
      });
    });

    list.sort((a, b) => a.name.localeCompare(b.name));
    setFetchedCities(list);

    const initialSelected: Record<string, boolean> = {};
    list.forEach(item => {
      if (!item.alreadyExists) {
        initialSelected[item.name] = true;
      }
    });
    setSelectedCities(initialSelected);

    if (list.length === 0) {
      toast({ title: "No Cities Found", description: "No cities found for this search.", variant: "info" });
    } else {
      toast({ title: "Success", description: `Found ${list.length} cities.` });
    }
  };

  const handleImportCities = async () => {
    const toImport = fetchedCities.filter(c => selectedCities[c.name]);
    if (toImport.length === 0) {
      toast({ title: "No Selection", description: "Please select at least one city to import.", variant: "warning" });
      return;
    }

    setIsImportingCities(true);
    setImportCitiesProgress(0);

    let successCount = 0;

    try {
      const catSnap = await getDocs(query(collection(db, "adminCategories"), where("isActive", "==", true)));
      const categoryNames = catSnap.docs.map(doc => doc.data().name as string);

      for (let i = 0; i < toImport.length; i++) {
        const cityItem = toImport[i];
        setImportCitiesProgress(Math.round(((i + 1) / toImport.length) * 100));

        try {
          const citySlug = generateSlug(cityItem.name);
          const seoResult = generateFreeCitySeoData(cityItem.name, categoryNames, []);

          const payload = {
            name: cityItem.name,
            slug: citySlug,
            isActive: true,
            latitude: Number(cityItem.latitude),
            longitude: Number(cityItem.longitude),
            h1_title: seoResult.h1_title,
            seo_title: seoResult.seo_title,
            seo_description: seoResult.seo_description,
            seo_keywords: seoResult.seo_keywords,
            createdAt: Timestamp.now()
          };

          const docRef = await addDoc(citiesCollectionRef, payload);
          const activeId = docRef.id;

          const nearby = await calculateNearbyCities(activeId, Number(cityItem.latitude), Number(cityItem.longitude));
          await updateDoc(doc(db, "cities", activeId), { nearbyCities: nearby });

          if (citySlug) {
            await submitToGoogleIndexing('city', citySlug, true);
          }

          successCount++;
        } catch (cityErr) {
          console.error(`Failed to import city ${cityItem.name}:`, cityErr);
        }
      }

      toast({
        title: "Import Complete!",
        description: `Successfully imported ${successCount} cities.`
      });

      setIsCountryImportOpen(false);
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      await fetchCities();
    } catch (error) {
      console.error("Import cities error:", error);
      toast({ title: "Import Failed", description: "An error occurred during import.", variant: "destructive" });
    } finally {
      setIsImportingCities(false);
      setImportCitiesProgress(0);
    }
  };

  const handleStartBatchSeo = async () => {
    setBatchSeoRunning(true);
    setBatchSeoProgress(0);
    setBatchSeoStatus("Initializing City SEO batch...");

    try {
      const targetCities = cities.filter(c => c.isActive !== false);

      const totalIterations = targetCities.length;
      if (totalIterations === 0) {
        toast({ title: "No targets", description: "No active cities found.", variant: "destructive" });
        setBatchSeoRunning(false);
        return;
      }

      const catSnap = await getDocs(query(collection(db, "adminCategories"), where("isActive", "==", true)));
      const categoryNames = catSnap.docs.map(doc => doc.data().name as string);

      const areasSnap = await getDocs(query(collection(db, "areas"), where("isActive", "==", true)));
      const allActiveAreas = areasSnap.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        slug: doc.data().slug,
        cityId: doc.data().cityId
      }));

      let processedCount = 0;
      let updatedCount = 0;

      for (const city of targetCities) {
        processedCount++;
        setBatchSeoProgress(Math.round((processedCount / totalIterations) * 100));
        setBatchSeoStatus(`Processing City SEO: ${city.name} (${processedCount}/${totalIterations})`);

        const hasExisting = city.h1_title || city.seo_title || city.seo_description || city.seo_keywords;
        if (hasExisting && !batchSeoOverwrite) {
          continue;
        }

        const cityAreas = allActiveAreas.filter(a => a.cityId === city.id);

        const result = generateFreeCitySeoData(city.name, categoryNames, cityAreas);

        const cityDoc = doc(db, "cities", city.id!);
        await updateDoc(cityDoc, {
          h1_title: result.h1_title,
          seo_title: result.seo_title,
          seo_description: result.seo_description,
          seo_keywords: result.seo_keywords,
          updatedAt: Timestamp.now()
        });

        updatedCount++;
      }

      toast({
        title: "City SEO Batch Completed!",
        description: `Successfully updated SEO tags for ${updatedCount} cities.`,
        className: "bg-green-100 border-green-300 text-green-700"
      });

      setIsBatchSeoOpen(false);
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      await fetchCities();
    } catch (err) {
      console.error("Error batch generating city SEO:", err);
      toast({ title: "Batch Failed", description: (err as Error).message || "An error occurred.", variant: "destructive" });
    } finally {
      setBatchSeoRunning(false);
    }
  };

  const fetchCities = async () => {
    setIsLoading(true);
    try {
      const q = query(citiesCollectionRef, orderBy("name", "asc"), limit(100));
      const data = await getDocs(q);
      const fetchedCities = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCity));
      setCities(fetchedCities);
    } catch (error) {
      console.error("Error fetching cities: ", error);
      toast({
        title: "Error",
        description: "Could not fetch cities.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchCities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteAll = async () => {
    if (cities.length === 0) {
      toast({ title: "No Cities", description: "There are no cities to delete.", variant: "destructive" });
      setIsDeleteAllOpen(false);
      return;
    }

    setDeleteRunning(true);
    setDeleteProgress(0);
    setDeleteStatus("Initializing deletion...");

    try {
      const total = cities.length;
      setDeleteStatus("Clearing all cities from database...");
      setDeleteProgress(50);

      await executeDbClearTable('cities');

      setDeleteProgress(100);

      toast({
        title: "All Cities Deleted",
        description: `Successfully deleted all ${total} cities.`,
        className: "bg-green-100 border-green-300 text-green-700"
      });

      setIsDeleteAllOpen(false);
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      await fetchCities();
    } catch (err) {
      console.error("Error deleting all cities:", err);
      toast({ title: "Delete Failed", description: (err as Error).message || "An error occurred.", variant: "destructive" });
    } finally {
      setDeleteRunning(false);
    }
  };

  const handleAddCity = () => {
    setEditingCity(null);
    setIsFormOpen(true);
  };

  const handleEditCity = (city: FirestoreCity) => {
    setEditingCity(city);
    setIsFormOpen(true);
  };

  const handleDeleteCity = async (cityId: string) => {
    setIsSubmitting(true);
    try {
      const city = cities.find(c => c.id === cityId);
      await deleteDoc(doc(db, "cities", cityId));
      setCities(cities.filter(city => city.id !== cityId));
      toast({ title: "Success", description: "City deleted successfully." });
      
      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      if (city?.slug) {
        await submitToGoogleIndexing('city', city.slug, false);
      }
    } catch (error) {
      console.error("Error deleting city: ", error);
      toast({ title: "Error", description: "Could not delete city. It might have areas associated with it.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreCity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    setIsSubmitting(true);
    
    const payload: Omit<FirestoreCity, 'id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      slug: data.slug || "",
      isActive: data.isActive === undefined ? true : data.isActive,
      seo_title: data.seo_title,
      seo_description: data.seo_description,
      seo_keywords: data.seo_keywords,
      h1_title: data.h1_title,
      latitude: data.latitude ? Number(data.latitude) : undefined,
      longitude: data.longitude ? Number(data.longitude) : undefined,
    };

    try {
      let activeId = data.id || "";
      if (editingCity && data.id) { 
        const cityDoc = doc(db, "cities", data.id);
        const nearby = (payload.latitude && payload.longitude)
          ? await calculateNearbyCities(data.id, Number(payload.latitude), Number(payload.longitude))
          : [];
        await updateDoc(cityDoc, { ...payload, nearbyCities: nearby, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "City updated successfully." });
      } else { 
        const docRef = await addDoc(citiesCollectionRef, { ...payload, createdAt: Timestamp.now() });
        activeId = docRef.id;
        if (payload.latitude && payload.longitude) {
          const nearby = await calculateNearbyCities(activeId, Number(payload.latitude), Number(payload.longitude));
          await updateDoc(doc(db, "cities", activeId), { nearbyCities: nearby });
        }
        toast({ title: "Success", description: "City added successfully." });
      }
      
      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      if (payload.slug) {
        await submitToGoogleIndexing('city', payload.slug, payload.isActive);
      }

      setIsFormOpen(false);
      setEditingCity(null);
      await fetchCities(); 
    } catch (error) {
      console.error("Error saving city: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save city.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
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
            <CardTitle className="text-2xl flex items-center"><MapPin className="mr-2 h-6 w-6 text-primary" />Manage Cities</CardTitle>
            <CardDescription>Add, edit, or delete cities. These will create pages like /city-slug.</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <PermissionGuard moduleId="cities" action="delete">
              <Button variant="destructive" onClick={() => setIsDeleteAllOpen(true)} disabled={isSubmitting || isLoading || cities.length === 0} className="w-full sm:w-auto">
                <Trash2 className="mr-2 h-4 w-4" /> Delete All
              </Button>
            </PermissionGuard>
            <PermissionGuard moduleId="cities" action="create">
              <Button onClick={() => setIsCountryImportOpen(true)} variant="outline" disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
                <Globe className="mr-2 h-4 w-4 text-emerald-500" /> Import from Country (Free)
              </Button>
              <Button variant="outline" onClick={() => setIsBatchSeoOpen(true)} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
                <Zap className="mr-2 h-4 w-4 text-amber-500" /> Batch Generate SEO (Free)
              </Button>
              <Button onClick={handleAddCity} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" /> Add New City
              </Button>
            </PermissionGuard>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading cities...</p>
            </div>
          ) : cities.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No cities found yet. Add one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>City Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>H1 Title</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cities.slice(0, displayLimit).map((city) => (
                  <TableRow key={city.id}>
                    <TableCell className="font-medium">{city.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{city.slug}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={city.h1_title}>{city.h1_title || "Not set"}</TableCell>
                    <TableCell className="text-center">
                      {city.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                        <Button variant="outline" size="icon" onClick={() => handleEditCity(city)} disabled={isSubmitting}>
                          <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" disabled={isSubmitting}>
                              <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the city "{city.name}". Areas under this city might be affected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteCity(city.id)}
                                disabled={isSubmitting}
                                className="bg-destructive hover:bg-destructive/90">
                                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {cities.length > displayLimit && (
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground border-t pt-4">
              <div>
                Showing first {Math.min(displayLimit, cities.length)} of {cities.length} cities.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit(prev => prev + 500)}>
                  Load More (+500)
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit(cities.length)}>
                  Load All ({cities.length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingCity(null); } }}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-3 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingCity ? 'Edit City' : 'Add New City'}</DialogTitle>
            <DialogDescription>
              {editingCity ? 'Update the details for this city.' : 'Fill in the details to create a new city.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 flex-grow overflow-y-auto">
            <CityForm
              onSubmit={handleFormSubmit}
              initialData={editingCity}
              onCancel={() => { setIsFormOpen(false); setEditingCity(null); }}
              isSubmitting={isSubmitting}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBatchSeoOpen} onOpenChange={(open) => { if (!batchSeoRunning) setIsBatchSeoOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Batch Generate City SEO tags</DialogTitle>
            <DialogDescription>
              Automatically generate H1, Meta Title, Description, and Keywords for all active cities.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-500 leading-relaxed">
              This will calculate coordinates, category mappings, and locations to produce unique SEO copy for all active cities in your system.
            </p>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="overwrite_seo" 
                checked={batchSeoOverwrite} 
                onCheckedChange={(checked) => setBatchSeoOverwrite(!!checked)}
                disabled={batchSeoRunning}
              />
              <label htmlFor="overwrite_seo" className="text-sm font-medium leading-none cursor-pointer">
                Overwrite existing custom SEO tags
              </label>
            </div>

            {batchSeoRunning && (
              <div className="space-y-2 pt-4">
                <Progress value={batchSeoProgress} className="w-full" />
                <p className="text-xs text-muted-foreground animate-pulse">{batchSeoStatus}</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsBatchSeoOpen(false)} disabled={batchSeoRunning}>
              Cancel
            </Button>
            <Button onClick={handleStartBatchSeo} disabled={batchSeoRunning}>
              {batchSeoRunning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {batchSeoRunning ? "Generating..." : "Start Batch Generation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCountryImportOpen} onOpenChange={(open) => { if (!isImportingCities && !isSearchingCountry) { setIsCountryImportOpen(open); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center"><Globe className="mr-2 h-5 w-5 text-emerald-500" /> Import Cities from Country / State</DialogTitle>
            <DialogDescription>
              Select search level, type a country or state name, and import major cities with their geographic coordinates.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Search By</label>
              <div className="flex gap-4 pb-2">
                <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="importType"
                    value="country"
                    checked={importType === 'country'}
                    onChange={() => {
                      setImportType('country');
                      setFetchedCities([]);
                      setSelectedCities({});
                    }}
                    className="accent-primary"
                    disabled={isSearchingCountry || isImportingCities}
                  />
                  Country
                </label>
                <label className="flex items-center gap-1.5 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="importType"
                    value="state"
                    checked={importType === 'state'}
                    onChange={() => {
                      setImportType('state');
                      setFetchedCities([]);
                      setSelectedCities({});
                    }}
                    className="accent-primary"
                    disabled={isSearchingCountry || isImportingCities}
                  />
                  State / Province
                </label>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1 pb-2">
              <Checkbox 
                id="only_major_cities" 
                checked={onlyMajorCities} 
                onCheckedChange={(checked) => setOnlyMajorCities(!!checked)}
                disabled={isSearchingCountry || isImportingCities}
              />
              <label htmlFor="only_major_cities" className="text-xs font-semibold leading-none cursor-pointer">
                Only major cities (Excludes smaller towns)
              </label>
            </div>

            {importType === 'country' ? (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Country Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. India, United States, United Kingdom"
                    value={countryInput}
                    onChange={(e) => setCountryInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                    className="flex h-10 flex-grow rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={isSearchingCountry || isImportingCities}
                  />
                  <Button onClick={handleSearch} disabled={isSearchingCountry || !countryInput || isImportingCities}>
                    {isSearchingCountry ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">State / Province Name</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. California, Karnataka, Texas"
                    value={stateInput}
                    onChange={(e) => setStateInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
                    className="flex h-10 flex-grow rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={isSearchingCountry || isImportingCities}
                  />
                  <Button onClick={handleSearch} disabled={isSearchingCountry || !stateInput || isImportingCities}>
                    {isSearchingCountry ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                  </Button>
                </div>
              </div>
            )}

            {fetchedCities.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Found {fetchedCities.length} Cities:</span>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs"
                      onClick={() => {
                        const newSelected: Record<string, boolean> = {};
                        fetchedCities.forEach(c => {
                          if (!c.alreadyExists) newSelected[c.name] = true;
                        });
                        setSelectedCities(newSelected);
                      }}
                    >
                      Reset selection
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs"
                      onClick={() => {
                        const allSelected = fetchedCities.every(c => selectedCities[c.name]);
                        const newSelected: Record<string, boolean> = {};
                        if (!allSelected) {
                          fetchedCities.forEach(c => {
                            newSelected[c.name] = true;
                          });
                        }
                        setSelectedCities(newSelected);
                      }}
                    >
                      {fetchedCities.every(c => selectedCities[c.name]) ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </div>

                <div className="border rounded-md max-h-60 overflow-y-auto p-2 bg-muted/20 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fetchedCities.map((cityItem) => (
                    <div 
                      key={cityItem.name} 
                      className={`flex items-center space-x-2 p-2 rounded-md border bg-background text-sm ${cityItem.alreadyExists ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        id={`city-${cityItem.name}`}
                        checked={!!selectedCities[cityItem.name]}
                        onCheckedChange={(checked) => {
                          setSelectedCities(prev => ({
                            ...prev,
                            [cityItem.name]: !!checked
                          }));
                        }}
                      />
                      <label 
                        htmlFor={`city-${cityItem.name}`} 
                        className="flex-grow cursor-pointer font-medium leading-none select-none truncate"
                      >
                        {cityItem.name}
                        {cityItem.alreadyExists && (
                          <span className="ml-1 text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
                            Exists
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>

                {isImportingCities && (
                  <div className="space-y-2 pt-2">
                    <Progress value={importCitiesProgress} className="w-full" />
                    <p className="text-xs text-muted-foreground animate-pulse text-center">Importing cities... {importCitiesProgress}%</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-background z-10">
            <Button variant="outline" onClick={() => setIsCountryImportOpen(false)} disabled={isImportingCities || isSearchingCountry}>
              Close
            </Button>
            {fetchedCities.length > 0 && (
              <Button onClick={handleImportCities} disabled={isImportingCities || isSearchingCountry || Object.values(selectedCities).filter(Boolean).length === 0}>
                {isImportingCities && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {Object.values(selectedCities).filter(Boolean).length} Cities
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteAllOpen} onOpenChange={(open) => { if (!deleteRunning) setIsDeleteAllOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <Trash2 className="h-6 w-6 mr-2" /> Danger: Delete All Cities?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all cities in the database. This action is irreversible.
            </DialogDescription>
          </DialogHeader>

          {deleteRunning && (
            <div className="space-y-2 py-4">
              <Progress value={deleteProgress} className="w-full" />
              <p className="text-xs text-muted-foreground animate-pulse text-center">{deleteStatus}</p>
            </div>
          )}

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
    </div>
  );
}
