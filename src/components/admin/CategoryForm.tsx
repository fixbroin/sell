
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { FirestoreCategory } from '@/types/firestore';
import { useEffect, useState, useRef, useCallback } from "react";
import { Loader2, Image as ImageIcon, Trash2, Wand2, Edit2, Lock, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import NextImage from 'next/image';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { collection, query, where, getDocs, limit } from '@/lib/mysqlDb';
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { generateCategorySeo } from '@/ai/flows/generateCategorySeoFlow';
import { getSpinnedLocalContent } from "@/lib/seoGenerator";
import { compressImage } from "@/lib/imageCompressor";
import { useApplicationConfig } from "@/hooks/useApplicationConfig";

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const generateRandomHexString = (length: number) => {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
};

const categoryFormSchema = z.object({
  name: z.string().min(2, { message: "Category name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., my-category-name).").optional().or(z.literal('')),
  order: z.coerce.number().min(0, { message: "Order must be a non-negative number." }),
  isActive: z.boolean().default(true),
  imageUrl: z.string().refine(
    (val) => !val || val === "" || val.startsWith('/') || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('uploads/'),
    { message: "Must be a valid URL or path if provided." }
  ).optional().or(z.literal('')),
  imageHint: z.string().max(50, { message: "Image hint should be max 50 characters."}).optional().or(z.literal('')),
  h1_title: z.string().optional().or(z.literal('')),
  seo_title: z.string().optional().or(z.literal('')),
  seo_description: z.string().optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
  seo_content: z.string().optional().or(z.literal('')),
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).optional(),
  visitingChargeAmount: z.preprocess(val => val === '' ? undefined : Number(val), z.number().min(0).optional()),
  minimumBookingAmount: z.preprocess(val => val === '' ? undefined : Number(val), z.number().min(0).optional()),
  minimumBookingPolicyDescription: z.string().optional().or(z.literal('')),
});

type CategoryFormData = z.infer<typeof categoryFormSchema>;

interface CategoryFormProps {
  onSubmit: (data: Omit<FirestoreCategory, 'id' | 'createdAt'> & { id?: string, slug?: string }) => Promise<void>;
  initialData?: FirestoreCategory | null;
  onCancel: () => void;
  isSubmitting?: boolean;
  nextOrder?: number;
}

const isFirebaseStorageUrl = (url: string | null | undefined): boolean => {
  if (!url) return false;
  return typeof url === 'string' && url.trim().length > 0;
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

export default function CategoryForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting: isParentSubmitting = false, nextOrder = 0 }: CategoryFormProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);
  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSlugEditable, setIsSlugEditable] = useState(false);

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "", slug: "", order: nextOrder, isActive: true, imageUrl: "", imageHint: "",
      h1_title: "", seo_title: "", seo_description: "", seo_keywords: "", seo_content: "", faqs: [],
      visitingChargeAmount: "" as any,
      minimumBookingAmount: "" as any,
      minimumBookingPolicyDescription: `A visiting charge of ${symbol}{VISITING_CHARGE} will be applied if your booking total is below ${symbol}{MINIMUM_BOOKING_AMOUNT}.`,
    },
  });

  const watchedName = form.watch("name");
  const watchedImageHint = form.watch("imageHint");
  const watchedSlug = form.watch("slug");

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "adminCategories"),
        where("slug", "==", uniqueSlug),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        isUnique = true;
      } else {
        const doc = querySnapshot.docs[0];
        if (currentId && doc.id === currentId) {
          isUnique = true;
        } else {
          uniqueSlug = `${baseSlug}-${counter}`;
          counter++;
        }
      }
    }
    return uniqueSlug;
  }, []);

  useEffect(() => {
    if (initialData) {
      form.reset({
        name: initialData.name,
        slug: initialData.slug,
        order: initialData.order,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
        h1_title: initialData.h1_title || "",
        seo_title: initialData.seo_title || "",
        seo_description: initialData.seo_description || "",
        seo_keywords: initialData.seo_keywords || "",
        seo_content: initialData.seo_content || "",
        faqs: initialData.faqs || [],
        visitingChargeAmount: initialData.visitingChargeAmount !== undefined ? initialData.visitingChargeAmount : "" as any,
        minimumBookingAmount: initialData.minimumBookingAmount !== undefined ? initialData.minimumBookingAmount : "" as any,
        minimumBookingPolicyDescription: initialData.minimumBookingPolicyDescription || `A visiting charge of ${symbol}{VISITING_CHARGE} will be applied if your booking total is below ${symbol}{MINIMUM_BOOKING_AMOUNT}.`,
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({
        name: "", slug: "", order: nextOrder, isActive: true, imageUrl: "", imageHint: "",
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "", seo_content: "", faqs: [],
        visitingChargeAmount: "" as any,
        minimumBookingAmount: "" as any,
        minimumBookingPolicyDescription: `A visiting charge of ${symbol}{VISITING_CHARGE} will be applied if your booking total is below ${symbol}{MINIMUM_BOOKING_AMOUNT}.`,
      });
      setCurrentImagePreview(null);
      setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null);
    setUploadProgress(null);
    setIsFormBusyForImage(false);
    setStatusMessage("");
    setIsSlugEditable(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialData, form, nextOrder, symbol]);

  useEffect(() => {
    if (watchedName && !isSlugEditable) {
      const delayDebounceFn = setTimeout(async () => {
        const baseSlug = generateSlug(watchedName);
        const uniqueSlug = await checkSlugUniqueness(baseSlug, initialData?.id);
        form.setValue('slug', uniqueSlug, { shouldValidate: true });
      }, 500);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [watchedName, isSlugEditable, initialData, form, checkSlugUniqueness]);

  // Handle manual slug changes to ensure uniqueness if needed
  useEffect(() => {
    if (isSlugEditable && watchedSlug && form.getFieldState('slug').isDirty) {
        const delayDebounceFn = setTimeout(async () => {
            const baseSlug = generateSlug(watchedSlug);
            if (baseSlug !== watchedSlug) {
                form.setValue('slug', baseSlug, { shouldValidate: true });
            }
            const uniqueSlug = await checkSlugUniqueness(baseSlug, initialData?.id);
            if (uniqueSlug !== baseSlug) {
                form.setValue('slug', uniqueSlug, { shouldValidate: true });
            }
        }, 500);
        return () => clearTimeout(delayDebounceFn);
    }
  }, [watchedSlug, isSlugEditable, initialData, form, checkSlugUniqueness]);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        toast({ title: "File Too Large", description: "Please select an image smaller than 50MB.", variant: "destructive" });
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
  };

  const handleGenerateFreeSeo = async () => {
    const categoryName = form.getValues("name");
    if (!categoryName.trim()) {
        toast({ title: "Category Name Required", description: "Please enter a category name first.", variant: "destructive" });
        return;
    }

    try {
        const spinnedContent = getSpinnedLocalContent({
            cityName: "your city",
            categoryName: categoryName
        });

        const h1Title = `Professional ${categoryName} Services`;
        const seoTitle = `Best ${categoryName} Services near me | Yourbrand`;
        const seoDescription = `Book certified and background-verified ${categoryName.toLowerCase()} experts with Yourbrand. Quality service, upfront pricing, and trusted professionals.`;
        const seoKeywords = `${categoryName.toLowerCase()} services, best ${categoryName.toLowerCase()} near me, local ${categoryName.toLowerCase()}`;
        const imageHint = `${categoryName.toLowerCase()} services`;

        const faqsList = [
          {
            question: `How do I book ${categoryName.toLowerCase()} services on Yourbrand?`,
            answer: `You can easily book online. Select the required ${categoryName.toLowerCase()} service, choose a convenient date and time slot, and confirm your booking instantly.`
          },
          {
            question: `Are your ${categoryName.toLowerCase()} professionals certified?`,
            answer: `Yes, all ${categoryName.toLowerCase()} technicians on our platform are background-checked, vetted, and highly experienced.`
          }
        ];

        form.setValue("h1_title", h1Title, { shouldValidate: true, shouldDirty: true });
        form.setValue("seo_title", seoTitle, { shouldValidate: true, shouldDirty: true });
        form.setValue("seo_description", seoDescription, { shouldValidate: true, shouldDirty: true });
        form.setValue("seo_keywords", seoKeywords, { shouldValidate: true, shouldDirty: true });
        form.setValue("seo_content", spinnedContent, { shouldValidate: true, shouldDirty: true });
        form.setValue("faqs", faqsList, { shouldValidate: true, shouldDirty: true });
        form.setValue("imageHint", imageHint, { shouldValidate: true, shouldDirty: true });

        toast({ 
            title: "Content Generated (Free)!", 
            description: "SEO fields and FAQs have been auto-populated using dynamic templates.",
            className: "bg-green-100 border-green-300 text-green-700" 
        });
    } catch (error) {
        console.error("Error generating free category SEO:", error);
        toast({ title: "Error", description: "Failed to generate free SEO content.", variant: "destructive" });
    }
  };

  const handleGenerateSeo = async () => {
    const categoryName = form.getValues("name");
    if (!categoryName.trim()) {
        toast({ title: "Category Name Required", description: "Please enter a category name first.", variant: "destructive" });
        return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating AI SEO...", description: "Please wait a moment." });
    try {
        const result = await generateCategorySeo({ categoryName });
        form.setValue("h1_title", result.h1_title, { shouldValidate: true });
        form.setValue("seo_title", result.seo_title, { shouldValidate: true });
        form.setValue("seo_description", result.seo_description, { shouldValidate: true });
        form.setValue("seo_keywords", result.seo_keywords, { shouldValidate: true });
        form.setValue("seo_content", result.seo_content, { shouldValidate: true });
        form.setValue("faqs", result.faqs, { shouldValidate: true });
        form.setValue("imageHint", result.imageHint, { shouldValidate: true });
        toast({ title: "Content Generated!", description: "SEO fields and FAQs have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
        console.error("AI Generation Error:", error);
        toast({ title: "AI Error", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsGeneratingSeo(false);
    }
  };

  const handleSubmit = async (formData: CategoryFormData) => {
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
        const fileName = `category_${timestamp}_${randomString}.${extension}`;
        const imagePath = `public/uploads/categories/${fileName}`;
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);

        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(new Error(`Image upload failed: ${error.message}`)),
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              } catch (getUrlError) {
                reject(new Error(`Failed to get download URL: ${(getUrlError as Error).message}`));
              }
            }
          );
        });
        setStatusMessage("Image uploaded. Saving category...");
      } else if (!formData.imageUrl && originalImageUrlFromInitialData) {
        setStatusMessage("Removing image from storage...");
        try {
          const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
          await deleteObject(oldImageRef);
          finalImageUrl = "";
          setStatusMessage("Image removed. Saving category...");
        } catch (error: any) {
          console.error("Error deleting image from storage: ", error);
        }
      } else {
        setStatusMessage(initialData ? "Saving changes..." : "Creating category...");
      }

      await onSubmitProp({
        name: formData.name,
        slug: formData.slug || "",
        order: formData.order,
        isActive: formData.isActive,
        imageUrl: finalImageUrl,
        imageHint: formData.imageHint,
        h1_title: formData.h1_title,
        seo_title: formData.seo_title,
        seo_description: formData.seo_description,
        seo_keywords: formData.seo_keywords,
        seo_content: formData.seo_content,
        faqs: formData.faqs,
        visitingChargeAmount: typeof formData.visitingChargeAmount === 'number' ? formData.visitingChargeAmount : undefined,
        minimumBookingAmount: typeof formData.minimumBookingAmount === 'number' ? formData.minimumBookingAmount : undefined,
        minimumBookingPolicyDescription: formData.minimumBookingPolicyDescription || undefined,
        id: initialData?.id,
      });

      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Error during category form submission or image operation:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save category data.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false);
      setStatusMessage("");
      setUploadProgress(null);
    }
  };
  
  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage || isGeneratingSeo;

  return (
    <Form {...form} key={initialData ? `edit-${initialData.id}` : 'new-post'}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex-grow space-y-6 p-3 overflow-y-auto">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Home Repairs" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Slug {initialData ? "(Editing might affect SEO)" : "(Auto-generated or custom)"}</FormLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSlugEditable(!isSlugEditable)}
                  className="h-8 px-2 text-xs"
                  disabled={effectiveIsSubmitting}
                >
                  {isSlugEditable ? (
                    <><Lock className="mr-1 h-3 w-3" /> Lock</>
                  ) : (
                    <><Edit2 className="mr-1 h-3 w-3" /> Edit Manually</>
                  )}
                </Button>
              </div>
              <FormControl>
                <Input
                  placeholder="e.g., home-repairs"
                  {...field}
                  onChange={(e) => field.onChange(generateSlug(e.target.value))}
                  disabled={effectiveIsSubmitting || !isSlugEditable}
                  className={!isSlugEditable ? "bg-muted/50 font-mono text-xs" : "font-mono text-xs"}
                />
              </FormControl>
              <FormDescription>
                {isSlugEditable 
                  ? "Lowercase, dash-separated. Uniqueness is automatically checked." 
                  : "Automatically generated and unique. Click 'Edit Manually' to customize."}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Order</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormDescription className="text-xs">Lower numbers appear first. {!initialData && `(Suggested: ${nextOrder})`}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5">
                <FormLabel>Category Active</FormLabel>
                <FormDescription>If unchecked, this category and all its contents will be hidden.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting}/>
              </FormControl>
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Category Image (Optional)</FormLabel>
          {displayPreviewUrl ? (
            <div className="my-2 relative w-full h-40 rounded-md overflow-hidden border bg-muted/10">
              <NextImage
                src={displayPreviewUrl}
                alt="Current category image"
                fill
                className="object-contain"
                data-ai-hint={watchedImageHint || "category image preview"}
                unoptimized={displayPreviewUrl.startsWith('blob:')}
                sizes="(max-width: 640px) 100vw, 50vw"
              />
            </div>
          ) : (
            <div className="my-2 flex items-center justify-center w-full h-40 rounded-md border border-dashed bg-muted/10">
              <ImageIcon className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          <FormControl>
            <Input
              type="file"
              accept="image/png, image/jpeg, image/gif, image/webp"
              onChange={handleFileSelected}
              disabled={effectiveIsSubmitting}
              ref={fileInputRef}
              className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90"
            />
          </FormControl>
          <FormDescription className="mt-1">
            Select new image (PNG, JPG, GIF, WEBP, max 5MB).
          </FormDescription>
          {uploadProgress !== null && selectedFile && (
            <div className="mt-2">
              <Progress value={uploadProgress} className="w-full h-2" />
              {statusMessage && <p className="text-xs text-muted-foreground mt-1">{statusMessage}</p>}
            </div>
          )}
        </FormItem>

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image URL (Leave empty to remove image on save if one exists)</FormLabel>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <FormControl className="flex-grow">
                  <Textarea
                    placeholder="Auto-filled after upload, or manually enter a URL. Clear to remove existing image."
                    {...field}
                    disabled={effectiveIsSubmitting || selectedFile !== null}
                    rows={3}
                    onBlur={(e) => {
                        if (!selectedFile) {
                            setCurrentImagePreview(e.target.value || null);
                            form.setValue('imageUrl', e.target.value, { shouldValidate: true });
                        }
                    }}
                  />
                </FormControl>
                {(field.value || selectedFile || currentImagePreview) && (
                    <Button type="button" variant="ghost" size="icon" onClick={handleRemoveImage} disabled={effectiveIsSubmitting} aria-label="Clear image selection or URL" className="sm:ml-auto mt-2 sm:mt-0">
                        <Trash2 className="h-4 w-4 text-destructive"/>
                    </Button>
                )}
              </div>
              <FormDescription>If a new file is selected above, this URL will be ignored. If this field is empty and an image exists, it will be removed upon saving.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-md font-semibold text-muted-foreground">Visiting Fee Settings (Optional)</h3>
          <p className="text-xs text-muted-foreground">Override the global visiting charge settings for this category. Leave blank to use defaults.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="visitingChargeAmount" render={({ field }) => (
              <FormItem>
                <FormLabel>Visiting Charge ({symbol})</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="e.g., 150" {...field} disabled={effectiveIsSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}/>
            <FormField control={form.control} name="minimumBookingAmount" render={({ field }) => (
              <FormItem>
                <FormLabel>Min Booking Amount for Free Delivery ({symbol})</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="e.g., 399" {...field} disabled={effectiveIsSubmitting} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}/>
          </div>
          <FormField control={form.control} name="minimumBookingPolicyDescription" render={({ field }) => (
            <FormItem>
              <FormLabel>Min Booking Policy Description Override</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder={`e.g., A visiting charge of ${symbol}{VISITING_CHARGE} will be applied if your booking total is below ${symbol}{MINIMUM_BOOKING_AMOUNT}.`}
                  {...field} 
                  rows={2} 
                  disabled={effectiveIsSubmitting} 
                />
              </FormControl>
              <FormDescription>Use placeholders: <code>{"{MINIMUM_BOOKING_AMOUNT}"}</code> and <code>{"{VISITING_CHARGE}"}</code> to substitute values dynamically.</FormDescription>
              <FormMessage />
            </FormItem>
          )}/>
        </div>

        <div className="space-y-4 pt-4 border-t">
          <div className="flex justify-between items-center">
              <h3 className="text-md font-semibold text-muted-foreground">SEO Settings (Optional)</h3>
              <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateFreeSeo}
                    disabled={effectiveIsSubmitting || !watchedName}
                >
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    Auto-Fill (Free)
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSeo}
                    disabled={effectiveIsSubmitting || !watchedName}
                >
                    {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Generate AI SEO
                </Button>
              </div>
            </div>
          <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings. Use <code>{"{{categoryName}}"}</code> in global patterns.</p>
          <FormField control={form.control} name="h1_title" render={({ field }) => (
            <FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Expert Home Repair Services" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
          )}/>
          <FormField control={form.control} name="seo_title" render={({ field }) => (
            <FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Home Repair Services | Yourbrand" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
          )}/>
          <FormField control={form.control} name="seo_description" render={({ field }) => (
            <FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Get reliable home repair services for plumbing, electrical, and more." {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
          )}/>
          <FormField control={form.control} name="seo_keywords" render={({ field }) => (
            <FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., home repair, plumbing, electrical services" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
          )}/>
          <FormField control={form.control} name="seo_content" render={({ field }) => (
            <FormItem><FormLabel>SEO Bio / Page Content (HTML)</FormLabel><FormControl><Textarea placeholder="Long-form content for the bottom of the page..." {...field} value={field.value || ""} rows={8} disabled={effectiveIsSubmitting} /></FormControl><FormDescription>Detailed description for search engines. Use HTML tags for formatting.</FormDescription><FormMessage /></FormItem>
          )}/>
          <FormField control={form.control} name="faqs" render={({ field }) => (
            <FormItem>
              <FormLabel>SEO FAQs (JSON)</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder='[{"question": "How much?", "answer": "It depends..."}]' 
                  value={field.value ? JSON.stringify(field.value, null, 2) : "[]"} 
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value);
                      field.onChange(parsed);
                    } catch (err) {
                      // Just update raw text if it's invalid JSON
                    }
                  }}
                  rows={8} 
                  className="font-mono text-xs"
                  disabled={effectiveIsSubmitting} 
                />
              </FormControl>
              <FormDescription>JSON array of question/answer objects for Google FAQ Schema.</FormDescription>
              <FormMessage />
            </FormItem>
          )}/>
           <FormField
            control={form.control}
            name="imageHint"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image AI Hint (Optional)</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., tools repair" {...field} disabled={effectiveIsSubmitting} />
                </FormControl>
                <FormDescription>Keywords for AI image generation (e.g. "tools repair"). Max 50 characters.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="p-3 border-t sticky bottom-0 bg-background flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={effectiveIsSubmitting}>
            {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Category')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
