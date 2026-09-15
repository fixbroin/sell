"use client";

import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, UserCheck2, UserCircle, PackageSearch, MapPin } from "lucide-react";
import type { ProviderApplication, FirestoreBooking, FirestoreService, FirestoreSubCategory } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getHaversineDistance } from '@/lib/locationUtils';
import { cn } from '@/lib/utils';

interface AssignProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: FirestoreBooking;
  onAssignConfirm: (bookingId: string, providerId: string, providerName: string) => Promise<void>;
}

export default function AssignProviderModal({ isOpen, onClose, booking, onAssignConfirm }: AssignProviderModalProps) {
  const [providers, setProviders] = useState<ProviderApplication[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | undefined>(undefined);
  const [isLoadingProviders, setIsLoadingProviders] = useState(true);
  const [isAssigning, setIsAssigning] = useState(false);
  const [bookingCategoryId, setBookingCategoryId] = useState<string | null>(null);
  const [isLoadingCategory, setIsLoadingCategory] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      setSelectedProviderId(undefined);
      setBookingCategoryId(null);
      return;
    }
    
    const fetchBookingCategoryAndProviders = async () => {
      setIsLoadingCategory(true);
      setIsLoadingProviders(true);
      try {
        // 1. Get Category ID for the booking
        let categoryId: string | null = null;
        if (booking.services.length > 0) {
          const firstServiceId = booking.services[0].serviceId;
          const serviceSnap = await getDoc(doc(db, "adminServices", firstServiceId));
          if (serviceSnap.exists()) {
            const serviceData = serviceSnap.data() as FirestoreService;
            const subCatSnap = await getDoc(doc(db, "adminSubCategories", serviceData.subCategoryId));
            if (subCatSnap.exists()) {
              const subCatData = subCatSnap.data() as FirestoreSubCategory;
              categoryId = subCatData.parentId;
            }
          }
        }
        setBookingCategoryId(categoryId);
        setIsLoadingCategory(false);

        // 2. Fetch all approved providers
        const providersRef = collection(db, "providerApplications");
        const q = query(
          providersRef, 
          where("status", "==", "approved")
        );
        const snapshot = await getDocs(q);
        const approvedProviders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProviderApplication));
        setProviders(approvedProviders);
      } catch (error) {
        console.error("Error fetching providers:", error);
        toast({ title: "Error", description: "Could not load relevant providers.", variant: "destructive" });
      } finally {
        setIsLoadingProviders(false);
      }
    };

    fetchBookingCategoryAndProviders();
  }, [isOpen, booking, toast]);

  const providersWithDistance = useMemo(() => {
    return providers.map(p => {
      let distance = Infinity;
      if (booking.latitude && booking.longitude && p.workAreaCenter) {
        distance = getHaversineDistance(
          booking.latitude,
          booking.longitude,
          p.workAreaCenter.latitude,
          p.workAreaCenter.longitude
        );
      }
      return { ...p, distance };
    });
  }, [providers, booking]);

  const { matchingProviders, otherProviders } = useMemo(() => {
    const matching: typeof providersWithDistance = [];
    const other: typeof providersWithDistance = [];

    providersWithDistance.forEach(p => {
      if (bookingCategoryId && p.workCategoryId === bookingCategoryId) {
        matching.push(p);
      } else {
        other.push(p);
      }
    });

    matching.sort((a, b) => a.distance - b.distance);
    other.sort((a, b) => a.distance - b.distance);

    return { matchingProviders: matching, otherProviders: other };
  }, [providersWithDistance, bookingCategoryId]);

  const renderProviderItem = (provider: typeof providersWithDistance[0]) => {
    return (
      <Label
        key={provider.id}
        htmlFor={`provider-${provider.id}`}
        className={cn(
          "flex items-center gap-3 w-full p-3 border rounded-xl cursor-pointer transition-all hover:bg-accent/50",
          selectedProviderId === provider.id ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border"
        )}
      >
        <RadioGroupItem value={provider.id!} id={`provider-${provider.id}`} className="shrink-0" />
        
        <Avatar className="h-12 w-12 border shadow-sm shrink-0">
          <AvatarImage src={provider.profilePhotoUrl || undefined} alt={provider.fullName} />
          <AvatarFallback className="bg-muted text-lg">{provider.fullName ? provider.fullName[0].toUpperCase() : <UserCircle />}</AvatarFallback>
        </Avatar>

        <div className="flex-grow min-w-0 space-y-0.5">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-baseline gap-1 sm:gap-2">
            <div className="flex flex-col min-w-0">
              <p className="font-bold text-sm truncate">{provider.fullName}</p>
              {booking.suggestedProviderIds?.includes(provider.id!) && (
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Suggested Match</span>
              )}
            </div>
            {provider.distance !== Infinity && (
              <span className="text-[10px] font-bold text-primary whitespace-nowrap bg-primary/10 px-1.5 py-0.5 rounded flex items-center w-fit gap-1">
                <MapPin className="h-3 w-3" /> {provider.distance.toFixed(1)} km away
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-medium truncate">{provider.workCategoryName}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-foreground/70 font-mono">{provider.mobileNumber}</p>
          </div>
        </div>
      </Label>
    );
  };

  const handleConfirm = async () => {
    if (!selectedProviderId) {
      toast({ title: "Selection Required", description: "Please select a provider to assign.", variant: "default" });
      return;
    }
    const selectedProvider = providers.find(p => p.id === selectedProviderId);
    if (!selectedProvider) {
        toast({ title: "Error", description: "Selected provider not found.", variant: "destructive"});
        return;
    }

    setIsAssigning(true);
    await onAssignConfirm(booking.id!, selectedProviderId, selectedProvider.fullName || "Unknown Provider");
    setIsAssigning(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md md:max-w-lg max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-3 pb-2">
          <DialogTitle className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <div className="flex items-center">
              <UserCheck2 className="mr-2 h-5 w-5 text-primary"/> Assign Provider
            </div>
            <span className="text-xs sm:text-sm text-muted-foreground font-normal">#{booking.bookingId}</span>
          </DialogTitle>
          <DialogDescription>
            Showing nearest approved providers. Matching category shown first.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-grow overflow-hidden">
          {isLoadingCategory || isLoadingProviders ? (
            <div className="flex flex-col items-center justify-center h-60">
              <Loader2 className="h-10 w-10 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Finding best providers...</p>
            </div>
          ) : matchingProviders.length === 0 && otherProviders.length === 0 ? (
            <div className="text-center py-16 flex flex-col items-center">
              <PackageSearch className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="font-semibold text-lg">No Providers Found</p>
              <p className="text-muted-foreground text-sm max-w-[250px] mx-auto">
                No approved providers found.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-full max-h-[500px]">
              <RadioGroup value={selectedProviderId} onValueChange={setSelectedProviderId} className="p-4 pt-2 gap-4">
                {matchingProviders.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-primary uppercase tracking-wider pl-1 flex items-center gap-1.5">
                      <UserCheck2 className="h-4 w-4" /> Matching Category Providers ({matchingProviders.length})
                    </div>
                    <div className="grid gap-3">
                      {matchingProviders.map((provider) => renderProviderItem(provider))}
                    </div>
                  </div>
                )}

                {otherProviders.length > 0 && (
                  <div className="space-y-3 mt-4">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1 flex items-center gap-1.5">
                      <UserCircle className="h-4 w-4" /> Other Category Providers ({otherProviders.length})
                    </div>
                    <div className="grid gap-3">
                      {otherProviders.map((provider) => renderProviderItem(provider))}
                    </div>
                  </div>
                )}
              </RadioGroup>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="p-4 sm:p-3 border-t bg-muted/30 gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onClose} disabled={isAssigning}>
            Cancel
          </Button>
          <Button type="button" className="w-full sm:w-auto" onClick={handleConfirm} disabled={!selectedProviderId || isAssigning || isLoadingProviders}>
            {isAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Assign to Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
