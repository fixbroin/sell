
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, XCircle, Image as ImageIcon } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, orderBy, addDoc, serverTimestamp } from '@/lib/mysqlDb';
import type { FirestoreService } from '@/types/firestore';
import Link from 'next/link';
import NextImage from 'next/image';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLoading } from '@/contexts/LoadingContext';
import { useAuth } from '@/hooks/useAuth';
import { getGuestId } from '@/lib/guestIdManager';
import { logUserActivity } from '@/lib/activityLogger';
import { formatCurrency } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

interface SearchPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SearchPopup({ isOpen, onClose }: SearchPopupProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [searchTerm, setSearchTerm] = useState('');
  const [allServices, setAllServices] = useState<FirestoreService[]>([]);
  const [filteredServices, setFilteredServices] = useState<FirestoreService[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const { showLoading } = useLoading();
  const { user } = useAuth();

  const fetchAllServices = useCallback(async () => {
    if (!isOpen || hasFetched) return;

    setIsLoading(true);
    setHasFetched(true);
    try {
      const servicesCollectionRef = collection(db, "adminServices");
      const q = query(servicesCollectionRef, where("isActive", "==", true), orderBy("name", "asc"));
      const querySnapshot = await getDocs(q);
      const servicesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreService));
      setAllServices(servicesData);
      setFilteredServices([]); // Start with no results until user types
    } catch (error) {
      console.error("Error fetching services for search:", error);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, hasFetched]);

  useEffect(() => {
    if (isOpen && !hasFetched) {
      fetchAllServices();
    }
    if (!isOpen) {
        setSearchTerm("");
    }
  }, [isOpen, hasFetched, fetchAllServices]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (!searchTerm.trim()) {
        setFilteredServices([]);
        return;
      }
      if (searchTerm.trim().length > 2) {
        // Log the search activity
        logUserActivity(
          'search',
          { searchQuery: searchTerm.trim() },
          user?.uid,
          !user ? getGuestId() : null
        );

        // Persistent analytics logging
        try {
          addDoc(collection(db, "searchAnalytics"), {
            term: searchTerm.trim().toLowerCase(),
            createdAt: serverTimestamp(),
            userId: user?.uid || null,
            guestId: !user ? getGuestId() : null
          });
        } catch (e) {
          console.error("Error logging persistent search:", e);
        }
      }

      const lowerCaseSearchTerm = searchTerm.toLowerCase();

      const getScore = (service: FirestoreService): number => {
        const name = service.name.toLowerCase();
        const description = (service.shortDescription || service.description || '').toLowerCase();
        const slug = service.slug.toLowerCase();

        if (name.startsWith(lowerCaseSearchTerm)) return 10; // Exact start of name
        if (name.includes(lowerCaseSearchTerm)) return 5; // Name contains
        if (slug.includes(lowerCaseSearchTerm)) return 2; // Slug contains
        if (description.includes(lowerCaseSearchTerm)) return 1; // Description contains
        return 0; // No match
      };

      const results = allServices
        .map(service => ({ service, score: getScore(service) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score) // Sort by score descending
        .map(item => item.service); // Get back the service object

      setFilteredServices(results);
    }, 300); // Debounce search

    return () => clearTimeout(handler);
  }, [searchTerm, allServices, user]);

  const handleResultClick = () => {
    showLoading();
    onClose();
    setSearchTerm(''); 
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="w-[90%] sm:max-w-lg md:max-w-xl lg:max-w-2xl h-[90vh] max-h-[700px] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-3 pb-2 border-b">
          <DialogTitle className="font-headline flex items-center">
            <Search className="mr-2 h-5 w-5 text-primary" /> Search Services
          </DialogTitle>
          <DialogDescription>
            Find the service you need quickly.
          </DialogDescription>
        </DialogHeader>
        <div className="p-4 sm:p-3 border-b">
          <div className="relative">
            <Input
              id="search-popup-input"
              placeholder="e.g., AC Repair, Plumbing, Cleaning..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10 h-11 text-base"
              aria-label="Search services"
              autoFocus
            />
            {searchTerm ? (
                <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setSearchTerm('')}>
                    <XCircle className="h-5 w-5 text-muted-foreground"/>
                </Button>
            ) : (
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="flex-grow overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 sm:p-3 pt-2 space-y-3">
              {isLoading ? (
                <div className="flex justify-center items-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : searchTerm && filteredServices.length === 0 ? (
                <div className="text-center py-10">
                  <XCircle className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No results found for &quot;{searchTerm}&quot;.</p>
                </div>
              ) : !searchTerm ? (
                 <div className="text-center py-10">
                    <p className="text-muted-foreground">Type above to search for a service.</p>
                </div>
              ) : (
                filteredServices.map(service => (
                  <Link 
                    key={service.id} 
                    href={`/service/${service.slug}`}
                    onClick={handleResultClick}
                    className="block p-3 rounded-md hover:bg-accent/50 transition-colors border"
                  >
                    <div className="flex items-start gap-4">
                      <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
                        {service.imageUrl ? (
                          <NextImage
                            src={service.imageUrl}
                            alt={service.name}
                            fill
                            sizes="80px"
                            className="object-cover"
                            data-ai-hint={service.imageHint || "service"}
                          />
                        ) : (
                          <ImageIcon className="h-8 w-8 text-muted-foreground absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        )}
                      </div>
                      <div className="flex-grow">
                        <h4 className="font-semibold text-primary text-sm sm:text-base">{service.name}</h4>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 sm:mt-1">
                          {service.description || service.shortDescription || "View details..."}
                        </p>
                          <p className="font-semibold text-sm mt-1 sm:mt-2">{formatCurrency(service.discountedPrice ?? service.price, symbol, decimals, code)}</p>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
