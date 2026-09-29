"use client";

import { useState, useEffect, useMemo } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn, formatCurrency } from "@/lib/utils";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import AppImage from '@/components/ui/AppImage';
import { Loader2, Save, User, Mail, Phone, MapPin, Edit, Clock, Globe, CalendarDays, Check, ChevronsUpDown, Trash2, PlusCircle, Search, Tag } from 'lucide-react';
import type { FirestoreBooking, BookingStatus, FirestoreNotification, FirestoreService, FirestorePromoCode, BookingServiceItem, FirestoreCategory } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, Timestamp, addDoc, collection, query, where, getDocs } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { triggerPushNotification } from '@/lib/fcmUtils';
import RescheduleBookingDialog from '@/components/shared/RescheduleBookingDialog';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getBasePriceForInvoice } from '@/lib/bookingUtils';

const statusOptions: [string, ...string[]] = [
  "Pending Payment",
  "Confirmed",
  "Processing",
  "Completed",
  "Cancelled",
  "Rescheduled",
  "AssignedToProvider",
  "ProviderAccepted",
  "ProviderRejected",
  "InProgressByProvider"
];

const timeSlots = {
  morning: ["09:00 AM", "10:00 AM", "11:00 AM"],
  afternoon: ["01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM"],
  evening: ["05:00 PM", "06:00 PM"],
};
const allTimeSlots = Object.values(timeSlots).flat();

const bookingEditSchema = z.object({
  customerName: z.string().min(2, "Full name must be at least 2 characters."),
  customerEmail: z.string().email("Invalid email address."),
  customerPhone: z.string().min(10, "Phone number must be at least 10 digits.").regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format."),
  addressLine1: z.string().min(5, "Address is too short."),
  addressLine2: z.string().optional(),
  city: z.string().min(2, "City name is too short."),
  state: z.string().min(2, "State name is too short."),
  pincode: z.string().length(6, "Pincode must be 6 digits.").regex(/^\d+$/, "Invalid pincode."),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  scheduledDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Invalid date format." }),
  scheduledTimeSlot: z.string().min(1, "Time slot is required."),
  estimatedEndTime: z.string().optional(),
  status: z.enum(statusOptions),
  notes: z.string().optional(),
});

type BookingEditFormData = z.infer<typeof bookingEditSchema>;

interface EditBookingModalProps {
  bookingId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export default function EditBookingModal({ bookingId, isOpen, onOpenChange, onSuccess }: EditBookingModalProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [booking, setBooking] = useState<FirestoreBooking | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date | undefined>(undefined);

  const [isRescheduleDialogOpen, setIsRescheduleDialogOpen] = useState(false);
  const [isTimeSlotPickerOpen, setIsTimeSlotPickerOpen] = useState(false);
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);

  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [services, setServices] = useState<BookingServiceItem[]>([]);
  const [allCatalogServices, setAllCatalogServices] = useState<FirestoreService[]>([]);
  const [isAddServiceDialogOpen, setIsAddServiceDialogOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [allCategories, setAllCategories] = useState<FirestoreCategory[]>([]);
  const [availablePromos, setAvailablePromos] = useState<FirestorePromoCode[]>([]);

  const form = useForm<BookingEditFormData>({
    resolver: zodResolver(bookingEditSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      pincode: "",
      latitude: null,
      longitude: null,
      scheduledDate: "",
      scheduledTimeSlot: "",
      status: "Pending Payment",
      notes: "",
    },
  });

  useEffect(() => {
    if (!bookingId || !isOpen) return;

    const fetchBooking = async () => {
      setIsLoading(true);
      try {
        const bookingDocRef = doc(db, "bookings", bookingId);
        const docSnap = await getDoc(bookingDocRef);

        if (docSnap.exists()) {
          const bookingData = docSnap.data() as FirestoreBooking;
          setBooking(bookingData);
          setServices(bookingData.services || []);
          
          form.reset({
            customerName: bookingData.customerName || "",
            customerEmail: bookingData.customerEmail || "",
            customerPhone: bookingData.customerPhone || "",
            addressLine1: bookingData.addressLine1 || "",
            addressLine2: bookingData.addressLine2 || "",
            city: bookingData.city || "",
            state: bookingData.state || "",
            pincode: bookingData.pincode || "",
            latitude: bookingData.latitude || null,
            longitude: bookingData.longitude || null,
            scheduledDate: bookingData.scheduledDate || "",
            scheduledTimeSlot: bookingData.scheduledTimeSlot || "",
            status: bookingData.status || "Pending Payment",
            notes: bookingData.notes || "",
          });
          
          if (bookingData.scheduledDate) {
            const dateParts = bookingData.scheduledDate.split('-');
            if (dateParts.length === 3) {
              setCalendarDate(new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
            } else {
               const parsedDate = new Date(bookingData.scheduledDate);
               if (!isNaN(parsedDate.getTime())) {
                  setCalendarDate(parsedDate);
                  form.setValue('scheduledDate', parsedDate.toLocaleDateString('en-CA'));
               }
            }
          }
        } else {
          toast({ title: "Not Found", description: "Booking not found.", variant: "destructive" });
          onOpenChange(false);
        }
      } catch (error) {
        console.error("Error fetching booking:", error);
        toast({ title: "Error", description: "Could not fetch booking details.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };

    fetchBooking();
  }, [bookingId, isOpen, form, toast, onOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    const fetchServicesCatalog = async () => {
      try {
        const snap = await getDocs(query(collection(db, "adminServices"), where("isActive", "==", true)));
        setAllCatalogServices(snap.docs.map(d => ({ ...d.data(), id: d.id } as FirestoreService)));
      } catch (err) {
        console.error("Error fetching catalog services:", err);
      }
    };
    const fetchPromos = async () => {
      try {
        const snap = await getDocs(collection(db, "adminPromoCodes"));
        setAvailablePromos(snap.docs.map(d => ({ ...d.data(), id: d.id } as FirestorePromoCode)));
      } catch (err) {
        console.error("Error fetching promos:", err);
      }
    };
    const fetchCategoriesCatalog = async () => {
      try {
        const snap = await getDocs(collection(db, "adminCategories"));
        setAllCategories(snap.docs.map(d => ({ ...d.data(), id: d.id } as FirestoreCategory)));
      } catch (err) {
        console.error("Error fetching categories:", err);
      }
    };
    fetchServicesCatalog();
    fetchCategoriesCatalog();
    fetchPromos();
  }, [isOpen]);
  
  const handleCalendarSelect = (date: Date | undefined) => {
    setCalendarDate(date);
    if (date) {
      form.setValue('scheduledDate', date.toLocaleDateString('en-CA'));
    } else {
      form.setValue('scheduledDate', '');
    }
  };

  const handleRescheduleConfirm = (newDate: string, newSlot: string, newEndTime: string) => {
    form.setValue('scheduledDate', newDate);
    form.setValue('scheduledTimeSlot', newSlot);
    form.setValue('estimatedEndTime', newEndTime);
    form.setValue('status', 'Rescheduled');
    
    const dateParts = newDate.split('-');
    if (dateParts.length === 3) {
      setCalendarDate(new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2])));
    }
    
    setIsRescheduleDialogOpen(false);
    toast({ title: "Slot Updated", description: `Booking schedule updated to ${newDate} at ${newSlot}.` });
  };

  const handleQuantityChange = (serviceId: string, delta: number) => {
    setServices(prev => prev.map(s => {
      if (s.serviceId === serviceId) {
        const newQty = Math.max(1, s.quantity + delta);
        const price = s.pricePerUnit * newQty;
        const rate = s.taxPercentApplied || 0;
        const base = getBasePriceForInvoice(price, !!s.isTaxInclusive, rate);
        return {
          ...s,
          quantity: newQty,
          taxAmountForItem: price - base
        };
      }
      return s;
    }));
  };

  const handleRemoveService = (serviceId: string) => {
    setServices(prev => prev.filter(s => s.serviceId !== serviceId));
  };

  const handleAddServiceFromCatalog = (srv: FirestoreService) => {
    if (services.some(s => s.serviceId === srv.id)) {
      toast({ title: "Already Added", description: "This service is already added." });
      return;
    }

    const price = srv.discountedPrice ?? srv.price;
    const rate = srv.taxPercent || 0;
    const base = getBasePriceForInvoice(price, !!srv.isTaxInclusive, rate);

    const newItem: BookingServiceItem = {
      serviceId: srv.id,
      name: srv.name,
      imageUrl: srv.imageUrl || undefined,
      quantity: 1,
      pricePerUnit: price,
      discountedPricePerUnit: srv.discountedPrice || null,
      isTaxInclusive: !!srv.isTaxInclusive,
      taxPercentApplied: rate,
      taxAmountForItem: price - base,
      taskTimeValue: srv.taskTimeValue || null,
      taskTimeUnit: srv.taskTimeUnit || null,
      shortDescription: srv.shortDescription || null,
    };

    setServices(prev => [...prev, newItem]);
    setIsAddServiceDialogOpen(false);
    setServiceSearchQuery("");
    toast({ title: "Added", description: `${srv.name} added.` });
  };

  const summary = useMemo(() => {
    let itemTotal = 0; 
    let taxTotal = 0; 
    let visitingCharge = 0; 
    let platformFeeTotal = 0;
    const appliedPlatformFees: any[] = [];

    services.forEach(item => {
      const qty = item.quantity;
      const price = item.pricePerUnit * qty;
      itemTotal += price;

      const rate = item.taxPercentApplied || 0;
      const base = getBasePriceForInvoice(price, !!item.isTaxInclusive, rate);
      taxTotal += (price - base);
    });

    // Resolve Category ID of the booking from the services
    let resolvedCategoryId = "";
    if (services.length > 0) {
      const firstItem = services[0];
      const matchedCatalogService = allCatalogServices.find(s => s.id === firstItem.serviceId);
      if (matchedCatalogService) {
        resolvedCategoryId = matchedCatalogService.parentCategoryId || "";
      }
    }
    const selectedCategory = allCategories.find(c => c.id === resolvedCategoryId);
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
          appliedPlatformFees.push({ 
            name: fee.name, 
            type: fee.type, 
            valueApplied: fee.value, 
            calculatedFeeAmount: base, 
            taxRatePercentOnFee: fee.feeTaxRatePercent || 0, 
            taxAmountOnFee: tax 
          });
          platformFeeTotal += (base + tax);
        }
      });
    }

    let discountAmount = booking?.discountAmount || 0;
    if (booking?.discountCode) {
      const promo = availablePromos.find(p => p.code === booking.discountCode);
      if (promo) {
        if (promo.minBookingAmount && itemTotal < promo.minBookingAmount) {
          discountAmount = 0;
        } else {
          discountAmount = promo.discountType === 'percentage' 
            ? (itemTotal * promo.discountValue) / 100 
            : promo.discountValue;
          discountAmount = Math.min(discountAmount, itemTotal);
        }
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
  }, [services, appConfig, booking, availablePromos]);

  const onSubmit = async (data: BookingEditFormData) => {
    if (!booking || !bookingId) return;
    if (services.length === 0) {
      toast({ title: "Validation Error", description: "You must have at least one service in the booking.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    try {
      const bookingDocRef = doc(db, "bookings", bookingId);
      
      const updateData = {
        ...data,
        services: services,
        subTotal: summary.itemTotal,
        taxAmount: summary.taxTotal,
        visitingCharge: summary.visitingCharge,
        platformFeeTotal: summary.platformFeeTotal,
        appliedPlatformFees: summary.appliedPlatformFees,
        discountAmount: summary.discountAmount,
        totalAmount: summary.grandTotal,
        status: data.status as BookingStatus,
        isReviewedByCustomer: (data.status === 'Completed' && booking.status !== 'Completed') ? false : booking.isReviewedByCustomer,
        latitude: data.latitude === null ? undefined : data.latitude,
        longitude: data.longitude === null ? undefined : data.longitude,
        updatedAt: Timestamp.now(),
      };

      await updateDoc(bookingDocRef, updateData);

      fetch('/api/bookings/post-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingDocId: bookingId }),
      }).catch(err => console.error("Error calling post-process after edit:", err));

      const userNotificationData: Omit<FirestoreNotification, 'id'> = {
        userId: booking.userId || "anonymous",
        title: `Booking Update: ${data.status}`,
        message: `Your booking ${booking.bookingId} has been updated to ${data.status}.`,
        type: data.status === 'Completed' ? 'success' : (data.status === 'Cancelled' ? 'error' : 'info'),
        href: '/my-bookings',
        read: false,
        createdAt: Timestamp.now(),
      };
      await addDoc(collection(db, "userNotifications"), userNotificationData);

      if (booking.userId) {
        triggerPushNotification({
            userId: booking.userId,
            title: userNotificationData.title,
            body: userNotificationData.message,
            href: userNotificationData.href
        });
      }

      toast({ title: "Success", description: "Booking updated successfully." });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating booking:", error);
      toast({ title: "Error", description: "Could not update booking.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] flex flex-col p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="p-3 pb-4 border-b shrink-0">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Edit className="h-5 w-5 text-primary" /> Edit Booking: {booking?.bookingId || "Loading..."}
          </DialogTitle>
          <DialogDescription>Modify the details and service items of this booking.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex flex-col justify-center items-center py-20 gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading booking details...</p>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-3 max-h-[60vh] md:max-h-[68vh] min-h-0">
                <div className="space-y-6">
                  {/* Customer Details */}
                  <section className="space-y-4 p-4 border rounded-xl bg-muted/5 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <User className="h-4 w-4 text-primary" /> Customer Details
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="customerName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold">Full Name</FormLabel>
                            <FormControl><Input className="h-9" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="customerEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold">Email</FormLabel>
                            <FormControl><Input className="h-9" type="email" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="customerPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold">Phone</FormLabel>
                            <FormControl><Input className="h-9" type="tel" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </section>

                  {/* Address & Location */}
                  <section className="space-y-4 p-4 border rounded-xl bg-muted/5 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" /> Address & Location
                    </h3>
                    <FormField
                      control={form.control}
                      name="addressLine1"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold">Address Line 1</FormLabel>
                          <FormControl><Input className="h-9" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="addressLine2"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold">Address Line 2 (Optional)</FormLabel>
                          <FormControl><Input className="h-9" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold">City</FormLabel>
                            <FormControl><Input className="h-9" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold">State</FormLabel>
                            <FormControl><Input className="h-9" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="pincode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-bold">Pincode</FormLabel>
                            <FormControl><Input className="h-9" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <FormItem>
                        <FormLabel className="flex items-center text-xs font-bold">
                          <Globe className="mr-2 h-4 w-4 text-muted-foreground" /> Latitude (Read-only)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            value={form.watch('latitude') !== null && form.watch('latitude') !== undefined ? form.watch('latitude')?.toFixed(6) : "N/A"} 
                            readOnly 
                            disabled 
                            className="bg-muted/50 h-9"
                          />
                        </FormControl>
                      </FormItem>
                      <FormItem>
                        <FormLabel className="flex items-center text-xs font-bold">
                          <Globe className="mr-2 h-4 w-4 text-muted-foreground" /> Longitude (Read-only)
                        </FormLabel>
                        <FormControl>
                          <Input 
                            value={form.watch('longitude') !== null && form.watch('longitude') !== undefined ? form.watch('longitude')?.toFixed(6) : "N/A"} 
                            readOnly 
                            disabled 
                            className="bg-muted/50 h-9"
                          />
                        </FormControl>
                      </FormItem>
                    </div>
                  </section>

                  {/* Service Items Section */}
                  <section className="space-y-4 p-4 border rounded-xl bg-muted/5 shadow-sm">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                        <Tag className="h-4 w-4 text-primary" /> Service Items
                      </h3>
                      <Dialog open={isAddServiceDialogOpen} onOpenChange={setIsAddServiceDialogOpen}>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm"
                          className="h-8 text-xs font-bold border-primary text-primary hover:bg-primary hover:text-white"
                          onClick={() => setIsAddServiceDialogOpen(true)}
                        >
                          <PlusCircle className="mr-1.5 h-3.5 w-3.5" /> Add Service
                        </Button>
                        <DialogContent className="w-[90vw] sm:max-w-lg rounded-2xl max-h-[90vh] flex flex-col p-0">
                          <DialogHeader className="p-3 pb-4 border-b">
                            <DialogTitle>Add Service</DialogTitle>
                            <DialogDescription>Search and select a service to add to this booking.</DialogDescription>
                          </DialogHeader>
                          <div className="p-4 border-b shrink-0">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input 
                                placeholder="Search services..." 
                                className="pl-9 h-9"
                                value={serviceSearchQuery}
                                onChange={(e) => setServiceSearchQuery(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="flex-grow overflow-y-auto p-4 max-h-[50vh] min-h-0">
                            <div className="space-y-2">
                              {allCatalogServices
                                .filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase()))
                                .map((srv) => (
                                  <Button
                                    key={srv.id}
                                    type="button"
                                    variant="ghost"
                                    className="w-full justify-start text-left h-auto py-3 px-4 flex flex-col items-start gap-1 hover:bg-muted/50 border rounded-lg"
                                    onClick={() => handleAddServiceFromCatalog(srv)}
                                  >
                                    <span className="font-bold text-sm text-foreground">{srv.name}</span>
                                    <span className="text-xs text-muted-foreground">Price: {formatCurrency(srv.discountedPrice ?? srv.price, symbol, decimals, code)}</span>
                                  </Button>
                                ))}
                              {allCatalogServices.filter(s => s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase())).length === 0 && (
                                <div className="text-center py-8 text-sm text-muted-foreground">No services found matching search query.</div>
                              )}
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="space-y-3">
                      {services.map((item) => (
                        <div key={item.serviceId} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg bg-background gap-4 shadow-sm">
                          <div className="flex items-center gap-3">
                            {item.imageUrl && (
                              <AppImage src={item.imageUrl} alt={item.name} width={40} height={40} className="rounded-md object-cover h-10 w-10 shrink-0" />
                            )}
                            <div className="space-y-0.5">
                              <div className="font-bold text-sm leading-tight">{item.name}</div>
                              <div className="text-xs text-muted-foreground">{formatCurrency(item.pricePerUnit, symbol, decimals, code)} per unit</div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 self-end sm:self-auto">
                            <div className="flex items-center border rounded-lg p-0.5 h-8 bg-muted/20">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-md"
                                onClick={() => handleQuantityChange(item.serviceId, -1)}
                              >
                                -
                              </Button>
                              <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 rounded-md"
                                onClick={() => handleQuantityChange(item.serviceId, 1)}
                              >
                                +
                              </Button>
                            </div>
                            <div className="text-sm font-bold min-w-[70px] text-right">
                              {formatCurrency(item.pricePerUnit * item.quantity, symbol, decimals, code)}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleRemoveService(item.serviceId)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {services.length === 0 && (
                        <div className="text-center py-6 text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg font-medium">
                          No services added. You must add at least one service.
                        </div>
                      )}
                    </div>

                    {/* Summary Display */}
                    {services.length > 0 && (
                      <div className="mt-4 border-t pt-4 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Services Subtotal:</span>
                          <span className="font-bold">{formatCurrency(summary.itemTotal, symbol, decimals, code)}</span>
                        </div>
                        {summary.visitingCharge > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Visiting Charge:</span>
                            <span className="font-bold">{formatCurrency(summary.visitingCharge, symbol, decimals, code)}</span>
                          </div>
                        )}
                        {summary.appliedPlatformFees.map((fee: any, idx: number) => (
                          <div key={idx} className="flex justify-between">
                            <span className="text-muted-foreground">{fee.name}:</span>
                            <span className="font-bold">{formatCurrency(fee.calculatedFeeAmount + fee.taxAmountOnFee, symbol, decimals, code)}</span>
                          </div>
                        ))}
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Taxes Applied:</span>
                          <span className="font-bold">{formatCurrency(summary.taxTotal, symbol, decimals, code)}</span>
                        </div>
                        {summary.discountAmount > 0 && (
                          <div className="flex justify-between text-red-500 font-bold">
                            <span>Promo Discount ({booking?.discountCode}):</span>
                            <span>-{formatCurrency(summary.discountAmount, symbol, decimals, code)}</span>
                          </div>
                        )}
                        <Separator />
                        <div className="flex justify-between text-sm font-bold text-primary pt-1">
                          <span>Grand Total:</span>
                          <span>{formatCurrency(summary.grandTotal, symbol, decimals, code)}</span>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Schedule & Status */}
                  <section className="space-y-4 p-4 border rounded-xl bg-muted/5 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" /> Schedule & Status
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                      <FormField
                        control={form.control}
                        name="scheduledDate"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel className="text-xs font-bold mb-2">Scheduled Date</FormLabel>
                            <Calendar
                              mode="single"
                              selected={calendarDate}
                              onSelect={handleCalendarSelect}
                              className="rounded-xl border p-3 self-center sm:self-start bg-background shadow-sm"
                              disabled={(date) => date < new Date(new Date().setDate(new Date().getDate() - 1))}
                            />
                            <Input type="hidden" {...field} />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="scheduledTimeSlot"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="text-xs font-bold mb-2">Scheduled Time Slot</FormLabel>
                              <Dialog open={isTimeSlotPickerOpen} onOpenChange={setIsTimeSlotPickerOpen}>
                                <Button
                                  variant="outline"
                                  className={cn("w-full justify-between text-left font-normal h-9", !field.value && "text-muted-foreground")}
                                  disabled={isSubmitting}
                                  type="button"
                                  onClick={() => setIsTimeSlotPickerOpen(true)}
                                >
                                  {field.value || "Select time slot..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                                <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px] rounded-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Select Time Slot</DialogTitle>
                                    <DialogDescription>Choose a preferred time slot for the booking.</DialogDescription>
                                  </DialogHeader>
                                  <div className="py-4">
                                    <ScrollArea className="h-[250px] rounded-xl border p-2 bg-background">
                                      <div className="space-y-1">
                                        {allTimeSlots.map((slot) => (
                                          <Button
                                            key={slot}
                                            variant={field.value === slot ? "secondary" : "ghost"}
                                            className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                            onClick={() => {
                                              field.onChange(slot);
                                              setIsTimeSlotPickerOpen(false);
                                            }}
                                            type="button"
                                          >
                                            <span className="text-sm font-medium">{slot}</span>
                                            {field.value === slot && (
                                              <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                            )}
                                          </Button>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="status"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="text-xs font-bold mb-2">Booking Status</FormLabel>
                              <Dialog open={isStatusPickerOpen} onOpenChange={setIsStatusPickerOpen}>
                                <Button
                                  variant="outline"
                                  className={cn("w-full justify-between text-left font-normal h-9", !field.value && "text-muted-foreground")}
                                  disabled={isSubmitting}
                                  type="button"
                                  onClick={() => setIsStatusPickerOpen(true)}
                                >
                                  {field.value || "Select status..."}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                                <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px] rounded-2xl">
                                  <DialogHeader>
                                    <DialogTitle>Select Booking Status</DialogTitle>
                                    <DialogDescription>Update the current status of this booking.</DialogDescription>
                                  </DialogHeader>
                                  <div className="py-4">
                                    <ScrollArea className="h-[300px] rounded-xl border p-2 bg-background">
                                      <div className="space-y-1">
                                        {statusOptions.map((s) => (
                                          <Button
                                            key={s}
                                            variant={field.value === s ? "secondary" : "ghost"}
                                            className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                            onClick={() => {
                                              field.onChange(s);
                                              setIsStatusPickerOpen(false);
                                              if (s === 'Rescheduled' && booking) {
                                                setIsRescheduleDialogOpen(true);
                                              }
                                            }}
                                            type="button"
                                          >
                                            <span className="text-sm font-medium">{s}</span>
                                            {field.value === s && (
                                              <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                            )}
                                          </Button>
                                        ))}
                                      </div>
                                    </ScrollArea>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="w-full border-dashed h-9 text-xs font-bold"
                          onClick={() => setIsRescheduleDialogOpen(true)}
                        >
                          <CalendarDays className="mr-2 h-4 w-4" /> Check Availability & Rescheduled
                        </Button>
                      </div>
                    </div>
                  </section>

                  {/* Notes */}
                  <section className="space-y-4 p-4 border rounded-xl bg-muted/5 shadow-sm">
                    <h3 className="text-sm font-black text-primary uppercase tracking-wider">Notes</h3>
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-bold">Customer Notes (Optional)</FormLabel>
                          <FormControl><Textarea rows={3} placeholder="Any special instructions or notes..." {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </section>
                </div>
              </div>

              <DialogFooter className="p-4 border-t bg-muted/20 flex gap-2 shrink-0 justify-end">
                <Button type="button" variant="outline" className="h-9 text-xs font-bold" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" className="h-9 text-xs font-bold bg-primary text-primary-foreground" disabled={isSubmitting}>
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>

      {booking && (
        <RescheduleBookingDialog 
          isOpen={isRescheduleDialogOpen} 
          onClose={() => setIsRescheduleDialogOpen(false)} 
          booking={booking} 
          onRescheduleComplete={handleRescheduleConfirm} 
        />
      )}
    </Dialog>
  );
}
