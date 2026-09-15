
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { FirestoreSubCategory, FirestoreCategory } from '@/types/firestore';
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Loader2, Image as ImageIcon, Trash2, Edit2, Lock, Search, Tags, CheckCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import AppImage from '@/components/ui/AppImage';
import { storage, db } from '@/lib/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { collection, query, where, getDocs, limit } from '@/lib/mysqlDb';
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch"; // Import Switch
import { compressImage } from "@/lib/imageCompressor";

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const subCategoryFormSchema = z.object({
  name: z.string().min(2, { message: "Sub-category name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., my-subcategory-name).").optional().or(z.literal('')),
  parentId: z.string({ required_error: "Please select a parent category." }),
  order: z.coerce.number().min(0, { message: "Order must be a non-negative number." }),
  isActive: z.boolean().default(true),
  imageUrl: z.string().refine(
    (val) => !val || val === "" || val.startsWith('/') || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('uploads/'),
    { message: "Must be a valid URL or path if provided." }
  ).optional().or(z.literal('')),
  imageHint: z.string().max(50, { message: "Image hint should be max 50 characters."}).optional().or(z.literal('')),
});

type SubCategoryFormData = z.infer<typeof subCategoryFormSchema>;

interface SubCategoryFormProps {
  onSubmit: (data: Omit<FirestoreSubCategory, 'id' | 'createdAt'> & { id?: string, slug?: string }) => Promise<void>;
  initialData?: FirestoreSubCategory | null;
  onCancel: () => void;
  parentCategories: FirestoreCategory[];
  allSubCategories: FirestoreSubCategory[];
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

export default function SubCategoryForm({ onSubmit: onSubmitProp, initialData, onCancel, parentCategories, allSubCategories, isSubmitting: isParentSubmitting = false }: SubCategoryFormProps) {
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [originalImageUrlFromInitialData, setOriginalImageUrlFromInitialData] = useState<string | null>(null);
  
  const [isFormBusyForImage, setIsFormBusyForImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isSlugEditable, setIsSlugEditable] = useState(false);

  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  const form = useForm<SubCategoryFormData>({
    resolver: zodResolver(subCategoryFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      parentId: undefined,
      order: 0,
      isActive: true,
      imageUrl: "",
      imageHint: "",
    },
  });

  const watchedName = form.watch("name");
  const watchedImageHint = form.watch("imageHint"); 
  const watchedSlug = form.watch("slug");
  const watchedParentId = form.watch("parentId");

  const selectedParentCategory = useMemo(() => parentCategories.find(c => c.id === watchedParentId), [parentCategories, watchedParentId]);

  const searchableCategories = useMemo(() => {
    return parentCategories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()));
  }, [parentCategories, categorySearch]);

  const nextOrder = useMemo(() => {
    if (!watchedParentId) return 0;
    const sameParentSubCats = allSubCategories.filter(s => s.parentId === watchedParentId);
    if (sameParentSubCats.length === 0) return 0;
    return Math.max(...sameParentSubCats.map(s => s.order || 0)) + 1;
  }, [watchedParentId, allSubCategories]);

  useEffect(() => {
    if (!initialData && watchedParentId) {
      form.setValue('order', nextOrder);
    }
  }, [nextOrder, watchedParentId, initialData, form]);

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "adminSubCategories"),
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
        parentId: initialData.parentId,
        order: initialData.order,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        imageUrl: initialData.imageUrl || "",
        imageHint: initialData.imageHint || "",
      });
      setCurrentImagePreview(initialData.imageUrl || null);
      setOriginalImageUrlFromInitialData(initialData.imageUrl || null);
    } else {
      form.reset({ 
        name: "", slug: "", parentId: undefined, order: 0, isActive: true, imageUrl: "", imageHint: "",
      });
      setCurrentImagePreview(null);
      setOriginalImageUrlFromInitialData(null);
    }
    setSelectedFile(null);
    setUploadProgress(null);
    setIsFormBusyForImage(false);
    setStatusMessage("");
    setIsSlugEditable(false);
    setCategorySearch("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [initialData, form]);

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

  const handleSubmit = async (formData: SubCategoryFormData) => {
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
        const imagePath = `public/uploads/sub-categories/${fileName}`; 
        const fileStorageRefInstance = storageRef(storage, imagePath);
        const uploadTask = uploadBytesResumable(fileStorageRefInstance, selectedFile);

        finalImageUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              setUploadProgress(progress);
              setStatusMessage(`Uploading image: ${Math.round(progress)}%`);
            },
            (error) => {
                console.error("Upload error:", error);
                reject(new Error(`Image upload failed: ${error.message}`));
            },
            async () => {
              try {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              } catch (error) {
                reject(new Error(`Failed to get download URL: ${(error as Error).message}`));
              }
            }
          );
        });
        setUploadProgress(100);
        setStatusMessage("Image uploaded. Saving sub-category...");
      } else if (!formData.imageUrl && originalImageUrlFromInitialData) {
        setStatusMessage("Removing image from storage...");
        try {
          const oldImageRef = storageRef(storage, originalImageUrlFromInitialData);
          await deleteObject(oldImageRef);
          finalImageUrl = "";
          setStatusMessage("Image removed. Saving sub-category...");
        } catch (error: any) {
          console.error("Error deleting image from storage: ", error);
        }
      } else {
           setStatusMessage(initialData ? "Saving changes..." : "Creating sub-category...");
      }

      const parentCat = parentCategories.find(c => c.id === formData.parentId);

      await onSubmitProp({
        name: formData.name,
        slug: formData.slug || "",
        parentId: formData.parentId,
        parentCategoryId: formData.parentId,
        parentCategoryName: parentCat?.name || "Unknown",
        order: formData.order,
        isActive: formData.isActive,
        imageUrl: finalImageUrl,
        imageHint: formData.imageHint,
        id: initialData?.id,
      });
      
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
    } catch (error) {
      console.error("Error during sub-category form submission or image operation:", error);
      toast({ title: "Operation Failed", description: (error as Error).message || "Could not save sub-category data.", variant: "destructive" });
    } finally {
      setIsFormBusyForImage(false);
      setStatusMessage("");
      setUploadProgress(null);
    }
  };
  
  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSubmitting = isParentSubmitting || isFormBusyForImage;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sub-Category Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., Plumbing Services" {...field} disabled={effectiveIsSubmitting} />
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
                  placeholder="e.g., plumbing-services"
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
          name="parentId"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="mb-2">Parent Category</FormLabel>
              <Dialog open={isCategoryPickerOpen} onOpenChange={setIsCategoryPickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between text-left font-normal h-10",
                      !field.value && "text-muted-foreground"
                    )}
                    disabled={effectiveIsSubmitting || parentCategories.length === 0}
                    type="button"
                  >
                    {selectedParentCategory ? (
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-primary" />
                        <span>{selectedParentCategory.name}</span>
                      </div>
                    ) : (
                      "Search and select category..."
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Parent Category</DialogTitle>
                    <DialogDescription>
                      Search and select a parent category for this sub-category.
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
                              variant={field.value === cat.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                              onClick={() => {
                                field.onChange(cat.id);
                                setIsCategoryPickerOpen(false);
                                setCategorySearch("");
                              }}
                              type="button"
                            >
                              <div className="flex items-center gap-2 pr-8">
                                <Tags className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold text-sm">{cat.name}</span>
                              </div>
                              {field.value === cat.id && (
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
                <FormLabel>Sub-Category Active</FormLabel>
                <FormDescription>If unchecked, this sub-category and its services will be hidden.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting}/>
              </FormControl>
            </FormItem>
          )}
        />

        <FormItem>
          <FormLabel>Sub-Category Image (Optional)</FormLabel>
          {displayPreviewUrl ? (
            <div className="my-2 relative w-full h-40 rounded-md overflow-hidden border bg-muted/10">
              <AppImage
                src={displayPreviewUrl}
                alt="Current sub-category image"
                fill
                className="object-contain"
                aiHint={watchedImageHint || "sub-category image preview"}
                unoptimized={displayPreviewUrl.startsWith('blob:') || displayPreviewUrl.startsWith('data:')}
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
        <FormField
          control={form.control}
          name="imageHint"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Image AI Hint (Optional)</FormLabel>
              <FormControl>
                <Input placeholder="e.g., pipes tools" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormDescription>One or two keywords for AI image search (e.g. "pipes tools"). Max 50 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={effectiveIsSubmitting || (parentCategories.length === 0 && !initialData) }>
            {effectiveIsSubmitting && !statusMessage.includes("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForImage && statusMessage ? statusMessage : (initialData ? 'Save Changes' : 'Create Sub-Category')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
