"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { ChevronDown } from "lucide-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CalendarIcon, Loader2, Send, UploadCloud, XIcon, Check, MapPin, PlusCircle } from "lucide-react";
import type { FirestoreCategory, CustomServiceRequest, FirestoreNotification, Address, ServiceZone } from "@/types/firestore";
import { db, storage } from "@/lib/firebase";
import { triggerPushNotification } from "@/lib/fcmUtils";
import { collection, addDoc, Timestamp, query, where, getDocs, limit, doc, updateDoc, arrayUnion } from '@/lib/mysqlDb';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from '@/lib/mysqlStorage';
import dynamic from 'next/dynamic';
import AddressForm, { type AddressFormData } from '@/components/forms/AddressForm';

const MapAddressSelector = dynamic(() => import('@/components/checkout/MapAddressSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false,
});
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import Image from "next/image";
import { nanoid } from "nanoid";
import { cn, formatDateInTimezone } from "@/lib/utils";
import { sendNewCustomServiceRequestEmail, type NewCustomServiceRequestEmailInput } from "@/ai/flows/sendNewCustomServiceRequestEmailFlow";
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { getBaseUrl } from "@/lib/config";
import { ADMIN_EMAIL } from "@/contexts/AuthContext";
import { Progress } from "../ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useGlobalSettings } from "@/hooks/useGlobalSettings"; // Import useGlobalSettings
import { compressImage } from "@/lib/imageCompressor";

const OTHER_CATEGORY_VALUE = "__OTHER__";

const formSchema = z
  .object({
    serviceTitle: z.string().min(5, "Title must be at least 5 characters.").max(150),
    description: z.string().min(20, "Please provide a more detailed description.").max(1500),
    categoryId: z.string({ required_error: "Please select a category or 'Other'." }),
    customCategory: z.string().max(100).optional(),
    minBudget: z.coerce
      .number({
        required_error: "Please enter a minimum budget.",
        invalid_type_error: "Please enter a valid minimum budget.",
      })
      .min(500, "Minimum budget must be at least 500."),
    maxBudget: z.coerce
      .number({
        required_error: "Please enter a maximum budget.",
        invalid_type_error: "Please enter a valid maximum budget.",
      })
      .min(500, "Maximum budget must be at least 500."),
    preferredStartDate: z.date({ required_error: "Please select a preferred start date." }),
  })
  .refine(
    (data) =>
      data.categoryId !== OTHER_CATEGORY_VALUE ||
      (data.categoryId === OTHER_CATEGORY_VALUE &&
        !!data.customCategory &&
        data.customCategory.trim().length > 2),
    {
      message: "Please specify your category name.",
      path: ["customCategory"],
    }
  )
  .refine((data) => data.maxBudget >= data.minBudget, {
    message: "Max budget must be greater than or equal to min budget.",
    path: ["maxBudget"],
  });

type CustomServiceRequestFormData = z.infer<typeof formSchema>;

interface CustomServiceRequestFormProps {
  categories: FirestoreCategory[];
  onSaveSuccess: () => void;
  onCancel: () => void;
}

export default function CustomServiceRequestForm({
  categories,
  onSaveSuccess,
  onCancel,
}: CustomServiceRequestFormProps) {
  const { toast } = useToast();
  const { user, firestoreUser } = useAuth();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const { settings: globalSettings } = useGlobalSettings();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number[]>([]);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);

  const form = useForm<CustomServiceRequestFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      serviceTitle: "",
      description: "",
      categoryId: undefined,
      customCategory: "",
      minBudget: undefined,
      maxBudget: undefined,
      preferredStartDate: undefined,
    },
  });

  const watchedCategoryId = form.watch("categoryId");

  // Address States
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [initialMapCenter, setInitialMapCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Partial<Address> | null>(null);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [serviceZones, setServiceZones] = useState<ServiceZone[]>([]);

  // Load service zones
  useEffect(() => {
    const fetchZones = async () => {
      try {
        const zonesQuery = query(collection(db, 'serviceZones'), where('isActive', '==', true));
        const snapshot = await getDocs(zonesQuery);
        setServiceZones(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ServiceZone)));
      } catch (error) {
        console.error("Error fetching service zones for custom request form:", error);
      }
    };
    fetchZones();
  }, []);

  // Load user default address on load
  useEffect(() => {
    if (firestoreUser?.addresses && firestoreUser.addresses.length > 0) {
      const defaultAddr = firestoreUser.addresses.find(a => a.isDefault);
      setSelectedAddressId(defaultAddr ? defaultAddr.id : firestoreUser.addresses[0].id);
    }
  }, [firestoreUser]);

  // Geo locate coordinates to center the map selector
  const handleOpenMapForNewAddress = useCallback(async () => {
    setEditingAddress(null);
    setIsLocating(true);
    try {
      if (!navigator.geolocation) {
        setInitialMapCenter(null);
        setIsMapModalOpen(true);
        setIsLocating(false);
        return;
      }
      const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
      if (permissionStatus.state === 'granted' || permissionStatus.state === 'prompt') {
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
          }
        );
      } else {
        setInitialMapCenter(null);
        setIsLocating(false);
        setIsMapModalOpen(true);
      }
    } catch (e) {
      setInitialMapCenter(null);
      setIsLocating(false);
      setIsMapModalOpen(true);
    }
  }, []);

  const handleMapAddressSelect = useCallback((addressData: Partial<AddressFormData>) => {
    setEditingAddress(prev => ({
      ...prev,
      ...addressData,
      fullName: firestoreUser?.displayName || user?.displayName || "",
      email: firestoreUser?.email || user?.email || "",
      phone: firestoreUser?.mobileNumber || user?.phoneNumber || "",
    }));
    setIsMapModalOpen(false);
    setIsAddressFormOpen(true);
  }, [user, firestoreUser]);

  const handleAddressSubmit = async (data: AddressFormData) => {
    if (!user) return;
    setIsSavingAddress(true);
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const newAddress: Address = { ...data, id: nanoid(), isDefault: !firestoreUser?.addresses || firestoreUser.addresses.length === 0 };
      await updateDoc(userDocRef, { addresses: arrayUnion(newAddress) });
      setSelectedAddressId(newAddress.id);
      setAddressError(null);
      setIsAddressFormOpen(false);
      setEditingAddress(null);
      toast({ title: "Success", description: "Address added successfully." });
    } catch (error) {
      console.error("Error saving address in custom service request:", error);
      toast({ title: "Error", description: "Could not save address.", variant: "destructive" });
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      if (files.length + newFiles.length > 5) {
        toast({
          title: "Upload Limit",
          description: "You can upload a maximum of 5 images.",
          variant: "destructive",
        });
        return;
      }

      // Enforce 50MB limit check
      const oversized = newFiles.filter((file) => file.size > 50 * 1024 * 1024);
      if (oversized.length > 0) {
        toast({
          title: "File Too Large",
          description: "One or more files exceed the 50MB limit.",
          variant: "destructive",
        });
        return;
      }

      try {
        const compressedFiles = await Promise.all(
          newFiles.map((file) => compressImage(file))
        );
        setFiles((prev) => [...prev, ...compressedFiles]);
        const newPreviews = compressedFiles.map((file) => URL.createObjectURL(file));
        setPreviews((prev) => [...prev, ...newPreviews]);
      } catch (err) {
        console.error("Compression failed, uploading original files", err);
        setFiles((prev) => [...prev, ...newFiles]);
        const newPreviews = newFiles.map((file) => URL.createObjectURL(file));
        setPreviews((prev) => [...prev, ...newPreviews]);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeUndefined = (obj: Record<string, any>) =>
    Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));

  const onSubmit = async (data: CustomServiceRequestFormData) => {
    if (!user) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to submit a request.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedAddressId) {
      setAddressError("Please select or add a service address.");
      toast({
        title: "Address Required",
        description: "Please select or add a service address.",
        variant: "destructive",
      });
      return;
    }

    const selectedAddress = firestoreUser?.addresses?.find(a => a.id === selectedAddressId);
    if (!selectedAddress) {
      toast({
        title: "Address Error",
        description: "Selected address could not be found.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    let uploadedImageUrls: string[] = [];

    try {
      if (files.length > 0) {
        const uploadPromises = files.map((file, index) => {
          setUploadProgress((prev) => {
            const newProgress = [...prev];
            newProgress[index] = 0;
            return newProgress;
          });
          const storagePath = `custom_requests/${user.uid}/${nanoid()}_${file.name}`;
          const fileRef = storageRef(storage, storagePath);
          const uploadTask = uploadBytesResumable(fileRef, file);

          return new Promise<string>((resolve, reject) => {
            uploadTask.on(
              "state_changed",
              (snapshot) => {
                const progress =
                  (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress((prev) => {
                  const newProgress = [...prev];
                  newProgress[index] = progress;
                  return newProgress;
                });
              },
              (error) => reject(error),
              async () => {
                try {
                  resolve(await getDownloadURL(uploadTask.snapshot.ref));
                } catch (e) {
                  reject(e);
                }
              }
            );
          });
        });
        uploadedImageUrls = await Promise.all(uploadPromises);
      }

      const category = categories.find((c) => c.id === data.categoryId);

      const requestData: Partial<CustomServiceRequest> = {
        userId: user.uid,
        userName: firestoreUser?.displayName || user.displayName || undefined,
        userEmail: firestoreUser?.email || user.email || undefined,
        userMobile: firestoreUser?.mobileNumber || user.phoneNumber || undefined,
        serviceTitle: data.serviceTitle,
        description: data.description,
        imageUrls: uploadedImageUrls,
        preferredStartDate: Timestamp.fromDate(data.preferredStartDate),
        minBudget: data.minBudget,
        maxBudget: data.maxBudget,
        address: selectedAddress,
      };

      if (data.categoryId !== OTHER_CATEGORY_VALUE) {
        requestData.categoryId = data.categoryId;
        if (category) requestData.categoryName = category.name;
      } else if (data.customCategory) {
        requestData.customCategory = data.customCategory;
      }

      const docRef = await addDoc(collection(db, "customServiceRequests"), removeUndefined({
        ...requestData,
        status: "new",
        submittedAt: Timestamp.now(),
      }));

      toast({
        title: "Request Submitted!",
        description:
          "We have received your custom service request and will get back to you soon.",
        className: "bg-background text-foreground",
      });

      const usersRef = collection(db, "users");
      const adminQuery = query(usersRef, where("email", "==", ADMIN_EMAIL), limit(1));
      const adminSnapshot = await getDocs(adminQuery);
      if (!adminSnapshot.empty) {
        const adminUid = adminSnapshot.docs[0].id;
        const adminNotification: FirestoreNotification = {
          userId: adminUid,
          title: "New Custom Service Request",
          message: `From ${user.displayName || user.email} for: ${data.serviceTitle}`,
          type: "admin_alert",
          href: `/admin/custom-service?id=${docRef.id}`,
          read: false,
          createdAt: Timestamp.now(),
        };
        await addDoc(collection(db, "userNotifications"), adminNotification);

        // Trigger actual Push Notification for admin
        triggerPushNotification({
          userId: adminUid,
          title: adminNotification.title,
          body: adminNotification.message,
          href: adminNotification.href
        });

        if (appConfig.smtpHost && appConfig.senderEmail) {
          const addressText = selectedAddress 
            ? `${selectedAddress.addressLine1}${selectedAddress.addressLine2 ? ', ' + selectedAddress.addressLine2 : ''}, ${selectedAddress.city}, ${selectedAddress.state} - ${selectedAddress.pincode}` 
            : undefined;
          
          const preferredStartDateText = data.preferredStartDate 
            ? formatDateInTimezone(new Date(data.preferredStartDate), appConfig.timezone) 
            : undefined;

          const emailInput: NewCustomServiceRequestEmailInput = {
              requestId: docRef.id,
              serviceTitle: data.serviceTitle,
              userName: requestData.userName || "N/A",
              userEmail: requestData.userEmail || "N/A",
              userMobile: requestData.userMobile || "N/A",
              description: data.description,
              category: category?.name || data.customCategory || "N/A",
              minBudget: requestData.minBudget,
              maxBudget: requestData.maxBudget,
              adminUrl: `${getBaseUrl()}/admin/custom-service?id=${docRef.id}`,
              addressText,
              latitude: selectedAddress?.latitude || null,
              longitude: selectedAddress?.longitude || null,
              preferredStartDateText,
              smtpHost: appConfig.smtpHost,
              smtpPort: appConfig.smtpPort,
              smtpUser: appConfig.smtpUser,
              smtpPass: appConfig.smtpPass,
              senderEmail: appConfig.senderEmail,
              siteName: globalSettings?.websiteName,
              logoUrl: globalSettings?.logoUrl,
              currencySymbol: appConfig.currencySymbol || "₹",
          };
          try { 
              const emailResult = await sendNewCustomServiceRequestEmail(emailInput);
              if (!emailResult.success) {
                  throw new Error(emailResult.message || "Email flow reported failure.");
              }
          } catch (e) { 
              console.error("Failed to send admin notification email for custom request:", e); 
              toast({
                  title: "Email Notification Failed",
                  description: `Your request was submitted, but the admin email notification failed to send. Reason: ${(e as Error).message}`,
                  variant: "destructive",
                  duration: 8000,
              });
          }
        } else {
            console.warn("SMTP configuration missing. Admin email for custom request was not sent.");
        }
      } else {
        console.warn(`Admin user with email ${ADMIN_EMAIL} not found. Cannot send notifications.`);
      }
      // --- End of corrected notification logic ---
      

      form.reset();
      setFiles([]);
      setPreviews([]);
      onSaveSuccess();
    } catch (error) {
      console.error("Error submitting custom request:", error);
      toast({
        title: "Submission Failed",
        description: (error as Error).message || "Could not submit your request.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 p-3">
        {/* Title */}
        <FormField
          control={form.control}
          name="serviceTitle"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Service Title</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Custom Bookshelf Installation"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Description */}
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Describe Your Requirement</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Please provide as much detail as possible..."
                  rows={5}
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Category Popup */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
                  <DialogTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full flex items-center justify-between text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isSubmitting}
                      >
                        <span>
                          {field.value
                            ? categories.find((cat) => cat.id === field.value)?.name ||
                              (field.value === OTHER_CATEGORY_VALUE && "Other")
                            : "Select a relevant category"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                      </Button>
                    </FormControl>
                  </DialogTrigger>
                  <DialogContent className="p-0 max-w-sm">
                    <DialogHeader className="p-4 border-b">
                      <DialogTitle>Select a Category</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[80vh]">
                      <div className="p-2">
                        {categories.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => {
                              field.onChange(c.id);
                              setIsCategoryDialogOpen(false);
                            }}
                            className="flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer"
                          >
                            <span>{c.name}</span>
                            {field.value === c.id && <Check className="h-4 w-4" />}
                          </div>
                        ))}
                        <div
                          onClick={() => {
                            field.onChange(OTHER_CATEGORY_VALUE);
                            setIsCategoryDialogOpen(false);
                          }}
                          className="flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer"
                        >
                          <span>Other</span>
                          {field.value === OTHER_CATEGORY_VALUE && <Check className="h-4 w-4" />}
                        </div>
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
                <FormMessage />
              </FormItem>
            )}
          />
          {watchedCategoryId === OTHER_CATEGORY_VALUE && (
            <FormField
              control={form.control}
              name="customCategory"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specify Other Category</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Metal Fabrication"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>

        {/* Budgets */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="minBudget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Min. Budget ({symbol}) <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="e.g., 5000"
                    {...field}
                    value={field.value ?? ""}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="maxBudget"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Max. Budget ({symbol}) <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="e.g., 10000"
                    {...field}
                    value={field.value ?? ""}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Calendar Popup */}
        <FormField
          control={form.control}
          name="preferredStartDate"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Preferred Start Date</FormLabel>
              <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                <DialogTrigger asChild>
                  <FormControl>
                    <Button
                      variant={"outline"}
                      className={cn(
                        "w-[240px] pl-3 text-left font-normal",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={isSubmitting}
                    >
                      {field.value
                        ? formatDateInTimezone(new Date(field.value), 'Asia/Kolkata')
                        : "Pick a date"}
                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button>
                  </FormControl>
                </DialogTrigger>
                <DialogContent className="w-auto p-2 pt-8">
                  <VisuallyHidden>
                    <DialogTitle>Select a Date</DialogTitle>
                  </VisuallyHidden>
                  <Calendar
                    mode="single"
                    selected={field.value}
                    onSelect={(date) => {
                      field.onChange(date);
                      setIsCalendarOpen(false);
                    }}
                    disabled={(date) => date <= new Date()}
                    initialFocus
                  />
                </DialogContent>
              </Dialog>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Service Address Selection */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <FormLabel className="text-sm font-medium text-foreground flex items-center gap-1">
              Service Address <span className="text-destructive">*</span>
            </FormLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenMapForNewAddress}
              disabled={isLocating || isSavingAddress || isSubmitting}
            >
              {isLocating ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="mr-2 h-3.5 w-3.5" />}
              Add New Address
            </Button>
          </div>

          {firestoreUser?.addresses && firestoreUser.addresses.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
              {firestoreUser.addresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                return (
                  <div
                    key={addr.id}
                    onClick={() => {
                      if (!isSubmitting) {
                        setSelectedAddressId(addr.id);
                        setAddressError(null);
                      }
                    }}
                    className={cn(
                      "p-3 border rounded-lg cursor-pointer transition-all hover:bg-muted/50 relative flex flex-col justify-between text-left",
                      isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input"
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{addr.fullName}</span>
                        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{addr.phone}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {addr.addressLine1}{addr.addressLine2 ? `, ${addr.addressLine2}` : ''}, {addr.city}, {addr.state} - {addr.pincode}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-6 border border-dashed rounded-lg bg-muted/20">
              <MapPin className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-xs text-muted-foreground">No addresses saved. Please add a new service address.</p>
            </div>
          )}
          {addressError && (
            <p className="text-sm font-medium text-destructive mt-1">
              {addressError}
            </p>
          )}
        </div>

        {/* Image Upload */}
        <div>
          <FormLabel>Reference Photos (Optional, up to 5)</FormLabel>
          <FormControl>
            <div className="mt-2 flex items-center justify-center w-full">
              <label
                htmlFor="file-upload"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-muted/50 hover:bg-muted/80"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="mb-1 text-sm text-muted-foreground">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, WEBP (MAX 50MB each)
                  </p>
                </div>
                <Input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  multiple
                  onChange={handleFileChange}
                  accept="image/*"
                  disabled={isSubmitting}
                />
              </label>
            </div>
          </FormControl>
          {previews.length > 0 && (
            <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-2">
              {previews.map((preview, index) => (
                <div key={index} className="relative group">
                  <Image
                    src={preview}
                    alt={`preview ${index}`}
                    width={100}
                    height={100}
                    className="rounded-md object-cover aspect-square"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removeFile(index)}
                    disabled={isSubmitting}
                  >
                    <XIcon className="h-3 w-3" />
                  </Button>
                  {uploadProgress[index] !== undefined && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-md">
                      <Progress value={uploadProgress[index]} className="h-1 w-10/12" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Submit Request
          </Button>
        </div>
      </form>

      <Dialog open={isMapModalOpen} onOpenChange={setIsMapModalOpen}>
        <DialogContent 
          className="max-w-3xl w-[95vw] h-[90vh] p-0 flex flex-col"
          onPointerDownOutside={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.pac-container')) {
              e.preventDefault();
            }
          }}
        >
          <DialogHeader className="p-3 border-b">
            <DialogTitle>Locate on Google Maps</DialogTitle>
          </DialogHeader>
            {appConfig?.googleMapsApiKey ? (
              <MapAddressSelector 
                apiKey={appConfig.googleMapsApiKey} 
                onAddressSelect={handleMapAddressSelect}
                onClose={() => setIsMapModalOpen(false)}
                initialCenter={initialMapCenter}
                serviceZones={serviceZones}
              />
            ) : (
              <div className="flex items-center justify-center h-full"><Loader2 className="h-8 w-8 animate-spin" /></div>
            )}
        </DialogContent>
      </Dialog>

      {/* Address Form Dialog */}
      <Dialog open={isAddressFormOpen} onOpenChange={setIsAddressFormOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Complete Address Details</DialogTitle>
          </DialogHeader>
          <AddressForm 
            initialData={editingAddress}
            onSubmit={handleAddressSubmit}
            onCancel={() => { setIsAddressFormOpen(false); setEditingAddress(null); }}
            isSubmitting={isSavingAddress}
            submitButtonText="Save Address"
          />
        </DialogContent>
      </Dialog>
    </Form>
  );
}
