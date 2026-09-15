
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Loader2, PlusCircle, Edit, Trash2, Home, MapPin, PackageSearch, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc, collection, query, where, getDocs } from '@/lib/mysqlDb';
import type { Address, FirestoreUser, ServiceZone } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import AddressForm, { type AddressFormData } from '@/components/forms/AddressForm';
import dynamic from 'next/dynamic';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getHaversineDistance } from '@/lib/locationUtils';

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false,
});

export default function MyAddressPage() {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Partial<Address> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [initialMapCenter, setInitialMapCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [isServiceable, setIsServiceable] = useState<boolean | null>(null);
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState(true);

  useEffect(() => {
    if (!user) {
      if (!isLoadingAuth) setIsLoadingAddresses(false);
      return;
    }
    
    const fetchZones = async () => {
      setIsLoadingZones(true);
      try {
        const zonesQuery = query(collection(db, 'serviceZones'), where('isActive', '==', true));
        const snapshot = await getDocs(zonesQuery);
        setServiceZones(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceZone)));
      } catch (error) {
        console.error("Error fetching service zones:", error);
      } finally {
        setIsLoadingZones(false);
      }
    };
    fetchZones();

    const userDocRef = doc(db, 'users', user.uid);
    const fetchUserAddresses = async () => {
      try {
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const userData = docSnap.data() as FirestoreUser;
          setAddresses(userData.addresses || []);
          setFirestoreUser(userData);
        }
      } catch (error) {
        console.error("Error fetching addresses:", error);
        toast({ title: "Error", description: "Could not fetch your addresses.", variant: "destructive" });
      } finally {
        setIsLoadingAddresses(false);
      }
    };
    fetchUserAddresses();
  }, [user, isLoadingAuth, toast]);
  
  const checkServiceability = useCallback((address: Partial<AddressFormData>) => {
    if (isLoadingZones) return;
    if (serviceZones.length === 0) {
      setIsServiceable(true);
      return;
    }
    if (!address.latitude || !address.longitude) {
      setIsServiceable(null);
      return;
    }

    const serviceable = serviceZones.some(zone => {
      const distance = getHaversineDistance(address.latitude!, address.longitude!, zone.center.latitude, zone.center.longitude);
      return distance <= zone.radiusKm;
    });
    setIsServiceable(serviceable);
  }, [serviceZones, isLoadingZones]);

  const handleOpenMapForNewAddress = useCallback(async () => {
    setEditingAddress(null); // Ensure we're adding a new address
    setIsLocating(true);
    try {
      if (!navigator.geolocation) {
        setInitialMapCenter(null); setIsMapModalOpen(true); setIsLocating(false); return;
      }
      const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
      if (permissionStatus.state === 'granted' || permissionStatus.state === 'prompt') {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setInitialMapCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
            setIsLocating(false); setIsMapModalOpen(true);
          },
          () => { setInitialMapCenter(null); setIsLocating(false); setIsMapModalOpen(true); }
        );
      } else {
        setInitialMapCenter(null); setIsLocating(false); setIsMapModalOpen(true);
      }
    } catch (e) {
      setInitialMapCenter(null); setIsLocating(false); setIsMapModalOpen(true);
    }
  }, []);
  
  const handleEditAddressClick = (address: Address) => {
    setEditingAddress(address);
    setIsMapModalOpen(true); // Open map first for editing
    if(address.latitude && address.longitude) {
      setInitialMapCenter({lat: address.latitude, lng: address.longitude});
    } else {
      handleOpenMapForNewAddress();
    }
  };
  
  const handleReselectOnMap = useCallback(() => {
    setIsFormOpen(false); // Close the form
    handleOpenMapForNewAddress(); // Re-open the map
  }, [handleOpenMapForNewAddress]);

  const handleMapAddressSelect = useCallback((addressData: Partial<AddressFormData>) => {
    checkServiceability(addressData);
    setEditingAddress(prev => ({
        ...prev,
        ...addressData,
        fullName: firestoreUser?.displayName || user?.displayName || "",
        email: firestoreUser?.email || user?.email || "",
        phone: firestoreUser?.mobileNumber || user?.phoneNumber || "",
    }));
    setIsMapModalOpen(false);
    setIsFormOpen(true);
  }, [checkServiceability, user, firestoreUser]);

  const handleDeleteAddress = async (addressId: string) => {
    if (!user) return;
    const addressToDelete = addresses.find(a => a.id === addressId);
    if (!addressToDelete) return;

    setIsSubmitting(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { addresses: arrayRemove(addressToDelete) });
      toast({ title: "Success", description: "Address deleted." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete address.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddressSubmit = async (data: AddressFormData) => {
    if (!user) return;
    if (isServiceable === false) {
      toast({ title: "Cannot Save", description: "Address is outside our service area.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    
    let updatedAddresses: Address[];
    if (editingAddress?.id) {
      updatedAddresses = addresses.map(addr => 
        addr.id === editingAddress.id ? { ...addr, ...data } : addr
      );
    } else {
      const newAddress: Address = { ...data, id: nanoid(), isDefault: addresses.length === 0 };
      updatedAddresses = [...addresses, newAddress];
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, { addresses: updatedAddresses });
      toast({ title: "Success", description: `Address ${editingAddress?.id ? 'updated' : 'saved'}.` });
      setIsFormOpen(false);
      setEditingAddress(null);
    } catch (error) {
      toast({ title: "Error", description: "Could not save address.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Account", href: "/account" },
    { label: "My Addresses" },
  ];
  
  if (isLoadingAuth || isLoadingAddresses || isLoadingZones) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-headline font-semibold">My Addresses</h1>
          <Button onClick={handleOpenMapForNewAddress}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add New Address
          </Button>
        </div>

        {addresses.length === 0 ? (
          <Card className="text-center py-16">
            <CardHeader><PackageSearch className="mx-auto h-16 w-16 text-muted-foreground mb-4" /></CardHeader>
            <CardContent>
              <h3 className="text-xl font-semibold">No Saved Addresses</h3>
              <p className="text-muted-foreground mt-2">Add an address to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {addresses.map(address => (
              <Card key={address.id}>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Home className="h-5 w-5 text-primary" /> {address.fullName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  <p>{address.addressLine1}</p>
                  {address.addressLine2 && <p>{address.addressLine2}</p>}
                  <p>{address.city}, {address.state} - {address.pincode}</p>
                  <p><strong>Email:</strong> {address.email}</p>
                  <p><strong>Phone:</strong> {address.phone}</p>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEditAddressClick(address)}>
                    <Edit className="mr-2 h-4 w-4" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Are you sure?</AlertDialogTitle><AlertDialogDescriptionComponent>This will permanently delete this address.</AlertDialogDescriptionComponent></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteAddress(address.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] max-h-[90vh] p-0 flex flex-col">
          <DialogHeader className="p-3 border-b"><DialogTitle>{editingAddress?.id ? 'Edit Address' : 'Add New Address'}</DialogTitle></DialogHeader>
          <div className="flex-grow overflow-y-auto p-3">
            <AddressForm
              initialData={editingAddress}
              onSubmit={handleAddressSubmit}
              onCancel={() => { setIsFormOpen(false); setEditingAddress(null); }}
              isSubmitting={isSubmitting}
              serviceZones={serviceZones}
              onReselectOnMap={handleReselectOnMap}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent
          className="max-w-3xl w-[95vw] sm:w-[90vw] h-[90vh] p-0 flex flex-col"
          onPointerDownOutside={(e) => { const target = e.target as HTMLElement; if (target.closest('.pac-container')) e.preventDefault(); }}
        >
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Select Service Location</DialogTitle>
            <DialogDescription>
                {isLocating ? "Getting your current location..." : "Search for an address or click/drag the pin on the map."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow">
            {isLoadingAppSettings || !appConfig.googleMapsApiKey ? (
                <div className="flex items-center justify-center h-full bg-muted"><p>Map configuration loading or missing.</p></div>
            ) : (
                <MapAddressSelector 
                    apiKey={appConfig.googleMapsApiKey} 
                    onAddressSelect={handleMapAddressSelect} 
                    onClose={() => setIsMapModalOpen(false)} 
                    initialCenter={initialMapCenter} 
                    serviceZones={serviceZones}
                    
                />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}

