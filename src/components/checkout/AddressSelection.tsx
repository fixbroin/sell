
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PlusCircle, CheckCircle, Loader2, AlertTriangle, MapPin, Edit3, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { db } from '@/lib/firebase';
import { doc, onSnapshot, updateDoc, arrayUnion, collection, query, where, getDocs, Timestamp, arrayRemove } from '@/lib/mysqlDb';
import type { Address, FirestoreUser, ServiceZone } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { nanoid } from 'nanoid';
import AddressForm, { type AddressFormData } from '@/components/forms/AddressForm';
import { getHaversineDistance } from '@/lib/locationUtils'; 
import dynamic from 'next/dynamic'; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; 
import { useAuth } from '@/hooks/useAuth';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId } from '@/lib/guestIdManager';
import { getActiveCheckoutEntries } from '@/lib/cartManager';

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false,
});

interface AddressSelectionProps {
  onSelect: (address: Address) => void;
  initialAddressId?: string | null;
}

export default function AddressSelection({ onSelect, initialAddressId }: AddressSelectionProps) {
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig(); 

  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(initialAddressId || null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(true);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [initialMapCenter, setInitialMapCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [editingAddress, setEditingAddress] = useState<Partial<Address> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isServiceable, setIsServiceable] = useState<boolean | null>(null);
  const [allServiceZones, setAllServiceZones] = useState<ServiceZone[]>([]);

  const lastLoggedOutOfCoverageIdRef = useRef<string | null>(null);
  const [providerZones, setProviderZones] = useState<ServiceZone[]>([]);
  const [isLoadingZones, setIsLoadingZones] = useState(true);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setActiveCategoryId(localStorage.getItem('yourbrandActiveCheckoutCategory'));
    }
  }, []);

  const currentCategoryId = activeCategoryId || (typeof window !== 'undefined' ? localStorage.getItem('yourbrandActiveCheckoutCategory') : null);

  const applicableServiceZones = useMemo(() => {
    const adminZones = allServiceZones.filter(zone => {
      if (!zone.categoryIds || zone.categoryIds.length === 0) return true;
      return currentCategoryId && zone.categoryIds.includes(currentCategoryId);
    });
    return [...adminZones, ...providerZones];
  }, [allServiceZones, providerZones, currentCategoryId]);

  useEffect(() => {
    const fetchZonesAndProviders = async () => {
      setIsLoadingZones(true);
      try {
        const zonesQuery = query(collection(db, 'serviceZones'), where('isActive', '==', true));
        const zonesSnapshot = await getDocs(zonesQuery);
        setAllServiceZones(zonesSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceZone)));

        const activeEntries = getActiveCheckoutEntries();
        const activeServiceIds = activeEntries.map(e => e.serviceId).filter(Boolean);
        const effectiveCategoryId = activeCategoryId || (typeof window !== 'undefined' ? localStorage.getItem('yourbrandActiveCheckoutCategory') : null);

        if (effectiveCategoryId || activeServiceIds.length > 0) {
          const providersQuery = query(
            collection(db, 'providerApplications'), 
            where('status', '==', 'approved')
          );
          const providersSnapshot = await getDocs(providersQuery);

          const matchingDocs = providersSnapshot.docs.filter(doc => {
            const p = doc.data();
            if (p.isOnline === false) return false;
            if (!p.workAreaCenter || !p.workAreaRadiusKm) return false;

            // If there are active services in checkout, provider must be able to do EVERY service in the cart:
            if (activeServiceIds.length > 0) {
              return activeServiceIds.every(sId => {
                const hasCategory = effectiveCategoryId && (
                  p.workCategoryId === effectiveCategoryId ||
                  (Array.isArray(p.allCategoryIds) && p.allCategoryIds.includes(effectiveCategoryId))
                );
                const hasSpecificService = (Array.isArray(p.additionalServiceIds) && p.additionalServiceIds.includes(sId)) ||
                                           (Array.isArray(p.additionalServices) && p.additionalServices.some((s: any) => s.id === sId));
                return hasCategory || hasSpecificService;
              });
            }

            // Fallback if no specific service IDs are in the cart:
            const matchesCategory = effectiveCategoryId && (
              p.workCategoryId === effectiveCategoryId ||
              (Array.isArray(p.allCategoryIds) && p.allCategoryIds.includes(effectiveCategoryId))
            );
            return matchesCategory;
          });

          setProviderZones(matchingDocs.map(doc => {
            const data = doc.data();
            return {
              id: `provider_${doc.id}`,
              name: data.fullName || 'Service Provider',
              center: { latitude: data.workAreaCenter.latitude, longitude: data.workAreaCenter.longitude },
              radiusKm: data.workAreaRadiusKm,
              isActive: true,
              createdAt: data.createdAt || Timestamp.now(),
            } as ServiceZone;
          }));
        }
      } catch (error) {
        console.error("Error fetching serviceability data:", error);
      } finally {
        setIsLoadingZones(false);
      }
    };
    fetchZonesAndProviders();
  }, [activeCategoryId]);

  useEffect(() => {
    if (!user) {
      if (!isLoadingAuth) {
        setIsLoadingAddresses(false);
        const savedGuestAddressRaw = localStorage.getItem('yourbrandCustomerAddress');
        if (savedGuestAddressRaw) {
          try {
            const savedGuestAddress: Address = JSON.parse(savedGuestAddressRaw);
            savedGuestAddress.id = 'guest_address'; 
            setSavedAddresses([savedGuestAddress]);
            if (!selectedAddressId) setSelectedAddressId('guest_address');
          } catch (e) { console.error("Error parsing guest address:", e); }
        }
      }
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data() as FirestoreUser;
        setFirestoreUser(userData);
        const userAddresses = userData.addresses || [];
        setSavedAddresses(userAddresses);
        if (userAddresses.length > 0 && !selectedAddressId) {
            const defaultAddress = userAddresses.find(a => a.isDefault);
            setSelectedAddressId(defaultAddress ? defaultAddress.id : userAddresses[0].id);
        }
      }
      setIsLoadingAddresses(false);
    });
    return () => unsubscribe();
  }, [user, isLoadingAuth, selectedAddressId]);

  const checkServiceability = useCallback((address: Address | Partial<AddressFormData>) => {
    if (isLoadingZones) return; 
    if (!address.latitude || !address.longitude) { setIsServiceable(null); return; }

    if (applicableServiceZones.length === 0) {
      setIsServiceable(false);
      return;
    }

    const serviceable = applicableServiceZones.some(zone => {
      const distance = getHaversineDistance(address.latitude!, address.longitude!, zone.center.latitude, zone.center.longitude);
      return distance <= zone.radiusKm;
    });
    setIsServiceable(serviceable);
  }, [applicableServiceZones, isLoadingZones]);

  useEffect(() => {
    const selectedAddress = savedAddresses.find(a => a.id === selectedAddressId);
    if (selectedAddress) checkServiceability(selectedAddress);
    else setIsServiceable(null); 
  }, [selectedAddressId, savedAddresses, checkServiceability]);

  // Log user activity when the selected address is out of coverage
  useEffect(() => {
    if (isServiceable === false && selectedAddressId) {
      if (lastLoggedOutOfCoverageIdRef.current !== selectedAddressId) {
        lastLoggedOutOfCoverageIdRef.current = selectedAddressId;
        const selectedAddress = savedAddresses.find(a => a.id === selectedAddressId);
        if (selectedAddress) {
          logUserActivity(
            'checkoutStep',
            {
              checkoutStepName: applicableServiceZones.length === 0 ? 'providers_unavailable' : 'out_of_coverage',
              addressId: selectedAddress.id,
              fullName: selectedAddress.fullName,
              city: selectedAddress.city,
              pincode: selectedAddress.pincode,
              pageUrl: '/checkout'
            },
            user?.uid,
            !user ? getGuestId() : null,
            selectedAddress.fullName || firestoreUser?.displayName || user?.displayName || "Registered User"
          );
        }
      }
    } else if (isServiceable === true) {
      lastLoggedOutOfCoverageIdRef.current = null;
    }
  }, [isServiceable, selectedAddressId, savedAddresses, user, firestoreUser, applicableServiceZones]);

  const handleOpenMapClick = useCallback(async () => {
    setEditingAddress(null);
    setIsLocating(true);
    try {
        if (!navigator.geolocation) {
            setInitialMapCenter(null);
            setIsMapModalOpen(true);
            setIsLocating(false);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setInitialMapCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
                setIsLocating(false);
                setIsMapModalOpen(true);
            },
            () => {
                setInitialMapCenter(null); 
                setIsLocating(false);
                setIsMapModalOpen(true);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } catch (e) {
        setInitialMapCenter(null);
        setIsLocating(false);
        setIsMapModalOpen(true);
    }
  }, []);

  const handleMapAddressSelect = useCallback((addressData: Partial<AddressFormData>) => {
    checkServiceability(addressData); 
    setEditingAddress(prev => ({
        ...prev,
        ...addressData,
        ...(!editingAddress && user ? {
            fullName: firestoreUser?.displayName || user?.displayName || "",
            email: firestoreUser?.email || user?.email || "",
            phone: firestoreUser?.mobileNumber || user?.phoneNumber || "",
        } : {})
    }));
    setIsMapModalOpen(false);
    setIsFormOpen(true); 
  }, [checkServiceability, user, firestoreUser, editingAddress]);

  const handleOutOfCoverage = useCallback((addressData: Partial<AddressFormData>) => {
    logUserActivity(
      'checkoutStep',
      {
        checkoutStepName: 'out_of_coverage',
        addressLine1: addressData.addressLine1,
        addressLine2: addressData.addressLine2,
        city: addressData.city,
        state: addressData.state,
        pincode: addressData.pincode,
        latitude: addressData.latitude,
        longitude: addressData.longitude,
        source: 'map_selection',
        pageUrl: '/checkout'
      },
      user?.uid,
      !user ? getGuestId() : null,
      addressData.fullName || firestoreUser?.displayName || user?.displayName || "Registered User"
    );
  }, [user, firestoreUser]);

  const handleEditAddress = (e: React.MouseEvent, address: Address) => {
    e.stopPropagation();
    setEditingAddress(address);
    setIsFormOpen(true);
  };

  const handleAddressSubmit = async (data: AddressFormData) => {
    setIsSubmitting(true);
    
    try {
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        if (editingAddress?.id) {
          // Update
          const updatedAddresses = savedAddresses.map(a => 
            a.id === editingAddress.id ? { ...data, id: a.id, isDefault: a.isDefault } : a
          );
          await updateDoc(userDocRef, { addresses: updatedAddresses });
          toast({ title: "Success", description: "Address updated." });
        } else {
          // Add new
          const newAddress: Address = { ...data, id: nanoid(), isDefault: savedAddresses.length === 0 };
          await updateDoc(userDocRef, { addresses: arrayUnion(newAddress) });
          toast({ title: "Success", description: "New address saved." });
          setSelectedAddressId(newAddress.id);
        }
      } else {
        const newAddress: Address = { ...data, id: editingAddress?.id || 'guest_address', isDefault: true };
        localStorage.setItem('yourbrandCustomerAddress', JSON.stringify(newAddress));
        setSavedAddresses([newAddress]);
        setSelectedAddressId(newAddress.id);
        toast({ title: "Success", description: "Address saved." });
      }
      setIsFormOpen(false);
      setEditingAddress(null);
    } catch (error) {
      console.error("Error saving address:", error);
      toast({ title: "Error", description: "Could not save address.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = () => {
    const address = savedAddresses.find(a => a.id === selectedAddressId);
    if (address && isServiceable) {
      onSelect(address);
    }
  };

  if (isLoadingAuth || isLoadingAddresses || isLoadingZones) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {savedAddresses.map(address => (
          <Card
            key={address.id}
            className={`p-4 cursor-pointer hover:border-primary transition-all relative ${
              selectedAddressId === address.id
                ? "border-primary ring-2 ring-primary"
                : "border"
            }`}
            onClick={() => setSelectedAddressId(address.id)}
          >
            {/* Edit Button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 z-10 rounded-full bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-all duration-300 shadow-none"
              onClick={(e) => handleEditAddress(e, address)}
            >
              <Edit3 className="h-4 w-4" />
            </Button>

            <div className="flex items-center justify-between">
              <div className="space-y-1 text-sm flex-1 pr-12">
                <p className="font-semibold">{address.fullName}</p>
                <p className="text-muted-foreground">
                  {address.addressLine1}, {address.addressLine2}
                </p>
                <p className="text-muted-foreground">
                  {address.city}, {address.state} - {address.pincode}
                </p>
                <p className="text-muted-foreground">
                  Phone: {address.phone}
                </p>
              </div>

              {/* Selected Icon - Premium Styled */}
              {selectedAddressId === address.id && (
                <div className="flex items-center justify-center shrink-0 mr-2 animate-in zoom-in duration-300">
                  <div className="bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg shadow-primary/20 ring-2 ring-background">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Button variant="outline" className="w-full" onClick={handleOpenMapClick}>
        <PlusCircle className="mr-2 h-4 w-4" /> Add New Address
      </Button>

      {isServiceable === false && selectedAddressId && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {applicableServiceZones.length === 0
              ? "Providers Currently Unavailable"
              : "Area Not Serviceable"}
          </AlertTitle>
          <AlertDescription>
            {applicableServiceZones.length === 0
              ? "All service providers for this service are currently offline or fully busy. We will be back online soon! Please check back later."
              : "Sorry, the selected address is outside our current service zones. Please select a different location."}
          </AlertDescription>
        </Alert>
      )}

      <div className="sticky bottom-0 left-0 right-0 bg-background pt-4 pb-2 mt-auto border-t sm:border-none flex justify-end">
        <Button 
          onClick={handleConfirm} 
          disabled={!selectedAddressId || isServiceable === false} 
          className="w-full sm:w-auto px-10 py-6 sm:py-2 text-lg sm:text-base font-bold sm:font-medium shadow-lg sm:shadow-none"
        >
          Confirm Address
        </Button>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl w-[95vw] sm:w-[90vw] max-h-[90vh] p-0 flex flex-col" aria-describedby={undefined}>
          <DialogHeader className="p-3 border-b"><DialogTitle>{editingAddress?.id ? "Edit Address Details" : "Confirm Address Details"}</DialogTitle></DialogHeader>
          <div className="flex-grow overflow-y-auto p-3">
            <AddressForm
              initialData={editingAddress}
              onSubmit={handleAddressSubmit}
              onCancel={() => setIsFormOpen(false)}
              isSubmitting={isSubmitting}
              serviceZones={applicableServiceZones}
              onReselectOnMap={() => { setIsFormOpen(false); handleOpenMapClick(); }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent 
          className="max-w-3xl w-[95vw] sm:w-[90vw] h-[90vh] p-0 flex flex-col" 
          aria-describedby={undefined}
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Select Service Location</DialogTitle>
            <DialogDescription>{isLocating ? "Getting location..." : "Select location on map."}</DialogDescription>
          </DialogHeader>
          <div className="flex-grow">
            {!isLoadingAppSettings && appConfig.googleMapsApiKey && (
              <MapAddressSelector 
                apiKey={appConfig.googleMapsApiKey} 
                onAddressSelect={handleMapAddressSelect} 
                onClose={() => setIsMapModalOpen(false)} 
                initialCenter={initialMapCenter} 
                serviceZones={applicableServiceZones} 
                onOutOfCoverage={handleOutOfCoverage}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
