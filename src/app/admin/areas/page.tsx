
"use client";

import { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, MapPin, CheckCircle, XCircle, PackageSearch, RefreshCw, Map } from "lucide-react";
import type { FirestoreArea, FirestoreCity } from '@/types/firestore';
import AreaForm from '@/components/admin/AreaForm';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, getDoc, orderBy, query, Timestamp, where, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { submitToGoogleIndexing } from '@/lib/googleIndexing';
import { executeDbClearTable } from '@/app/actions/dbActions';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import { calculateNearbyAreas, recalculateAllNearbyAreasInCity } from '@/lib/locationUtils';
import { generateFreeAreaSeoData, getNearbyAreasSorted } from "@/lib/seoGenerator";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Zap } from "lucide-react";

const generateSlug = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

export default function AdminAreasPage() {
  const { adminPermissions } = useAuth();
  const [areas, setAreas] = useState<FirestoreArea[]>([]);
  const [cities, setCities] = useState<FirestoreCity[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<FirestoreArea | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();

  const [isBatchDialogOpen, setIsBatchDialogOpen] = useState(false);
  const [batchCityId, setBatchCityId] = useState("");
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCurrentName, setBatchCurrentName] = useState("");

  // Batch SEO States
  const [isBatchSeoOpen, setIsBatchSeoOpen] = useState(false);
  const [batchSeoCityId, setBatchSeoCityId] = useState<string>("all");
  const [batchSeoOverwrite, setBatchSeoOverwrite] = useState(false);
  const [batchSeoRunning, setBatchSeoRunning] = useState(false);
  const [batchSeoProgress, setBatchSeoProgress] = useState(0);
  const [batchSeoStatus, setBatchSeoStatus] = useState("");

  // Map Generation States
  const [isMapGenerateOpen, setIsMapGenerateOpen] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>({ lat: 12.9716, lon: 77.5946 }); // Default Bangalore
  const [mapRadius, setMapRadius] = useState<number>(5); // Default 5 km
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [fetchedPlaces, setFetchedPlaces] = useState<any[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<Record<string, boolean>>({});
  const [isFetchingPlaces, setIsFetchingPlaces] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [mapCityId, setMapCityId] = useState("");

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  // Delete All States
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [displayLimit, setDisplayLimit] = useState(500);
  const [onlyMajorAreas, setOnlyMajorAreas] = useState(true);

  // Load Leaflet dynamically on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).L) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => {
        setLeafletLoaded(true);
      };
      document.body.appendChild(script);
    } else if ((window as any).L) {
      setLeafletLoaded(true);
    }
  }, []);

  // Initialize and handle Leaflet map instance
  useEffect(() => {
    if (!isMapGenerateOpen || !leafletLoaded) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      const mapContainer = document.getElementById('osm-map-container');
      if (!mapContainer || mapRef.current) return;

      const L = (window as any).L;
      if (!L) return;

      const mapInstance = L.map('osm-map-container').setView([mapCenter.lat, mapCenter.lon], 12);
      mapRef.current = mapInstance;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(mapInstance);

      const markerInstance = L.marker([mapCenter.lat, mapCenter.lon], { draggable: true }).addTo(mapInstance);
      markerRef.current = markerInstance;

      const circleInstance = L.circle([mapCenter.lat, mapCenter.lon], {
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.15,
        radius: mapRadius * 1000
      }).addTo(mapInstance);
      circleRef.current = circleInstance;

      markerInstance.on('dragend', () => {
        const position = markerInstance.getLatLng();
        setMapCenter({ lat: position.lat, lon: position.lng });
        circleInstance.setLatLng(position);
      });

      mapInstance.on('click', (e: any) => {
        const position = e.latlng;
        markerInstance.setLatLng(position);
        circleInstance.setLatLng(position);
        setMapCenter({ lat: position.lat, lon: position.lng });
      });

    }, 200);

    return () => clearTimeout(timer);
  }, [isMapGenerateOpen, leafletLoaded]);

  // Update circle radius when radius changes
  useEffect(() => {
    if (circleRef.current) {
      circleRef.current.setRadius(mapRadius * 1000);
      if (mapRef.current && markerRef.current) {
        const L = (window as any).L;
        if (L) {
          mapRef.current.fitBounds(circleRef.current.getBounds());
        }
      }
    }
  }, [mapRadius]);

  const handleMapSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`, {
        headers: {
          'User-Agent': 'Yourbrand-Admin-App/1.0'
        }
      });
      const data = await response.json();
      if (data && data.length > 0) {
        const first = data[0];
        const lat = parseFloat(first.lat);
        const lon = parseFloat(first.lon);
        
        setMapCenter({ lat, lon });

        if (mapRef.current && markerRef.current && circleRef.current) {
          const L = (window as any).L;
          mapRef.current.setView([lat, lon], 13);
          markerRef.current.setLatLng([lat, lon]);
          circleRef.current.setLatLng([lat, lon]);
          circleRef.current.setRadius(mapRadius * 1000);
          mapRef.current.fitBounds(circleRef.current.getBounds());
        }
      } else {
        toast({ title: "No Results", description: "Could not find that location.", variant: "warning" });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast({ title: "Error", description: "Search failed. Please try again.", variant: "destructive" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleFetchNearby = async () => {
    if (!mapCityId) {
      toast({ title: "Select City", description: "Please select a target city first.", variant: "warning" });
      return;
    }
    setIsFetchingPlaces(true);
    setFetchedPlaces([]);
    setSelectedPlaces({});

    try {
      const radiusInMeters = mapRadius * 1000;
      const { lat, lon } = mapCenter;
      const placeTypes = onlyMajorAreas ? "suburb|quarter|village" : "suburb|neighbourhood|quarter|village";

      const overpassQuery = `
        [out:json][timeout:25];
        (
          node["place"~"${placeTypes}"](around:${radiusInMeters},${lat},${lon});
          way["place"~"${placeTypes}"](around:${radiusInMeters},${lat},${lon});
        );
        out center;
      `;

      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/overpass', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: overpassQuery })
      });
      const data = await response.json();

      if (data && data.elements) {
        const places: any[] = [];
        const seenNames = new Set<string>();

        data.elements.forEach((el: any) => {
          const name = el.tags?.name;
          if (!name) return;

          const placeLat = el.lat || el.center?.lat;
          const placeLon = el.lon || el.center?.lon;
          if (!placeLat || !placeLon) return;

          const key = name.toLowerCase().trim();
          if (seenNames.has(key)) return;
          seenNames.add(key);

          const alreadyExists = areas.some(a => a.name.toLowerCase().trim() === key && a.cityId === mapCityId);

          places.push({
            name,
            latitude: placeLat,
            longitude: placeLon,
            alreadyExists
          });
        });

        places.sort((a, b) => a.name.localeCompare(b.name));
        setFetchedPlaces(places);
        
        const initialSelected: Record<string, boolean> = {};
        places.forEach(p => {
          if (!p.alreadyExists) {
            initialSelected[p.name] = true;
          }
        });
        setSelectedPlaces(initialSelected);

        if (places.length === 0) {
          toast({ title: "No Places Found", description: "No suburbs or neighborhoods found in this radius.", variant: "info" });
        } else {
          toast({ title: "Success", description: `Found ${places.length} areas in range.` });
        }
      } else {
        toast({ title: "No Places Found", description: "No results returned from query.", variant: "info" });
      }
    } catch (error) {
      console.error("Overpass error:", error);
      toast({ title: "Error", description: "Failed to fetch nearby areas.", variant: "destructive" });
    } finally {
      setIsFetchingPlaces(false);
    }
  };

  const handleImportPlaces = async () => {
    const toImport = fetchedPlaces.filter(p => selectedPlaces[p.name]);
    if (toImport.length === 0) {
      toast({ title: "No Selection", description: "Please select at least one area to import.", variant: "warning" });
      return;
    }

    const parentCity = cities.find(c => c.id === mapCityId);
    if (!parentCity) {
      toast({ title: "Error", description: "Parent city not found.", variant: "destructive" });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;

    try {
      const catSnap = await getDocs(query(collection(db, "adminCategories"), where("isActive", "==", true)));
      const categoryNames = catSnap.docs.map(doc => doc.data().name as string);

      for (let i = 0; i < toImport.length; i++) {
        const place = toImport[i];
        setImportProgress(Math.round(((i + 1) / toImport.length) * 100));

        try {
          const areaSlug = generateSlug(place.name);
          const fallbackNearby: { id: string; name: string; slug: string }[] = [];
          const seoResult = generateFreeAreaSeoData(parentCity.name, place.name, categoryNames, fallbackNearby);

          const payload = {
            name: place.name,
            slug: areaSlug,
            cityId: mapCityId,
            cityName: parentCity.name,
            isActive: true,
            latitude: Number(place.latitude),
            longitude: Number(place.longitude),
            h1_title: seoResult.h1_title,
            seo_title: seoResult.seo_title,
            seo_description: seoResult.seo_description,
            seo_keywords: seoResult.seo_keywords,
            createdAt: Timestamp.now()
          };

          const docRef = await addDoc(areasCollectionRef, payload);
          const activeId = docRef.id;

          const nearby = await calculateNearbyAreas(activeId, mapCityId, Number(place.latitude), Number(place.longitude));
          await updateDoc(doc(db, "areas", activeId), { nearbyAreas: nearby });

          successCount++;
        } catch (placeErr) {
          console.error(`Failed to import place ${place.name}:`, placeErr);
        }
      }

      await recalculateAllNearbyAreasInCity(mapCityId);

      toast({
        title: "Import Complete!",
        description: `Successfully imported ${successCount} areas into ${parentCity.name}.`
      });

      setIsMapGenerateOpen(false);
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      await fetchCitiesAndAreas();
    } catch (error) {
      console.error("Import error:", error);
      toast({ title: "Import Failed", description: "An error occurred during import.", variant: "destructive" });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleStartBatchSeo = async () => {
    setBatchSeoRunning(true);
    setBatchSeoProgress(0);
    setBatchSeoStatus("Initializing Area SEO batch...");

    try {
      const targetCities = batchSeoCityId === "all" ? cities : cities.filter(c => c.id === batchSeoCityId);
      const cityIds = targetCities.map(c => c.id);
      const targetAreas = areas.filter(a => cityIds.includes(a.cityId));

      const totalIterations = targetAreas.length;
      if (totalIterations === 0) {
        toast({ title: "No targets", description: "No active areas found.", variant: "destructive" });
        setBatchSeoRunning(false);
        return;
      }

      const catSnap = await getDocs(query(collection(db, "adminCategories"), where("isActive", "==", true)));
      const categoryNames = catSnap.docs.map(doc => doc.data().name as string);

      let processedCount = 0;
      let updatedCount = 0;

      for (const area of targetAreas) {
        processedCount++;
        setBatchSeoProgress(Math.round((processedCount / totalIterations) * 100));
        setBatchSeoStatus(`Processing Area SEO: ${area.name} (${processedCount}/${totalIterations})`);

        const hasExisting = area.h1_title || area.seo_title || area.seo_description || area.seo_keywords;
        if (hasExisting && !batchSeoOverwrite) {
          continue;
        }

        const city = cities.find(c => c.id === area.cityId);
        if (!city) continue;

        const fallbackNearby = getNearbyAreasSorted(area, areas.filter(a => a.cityId === area.cityId), 10);

        const result = generateFreeAreaSeoData(city.name, area.name, categoryNames, fallbackNearby);

        const areaDoc = doc(db, "areas", area.id);
        await updateDoc(areaDoc, {
          h1_title: result.h1_title,
          seo_title: result.seo_title,
          seo_description: result.seo_description,
          seo_keywords: result.seo_keywords,
          updatedAt: Timestamp.now()
        });

        updatedCount++;
      }

      toast({
        title: "Area SEO Batch Completed!",
        description: `Successfully updated SEO tags for ${updatedCount} areas.`,
        className: "bg-green-100 border-green-300 text-green-700"
      });

      setIsBatchSeoOpen(false);
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      await fetchCitiesAndAreas();
    } catch (err) {
      console.error("Error batch generating area SEO:", err);
      toast({ title: "Batch Failed", description: (err as Error).message || "An error occurred.", variant: "destructive" });
    } finally {
      setBatchSeoRunning(false);
    }
  };

  const areasCollectionRef = collection(db, "areas");
  const citiesCollectionRef = collection(db, "cities");

  const handleBatchSync = async () => {
    if (!batchCityId) return;
    const parentCity = cities.find(c => c.id === batchCityId);
    if (!parentCity) return;

    const targetAreas = areas.filter(a => a.cityId === batchCityId && (!a.latitude || !a.longitude));
    if (targetAreas.length === 0) {
      toast({
        title: "No areas to sync",
        description: `All areas in ${parentCity.name} already have coordinates saved.`,
      });
      setIsBatchDialogOpen(false);
      return;
    }

    setIsBatchRunning(true);
    setBatchProgress(0);
    setBatchTotal(targetAreas.length);
    setBatchCurrentName("Initializing...");

    let successCount = 0;

    for (let i = 0; i < targetAreas.length; i++) {
      const area = targetAreas[i];
      setBatchCurrentName(`Fetching: ${area.name} (${i + 1}/${targetAreas.length})`);
      setBatchProgress(Math.round(((i + 1) / targetAreas.length) * 100));

      try {
        const q = `${area.name}, ${parentCity.name}, India`;
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();
        
        if (data.lat && data.lon) {
          const latNum = Number(data.lat);
          const lonNum = Number(data.lon);
          
          const areaDoc = doc(db, "areas", area.id);
          const nearby = await calculateNearbyAreas(area.id, batchCityId, latNum, lonNum);
          await updateDoc(areaDoc, { 
            latitude: latNum, 
            longitude: lonNum,
            nearbyAreas: nearby,
            updatedAt: Timestamp.now()
          });
          successCount++;
        }
      } catch (error) {
        console.error(`Error batch geocoding ${area.name}:`, error);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setBatchCurrentName("Recalculating all nearby mappings...");
    await recalculateAllNearbyAreasInCity(batchCityId);

    toast({
      title: "Batch Sync Complete!",
      description: `Successfully updated coordinates and calculated nearby zones for ${successCount} areas.`
    });
    
    setIsBatchRunning(false);
    setIsBatchDialogOpen(false);
    await triggerRefresh('locations');
    await triggerRefresh('sitemap');
    await fetchCitiesAndAreas();
  };

  const fetchCitiesAndAreas = async () => {
    setIsLoading(true);
    try {
      const citiesQuery = query(citiesCollectionRef, orderBy("name", "asc"), limit(100));
      const citiesSnapshot = await getDocs(citiesQuery);
      const fetchedCities = citiesSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreCity));
      setCities(fetchedCities);

      const areasQuery = query(areasCollectionRef, orderBy("name", "asc"), limit(500));
      const areasSnapshot = await getDocs(areasQuery);
      const fetchedAreas = areasSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestoreArea));
      setAreas(fetchedAreas);

    } catch (error) {
      console.error("Error fetching cities or areas: ", error);
      toast({ title: "Error", description: "Could not fetch required data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchCitiesAndAreas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteAll = async () => {
    if (areas.length === 0) {
      toast({ title: "No Areas", description: "There are no areas to delete.", variant: "destructive" });
      setIsDeleteAllOpen(false);
      return;
    }

    setDeleteRunning(true);
    setDeleteProgress(0);
    setDeleteStatus("Initializing deletion...");

    try {
      const total = areas.length;
      setDeleteStatus("Clearing all areas from database...");
      setDeleteProgress(50);

      await executeDbClearTable('areas');

      setDeleteProgress(100);

      toast({
        title: "All Areas Deleted",
        description: `Successfully deleted all ${total} areas.`,
        className: "bg-green-100 border-green-300 text-green-700"
      });

      setIsDeleteAllOpen(false);
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      await fetchCitiesAndAreas();
    } catch (err) {
      console.error("Error deleting all areas:", err);
      toast({ title: "Delete Failed", description: (err as Error).message || "An error occurred.", variant: "destructive" });
    } finally {
      setDeleteRunning(false);
    }
  };

  const handleAddArea = () => {
    setEditingArea(null);
    setIsFormOpen(true);
  };

  const handleEditArea = (area: FirestoreArea) => {
    setEditingArea(area);
    setIsFormOpen(true);
  };

  const handleDeleteArea = async (areaId: string) => {
    setIsSubmitting(true);
    try {
      // Call Google Indexing API before deleting from Firestore so we can resolve its slugs
      await submitToGoogleIndexing('area', areaId, false);
      
      await deleteDoc(doc(db, "areas", areaId));
      setAreas(areas.filter(area => area.id !== areaId));
      toast({ title: "Success", description: "Area deleted successfully." });

      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
    } catch (error) {
      console.error("Error deleting area: ", error);
      toast({ title: "Error", description: "Could not delete area.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Omit<FirestoreArea, 'id' | 'createdAt' | 'updatedAt' | 'cityName'> & { id?: string }) => {
    setIsSubmitting(true);
    const parentCity = cities.find(c => c.id === data.cityId);
    if (!parentCity) {
        toast({ title: "Error", description: "Parent city not found.", variant: "destructive" });
        setIsSubmitting(false);
        return;
    }

    const payload: Omit<FirestoreArea, 'id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      slug: data.slug || "",
      cityId: data.cityId,
      cityName: parentCity.name,
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
      if (editingArea && data.id) {
        const areaDoc = doc(db, "areas", data.id);
        const nearby = (payload.latitude && payload.longitude)
          ? await calculateNearbyAreas(data.id, data.cityId, Number(payload.latitude), Number(payload.longitude))
          : [];
        await updateDoc(areaDoc, { ...payload, nearbyAreas: nearby, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Area updated successfully." });
      } else {
        const docRef = await addDoc(areasCollectionRef, { ...payload, createdAt: Timestamp.now() });
        activeId = docRef.id;
        if (payload.latitude && payload.longitude) {
          const nearby = await calculateNearbyAreas(activeId, data.cityId, Number(payload.latitude), Number(payload.longitude));
          await updateDoc(doc(db, "areas", activeId), { nearbyAreas: nearby });
        }
        toast({ title: "Success", description: "Area added successfully." });
      }
      
      // Refresh the cache
      await triggerRefresh('locations');
      await triggerRefresh('sitemap');
      if (activeId) {
        await submitToGoogleIndexing('area', activeId, payload.isActive);
      }

      setIsFormOpen(false);
      setEditingArea(null);
      await fetchCitiesAndAreas(); // Re-fetch to update list
    } catch (error) {
      console.error("Error saving area: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save area.", variant: "destructive" });
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
            <CardTitle className="text-2xl flex items-center"><MapPin className="mr-2 h-6 w-6 text-primary" />Manage Areas</CardTitle>
            <CardDescription>Add, edit, or delete service areas under cities.</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <PermissionGuard moduleId="areas" action="delete">
              <Button variant="destructive" onClick={() => setIsDeleteAllOpen(true)} disabled={isSubmitting || isLoading || areas.length === 0} className="w-full sm:w-auto">
                <Trash2 className="mr-2 h-4 w-4" /> Delete All
              </Button>
            </PermissionGuard>
            <Button onClick={() => setIsMapGenerateOpen(true)} variant="outline" disabled={isSubmitting || isLoading || cities.length === 0} className="w-full sm:w-auto">
              <Map className="mr-2 h-4 w-4 text-emerald-500" /> Generate via Map (Free)
            </Button>
            <Button onClick={() => setIsBatchSeoOpen(true)} variant="outline" disabled={isSubmitting || isLoading || cities.length === 0} className="w-full sm:w-auto">
              <Zap className="mr-2 h-4 w-4 text-amber-500" /> Batch Generate SEO (Free)
            </Button>
            <Button onClick={() => setIsBatchDialogOpen(true)} variant="outline" disabled={isSubmitting || isLoading || cities.length === 0} className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" /> Batch Sync Coordinates
            </Button>
            <Button onClick={handleAddArea} disabled={isSubmitting || isLoading || cities.length === 0} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Area
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading areas...</p>
            </div>
          ) : cities.length === 0 ? (
             <p className="text-muted-foreground text-center py-6">
                No cities found. Please add cities first to create areas under them.
            </p>
          ) : areas.length === 0 ? (
            <div className="text-center py-10">
              <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No areas found yet. Add one to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Area Name</TableHead>
                  <TableHead>Parent City</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>H1 Title</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {areas.slice(0, displayLimit).map((area) => (
                  <TableRow key={area.id}>
                    <TableCell className="font-medium">{area.name}</TableCell>
                    <TableCell>{area.cityName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{area.slug}</TableCell>
                    <TableCell className="text-xs max-w-xs truncate" title={area.h1_title}>{area.h1_title || "Not set"}</TableCell>
                    <TableCell className="text-center">
                      {area.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                        <PermissionGuard moduleId="areas" action="write">
                          <Button variant="outline" size="icon" onClick={() => handleEditArea(area)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                          </Button>
                        </PermissionGuard>
                        <PermissionGuard moduleId="areas" action="delete">
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
                                  This will permanently delete the area "{area.name}". Services under this area might be affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteArea(area.id)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90">
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
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

          {areas.length > displayLimit && (
            <div className="mt-4 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-muted-foreground border-t pt-4">
              <div>
                Showing first {Math.min(displayLimit, areas.length)} of {areas.length} areas.
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit(prev => prev + 500)}>
                  Load More (+500)
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDisplayLimit(areas.length)}>
                  Load All ({areas.length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingArea(null); } }}>
        <DialogContent className="w-[calc(100%-6px)] sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto p-0">
           <DialogHeader className="p-3 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingArea ? 'Edit Area' : 'Add New Area'}</DialogTitle>
            <DialogDescription>
              {editingArea ? 'Update the details for this area.' : 'Fill in the details to create a new area.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 flex-grow overflow-y-auto">
            {cities.length === 0 && !isLoading ? (
                 <div className="py-8 text-center">
                    <p className="text-destructive">Cannot add areas because no cities exist.</p>
                    <p className="text-muted-foreground text-sm mt-2">Please add at least one city first.</p>
                 </div>
            ) : (
                <AreaForm
                onSubmit={handleFormSubmit}
                initialData={editingArea}
                cities={cities}
                onCancel={() => { setIsFormOpen(false); setEditingArea(null); }}
                isSubmitting={isSubmitting}
                />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBatchDialogOpen} onOpenChange={(open) => { if (!isBatchRunning) { setIsBatchDialogOpen(open); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Batch Auto-Fill Coordinates</DialogTitle>
            <DialogDescription>
              Select a city to automatically fetch coordinates for all areas that are missing them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select City</label>
              <select
                value={batchCityId}
                onChange={(e) => setBatchCityId(e.target.value)}
                disabled={isBatchRunning}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">-- Choose City --</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </div>

            {isBatchRunning && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="font-semibold">{batchCurrentName}</span>
                  <span>{batchProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2.5">
                  <div className="bg-primary h-2.5 rounded-full transition-all duration-300" style={{ width: `${batchProgress}%` }}></div>
                </div>
                <p className="text-[10px] text-muted-foreground italic">
                  Note: A 1-second delay is added between areas to respect OpenStreetMap rate limits.
                </p>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBatchDialogOpen(false)}
              disabled={isBatchRunning}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleBatchSync}
              disabled={isBatchRunning || !batchCityId}
            >
              {isBatchRunning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Start Auto-Fill
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBatchSeoOpen} onOpenChange={(open) => { if (!batchSeoRunning) setIsBatchSeoOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle>Batch Generate Area SEO tags</DialogTitle>
            <DialogDescription>
              Automatically generate H1, Meta Title, Description, and Keywords for all areas under the selected city.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Target City</label>
              <Select value={batchSeoCityId} onValueChange={setBatchSeoCityId} disabled={batchSeoRunning}>
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

      <Dialog open={isMapGenerateOpen} onOpenChange={(open) => { if (!isImporting && !isFetchingPlaces) { setIsMapGenerateOpen(open); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0">
          <DialogHeader className="p-4 pb-2 border-b">
            <DialogTitle className="flex items-center"><Map className="mr-2 h-5 w-5 text-emerald-500" /> Generate Areas via Map</DialogTitle>
            <DialogDescription>
              Search a central point, adjust the radius, and fetch nearby suburbs/neighborhoods from OpenStreetMap to import.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Target City (Parent)</label>
                <select
                  value={mapCityId}
                  onChange={(e) => setMapCityId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">-- Choose Target City --</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>{city.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">Radius (km)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={mapRadius}
                    onChange={(e) => setMapRadius(Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <span className="text-sm font-semibold whitespace-nowrap min-w-[40px] text-right">{mapRadius} km</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 pt-1 pb-2">
              <Checkbox 
                id="only_major_areas" 
                checked={onlyMajorAreas} 
                onCheckedChange={(checked) => setOnlyMajorAreas(!!checked)}
                disabled={isFetchingPlaces || isImporting}
              />
              <label htmlFor="only_major_areas" className="text-xs font-semibold leading-none cursor-pointer">
                Only major areas (Excludes minor layouts, building names, and apartments)
              </label>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Search Location</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. HSR Layout, Bangalore"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleMapSearch(); } }}
                  className="flex h-10 flex-grow rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button onClick={handleMapSearch} disabled={isSearching || !searchQuery}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-muted-foreground">Map (Drag marker or click to change center)</span>
              <div id="osm-map-container" className="h-[300px] w-full rounded-md border z-0" style={{ minHeight: '300px' }} />
            </div>

            <div className="flex justify-center pt-2">
              <Button onClick={handleFetchNearby} disabled={isFetchingPlaces || !mapCityId} className="w-full sm:w-auto px-8">
                {isFetchingPlaces ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Fetch Nearby Areas
              </Button>
            </div>

            {fetchedPlaces.length > 0 && (
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Found {fetchedPlaces.length} Areas:</span>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs"
                      onClick={() => {
                        const newSelected: Record<string, boolean> = {};
                        fetchedPlaces.forEach(p => {
                          if (!p.alreadyExists) newSelected[p.name] = true;
                        });
                        setSelectedPlaces(newSelected);
                      }}
                    >
                      Reset selection
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs"
                      onClick={() => {
                        const allSelected = fetchedPlaces.every(p => selectedPlaces[p.name]);
                        const newSelected: Record<string, boolean> = {};
                        if (!allSelected) {
                          fetchedPlaces.forEach(p => {
                            newSelected[p.name] = true;
                          });
                        }
                        setSelectedPlaces(newSelected);
                      }}
                    >
                      {fetchedPlaces.every(p => selectedPlaces[p.name]) ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                </div>

                <div className="border rounded-md max-h-48 overflow-y-auto p-2 bg-muted/20 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {fetchedPlaces.map((place) => (
                    <div 
                      key={place.name} 
                      className={`flex items-center space-x-2 p-2 rounded-md border bg-background text-sm ${place.alreadyExists ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        id={`place-${place.name}`}
                        checked={!!selectedPlaces[place.name]}
                        onCheckedChange={(checked) => {
                          setSelectedPlaces(prev => ({
                            ...prev,
                            [place.name]: !!checked
                          }));
                        }}
                      />
                      <label 
                        htmlFor={`place-${place.name}`} 
                        className="flex-grow cursor-pointer font-medium leading-none select-none truncate"
                      >
                        {place.name}
                        {place.alreadyExists && (
                          <span className="ml-1 text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
                            Exists
                          </span>
                        )}
                      </label>
                    </div>
                  ))}
                </div>

                {isImporting && (
                  <div className="space-y-2 pt-2">
                    <Progress value={importProgress} className="w-full" />
                    <p className="text-xs text-muted-foreground animate-pulse text-center">Importing areas... {importProgress}%</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-background z-10">
            <Button variant="outline" onClick={() => setIsMapGenerateOpen(false)} disabled={isImporting || isFetchingPlaces}>
              Close
            </Button>
            {fetchedPlaces.length > 0 && (
              <Button onClick={handleImportPlaces} disabled={isImporting || isFetchingPlaces || Object.values(selectedPlaces).filter(Boolean).length === 0}>
                {isImporting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {Object.values(selectedPlaces).filter(Boolean).length} Areas
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteAllOpen} onOpenChange={(open) => { if (!deleteRunning) setIsDeleteAllOpen(open); }}>
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center text-destructive">
              <Trash2 className="h-6 w-6 mr-2" /> Danger: Delete All Areas?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all areas/neighborhoods in the database. This action is irreversible.
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
