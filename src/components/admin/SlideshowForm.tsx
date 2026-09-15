
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import type { FirestoreSlide, SlideButtonLinkType, FirestoreCategory, FirestoreSubCategory, FirestoreService } from "@/types/firestore";
import { useEffect, useState, useRef } from "react";
import { Loader2, Image as ImageIconLucide, Trash2, Check, ChevronsUpDown, Search } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { Progress } from "@/components/ui/progress";
import { compressImage } from "@/lib/imageCompressor";

const slideFormSchema = z.object({
  title: z.string().max(100, "Title too long.").optional().or(z.literal('')),
  description: z.string().max(250, "Description too long.").optional().or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
  imageHint: z.string().max(50, "Image hint max 50 characters.").optional().or(z.literal('')),
  order: z.coerce.number().min(0, "Order must be non-negative."),
  buttonText: z.string().max(30, "Button text too long.").optional().or(z.literal('')),
  buttonLinkType: z.enum(['category', 'subcategory', 'service', 'url']).optional().nullable(), // Allow null for reset
  buttonLinkValue: z.string().max(255, "Link value is too long.").optional().or(z.literal('')),
  isActive: z.boolean().default(true),
}).refine(data => {
  if (data.buttonText && data.buttonText.trim() !== "") {
    return !!data.buttonLinkType && !!(data.buttonLinkValue && data.buttonLinkValue.trim() !== "");
  }
  return true;
}, {
  message: "If Button Text is present, Link Type and Link Value are required.",
  path: ["buttonLinkValue"],
});

type SlideFormData = z.infer<typeof slideFormSchema>;

interface SlideshowFormProps {
  onSubmit: (data: Omit<FirestoreSlide, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreSlide | null;
  onCancel: () => void;
  categories: FirestoreCategory[];
  subCategories: FirestoreSubCategory[];
  services: FirestoreService[];
  isSubmitting?: boolean;
}

const isFirebaseStorageUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.trim().length > 0;
};

const generateRandomHexString = (length: number) => {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/')) {
        try {
            if (url.startsWith('http:') || url.startsWith('https:')) {
                new URL(url);
            }
            return true;
        } catch (e) {
            return false;
        }
    }
    return false;
};

export default function SlideshowForm({
  onSubmit: onSubmitProp,
  initialData,
  onCancel,
  categories,
  subCategories,
  services,
  isSubmitting: isParentSubmitting = false,
}: SlideshowFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);

  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isLinkTypePickerOpen, setIsLinkTypePickerOpen] = useState(false);
  const [isValuePickerOpen, setIsValuePickerOpen] = useState(false);
  const [valueSearch, setValueSearch] = useState("");

  const form = useForm<SlideFormData>({
    resolver: zodResolver(slideFormSchema),
    defaultValues: {
      title: "",
      description: "",
      imageUrl: "",
      imageHint: "",
      order: 0,
      buttonText: "",
      buttonLinkType: undefined,
      buttonLinkValue: "",
      isActive: true,
    },
  });

  const watchedLinkType = form.watch("buttonLinkType");
  const watchedButtonText = form.watch("buttonText");

  useEffect(() => {
    if (!isValuePickerOpen) {
      setValueSearch("");
    }
  }, [isValuePickerOpen]);

  useEffect(() => {
    if (initialData) {
      form.reset({
        title: initialData.title || "",
        description: initialData.description || "",
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        order: initialData.order,
        buttonText: initialData.buttonText || "",
        buttonLinkType: initialData.buttonLinkType === null ? undefined : initialData.buttonLinkType, // Map null to undefined
        buttonLinkValue: initialData.buttonLinkValue || "",
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({
        title: "", description: "", imageUrl: "", imageHint: "", order: 0,
        buttonText: "", buttonLinkType: undefined, buttonLinkValue: "", isActive: true,
      });
      setCurrentImagePreview(null);
      setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null);
    setUploadProgress(null);
    setIsFormBusyForImage(false);
    setStatusMessage("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialData, form]);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Select image smaller than 50MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null);
        setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
        return;
      }
      let fileToSet = file;
      try {
        fileToSet = await compressImage(file);
      } catch (err) {
        console.error("Compression failed", err);
      }
      setSelectedFile(fileToSet);
      setCurrentImagePreview(URL.createObjectURL(fileToSet));
      form.setValue('imageUrl', '', { shouldValidate: false });
      form.clearErrors("imageUrl");
    } else {
      setSelectedFile(null);
      setCurrentImagePreview(form.getValues('imageUrl') || originalImageUrlFromInitialData || null);
    }
  };

  const handleRemoveImage = async () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) {
      URL.revokeObjectURL(currentImagePreview);
    }
    setSelectedFile(null);
    setCurrentImagePreview(null);
    form.setValue('imageUrl', '', { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
    form.clearErrors("imageUrl");
  };

  const handleSubmit = async (formData: SlideFormData) => {
    setIsFormBusyForImage(true);
    let finalImageUrl = formData.imageUrl || "";

    try {
      if (selectedFile) {
        setStatusMessage("Uploading image...");
        setUploadProgress(0);
        if (originalImageUrlFromInitialData) {
          try {
            const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
            await deleteObject(oldImageRef);
          } catch (error) {
            console.warn("Error deleting old image: ", error);
          }
        }
        const timestamp = Math.floor(Date.now() / 1000);
        const randomString = generateRandomHexString(16);
        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'png';
        const fileName = `${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/slideshows/${fileName}`;
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);

        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              setStatusMessage(`Uploading: ${Math.round(progress)}%`);
            },
            (error) => { console.error("Upload error:", error); reject(new Error(`Image upload failed: ${error.message}`)); },
            async () => {
              try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); }
              catch (error) { reject(new Error(`Failed to get download URL: ${(error as Error).message}`)); }
            }
          );
        });
        setUploadProgress(100);
        setStatusMessage("Image uploaded. Saving...");
      } else {
         finalImageUrl = formData.imageUrl || "";
         if (!finalImageUrl && originalImageUrlFromInitialData) {
            setStatusMessage("Removing image...");
            try {
                const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
                await deleteObject(oldImageRef);
            } catch (error: any) {
                console.error("Error deleting image: ", error);
            }
            setStatusMessage("Image removed. Saving...");
         }
         else if (finalImageUrl && originalImageUrlFromInitialData && finalImageUrl !== originalImageUrlFromInitialData) {
             setStatusMessage("Replacing image URL...");
             try {
                const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
                await deleteObject(oldImageRef);
             } catch (error: any) {
                console.warn("Could not delete old image: ", error);
             }
             setStatusMessage("Old image removed (if existed). Saving...");
         } else {
            setStatusMessage(initialData ? "Saving changes..." : "Creating slide...");
         }
      }

      if (!finalImageUrl) {
        form.setError("imageUrl", { type: "manual", message: "An image URL or uploaded file is required." });
        setIsFormBusyForImage(false);
        setStatusMessage("");
        toast({title: "Image Required", description: "Please provide an image for the slide.", variant: "destructive"});
        return;
      }

      const payload: Omit<FirestoreSlide, 'id' | 'createdAt' | 'updatedAt'> = {
        title: formData.title || "",
        description: formData.description || "",
        imageUrl: finalImageUrl,
        imageHint: formData.imageHint || "",
        order: Number(formData.order),
        buttonText: formData.buttonText || "",
        buttonLinkType: (formData.buttonText && formData.buttonText.trim() !== "") || (formData.buttonLinkType && formData.buttonLinkValue?.trim() !== "") ? formData.buttonLinkType : null,
        buttonLinkValue: (formData.buttonText && formData.buttonText.trim() !== "") || (formData.buttonLinkType && formData.buttonLinkValue?.trim() !== "") ? formData.buttonLinkValue : null,
        isActive: formData.isActive === undefined ? true : formData.isActive,
      };

      if (!payload.buttonText && !(payload.buttonLinkType && payload.buttonLinkValue)) {
          payload.buttonLinkType = null;
          payload.buttonLinkValue = null;
      }

      await onSubmitProp({
        ...payload,
        id: initialData?.id,
      });

      setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = "";

    } catch (error) {
      console.error("Error during slide form submission:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save slide.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false);
      setStatusMessage("");
      setUploadProgress(null);
    }
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage;
  const showLinkRequiredAsterisk = !!watchedButtonText?.trim() || !!watchedLinkType;

  const filteredCats = categories.filter(c => c.name.toLowerCase().includes(valueSearch.toLowerCase()));
  const filteredSubs = subCategories.filter(sc => sc.name.toLowerCase().includes(valueSearch.toLowerCase()));
  const filteredServs = services.filter(s => s.name.toLowerCase().includes(valueSearch.toLowerCase()));

  return (
    <Form {...form} key={initialData ? `slide-form-${initialData.id}` : 'new-slide-form'}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-4 p-3 overflow-y-auto">
        <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem><FormLabel>Title (Optional)</FormLabel><FormControl><Input placeholder="E.g., Summer Sale" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>
        <FormField control={form.control} name="description" render={({ field }) => (
            <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Short description for the slide" {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>

        <FormItem>
          <FormLabel>Slide Image <span className="text-destructive">*</span></FormLabel>
          {displayPreviewUrl ? (
            <div className="my-2 relative w-full h-40 rounded-md overflow-hidden border bg-muted/10">
              <NextImage src={displayPreviewUrl} alt="Current slide image" fill className="object-contain" data-ai-hint={form.watch('imageHint') || "slide image preview"} unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw" />
            </div>
          ) : (
            <div className="my-2 flex items-center justify-center w-full h-40 rounded-md border border-dashed bg-muted/10"><ImageIconLucide className="h-10 w-10 text-muted-foreground" /></div>
          )}
          <FormControl><Input type="file" accept="image/png, image/jpeg, image/gif, image/webp" onChange={handleFileSelected} disabled={effectiveIsSubmitting} ref={fileInputRef} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90" /></FormControl>
          <FormDescription className="mt-1">Upload new image (PNG, JPG, GIF, WEBP, max 5MB).</FormDescription>
          {uploadProgress !== null && selectedFile && (<div className="mt-2"><Progress value={uploadProgress} className="w-full h-2" />{statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}</div>)}
        </FormItem>

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Or Enter Image URL <span className="text-destructive">*</span></FormLabel>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <FormControl className="flex-grow"><Textarea placeholder="https://example.com/image.png. Clear to remove image." {...field} disabled={effectiveIsSubmitting || selectedFile !== null} rows={2} onChange={(e) => { field.onChange(e); if (!selectedFile) { setCurrentImagePreview(e.target.value || null); }}}/></FormControl>
                {(field.value || selectedFile || currentImagePreview) && (<Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} aria-label="Clear image" className="sm:ml-auto mt-2 sm:mt-0"><Trash2 className="h-4 w-4 text-destructive"/></Button>)}
              </div>
              <FormDescription>An image (uploaded or via URL) is required for the slide to display correctly.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField control={form.control} name="imageHint" render={({ field }) => (
            <FormItem><FormLabel>Image AI Hint (Optional)</FormLabel><FormControl><Input placeholder="e.g., happy family cleaning" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>Keywords for AI (e.g. "tools repair"). Max 50 chars.</FormDescription><FormMessage /></FormItem>
        )}/>
        <FormField control={form.control} name="order" render={({ field }) => (
            <FormItem><FormLabel>Display Order</FormLabel><FormControl><Input type="number" placeholder="0" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>
        <FormField control={form.control} name="buttonText" render={({ field }) => (
            <FormItem><FormLabel>Button Text (Optional)</FormLabel><FormControl><Input placeholder="e.g., Shop Now" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
        )}/>

        <FormField
            control={form.control}
            name="buttonLinkType"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                    <FormLabel className="mb-2">Link Type {showLinkRequiredAsterisk && <span className="text-destructive">*</span>}</FormLabel>
                    <Dialog open={isLinkTypePickerOpen} onOpenChange={setIsLinkTypePickerOpen}>
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
                                {field.value === "url"
                                    ? "Custom URL"
                                    : field.value === "category"
                                    ? "Category"
                                    : field.value === "subcategory"
                                    ? "Sub-Category"
                                    : field.value === "service"
                                    ? "Service"
                                    : "Select link type..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Select Link Type</DialogTitle>
                                <DialogDescription>
                                    Choose where clicking this slide will redirect users.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                                <div className="space-y-1">
                                    {[
                                        { value: "url", label: "Custom URL" },
                                        { value: "category", label: "Category" },
                                        { value: "subcategory", label: "Sub-Category" },
                                        { value: "service", label: "Service" },
                                    ].map((opt) => (
                                        <Button
                                            key={opt.value}
                                            variant={field.value === opt.value ? "secondary" : "ghost"}
                                            className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                            onClick={() => {
                                                field.onChange(opt.value as SlideButtonLinkType);
                                                form.setValue('buttonLinkValue', '');
                                                form.trigger('buttonLinkValue');
                                                setIsLinkTypePickerOpen(false);
                                            }}
                                            type="button"
                                        >
                                            <span className="text-sm font-medium">{opt.label}</span>
                                            {field.value === opt.value && (
                                                <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                            )}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </DialogContent>
                    </Dialog>
                    <FormDescription>This link applies to the image if no button text is set.</FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
        <FormField
            control={form.control}
            name="buttonLinkValue"
            render={({ field }) => {
                const selectedCat = categories.find(c => c.slug === field.value);
                const selectedSub = subCategories.find(sc => sc.slug === field.value);
                const selectedServ = services.find(s => s.slug === field.value);
                const placeholder = 
                    watchedLinkType === 'category'
                        ? (selectedCat ? selectedCat.name : "Select a category")
                        : watchedLinkType === 'subcategory'
                        ? (selectedSub ? selectedSub.name : "Select a sub-category")
                        : watchedLinkType === 'service'
                        ? (selectedServ ? selectedServ.name : "Select a service")
                        : "Select value...";

                return (
                    <FormItem className="flex flex-col">
                        <FormLabel className="mb-2">Link Value {showLinkRequiredAsterisk && <span className="text-destructive">*</span>}</FormLabel>
                        {watchedLinkType === 'url' && (
                            <FormControl>
                                <Input placeholder="https://example.com/offer" {...field} value={field.value || ""} disabled={effectiveIsSubmitting || !watchedLinkType} />
                            </FormControl>
                        )}
                        {(watchedLinkType === 'category' || watchedLinkType === 'subcategory' || watchedLinkType === 'service') && (
                            <Dialog open={isValuePickerOpen} onOpenChange={setIsValuePickerOpen}>
                                <DialogTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        className={cn(
                                            "w-full justify-between text-left font-normal h-10",
                                            !field.value && "text-muted-foreground"
                                        )}
                                        disabled={effectiveIsSubmitting || !watchedLinkType}
                                        type="button"
                                    >
                                        <span>{placeholder}</span>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle>Select {watchedLinkType === 'category' ? 'Category' : watchedLinkType === 'subcategory' ? 'Sub-Category' : 'Service'}</DialogTitle>
                                        <DialogDescription>
                                            Search and select an item to link this slide to.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="relative my-2">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Search..."
                                            className="pl-9 h-10"
                                            value={valueSearch}
                                            onChange={(e) => setValueSearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="py-2">
                                        <ScrollArea className="h-[250px] rounded-md border p-2">
                                            <div className="space-y-1">
                                                {watchedLinkType === 'category' && (
                                                    filteredCats.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground text-center py-4">No categories found.</p>
                                                    ) : (
                                                        filteredCats.map(c => (
                                                            <Button
                                                                key={c.id}
                                                                variant={field.value === c.slug ? "secondary" : "ghost"}
                                                                className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                                                onClick={() => {
                                                                    field.onChange(c.slug);
                                                                    setIsValuePickerOpen(false);
                                                                }}
                                                                type="button"
                                                            >
                                                                <span className="text-sm font-medium">{c.name}</span>
                                                                {field.value === c.slug && (
                                                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                                                )}
                                                            </Button>
                                                        ))
                                                    )
                                                )}
                                                {watchedLinkType === 'subcategory' && (
                                                    filteredSubs.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground text-center py-4">No sub-categories found.</p>
                                                    ) : (
                                                        filteredSubs.map(sc => (
                                                            <Button
                                                                key={sc.id}
                                                                variant={field.value === sc.slug ? "secondary" : "ghost"}
                                                                className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                                                onClick={() => {
                                                                    field.onChange(sc.slug);
                                                                    setIsValuePickerOpen(false);
                                                                }}
                                                                type="button"
                                                            >
                                                                <span className="text-sm font-medium">{sc.name}</span>
                                                                {field.value === sc.slug && (
                                                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                                                )}
                                                            </Button>
                                                        ))
                                                    )
                                                )}
                                                {watchedLinkType === 'service' && (
                                                    filteredServs.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground text-center py-4">No services found.</p>
                                                    ) : (
                                                        filteredServs.map(s => (
                                                            <Button
                                                                key={s.id}
                                                                variant={field.value === s.slug ? "secondary" : "ghost"}
                                                                className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                                                onClick={() => {
                                                                    field.onChange(s.slug);
                                                                    setIsValuePickerOpen(false);
                                                                }}
                                                                type="button"
                                                            >
                                                                <span className="text-sm font-medium">{s.name}</span>
                                                                {field.value === s.slug && (
                                                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                                                )}
                                                            </Button>
                                                        ))
                                                    )
                                                )}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        )}
                        {!watchedLinkType && <Input placeholder="Select Link Type first" disabled={true} />}
                        <FormMessage />
                    </FormItem>
                );
            }}
        />
        <FormField control={form.control} name="isActive" render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5"><FormLabel>Slide Active</FormLabel><FormDescription>If unchecked, slide will not be shown.</FormDescription></div>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl>
            </FormItem>
        )}/>

        <div className="p-3 border-t sticky bottom-0 bg-background flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button>
          <Button type="submit" disabled={effectiveIsSubmitting}>
            {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Slide')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
