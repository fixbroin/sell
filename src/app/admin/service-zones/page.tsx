"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, Loader2, Globe2, PackageSearch, CheckCircle, XCircle, List, AlertTriangle, Map, ExternalLink } from "lucide-react";
import type { ServiceZone, FirestoreCategory, UserActivity } from '@/types/firestore';
import ServiceZoneForm, { type ServiceZoneFormData } from '@/components/admin/ServiceZoneForm';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, getDocs, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { triggerRefresh } from '@/lib/revalidateUtils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';

const COLLECTION_NAME = "serviceZones";

export default function AdminServiceZonesPage() {
  const { config: appConfig } = useApplicationConfig();
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<ServiceZone | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const [outOfZoneRequests, setOutOfZoneRequests] = useState<UserActivity[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [isDeletingRequest, setIsDeletingRequest] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const q = query(collection(db, "adminCategories"), orderBy("name", "asc"));
      const snapshot = await getDocs(q);
      const catMap: Record<string, string> = {};
      snapshot.forEach(doc => {
        catMap[doc.id] = doc.data().name;
      });
      setCategories(catMap);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, []);

  const fetchZones = useCallback(() => {
    setIsLoading(true);
    const zonesCollectionRef = collection(db, COLLECTION_NAME);
    const q = query(zonesCollectionRef, orderBy("name", "asc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedZones = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as ServiceZone));
      setZones(fetchedZones);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching service zones: ", error);
      toast({ title: "Error", description: "Could not fetch service zones.", variant: "destructive" });
      setIsLoading(false);
    });

    return unsubscribe;
  }, [toast]);

  useEffect(() => {
    fetchCategories();
    const unsubscribe = fetchZones();
    return () => unsubscribe();
  }, [fetchZones, fetchCategories]);

  useEffect(() => {
    setIsLoadingRequests(true);
    const q = query(
      collection(db, "outOfZoneRequests"),
      orderBy("timestamp", "desc"),
      limit(150)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserActivity));
      setOutOfZoneRequests(items);
      setIsLoadingRequests(false);
    }, (error) => {
      console.error("Error loading out-of-coverage requests:", error);
      setIsLoadingRequests(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteRequest = async (id: string) => {
    setIsDeletingRequest(id);
    try {
      await deleteDoc(doc(db, "outOfZoneRequests", id));
      toast({ title: "Success", description: "Request record deleted successfully." });
    } catch (error) {
      console.error("Error deleting request:", error);
      toast({ title: "Error", description: "Could not delete request record.", variant: "destructive" });
    } finally {
      setIsDeletingRequest(null);
    }
  };

  const formatRequestTimestamp = (timestamp?: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return `${formatDateInTimezone(date, appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)} ${formatTimeInTimezone(date, appConfig?.timezone || 'Asia/Kolkata')}`;
  };

  const handleAddZone = () => {
    setEditingZone(null);
    setIsFormOpen(true);
  };

  const handleEditZone = (zone: ServiceZone) => {
    setEditingZone(zone);
    setIsFormOpen(true);
  };

  const handleDeleteZone = async (zoneId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, zoneId));
      toast({ title: "Success", description: "Service zone deleted successfully." });
      // Invalidate caches to reduce void base rates
      await triggerRefresh('service-zones');
    } catch (error) {
      toast({ title: "Error", description: "Could not delete service zone.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: ServiceZoneFormData) => {
    setIsSubmitting(true);
    const payload: Omit<ServiceZone, 'id' | 'createdAt' | 'updatedAt'> = {
      name: data.name,
      center: {
        latitude: data.center.lat,
        longitude: data.center.lng,
      },
      radiusKm: data.radiusKm,
      categoryIds: data.categoryIds,
      isActive: data.isActive,
    };

    try {
      if (editingZone) {
        const zoneDoc = doc(db, COLLECTION_NAME, editingZone.id);
        await updateDoc(zoneDoc, { ...payload, updatedAt: Timestamp.now() });
        toast({ title: "Success", description: "Service zone updated." });
      } else {
        await addDoc(collection(db, COLLECTION_NAME), { ...payload, createdAt: Timestamp.now() });
        toast({ title: "Success", description: "New service zone created." });
      }
      setIsFormOpen(false);
      setEditingZone(null);
      // Invalidate caches to reduce void base rates
      await triggerRefresh('service-zones');
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not save service zone.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Tabs defaultValue="active-zones" className="space-y-6">
      <TabsList className="flex flex-row flex-nowrap overflow-x-auto justify-start w-full max-w-md h-auto p-1 bg-muted rounded-lg scrollbar-none gap-1 sm:grid sm:grid-cols-2 sm:gap-0">
        <TabsTrigger value="active-zones" className="shrink-0 sm:shrink py-2 sm:py-1.5 px-3 sm:px-0 text-xs sm:text-sm font-medium whitespace-nowrap">Active Service Zones</TabsTrigger>
        <TabsTrigger value="out-of-coverage" className="shrink-0 sm:shrink py-2 sm:py-1.5 px-3 sm:px-0 text-xs sm:text-sm font-medium whitespace-nowrap">Out-of-Coverage Requests</TabsTrigger>
      </TabsList>

      <TabsContent value="active-zones" className="space-y-6">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-2xl flex items-center"><Globe2 className="mr-2 h-6 w-6 text-primary" />Manage Service Zones</CardTitle>
              <CardDescription>Define geographic areas where your services are available, now with category-wise filtering.</CardDescription>
            </div>
            <PermissionGuard moduleId="service_zones" action="create">
              <Button onClick={handleAddZone} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Zone
              </Button>
            </PermissionGuard>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading zones...</p>
              </div>
            ) : zones.length === 0 ? (
              <div className="text-center py-10">
                <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No service zones defined yet. Add one to get started.</p>
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Zone Name</TableHead>
                        <TableHead>Categories</TableHead>
                        <TableHead>Center (Lat, Lng)</TableHead>
                        <TableHead className="text-center">Radius (km)</TableHead>
                        <TableHead className="text-center">Active</TableHead>
                        <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {zones.map((zone) => (
                        <TableRow key={zone.id}>
                          <TableCell className="font-medium">{zone.name}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-[300px]">
                              {!zone.categoryIds || zone.categoryIds.length === 0 ? (
                                <Badge variant="outline" className="text-xs bg-muted/50">All Categories</Badge>
                              ) : (
                                zone.categoryIds.map(catId => (
                                  <Badge key={catId} variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {categories[catId] || 'Loading...'}
                                  </Badge>
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{zone.center.latitude.toFixed(4)}, {zone.center.longitude.toFixed(4)}</TableCell>
                          <TableCell className="text-center">{zone.radiusKm}</TableCell>
                          <TableCell className="text-center">
                            {zone.isActive ? <CheckCircle className="h-5 w-5 text-green-500 mx-auto" /> : <XCircle className="h-5 w-5 text-red-500 mx-auto" />}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="icon" onClick={() => handleEditZone(zone)} disabled={isSubmitting}>
                                <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild><Button variant="destructive" size="icon" disabled={isSubmitting}><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete the zone &quot;{zone.name}&quot;.</AlertDialogDescription></AlertDialogHeader>
                                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleDeleteZone(zone.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="block md:hidden space-y-4">
                  {zones.map((zone) => (
                    <Card key={zone.id} className="p-5 space-y-4 border border-border shadow-sm bg-background/50">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-base text-foreground leading-tight">{zone.name}</p>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${zone.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {zone.isActive ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleEditZone(zone)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" className="h-8 w-8" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>This will permanently delete the zone &quot;{zone.name}&quot;.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteZone(zone.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-sm pt-1">
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">Target Categories</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {!zone.categoryIds || zone.categoryIds.length === 0 ? (
                              <Badge variant="outline" className="text-xs bg-muted/50">All Categories</Badge>
                            ) : (
                              zone.categoryIds.map(catId => (
                                <Badge key={catId} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                                  {categories[catId] || 'Loading...'}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">Radius</span>
                            <span className="text-foreground font-semibold">{zone.radiusKm} km</span>
                          </div>
                          <div>
                            <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">Center (Lat, Lng)</span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {zone.center.latitude.toFixed(4)}, {zone.center.longitude.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingZone(null); } }}>
          <DialogContent 
            className="w-full max-w-lg md:max-w-2xl lg:max-w-4xl max-h-[90vh] p-0 flex flex-col"
            onPointerDownOutside={(e) => {
              const target = e.target as HTMLElement;
              if (target?.closest('.pac-container')) {
                e.preventDefault();
              }
            }}
          >
            <DialogHeader className="p-3 pb-4 border-b">
              <DialogTitle>{editingZone ? 'Edit Service Zone' : 'Add New Service Zone'}</DialogTitle>
              <DialogDescription>Use the map to select the center and define the radius of the service area.</DialogDescription>
            </DialogHeader>
            <div className="flex-grow overflow-y-auto">
              <ServiceZoneForm
                onSubmit={handleFormSubmit}
                initialData={editingZone}
                onCancel={() => { setIsFormOpen(false); setEditingZone(null); }}
                isSubmitting={isSubmitting}
              />
            </div>
          </DialogContent>
        </Dialog>
      </TabsContent>

      <TabsContent value="out-of-coverage">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-amber-500" />Out-of-Coverage Requests</CardTitle>
            <CardDescription>Locations outside active service zones where users tried to request bookings.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoadingRequests ? (
              <div className="flex justify-center items-center h-32">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading requests...</p>
              </div>
            ) : outOfZoneRequests.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <PackageSearch className="mx-auto h-12 w-12 mb-3" />
                No out-of-coverage requests captured yet.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User Name</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Address Details</TableHead>
                        <TableHead>Coordinates</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outOfZoneRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">{request.userDisplayName || 'Guest User'}</TableCell>
                          <TableCell className="text-sm">{formatRequestTimestamp(request.timestamp)}</TableCell>
                          <TableCell className="text-sm">
                            {request.eventData?.addressLine1 || request.eventData?.city || 'N/A'}
                            {request.eventData?.pincode ? ` - ${request.eventData.pincode}` : ''}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {request.eventData?.latitude?.toFixed(5) || 'N/A'}, {request.eventData?.longitude?.toFixed(5) || 'N/A'}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {request.eventData?.latitude && request.eventData?.longitude ? (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${request.eventData.latitude},${request.eventData.longitude}`, '_blank')}
                                >
                                  <Map className="h-4 w-4 mr-1.5 text-primary" /> Map <ExternalLink className="h-3 w-3 ml-1 text-muted-foreground" />
                                </Button>
                              ) : null}
                              <Button 
                                variant="destructive" 
                                size="icon" 
                                disabled={!request.id || isDeletingRequest === request.id} 
                                onClick={() => request.id && handleDeleteRequest(request.id)}
                              >
                                {isDeletingRequest === request.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile Card View */}
                <div className="block md:hidden space-y-4">
                  {outOfZoneRequests.map((request) => (
                    <Card key={request.id} className="p-5 space-y-4 border border-border shadow-sm bg-background/50">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <p className="font-bold text-base text-foreground leading-none">
                            {request.userDisplayName || 'Guest User'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatRequestTimestamp(request.timestamp)}
                          </p>
                        </div>
                        <Button 
                          variant="destructive" 
                          size="icon" 
                          className="h-8 w-8 shrink-0"
                          disabled={!request.id || isDeletingRequest === request.id} 
                          onClick={() => request.id && handleDeleteRequest(request.id)}
                        >
                          {isDeletingRequest === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 gap-2 text-sm pt-1">
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">Address Details</span>
                          <span className="text-foreground">
                            {request.eventData?.addressLine1 || request.eventData?.city || 'N/A'}
                            {request.eventData?.pincode ? ` - ${request.eventData.pincode}` : ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground block uppercase tracking-wider">Coordinates</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {request.eventData?.latitude?.toFixed(6) || 'N/A'}, {request.eventData?.longitude?.toFixed(6) || 'N/A'}
                          </span>
                        </div>
                      </div>

                      {request.eventData?.latitude && request.eventData?.longitude ? (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full mt-1 font-semibold flex items-center justify-center gap-1.5"
                          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${request.eventData.latitude},${request.eventData.longitude}`, '_blank')}
                        >
                          <Map className="h-4 w-4 text-primary" /> View on Map <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : null}
                    </Card>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
