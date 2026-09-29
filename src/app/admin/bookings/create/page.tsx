
"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Calendar } from '@/components/ui/calendar';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, getTimestampMillis, formatCurrency, formatDateInTimezone, formatTimeInTimezone } from "@/lib/utils";
import { 
  Loader2, ArrowLeft, Search, User, MapPin, Phone, Mail, 
  CalendarDays, Clock, CheckCircle2, IndianRupee, Tag, 
  AlertCircle, Plus, Trash2, Info, HandCoins, ChevronDown, CheckCircle, Check, ChevronsUpDown, X
} from "lucide-react";
import { db } from '@/lib/firebase';
import { 
  collection, query, where, getDocs, doc, getDoc, 
  addDoc, Timestamp, limit, orderBy 
} from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { triggerPushNotification } from '@/lib/fcmUtils';
import type { 
  FirestoreBooking, FirestoreUser, FirestoreCategory, 
  FirestoreService, BookingStatus, BookingServiceItem, FirestorePromoCode
} from '@/types/firestore';
import { 
  generateBookingId, getBasePriceForInvoice, 
  calculateIncrementalTotalPriceForItem 
} from '@/lib/bookingUtils';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Separator } from "@/components/ui/separator";
import { assignNewBookingNumber } from '@/lib/webServerUtils';
import { incrementSystemStats } from '@/lib/systemStatsUtils';
import { triggerRefresh } from '@/lib/revalidateUtils';

interface AppliedPromoCodeInfo {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  calculatedDiscount: number;
  minBookingAmount?: number;
}

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  ssr: false,
  loading: () => <div className="flex h-60 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
});

export default function AdminCreateBookingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';

  const ignoreNextSearch = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [isLoadingPrerequisites, setIsLoadingPrerequisites] = useState(true);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [createdBookingId, setCreatedBookingId] = useState("");
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [serviceZones, setServiceZones] = useState<any[]>([]);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromoCodeInfo | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [availablePromos, setAvailablePromos] = useState<FirestorePromoCode[]>([]);

  const [customerSearch, setCustomerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<FirestoreUser[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [selectedUser, setSelectedUser] = useState<FirestoreUser | null>(null);
  const [customerDetails, setCustomerDetails] = useState({
    name: "", email: "", phone: "", address: "", city: "", pincode: "", latitude: "" as string | number, longitude: "" as string | number
  });

  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [subCategories, setSubCategories] = useState<any[]>([]);
  const [allServices, setAllServices] = useState<FirestoreService[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedSubCategoryId, setSelectedSubCategoryId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [isCustomService, setIsCustomService] = useState(false);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServicePrice, setCustomServicePrice] = useState("");
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  const [bookingServices, setBookingServices] = useState<BookingServiceItem[]>([]);

  const [categorySearch, setCategorySearch] = useState("");
  const [subCategorySearch, setSubCategorySearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [isSubCategoryDialogOpen, setIsSubCategoryDialogOpen] = useState(false);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [availableSlots, setAvailableSlots] = useState<{ slot: string; remainingCapacity: number; endDateTime: string }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [selectedEndDateTime, setSelectedEndDateTime] = useState<string>("");
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const [paymentMode, setPaymentMode] = useState("Pay after service");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("Confirmed");
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);

  useEffect(() => {
    if (ignoreNextSearch.current) { ignoreNextSearch.current = false; return; }
    if (customerSearch.trim().length < 2) { setSearchResults([]); setShowSearchResults(false); return; }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingUser(true);
      try {
        const usersRef = collection(db, "users");
        const term = customerSearch.trim();
        const lowerTerm = term.toLowerCase();
        const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
        const queries = [
          query(usersRef, where("email", ">=", term), where("email", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("email", ">=", lowerTerm), where("email", "<=", lowerTerm + '\uf8ff'), limit(10)),
          query(usersRef, where("mobileNumber", ">=", term), where("mobileNumber", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("displayName", ">=", term), where("displayName", "<=", term + '\uf8ff'), limit(10)),
          query(usersRef, where("displayName", ">=", capitalizedTerm), where("displayName", "<=", capitalizedTerm + '\uf8ff'), limit(10)),
        ];
        if (/^\d+$/.test(term)) {
          queries.push(query(usersRef, where("mobileNumber", ">=", `91${term}`), where("mobileNumber", "<=", `91${term}` + '\uf8ff'), limit(5)));
          queries.push(query(usersRef, where("mobileNumber", ">=", `+91${term}`), where("mobileNumber", "<=", `+91${term}` + '\uf8ff'), limit(5)));
        }
        const snapShots = await Promise.all(queries.map(q => getDocs(q)));
        const results: FirestoreUser[] = [];
        snapShots.forEach(snap => snap.docs.forEach(docSnap => results.push({ ...docSnap.data(), uid: docSnap.id } as FirestoreUser)));
        const uniqueResults = Array.from(new Map(results.map(u => [u.uid, u])).values());
        setSearchResults(uniqueResults);
        setShowSearchResults(uniqueResults.length > 0);
      } catch (error) { console.error(error); } finally { setIsSearchingUser(false); }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [customerSearch]);

  const handleSelectUser = (user: FirestoreUser) => {
    ignoreNextSearch.current = true;
    setSelectedUser(user);
    const addr = user.addresses?.[0];
    setCustomerDetails({ name: user.displayName || "", email: user.email || "", phone: user.mobileNumber || "", address: addr?.addressLine1 || "", city: addr?.city || "", pincode: addr?.pincode || "", latitude: addr?.latitude || "", longitude: addr?.longitude || "" });
    setCustomerSearch(user.displayName || user.email || "");
    setShowSearchResults(false);
  };

  useEffect(() => {
    const fetchPrerequisites = async () => {
      try {
        const [catSnap, subCatSnap, servSnap, promoSnap, zonesSnap] = await Promise.all([
          getDocs(query(collection(db, "adminCategories"), orderBy("order", "asc"))),
          getDocs(query(collection(db, "adminSubCategories"), orderBy("order", "asc"))),
          getDocs(query(collection(db, "adminServices"), where("isActive", "==", true))),
          getDocs(collection(db, "adminPromoCodes")),
          getDocs(query(collection(db, "serviceZones"), where("isActive", "==", true)))
        ]);
        setCategories(catSnap.docs.map(d => ({ ...d.data(), id: d.id } as FirestoreCategory)));
        setSubCategories(subCatSnap.docs.map(d => ({ ...d.data(), id: d.id })));
        setAllServices(servSnap.docs.map(d => ({ ...d.data(), id: d.id } as FirestoreService)));
        setServiceZones(zonesSnap.docs.map(d => ({ ...d.data(), id: d.id })));
        
        const promos = promoSnap.docs
          .map(d => ({ ...d.data(), id: d.id } as FirestorePromoCode))
          .filter(p => p.isActive);
          
        const currentDate = new Date();
        const validPromos = promos.filter(p => {
          const from = getTimestampMillis(p.validFrom);
          const until = getTimestampMillis(p.validUntil);
          if (from && currentDate < new Date(from)) return false;
          if (until && currentDate > new Date(until)) return false;
          return true;
        });
        validPromos.sort((a, b) => a.code.localeCompare(b.code));
        setAvailablePromos(validPromos);
      } catch (error) { console.error(error); } finally { setIsLoadingPrerequisites(false); }
    };
    fetchPrerequisites();
  }, []);

  const filteredCategories = useMemo(() => categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase())), [categories, categorySearch]);
  const filteredSubCategories = useMemo(() => subCategories.filter(sc => sc.parentId === selectedCategoryId && sc.name.toLowerCase().includes(subCategorySearch.toLowerCase())), [subCategories, selectedCategoryId, subCategorySearch]);
  const filteredServices = useMemo(() => allServices.filter(s => s.subCategoryId === selectedSubCategoryId && s.name.toLowerCase().includes(serviceSearch.toLowerCase())), [allServices, selectedSubCategoryId, serviceSearch]);
  
  const selectedCategory = useMemo(() => categories.find(c => c.id === selectedCategoryId), [categories, selectedCategoryId]);
  const selectedSubCategory = useMemo(() => subCategories.find(sc => sc.id === selectedSubCategoryId), [subCategories, selectedSubCategoryId]);
  const selectedService = useMemo(() => allServices.find(s => s.id === selectedServiceId), [allServices, selectedServiceId]);

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedSlot("");
    setSelectedEndDateTime("");
  };

  useEffect(() => {
    if (!selectedDate) {
      setAvailableSlots([]);
      return;
    }
    const fetchSlots = async () => {
      setIsLoadingSlots(true);
      try {
        const cartEntries = bookingServices
          .filter(s => s.serviceId !== "custom")
          .map(s => ({ serviceId: s.serviceId, quantity: s.quantity }));

        const response = await fetch('/api/checkout/available-slots', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            selectedDate: selectedDate.toISOString(), 
            cartEntries,
            latitude: customerDetails.latitude ? Number(customerDetails.latitude) : undefined,
            longitude: customerDetails.longitude ? Number(customerDetails.longitude) : undefined
          })
        });
        const data = await response.json();
        setAvailableSlots(data.availableTimeSlots || []);
      } catch (error) { console.error(error); } finally { setIsLoadingSlots(false); }
    };
    fetchSlots();
  }, [selectedDate, bookingServices, customerDetails.latitude, customerDetails.longitude]);

  // Synchronize slot details when available slots or selected slot changes
  useEffect(() => {
    if (selectedSlot && availableSlots.length > 0) {
      const match = availableSlots.find(s => s.slot === selectedSlot);
      if (match) {
        setSelectedEndDateTime(match.endDateTime);
      } else {
        setSelectedSlot("");
        setSelectedEndDateTime("");
      }
    }
  }, [availableSlots, selectedSlot]);

  const summary = useMemo(() => {
    let itemTotal = 0;
    let taxTotal = 0;
    let visitingCharge = 0;
    let platformFeeTotal = 0;
    const appliedPlatformFees: any[] = [];

    bookingServices.forEach(item => {
      itemTotal += item.pricePerUnit * item.quantity;
      taxTotal += item.taxAmountForItem || 0;
    });

    const vcAmount = (selectedCategory && typeof selectedCategory.visitingChargeAmount === 'number') ? selectedCategory.visitingChargeAmount : appConfig?.visitingChargeAmount;
    const minBooking = (selectedCategory && typeof selectedCategory.minimumBookingAmount === 'number') ? selectedCategory.minimumBookingAmount : appConfig?.minimumBookingAmount;

    if (appConfig?.enableMinimumBookingPolicy && typeof minBooking === 'number' && typeof vcAmount === 'number') {
      if (itemTotal < minBooking) {
        visitingCharge = vcAmount;
        if (appConfig.enableTaxOnVisitingCharge) {
          const vcBase = getBasePriceForInvoice(visitingCharge, !!appConfig.isVisitingChargeTaxInclusive, appConfig.visitingChargeTaxPercent || 0);
          taxTotal += vcBase * ((appConfig.visitingChargeTaxPercent || 0) / 100);
        }
      }
    }
    if (visitingCharge === 0 && appConfig?.platformFees) {
      appConfig.platformFees.forEach(fee => {
        if (fee.isActive) {
          const base = fee.type === 'percentage' ? (itemTotal * (fee.value / 100)) : fee.value;
          const tax = base * ((fee.feeTaxRatePercent || 0) / 100);
          appliedPlatformFees.push({ name: fee.name, type: fee.type, valueApplied: fee.value, calculatedFeeAmount: base, taxRatePercentOnFee: fee.feeTaxRatePercent || 0, taxAmountOnFee: tax });
          platformFeeTotal += (base + tax);
        }
      });
    }

    // Calculate Promo Discount
    let discountAmount = 0;
    if (appliedPromo) {
      if (appliedPromo.minBookingAmount && itemTotal < appliedPromo.minBookingAmount) {
        // Ignored, doesn't meet minimum requirements
      } else {
        discountAmount = appliedPromo.discountType === 'percentage' 
          ? (itemTotal * appliedPromo.discountValue) / 100 
          : appliedPromo.discountValue;
        discountAmount = Math.min(discountAmount, itemTotal);
      }
    }

    const grandTotal = Math.max(0, itemTotal + taxTotal + visitingCharge + platformFeeTotal - discountAmount);

    return { 
      itemTotal, 
      taxTotal, 
      visitingCharge, 
      platformFeeTotal, 
      appliedPlatformFees, 
      discountAmount,
      grandTotal 
    };
  }, [bookingServices, appConfig, appliedPromo]);

  const validateForm = () => {
    const errors: string[] = [];
    if (!customerDetails.name.trim()) errors.push("name");
    if (!customerDetails.phone.trim()) errors.push("phone");
    if (!customerDetails.address.trim()) errors.push("address");
    if (bookingServices.length === 0) errors.push("service");
    if (!selectedDate) errors.push("date");
    if (!selectedSlot) errors.push("slot");
    setFormErrors(errors);
    return errors.length === 0;
  };

  const handleAddService = () => {
    if (isCustomService) {
      if (!customServiceName.trim() || !customServicePrice) {
        toast({ title: "Missing Fields", description: "Please enter a name and price for the custom service.", variant: "destructive" });
        return;
      }
      const price = parseFloat(customServicePrice) || 0;
      setBookingServices(prev => [...prev, {
        serviceId: "custom",
        name: customServiceName.trim(),
        quantity: 1,
        pricePerUnit: price,
        isTaxInclusive: false,
        taxPercentApplied: 0,
        taxAmountForItem: 0
      }]);
      setCustomServiceName("");
      setCustomServicePrice("");
      setIsCustomService(false);
      toast({ title: "Custom Service Added", description: "Successfully added custom service to booking." });
    } else {
      if (!selectedServiceId || !selectedService) {
        toast({ title: "No Service Selected", description: "Please select a service from the dropdown.", variant: "destructive" });
        return;
      }
      const rate = selectedService.taxPercent || 0;
      const totalItemPrice = calculateIncrementalTotalPriceForItem(selectedService, selectedQuantity);
      const base = getBasePriceForInvoice(totalItemPrice, !!selectedService.isTaxInclusive, rate);
      const taxAmount = totalItemPrice - base;

      setBookingServices(prev => {
        const existingIdx = prev.findIndex(item => item.serviceId === selectedService.id);
        if (existingIdx > -1) {
          const updated = [...prev];
          const newQty = updated[existingIdx].quantity + selectedQuantity;
          const newTotal = calculateIncrementalTotalPriceForItem(selectedService, newQty);
          const newBase = getBasePriceForInvoice(newTotal, !!selectedService.isTaxInclusive, rate);
          updated[existingIdx].quantity = newQty;
          updated[existingIdx].pricePerUnit = newTotal / newQty;
          updated[existingIdx].taxAmountForItem = newTotal - newBase;
          return updated;
        } else {
          return [...prev, {
            serviceId: selectedService.id!,
            name: selectedService.name,
            quantity: selectedQuantity,
            pricePerUnit: totalItemPrice / selectedQuantity,
            discountedPricePerUnit: selectedService.discountedPrice ?? undefined,
            isTaxInclusive: !!selectedService.isTaxInclusive,
            taxPercentApplied: rate,
            taxAmountForItem: taxAmount,
            taskTimeValue: selectedService.taskTimeValue ?? undefined,
            taskTimeUnit: selectedService.taskTimeUnit ?? undefined,
            shortDescription: selectedService.shortDescription ?? undefined,
            imageUrl: selectedService.imageUrl
          }];
        }
      });
      setSelectedServiceId("");
      setSelectedQuantity(1);
      toast({ title: "Service Added", description: `Added ${selectedService.name} to booking.` });
    }
  };

  const handleUpdateQuantity = (idx: number, delta: number) => {
    setBookingServices(prev => {
      const updated = [...prev];
      const item = { ...updated[idx] };
      const newQty = item.quantity + delta;
      if (newQty < 1) return prev;

      if (item.serviceId !== "custom") {
        const dbService = allServices.find(s => s.id === item.serviceId);
        if (dbService) {
          const totalItemPrice = calculateIncrementalTotalPriceForItem(dbService, newQty);
          const rate = dbService.taxPercent || 0;
          const base = getBasePriceForInvoice(totalItemPrice, !!dbService.isTaxInclusive, rate);
          
          item.quantity = newQty;
          item.pricePerUnit = totalItemPrice / newQty;
          item.taxAmountForItem = totalItemPrice - base;
          updated[idx] = item;
          return updated;
        }
      }
      
      item.quantity = newQty;
      updated[idx] = item;
      return updated;
    });
  };

  const handleApplyPromo = async (codeOverride?: string) => {
    const code = (codeOverride || promoCodeInput).toUpperCase().trim();
    if (!code) return;
    setIsApplyingPromo(true);
    try {
      const q = query(collection(db, "adminPromoCodes"), where("code", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) {
        toast({ title: "Invalid Code", description: "This promo code does not exist.", variant: "destructive" });
        setIsApplyingPromo(false);
        return;
      }
      const promoData = { id: snap.docs[0].id, ...snap.docs[0].data() } as FirestorePromoCode;
      if (!promoData.isActive) { 
        toast({ title: "Inactive Code", description: "This promo code is currently inactive.", variant: "destructive" }); 
        setIsApplyingPromo(false); 
        return; 
      }
      
      const currentDate = new Date();
      const validFrom = getTimestampMillis(promoData.validFrom);
      if (validFrom && currentDate < new Date(validFrom)) { 
        toast({ title: "Not Yet Valid", description: "This promo code is not active yet.", variant: "destructive" }); 
        setIsApplyingPromo(false); 
        return; 
      }
      const validUntil = getTimestampMillis(promoData.validUntil);
      if (validUntil && currentDate > new Date(validUntil)) { 
        toast({ title: "Expired Code", description: "This promo code has expired.", variant: "destructive" }); 
        setIsApplyingPromo(false); 
        return; 
      }

      const sumOfItemPrices = summary.itemTotal;
      if (promoData.minBookingAmount && sumOfItemPrices < promoData.minBookingAmount) {
        toast({ 
          title: "Min Amount Not Met", 
          description: `Minimum ${formatCurrency(promoData.minBookingAmount, symbol, decimals, code)} required for this code.`, 
          variant: "destructive" 
        });
        setIsApplyingPromo(false);
        return;
      }
      
      if (promoData.maxUsesPerUser && promoData.maxUsesPerUser > 0 && selectedUser?.uid) {
        const bookingsRef = collection(db, "bookings");
        const userUsageQuery = query(
          bookingsRef, 
          where("userId", "==", selectedUser.uid), 
          where("discountCode", "==", promoData.code.toUpperCase())
        );
        const userUsageSnapshot = await getDocs(userUsageQuery);
        if (userUsageSnapshot.size >= promoData.maxUsesPerUser) {
          toast({ 
            title: "Limit Reached", 
            description: "This customer has already used this code the maximum number of times.", 
            variant: "destructive" 
          });
          setIsApplyingPromo(false);
          return;
        }
      }

      let disc = promoData.discountType === 'percentage' 
        ? (sumOfItemPrices * promoData.discountValue) / 100 
        : promoData.discountValue;
      disc = Math.min(disc, sumOfItemPrices);

      const applied = { 
        id: promoData.id, 
        code: promoData.code, 
        discountType: promoData.discountType, 
        discountValue: promoData.discountValue, 
        calculatedDiscount: disc,
        minBookingAmount: promoData.minBookingAmount ?? undefined
      };
      setAppliedPromo(applied);
      setPromoCodeInput("");
      toast({ title: "Promo Applied!", description: `Saved ${formatCurrency(disc, symbol, decimals, code)}.` });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to apply promo code.", variant: "destructive" });
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCodeInput("");
    toast({ title: "Promo Removed" });
  };

  const handleMapAddressSelect = (address: any) => {
    setCustomerDetails(p => ({
      ...p,
      address: [address.addressLine1, address.addressLine2].filter(Boolean).join(", "),
      city: address.city || p.city,
      pincode: address.pincode || p.pincode,
      latitude: address.latitude ? String(address.latitude) : p.latitude,
      longitude: address.longitude ? String(address.longitude) : p.longitude
    }));
    setIsMapModalOpen(false);
    toast({ title: "Location Updated", description: "Selected location loaded from map." });
  };

  const handleSubmit = async () => {
    setHasAttemptedSubmit(true);
    if (!validateForm()) { toast({ title: "Validation Error", description: "Fill all required fields.", variant: "destructive" }); return; }
    setIsSubmitting(true);
    try {
      const newBookingId = generateBookingId();

      let parentCatId = selectedCategoryId || null;
      let subCatId = selectedSubCategoryId || null;
      
      const firstActiveService = bookingServices.find(s => s.serviceId !== "custom");
      if (firstActiveService) {
        const servObj = allServices.find(s => s.id === firstActiveService.serviceId);
        if (servObj) {
          subCatId = servObj.subCategoryId;
          const subCatObj = subCategories.find(sc => sc.id === subCatId);
          if (subCatObj) {
            parentCatId = subCatObj.parentId;
          }
        }
      }

      // Assign Sequential Booking Number
      const nextBookingNumber = await assignNewBookingNumber();

      const bookingData: any = {
        bookingId: newBookingId, 
        bookingNumber: nextBookingNumber,
        userId: selectedUser?.uid || null, 
        customerName: customerDetails.name, 
        customerEmail: customerDetails.email, 
        customerPhone: customerDetails.phone, 
        addressLine1: customerDetails.address, 
        city: customerDetails.city, 
        state: "N/A", 
        pincode: customerDetails.pincode, 
        scheduledDate: selectedDate!.toLocaleDateString('en-CA'), 
        scheduledTimeSlot: selectedSlot, 
        services: bookingServices, 
        appliedPlatformFees: summary.appliedPlatformFees, 
        subTotal: summary.itemTotal, 
        taxAmount: summary.taxTotal, 
        visitingCharge: summary.visitingCharge, 
        discountCode: appliedPromo?.code || null,
        discountAmount: summary.discountAmount || 0,
        totalAmount: summary.grandTotal, 
        paymentMethod: paymentMode, 
        status: bookingStatus, 
        createdAt: Timestamp.now(), 
        updatedAt: Timestamp.now(), 
        isReviewedByCustomer: false,
        parentCategoryId: parentCatId,
        subCategoryId: subCatId,
        estimatedEndTime: selectedEndDateTime || null
      };
      if (customerDetails.latitude) bookingData.latitude = Number(customerDetails.latitude);
      if (customerDetails.longitude) bookingData.longitude = Number(customerDetails.longitude);

      const docRef = await addDoc(collection(db, "bookings"), bookingData);
      // Track stats for new booking
      incrementSystemStats({ totalBookings: 1 }).catch(e => console.error("Stats increment error:", e));
      await triggerRefresh('bookings');
      fetch('/api/bookings/post-process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingDocId: docRef.id }) });
      setCreatedBookingId(newBookingId); setIsSuccessDialogOpen(true);
    } catch (error) { console.error(error); toast({ title: "Error", description: "Failed to create booking.", variant: "destructive" }); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 px-4">
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Bookings", href: "/admin/bookings" }, { label: "Create Booking" }]} className="mb-6" />
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl sm:text-3xl font-bold flex items-center"><Plus className="mr-2 h-8 w-8 text-primary" /> Create Manual Booking</h1><p className="text-muted-foreground">Fill details to create an offline booking.</p></div>
        <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className={hasAttemptedSubmit && (formErrors.includes("name") || formErrors.includes("phone") || formErrors.includes("address")) ? "border-destructive shadow-md" : ""}>
            <CardHeader><CardTitle className="text-lg flex items-center"><User className="mr-2 h-5 w-5 text-primary" /> Customer Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search existing users..." className="pl-9" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}/>
                {showSearchResults && (
                  <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-xl max-h-60 overflow-y-auto">
                    {searchResults.map((user) => (
                      <div key={user.uid} className="p-3 hover:bg-muted cursor-pointer border-b last:border-0 flex items-center justify-between" onClick={() => handleSelectUser(user)}>
                        <div><p className="font-bold text-sm">{user.displayName || "No Name"}</p><p className="text-xs text-muted-foreground">{user.email || user.mobileNumber}</p></div><Badge variant="outline" className="text-[10px]">Select</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {isSearchingUser && <div className="absolute right-3 top-2.5"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2"><Label>Name *</Label><Input className={hasAttemptedSubmit && !customerDetails.name.trim() ? "border-destructive" : ""} value={customerDetails.name} onChange={e => setCustomerDetails(p => ({...p, name: e.target.value}))}/></div>
                <div className="space-y-2"><Label>Mobile *</Label><Input className={hasAttemptedSubmit && !customerDetails.phone.trim() ? "border-destructive" : ""} value={customerDetails.phone} onChange={e => setCustomerDetails(p => ({...p, phone: e.target.value}))}/></div>
                <div className="space-y-2"><Label>Email</Label><Input value={customerDetails.email} onChange={e => setCustomerDetails(p => ({...p, email: e.target.value}))}/></div>
                <div className="space-y-2"><Label>City</Label><Input value={customerDetails.city} onChange={e => setCustomerDetails(p => ({...p, city: e.target.value}))}/></div>
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Address *</Label>
                    {appConfig?.googleMapsApiKey && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsMapModalOpen(true)}
                        className="h-8 px-2.5 text-xs text-primary border-primary/20 hover:border-primary/40 hover:bg-primary/5 hover:text-primary font-bold rounded-md flex items-center gap-1.5"
                      >
                        <MapPin className="h-3.5 w-3.5" /> Select on Map
                      </Button>
                    )}
                  </div>
                  <Input className={hasAttemptedSubmit && !customerDetails.address.trim() ? "border-destructive" : ""} value={customerDetails.address} onChange={e => setCustomerDetails(p => ({...p, address: e.target.value}))}/>
                </div>
                <div className="space-y-2"><Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Latitude</Label><Input value={customerDetails.latitude} onChange={e => setCustomerDetails(p => ({...p, latitude: e.target.value}))}/></div>
                <div className="space-y-2"><Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground" /> Longitude</Label><Input value={customerDetails.longitude} onChange={e => setCustomerDetails(p => ({...p, longitude: e.target.value}))}/></div>
              </div>
            </CardContent>
          </Card>

          <Card className={hasAttemptedSubmit && formErrors.includes("service") ? "border-destructive shadow-md" : ""}>
            <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-lg flex items-center"><Tag className="mr-2 h-5 w-5 text-primary" /> Service Selection</CardTitle><Button type="button" variant={isCustomService ? "default" : "outline"} size="sm" onClick={() => { setIsCustomService(!isCustomService); if (!isCustomService) setSelectedServiceId(""); }}>{isCustomService ? "Use Standard" : "Add Custom Service"}</Button></div></CardHeader>
            <CardContent className="space-y-4">
              {!isCustomService ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Category</Label>
                    <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                      <DialogTrigger asChild><Button variant="outline" className="w-full justify-between font-normal h-10 px-3"><span className="truncate">{selectedCategory ? selectedCategory.name : "Select Category"}</span><ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" /></Button></DialogTrigger>
                      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Select Category</DialogTitle></DialogHeader><div className="relative mb-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={categorySearch} onChange={e => setCategorySearch(e.target.value)} /></div><ScrollArea className="h-72 pr-4"><div className="space-y-1">{filteredCategories.map(c => (<Button key={c.id} variant="ghost" className={`w-full justify-start font-medium ${selectedCategoryId === c.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => { setSelectedCategoryId(c.id!); setSelectedSubCategoryId(""); setSelectedServiceId(""); setIsCategoryDialogOpen(false); setIsSubCategoryDialogOpen(true); }}>{c.name}</Button>))}</div></ScrollArea></DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-2"><Label>Sub-Category</Label>
                    <Dialog open={isSubCategoryDialogOpen} onOpenChange={setIsSubCategoryDialogOpen}>
                      <DialogTrigger asChild><Button variant="outline" className="w-full justify-between font-normal h-10 px-3" disabled={!selectedCategoryId}><span className="truncate">{selectedSubCategory ? selectedSubCategory.name : "Select Sub-Cat"}</span><ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" /></Button></DialogTrigger>
                      <DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Select Sub-Category</DialogTitle></DialogHeader><div className="relative mb-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={subCategorySearch} onChange={e => setSubCategorySearch(e.target.value)} /></div><ScrollArea className="h-72 pr-4"><div className="space-y-1">{filteredSubCategories.map(sc => (<Button key={sc.id} variant="ghost" className={`w-full justify-start font-medium ${selectedSubCategoryId === sc.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => { setSelectedSubCategoryId(sc.id!); setSelectedServiceId(""); setIsSubCategoryDialogOpen(false); setIsServiceDialogOpen(true); }}>{sc.name}</Button>))}</div></ScrollArea></DialogContent>
                    </Dialog>
                  </div>
                  <div className="space-y-2"><Label>Service</Label>
                    <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
                      <DialogTrigger asChild><Button variant="outline" className={`w-full justify-between font-normal h-10 px-3`} disabled={!selectedSubCategoryId}><span className="truncate">{selectedService ? selectedService.name : "Select Service"}</span><ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" /></Button></DialogTrigger>
                      <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Select Service</DialogTitle></DialogHeader><div className="relative mb-2"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-8" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} /></div><ScrollArea className="h-96 pr-4"><div className="space-y-1">{filteredServices.map(s => (<Button key={s.id} variant="ghost" className={`w-full justify-start h-auto py-3 px-4 flex flex-col items-start gap-0.5 ${selectedServiceId === s.id ? 'bg-primary/10 text-primary' : ''}`} onClick={() => { setSelectedServiceId(s.id!); setIsServiceDialogOpen(false); }}><span className="font-bold text-sm text-left">{s.name}</span><span className="text-xs text-muted-foreground text-left">Price: {formatCurrency(s.discountedPrice ?? s.price, symbol, decimals, code)}</span></Button>))}</div></ScrollArea></DialogContent>
                    </Dialog>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-primary/5 rounded-lg border border-primary/10">
                  <div className="space-y-2"><Label>Name</Label><Input value={customServiceName} onChange={e => setCustomServiceName(e.target.value)} placeholder="e.g. Custom Plumbing repair" /></div>
                  <div className="space-y-2"><Label>Price ({symbol})</Label><Input type="number" value={customServicePrice} onChange={e => setCustomServicePrice(e.target.value)} placeholder="500" /></div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
                {!isCustomService && selectedServiceId ? (
                  <div className="flex items-center gap-4">
                    <Label>Quantity</Label>
                    <div className="flex items-center gap-3">
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedQuantity(q => Math.max(1, q-1))}>-</Button>
                      <span className="font-bold">{selectedQuantity}</span>
                      <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setSelectedQuantity(q => q+1)}>+</Button>
                    </div>
                  </div>
                ) : <div />}

                <Button 
                  type="button" 
                  onClick={handleAddService} 
                  disabled={isCustomService ? (!customServiceName.trim() || !customServicePrice) : !selectedServiceId}
                  className="flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4" /> Add to Booking
                </Button>
              </div>

              {bookingServices.length > 0 && (
                <div className="pt-4 border-t space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-primary" /> Added Services ({bookingServices.length})
                  </Label>
                  <div className="space-y-2">
                    {bookingServices.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 border rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(item.pricePerUnit * item.quantity, symbol, decimals, code)} ({item.quantity} x {formatCurrency(item.pricePerUnit, symbol, decimals, code)})
                            {item.taxPercentApplied && item.taxPercentApplied > 0 ? ` • Incl. ${item.taxPercentApplied}% Tax (${formatCurrency(item.taxAmountForItem || 0, symbol, decimals, code)})` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 border rounded-md p-1 bg-background">
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-foreground font-bold hover:bg-muted" 
                              onClick={() => handleUpdateQuantity(idx, -1)}
                              disabled={item.quantity <= 1}
                            >
                              -
                            </Button>
                            <span className="text-xs font-bold w-4 text-center select-none">{item.quantity}</span>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 text-foreground font-bold hover:bg-muted" 
                              onClick={() => handleUpdateQuantity(idx, 1)}
                            >
                              +
                            </Button>
                          </div>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-full" 
                            onClick={() => setBookingServices(prev => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={hasAttemptedSubmit && (formErrors.includes("date") || formErrors.includes("slot")) ? "border-destructive shadow-md" : ""}>
            <CardHeader><CardTitle className="text-lg flex items-center"><CalendarDays className="mr-2 h-5 w-5 text-primary" /> Schedule</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`border rounded-md p-2 flex justify-center ${hasAttemptedSubmit && !selectedDate ? 'border-destructive' : ''}`}><Calendar mode="single" selected={selectedDate} onSelect={handleDateSelect} disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))} /></div>
              <div className="space-y-4 flex flex-col"><Label className="flex items-center"><Clock className="mr-2 h-4 w-4" /> Slots</Label>
                {isLoadingSlots ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-10"><Loader2 className="h-5 w-5 animate-spin" /> Loading...</div>
                ) : availableSlots.length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      {availableSlots.map(s => (
                        <Button 
                          key={s.slot} 
                          type="button"
                          variant={selectedSlot === s.slot ? "default" : "outline"} 
                          className={`text-xs ${hasAttemptedSubmit && !selectedSlot ? 'border-destructive' : ''}`} 
                          onClick={() => { setSelectedSlot(s.slot); setSelectedEndDateTime(s.endDateTime); }}
                        >
                          {s.slot}
                        </Button>
                      ))}
                    </div>

                    {selectedSlot && selectedDate && (
                      <div className="mt-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10 flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-green-700 uppercase">Selected Schedule</p>
                          <p className="text-xs font-bold">{formatDateInTimezone(selectedDate, appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)} at {selectedSlot}</p>
                          {selectedEndDateTime && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              Estimated Completion: {formatTimeInTimezone(new Date(selectedEndDateTime), appConfig?.timezone || 'Asia/Kolkata')}
                              {formatDateInTimezone(new Date(selectedEndDateTime), appConfig?.timezone || 'Asia/Kolkata', 'YYYY-MM-DD') !== formatDateInTimezone(selectedDate, appConfig?.timezone || 'Asia/Kolkata', 'YYYY-MM-DD') && ` on ${formatDateInTimezone(new Date(selectedEndDateTime), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)}`}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-10 text-muted-foreground border-2 border-dashed rounded-lg">{selectedDate ? "No slots." : "Select date."}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Service:</span><span className="font-medium">{formatCurrency(summary.itemTotal, symbol, decimals, code)}</span></div>
                <div className="flex justify-between"><span>Visiting:</span><span className="font-medium">{formatCurrency(summary.visitingCharge, symbol, decimals, code)}</span></div>
                {summary.appliedPlatformFees.map((fee, idx) => (<div key={idx} className="flex justify-between"><span className="flex items-center gap-1 text-muted-foreground"><HandCoins className="h-3 w-3" /> {fee.name}:</span><span className="font-medium">{formatCurrency(fee.calculatedFeeAmount + fee.taxAmountOnFee, symbol, decimals, code)}</span></div>))}
                <div className="flex justify-between"><span>Tax:</span><span className="font-medium">{formatCurrency(summary.taxTotal, symbol, decimals, code)}</span></div>
                {summary.discountAmount > 0 && (
                  <div className="flex justify-between text-green-600 font-semibold">
                    <span>Discount ({appliedPromo?.code}):</span>
                    <span>-{formatCurrency(summary.discountAmount, symbol, decimals, code)}</span>
                  </div>
                )}
                <Separator /><div className="flex justify-between text-lg font-bold"><span>Total:</span><span className="text-primary">{formatCurrency(summary.grandTotal, symbol, decimals, code)}</span></div>
              </div>
              <Separator />
              
              {/* Promo Code Section */}
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Promo Code</Label>
                {appliedPromo ? (
                  <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/30 p-2.5 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-green-600" />
                      <div>
                        <p className="text-xs font-bold text-green-700 dark:text-green-400">&quot;{appliedPromo.code}&quot; Applied</p>
                        <p className="text-[10px] text-green-600">Saved {formatCurrency(appliedPromo.calculatedDiscount, symbol, decimals, code)}</p>
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" 
                      onClick={handleRemovePromo}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Enter promo code" 
                        value={promoCodeInput} 
                        onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                        disabled={isApplyingPromo}
                        className="h-9 text-xs font-bold uppercase"
                      />
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleApplyPromo()} 
                        disabled={!promoCodeInput.trim() || isApplyingPromo}
                        className="h-9 px-3 text-xs"
                      >
                        {isApplyingPromo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
                      </Button>
                    </div>
                    {availablePromos.length > 0 && (
                      <div className="pt-1.5 space-y-1">
                        <span className="text-[10px] font-semibold text-muted-foreground block">Available Promos:</span>
                        <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
                          {availablePromos.map((promo) => (
                            <button
                              key={promo.id}
                              type="button"
                              onClick={() => handleApplyPromo(promo.code)}
                              disabled={isApplyingPromo}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-primary/15 border border-muted hover:border-primary/20 text-[10px] font-bold text-muted-foreground hover:text-primary transition-all cursor-pointer"
                            >
                              <Tag className="h-2.5 w-2.5" />
                              <span>{promo.code}</span>
                              <span className="text-[9px] font-normal text-muted-foreground/85">
                                ({promo.discountType === 'percentage' ? `${promo.discountValue}%` : formatCurrency(promo.discountValue, symbol, decimals, code)})
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <Separator />
              <div className="space-y-3">
                <Label>Payment</Label>
                <RadioGroup value={paymentMode} onValueChange={setPaymentMode} className="grid grid-cols-2 gap-2">
                  <Label className="flex items-center gap-2 border p-3 rounded-md cursor-pointer hover:bg-muted"><RadioGroupItem value="Pay after service" /> Pay after service</Label>
                  <Label className="flex items-center gap-2 border p-3 rounded-md cursor-pointer hover:bg-muted"><RadioGroupItem value="Online" /> Online</Label>
                  <Label className="flex items-center gap-2 border p-3 rounded-md cursor-pointer hover:bg-muted"><RadioGroupItem value="Pending" /> Pending</Label>
                </RadioGroup>
              </div>
              <div className="space-y-3 flex flex-col">
                <Label>Status</Label>
                <Dialog open={isStatusPickerOpen} onOpenChange={setIsStatusPickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={isStatusPickerOpen}
                      className="w-full justify-between text-left font-normal h-10"
                      disabled={isSubmitting}
                      type="button"
                    >
                      <span>{bookingStatus}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Select Booking Status</DialogTitle>
                      <DialogDescription>
                        Set the status of the booking being created.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <ScrollArea className="h-[150px] rounded-md border p-2">
                        <div className="space-y-1">
                          <Button
                            variant={bookingStatus === "Confirmed" ? "secondary" : "ghost"}
                            className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                            onClick={() => {
                              setBookingStatus("Confirmed");
                              setIsStatusPickerOpen(false);
                            }}
                            type="button"
                          >
                            <span className="font-semibold text-sm">Confirmed</span>
                            {bookingStatus === "Confirmed" && (
                              <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                            )}
                          </Button>
                          <Button
                            variant={bookingStatus === "Pending Payment" ? "secondary" : "ghost"}
                            className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                            onClick={() => {
                              setBookingStatus("Pending Payment");
                              setIsStatusPickerOpen(false);
                            }}
                            type="button"
                          >
                            <span className="font-semibold text-sm">Pending Payment</span>
                            {bookingStatus === "Pending Payment" && (
                              <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                            )}
                          </Button>
                        </div>
                      </ScrollArea>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
            <CardFooter><Button className="w-full h-12 text-lg font-bold shadow-lg" onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Create Booking"}</Button></CardFooter>
          </Card>
        </div>
      </div>

      <Dialog open={isSuccessDialogOpen} onOpenChange={(open) => !open && router.push('/admin/bookings')}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="flex flex-col items-center justify-center space-y-4">
            <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center text-green-600 animate-in zoom-in duration-300"><CheckCircle className="h-10 w-10" /></div>
            <DialogTitle className="text-2xl font-bold text-center">Booking Created!</DialogTitle>
            <DialogDescription className="text-center text-base">The booking <strong>{createdBookingId}</strong> has been successfully created.</DialogDescription>
          </DialogHeader>
          <div className="bg-muted p-4 rounded-lg space-y-2 mt-4 text-sm">
            <div className="flex justify-between"><span>Customer:</span><span className="font-bold">{customerDetails.name}</span></div>
            <div className="flex justify-between"><span>Service:</span><span className="font-bold truncate max-w-[200px]">{isCustomService ? customServiceName : selectedService?.name}</span></div>
            <div className="flex justify-between"><span>Date:</span><span className="font-bold">{selectedDate ? formatDateInTimezone(selectedDate, appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat) : 'N/A'}</span></div>
            {summary.discountAmount > 0 && (
              <div className="flex justify-between text-green-600 font-semibold">
                <span>Discount ({appliedPromo?.code}):</span>
                <span>-{formatCurrency(summary.discountAmount, symbol, decimals, code)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t font-bold"><span>Amount:</span><span className="text-primary">{formatCurrency(summary.grandTotal, symbol, decimals, code)}</span></div>
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-6">
            <Button variant="outline" className="w-full sm:flex-1" onClick={() => router.push('/admin')}>Dashboard</Button>
            <Button className="w-full sm:flex-1" onClick={() => router.push('/admin/bookings')}>All Bookings</Button>
          </DialogFooter>
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
            <DialogDescription>Select location on map.</DialogDescription>
          </DialogHeader>
          <div className="flex-grow">
            {appConfig?.googleMapsApiKey && (
              <MapAddressSelector 
                apiKey={appConfig.googleMapsApiKey} 
                onAddressSelect={handleMapAddressSelect} 
                onClose={() => setIsMapModalOpen(false)} 
                initialCenter={customerDetails.latitude && customerDetails.longitude ? { lat: Number(customerDetails.latitude), lng: Number(customerDetails.longitude) } : null} 
                serviceZones={serviceZones} 
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
