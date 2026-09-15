
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { HomepageAd, AdActionType, AdPlacement, FirestoreCategory, FirestoreService } from '@/types/firestore';
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Loader2, Image as ImageIconLucide, Trash2, ExternalLink, ListChecks, ShoppingBag, Search, Tags, CheckCircle, Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase'; // Assuming firebase.ts exports storage
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { Progress } from "@/components/ui/progress";
import { nanoid } from 'nanoid'; // Import nanoid
import { compressImage } from "@/lib/imageCompressor";

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.trim().length > 0;
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const adActionTypes: [string, ...string[]] = ['url', 'category', 'service'];
const adPlacements: [string, ...string[]] = [
    'AFTER_HERO_CAROUSEL', 'AFTER_POPULAR_SERVICES', 'AFTER_RECENTLY_ADDED_SERVICES', 'AFTER_CATEGORY_SECTIONS', 'BEFORE_FOOTER_CTA'
];

const isValidUrlOrRelativePath = (val?: string) => {
  if (!val || val.trim() === '') return true;
  const s = val.trim();
  return s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('uploads/') || s.startsWith('data:') || s.startsWith('blob:');
};

const adFormSchema = z.object({
  name: z.string().min(2, "Ad name is required.").max(100, "Name too long."),
  imageUrl: z.string().refine(isValidUrlOrRelativePath, { message: "Must be a valid URL or relative path if provided." }).optional().or(z.literal('')),
  imageHint: z.string().max(50, "Image hint max 50 chars.").optional().or(z.literal('')),
  actionType: z.enum(adActionTypes, { required_error: "Action type is required."}),
  targetValue: z.string().min(1, "Target value is required."),
  placement: z.enum(adPlacements, { required_error: "Placement is required."}),
  order: z.coerce.number().min(0, "Order must be non-negative.").default(0),
  isActive: z.boolean().default(true),
});

export type AdFormData = z.infer<typeof adFormSchema>;

interface AdFormProps {
  onSubmit: (data: AdFormData, adId?: string) => Promise<void>; // Pass adId if editing
  initialData?: HomepageAd | null;
  onCancel: () => void;
  allCategories: FirestoreCategory[];
  allServices: FirestoreService[];
  isSubmitting?: boolean;
}

export default function AdForm({ onSubmit: onSubmitProp, initialData, onCancel, allCategories, allServices, isSubmitting: isParentSubmitting = false }: AdFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);
  
  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const form = useForm<AdFormData>({
    resolver: zodResolver(adFormSchema),
    defaultValues: initialData ? 
      { ...initialData, targetValue: initialData.targetValue || "" } : 
      { name: "", imageUrl: "", imageHint: "", actionType: "url", targetValue: "", placement: "AFTER_HERO_CAROUSEL", order: 0, isActive: true },
  });

  const watchedActionType = form.watch("actionType");

  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [isActionTypePickerOpen, setIsActionTypePickerOpen] = useState(false);
  const [isPlacementPickerOpen, setIsPlacementPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  const watchedTargetValue = form.watch("targetValue");

  const selectedCategory = useMemo(() => {
    return allCategories.find(c => c.slug === watchedTargetValue);
  }, [allCategories, watchedTargetValue]);

  const selectedService = useMemo(() => {
    return allServices.find(s => s.slug === watchedTargetValue);
  }, [allServices, watchedTargetValue]);

  const searchableCategories = useMemo(() => {
    return allCategories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()));
  }, [allCategories, categorySearch]);

  const searchableServices = useMemo(() => {
    return allServices.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
  }, [allServices, serviceSearch]);

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        actionType: initialData.actionType,
        targetValue: initialData.targetValue || "",
        placement: initialData.placement,
        order: initialData.order,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({ name: "", imageUrl: "", imageHint: "", actionType: "url", targetValue: "", placement: "AFTER_HERO_CAROUSEL", order: 0, isActive: true });
      setCurrentImagePreview(null); setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null); setUploadProgress(null); setIsFormBusyForImage(false); setStatusMessage("");
    setIsCategoryPickerOpen(false);
    setCategorySearch("");
    setIsServicePickerOpen(false);
    setServiceSearch("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [initialData, form]);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        toast({ title: "File Too Large", description: "Image must be < 50MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null); setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
        return;
      }
      let fileToSet = file;
      try {
        fileToSet = await compressImage(file);
      } catch (err) {
        console.error("Compression failed", err);
      }
      setSelectedFile(fileToSet); setCurrentImagePreview(URL.createObjectURL(fileToSet));
      form.setValue('imageUrl', '', { shouldValidate: false }); // Clear URL if file selected
    } else {
      setSelectedFile(null); setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
    }
  };

  const handleRemoveImage = () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) URL.revokeObjectURL(currentImagePreview);
    setSelectedFile(null); setCurrentImagePreview(null);
    form.setValue('imageUrl', '', { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (formData: AdFormData) => {
    setIsFormBusyForImage(true);
    let finalImageUrl = formData.imageUrl || "";

    try {
      if (selectedFile) {
        setStatusMessage("Uploading image..."); setUploadProgress(0);
        if (originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
          try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); }
          catch (error) { console.warn("Error deleting old ad image:", error); }
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `ad_${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/ads/${fileName}`;
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);
        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => { const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100; setUploadProgress(p); setStatusMessage(`Uploading: ${Math.round(p)}%`); },
            (error) => { console.error("Upload error:", error); reject(new Error(`Upload failed: ${error.message}`)); },
            async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(new Error(`URL failed: ${(e as Error).message}`)); } }
          );
        });
        setUploadProgress(100); setStatusMessage("Image uploaded. Saving ad...");
      } else if (!formData.imageUrl && originalImageUrlFromInitialData && isFirebaseStorageUrl(originalImageUrlFromInitialData)) {
        setStatusMessage("Removing image...");
        try { await deleteObject(storageRef(storage, originalImageUrlFromInitialData)); finalImageUrl = ""; setStatusMessage("Image removed. Saving ad..."); }
        catch (e: any) { throw new Error(`Failed to delete image: ${e.message}. Ad not saved.`); }
      } else { setStatusMessage(initialData ? "Saving changes..." : "Creating ad..."); }

      if (!finalImageUrl) {
        form.setError("imageUrl", { type: "manual", message: "An image URL or uploaded file is required." });
        setIsFormBusyForImage(false); setStatusMessage(""); toast({title: "Image Required", variant: "destructive"}); return;
      }

      await onSubmitProp({ ...formData, imageUrl: finalImageUrl }, initialData?.id);
      setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Ad form submission/image error:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save ad.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false); setStatusMessage(""); setUploadProgress(null);
    }
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-4 p-3 overflow-y-auto">
        <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Ad Name (Internal)</FormLabel><FormControl><Input placeholder="e.g., Summer Sale Banner" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)} />
        <FormItem>
          <FormLabel>Ad Image <span className="text-destructive">*</span></FormLabel>
          {displayPreviewUrl ? (<div className="my-2 relative w-full h-32 rounded-md overflow-hidden border bg-muted/10"><NextImage src={displayPreviewUrl} alt="Ad preview" fill className="object-contain" data-ai-hint={form.watch('imageHint') || "advertisement banner"} unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/></div>) : (<div className="my-2 flex items-center justify-center w-full h-32 rounded-md border border-dashed bg-muted/10"><ImageIconLucide className="h-10 w-10 text-muted-foreground" /></div>)}
          <FormControl><Input type="file" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleFileSelected} disabled={effectiveIsSubmitting} ref={fileInputRef} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"/></FormControl>
          <FormDescription className="mt-1">Upload (PNG, JPG, GIF, WEBP, max 50MB).</FormDescription>
          {uploadProgress !== null && selectedFile && (<div className="mt-2"><Progress value={uploadProgress} className="w-full h-2" />{statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}</div>)}
        </FormItem>
        <FormField control={form.control} name="imageUrl" render={({ field }) => (<FormItem><FormLabel>Or Image URL <span className="text-destructive">*</span></FormLabel><div className="flex items-center gap-2"><FormControl className="flex-grow"><Textarea placeholder="https://example.com/ad.png" {...field} disabled={effectiveIsSubmitting || !!selectedFile} rows={2} onChange={(e) => { field.onChange(e); if (!selectedFile) setCurrentImagePreview(e.target.value || null); }}/></FormControl>{(field.value || selectedFile || currentImagePreview) && (<Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} aria-label="Clear image"><Trash2 className="h-4 w-4 text-destructive"/></Button>)}</div><FormDescription>Required if no file uploaded.</FormDescription><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image AI Hint</FormLabel><FormControl><Input placeholder="e.g., summer sale offer" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>)}/>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="actionType" render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="mb-2">Action Type</FormLabel>
              <Dialog open={isActionTypePickerOpen} onOpenChange={setIsActionTypePickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between text-left font-normal h-10",
                      !field.value && "text-muted-foreground"
                    )}
                    disabled={effectiveIsSubmitting}
                    type="button"
                  >
                    {field.value ? field.value.charAt(0).toUpperCase() + field.value.slice(1) : "Select action"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Action Type</DialogTitle>
                    <DialogDescription>
                      Choose the action triggered when clicking the ad.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <ScrollArea className="h-[200px] rounded-md border p-2">
                      <div className="space-y-1">
                        {adActionTypes.map((type) => (
                          <Button
                            key={type}
                            variant={field.value === type ? "secondary" : "ghost"}
                            className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                            onClick={() => {
                              field.onChange(type as AdActionType);
                              form.setValue('targetValue', '');
                              setIsActionTypePickerOpen(false);
                            }}
                            type="button"
                          >
                            <span className="text-sm font-medium">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                            {field.value === type && (
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
          )}/>
          <FormField control={form.control} name="targetValue" render={({ field }) => (
            <FormItem>
              <FormLabel>Target Value <span className="text-destructive">*</span>
                {watchedActionType === 'category' && <ListChecks className="inline ml-1 h-3 w-3 text-muted-foreground"/>}
                {watchedActionType === 'service' && <ShoppingBag className="inline ml-1 h-3 w-3 text-muted-foreground"/>}
                {watchedActionType === 'url' && <ExternalLink className="inline ml-1 h-3 w-3 text-muted-foreground"/>}
              </FormLabel>
              {watchedActionType === 'url' && <FormControl><Input placeholder="https://example.com/target" {...field} disabled={effectiveIsSubmitting} /></FormControl>}
              {watchedActionType === 'category' && (
                <Dialog open={isCategoryPickerOpen} onOpenChange={setIsCategoryPickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between text-left font-normal h-10",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={effectiveIsSubmitting || allCategories.length === 0}
                      type="button"
                    >
                      {selectedCategory ? (
                        <div className="flex items-center gap-2">
                          <ListChecks className="h-4 w-4 text-primary" />
                          <span>{selectedCategory.name}</span>
                        </div>
                      ) : (
                        "Search and select category..."
                      )}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Select Category</DialogTitle>
                      <DialogDescription>
                        Search and select a target category for this ad.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Type category name..."
                          className="pl-8"
                          value={categorySearch}
                          onChange={(e) => setCategorySearch(e.target.value)}
                        />
                      </div>
                      <ScrollArea className="h-[300px] rounded-md border p-2">
                        <div className="space-y-1">
                          {searchableCategories.length === 0 ? (
                            <p className="text-center py-4 text-sm text-muted-foreground">No categories found.</p>
                          ) : (
                            searchableCategories.map((cat) => (
                              <Button
                                key={cat.id}
                                variant={field.value === cat.slug ? "secondary" : "ghost"}
                                className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                onClick={() => {
                                  field.onChange(cat.slug);
                                  setIsCategoryPickerOpen(false);
                                  setCategorySearch("");
                                }}
                                type="button"
                              >
                                <div className="flex items-center gap-2 pr-8">
                                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-semibold text-sm">{cat.name}</span>
                                </div>
                                {field.value === cat.slug && (
                                  <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                )}
                              </Button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {watchedActionType === 'service' && (
                <Dialog open={isServicePickerOpen} onOpenChange={setIsServicePickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between text-left font-normal h-10",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={effectiveIsSubmitting || allServices.length === 0}
                      type="button"
                    >
                      {selectedService ? (
                        <div className="flex items-center gap-2">
                          <ShoppingBag className="h-4 w-4 text-primary" />
                          <span>{selectedService.name}</span>
                        </div>
                      ) : (
                        "Search and select service..."
                      )}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Select Service</DialogTitle>
                      <DialogDescription>
                        Search and select a target service for this ad.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Type service name..."
                          className="pl-8"
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                        />
                      </div>
                      <ScrollArea className="h-[300px] rounded-md border p-2">
                        <div className="space-y-1">
                          {searchableServices.length === 0 ? (
                            <p className="text-center py-4 text-sm text-muted-foreground">No services found.</p>
                          ) : (
                            searchableServices.map((serv) => (
                              <Button
                                key={serv.id}
                                variant={field.value === serv.slug ? "secondary" : "ghost"}
                                className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                onClick={() => {
                                  field.onChange(serv.slug);
                                  setIsServicePickerOpen(false);
                                  setServiceSearch("");
                                }}
                                type="button"
                              >
                                <div className="flex items-center gap-2 pr-8">
                                  <ShoppingBag className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-semibold text-sm">{serv.name}</span>
                                </div>
                                {field.value === serv.slug && (
                                  <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                )}
                              </Button>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              <FormMessage />
            </FormItem>
          )}/>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField control={form.control} name="placement" render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="mb-2">Placement</FormLabel>
                <Dialog open={isPlacementPickerOpen} onOpenChange={setIsPlacementPickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between text-left font-normal h-10",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={effectiveIsSubmitting}
                      type="button"
                    >
                      {field.value ? field.value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) : "Select placement"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Select Placement</DialogTitle>
                      <DialogDescription>
                        Choose where the ad will be placed on the home page.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <ScrollArea className="h-[200px] rounded-md border p-2">
                        <div className="space-y-1">
                          {adPlacements.map((place) => (
                            <Button
                              key={place}
                              variant={field.value === place ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                              onClick={() => {
                                field.onChange(place as AdPlacement);
                                setIsPlacementPickerOpen(false);
                              }}
                              type="button"
                            >
                              <span className="text-sm font-medium">
                                {place.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                              {field.value === place && (
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
            )}/>
            <FormField control={form.control} name="order" render={({ field }) => (<FormItem><FormLabel>Order</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>Sort order within the same placement.</FormDescription><FormMessage /></FormItem>)}/>
        </div>
        <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Ad Active</FormLabel><FormDescription>Enable this ad to be shown.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)}/>
        
        <div className="p-3 border-t sticky bottom-0 bg-background flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button>
          <Button type="submit" disabled={effectiveIsSubmitting}>
            {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Ad')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
