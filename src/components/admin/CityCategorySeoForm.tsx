"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Switch } from "@/components/ui/switch";
import type { FirestoreCity, FirestoreCategory, CityCategorySeoSetting } from '@/types/firestore';
import { useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Wand2, Edit2, Lock, CheckCircle, Search, Building, Tags, Sparkles } from "lucide-react";
import { generateCityCategorySeo } from '@/ai/flows/generateCityCategorySeoFlow';
import { generateFreeCityCategorySeoData } from "@/lib/seoGenerator";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from '@/lib/mysqlDb';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const generateSeoSlug = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).join('/');
};

const cityCategorySeoFormSchema = z.object({
  cityId: z.string({ required_error: "Please select a city." }),
  categoryId: z.string({ required_error: "Please select a category." }),
  slug: z.string().optional().or(z.literal('')),
  h1_title: z.string().optional().or(z.literal('')),
  meta_title: z.string().optional().or(z.literal('')),
  meta_description: z.string().optional().or(z.literal('')),
  meta_keywords: z.string().optional().or(z.literal('')),
  seo_content: z.string().optional().or(z.literal('')),
  faqs: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).optional(),
  imageHint: z.string().max(50, "Image hint max 50 chars.").optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export type CityCategorySeoFormData = z.infer<typeof cityCategorySeoFormSchema>;

interface CityCategorySeoFormProps {
  onSubmit: (data: CityCategorySeoFormData & { id?: string }) => Promise<void>;
  initialData?: CityCategorySeoSetting | null;
  existingSettings?: CityCategorySeoSetting[];
  cities: FirestoreCity[];
  categories: FirestoreCategory[];
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function CityCategorySeoForm({ 
  onSubmit: onSubmitProp, 
  initialData, 
  existingSettings = [],
  cities, 
  categories, 
  onCancel, 
  isSubmitting = false 
}: CityCategorySeoFormProps) {
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isSlugEditable, setIsSlugEditable] = useState(false);
  
  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  
  const { toast } = useToast();

  const form = useForm<CityCategorySeoFormData>({
    resolver: zodResolver(cityCategorySeoFormSchema),
    defaultValues: {
      cityId: undefined, categoryId: undefined, slug: "", h1_title: "", meta_title: "", meta_description: "", meta_keywords: "", seo_content: "", faqs: [], imageHint: "", isActive: true,
    },
  });

  const watchedCityId = form.watch("cityId");
  const watchedCategoryId = form.watch("categoryId");
  const watchedSlug = form.watch("slug");

  const selectedCity = useMemo(() => cities.find(c => c.id === watchedCityId), [cities, watchedCityId]);
  const selectedCategory = useMemo(() => categories.find(c => c.id === watchedCategoryId), [categories, watchedCategoryId]);
  
  const searchableCities = useMemo(() => {
    return cities.filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase()));
  }, [cities, citySearch]);

  const searchableCategories = useMemo(() => {
    return categories.filter(c => c.name.toLowerCase().includes(categorySearch.toLowerCase()));
  }, [categories, categorySearch]);

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "cityCategorySeoSettings"),
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
        cityId: initialData.cityId,
        categoryId: initialData.categoryId,
        slug: initialData.slug || "", // Ensure slug is at least an empty string
        h1_title: initialData.h1_title || "",
        meta_title: initialData.meta_title || "",
        meta_description: initialData.meta_description || "",
        meta_keywords: initialData.meta_keywords || "",
        seo_content: initialData.seo_content || "",
        faqs: initialData.faqs || [],
        imageHint: initialData.imageHint || "",
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
    } else {
      form.reset({ cityId: undefined, categoryId: undefined, slug: "", h1_title: "", meta_title: "", meta_description: "", meta_keywords: "", seo_content: "", faqs: [], imageHint: "", isActive: true });
    }
    setIsSlugEditable(false);
  }, [initialData, form]);

  useEffect(() => {
    if (watchedCityId && watchedCategoryId && !isSlugEditable) {
      const city = cities.find(c => c.id === watchedCityId);
      const category = categories.find(c => c.id === watchedCategoryId);
      if (city && category) {
        const delayDebounceFn = setTimeout(async () => {
            const baseSlug = generateSeoSlug([city.slug, category.slug]);
            const uniqueSlug = await checkSlugUniqueness(baseSlug, initialData?.id);
            form.setValue('slug', uniqueSlug, { shouldValidate: true });
        }, 500);
        return () => clearTimeout(delayDebounceFn);
      }
    }
  }, [watchedCityId, watchedCategoryId, cities, categories, isSlugEditable, initialData, form, checkSlugUniqueness]);

  // Handle manual slug changes to ensure uniqueness if needed
  useEffect(() => {
    if (isSlugEditable && watchedSlug && form.getFieldState('slug').isDirty) {
        const delayDebounceFn = setTimeout(async () => {
            const parts = watchedSlug.split('/');
            const baseSlug = generateSeoSlug(parts);
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

  const handleGenerateFreeSeo = async () => {
    const cityId = form.getValues("cityId");
    const categoryId = form.getValues("categoryId");

    const selectedCityObj = cities.find(c => c.id === cityId);
    const selectedCategoryObj = categories.find(c => c.id === categoryId);

    if (!selectedCityObj || !selectedCategoryObj) {
      toast({
        title: "City & Category Required",
        description: "Please select a city and a category first.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Query top active services under this category to build unique content strings
      const servicesRef = collection(db, "services");
      const snap = await getDocs(query(servicesRef, where("categoryId", "==", categoryId), where("isActive", "==", true), orderBy("order", "asc"), limit(10)));
      const serviceNames = snap.docs.map(d => d.data().name);

      const areasRef = collection(db, "areas");
      const areasSnap = await getDocs(query(areasRef, where("cityId", "==", cityId), where("isActive", "==", true)));
      const fallbackNearby = areasSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name,
        slug: d.data().slug
      }));

      const result = generateFreeCityCategorySeoData(selectedCityObj.name, selectedCategoryObj.name, serviceNames, fallbackNearby);

      form.setValue("h1_title", result.h1_title, { shouldValidate: true, shouldDirty: true });
      form.setValue("meta_title", result.seo_title, { shouldValidate: true, shouldDirty: true });
      form.setValue("meta_description", result.seo_description, { shouldValidate: true, shouldDirty: true });
      form.setValue("meta_keywords", result.seo_keywords, { shouldValidate: true, shouldDirty: true });
      form.setValue("seo_content", result.seo_content, { shouldValidate: true, shouldDirty: true });
      form.setValue("faqs", result.faqs, { shouldValidate: true, shouldDirty: true });
      form.setValue("imageHint", result.imageHint, { shouldValidate: true, shouldDirty: true });

      toast({ 
        title: "Content Generated (Free)!", 
        description: "SEO fields and FAQs have been auto-populated using dynamic templates.",
        className: "bg-green-100 border-green-300 text-green-700" 
      });
    } catch (error) {
      console.error("Error generating free SEO:", error);
      toast({ title: "Error", description: "Failed to generate free SEO content.", variant: "destructive" });
    }
  };

  const handleGenerateSeo = async () => {
    const cityId = form.getValues("cityId");
    const categoryId = form.getValues("categoryId");

    const selectedCity = cities.find(c => c.id === cityId);
    const selectedCategory = categories.find(c => c.id === categoryId);

    if (!selectedCity || !selectedCategory) {
      toast({
        title: "City & Category Required",
        description: "Please select a city and a category first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
      const result = await generateCityCategorySeo({ cityName: selectedCity.name, categoryName: selectedCategory.name });
      form.setValue("h1_title", result.h1_title, { shouldValidate: true });
      form.setValue("meta_title", result.meta_title, { shouldValidate: true });
      form.setValue("meta_description", result.meta_description, { shouldValidate: true });
      form.setValue("meta_keywords", result.meta_keywords, { shouldValidate: true });
      form.setValue("seo_content", result.seo_content, { shouldValidate: true });
      form.setValue("faqs", result.faqs, { shouldValidate: true });
      form.setValue("imageHint", result.imageHint, { shouldValidate: true });
      toast({ title: "Content Generated!", description: "SEO fields and FAQs have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
      console.error("Error generating city-category SEO:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
      setIsGeneratingSeo(false);
    }
  };

  const handleCopyLink = () => {
    const slugVal = form.getValues("slug");
    if (!slugVal) {
      toast({ title: "Cannot copy", description: "Slug must be set first.", variant: "warning" });
      return;
    }
    const parts = slugVal.split('/');
    if (parts.length < 2) {
      toast({ title: "Cannot copy", description: "Slug must contain city and category.", variant: "warning" });
      return;
    }
    const fullUrl = `${window.location.origin}/${parts[0]}/category/${parts[1]}`;
    navigator.clipboard.writeText(fullUrl);
    toast({ title: "Copied!", description: "Link copied to clipboard." });
  };

  const handleVisitPage = () => {
    const slugVal = form.getValues("slug");
    if (!slugVal) {
      toast({ title: "Cannot visit", description: "Slug must be set first.", variant: "warning" });
      return;
    }
    const parts = slugVal.split('/');
    if (parts.length < 2) {
      toast({ title: "Cannot visit", description: "Slug must contain city and category.", variant: "warning" });
      return;
    }
    window.open(`/${parts[0]}/category/${parts[1]}`, '_blank');
  };

  const handleSubmit = async (formData: CityCategorySeoFormData) => {
    await onSubmitProp({ ...formData, id: initialData?.id });
  };
  
  const isEditing = !!initialData;
  const effectiveIsSubmitting = isSubmitting || isGeneratingSeo;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField control={form.control} name="cityId" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>City</FormLabel>
            <Dialog open={isCityPickerOpen} onOpenChange={setIsCityPickerOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between text-left font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                  disabled={effectiveIsSubmitting || isEditing}
                >
                  {selectedCity ? (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-primary" />
                      <span>{selectedCity.name}</span>
                    </div>
                  ) : (
                    "Search and select city..."
                  )}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Select City</DialogTitle>
                  <DialogDescription>
                    Search and select a city. ✅ indicates existing SEO settings.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Type city name..."
                      className="pl-8"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                    />
                  </div>
                  <ScrollArea className="h-[300px] rounded-md border p-2">
                    <div className="space-y-1">
                      {searchableCities.length === 0 ? (
                        <p className="text-center py-4 text-sm text-muted-foreground">No cities found.</p>
                      ) : (
                        searchableCities.map((city) => {
                          const generatedCategories = existingSettings
                            .filter(s => s.cityId === city.id)
                            .map(s => s.categoryName);
                          const hasGenerated = generatedCategories.length > 0;
                          
                          return (
                            <Button
                              key={city.id}
                              variant={field.value === city.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                              onClick={() => {
                                field.onChange(city.id);
                                setIsCityPickerOpen(false);
                                setCitySearch("");
                              }}
                            >
                              <div className="flex flex-col gap-1 pr-8">
                                <span className="font-semibold text-sm">{city.name}</span>
                                {hasGenerated && (
                                  <div className="flex flex-wrap gap-1">
                                    {generatedCategories.map(cat => (
                                      <Badge 
                                        key={cat} 
                                        variant="outline" 
                                        className="text-[9px] py-0 px-1.5 h-4 bg-green-50 text-green-700 border-green-200"
                                      >
                                        {cat}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {hasGenerated && (
                                <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>
            <FormMessage />
          </FormItem>
        )}/>
        <FormField control={form.control} name="categoryId" render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Category</FormLabel>
            <Dialog open={isCategoryPickerOpen} onOpenChange={setIsCategoryPickerOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between text-left font-normal",
                    !field.value && "text-muted-foreground"
                  )}
                  disabled={effectiveIsSubmitting || isEditing}
                >
                  {selectedCategory ? (
                    <div className="flex items-center gap-2">
                      <Tags className="h-4 w-4 text-primary" />
                      <span>{selectedCategory.name}</span>
                    </div>
                  ) : (
                    "Search and select category..."
                  )}
                  <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Select Category</DialogTitle>
                  <DialogDescription>
                    Search categories. ✅ indicates existing SEO for the chosen city.
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
                        searchableCategories.map((category) => {
                          const isGenerated = watchedCityId && existingSettings.some(s => s.cityId === watchedCityId && s.categoryId === category.id);
                          
                          return (
                            <Button
                              key={category.id}
                              variant={field.value === category.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                              onClick={() => {
                                field.onChange(category.id);
                                setIsCategoryPickerOpen(false);
                                setCategorySearch("");
                              }}
                            >
                              <div className="flex flex-col gap-1 pr-8">
                                <span className="font-semibold text-sm">{category.name}</span>
                                {isGenerated && (
                                  <Badge variant="outline" className="text-[10px] py-0 h-4 bg-green-50 text-green-700 border-green-200">
                                    Already Generated
                                  </Badge>
                                )}
                              </div>
                              {isGenerated && (
                                <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </DialogContent>
            </Dialog>
            <FormMessage />
          </FormItem>
        )}/>
        <FormField control={form.control} name="slug" render={({ field }) => (
          <FormItem>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <FormLabel>Slug Segment {isEditing ? "(Editing might affect SEO)" : "(Auto-generated or custom)"}</FormLabel>
              <div className="flex flex-wrap items-center gap-1">
                {watchedSlug && watchedSlug.split('/').length >= 2 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyLink}
                      className="h-8 px-2 text-xs text-primary hover:text-primary/80 hover:bg-muted"
                    >
                      Copy Link
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleVisitPage}
                      className="h-8 px-2 text-xs text-primary hover:text-primary/80 hover:bg-muted"
                    >
                      Open Page
                    </Button>
                  </>
                )}
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
            </div>
            <FormControl>
              <div className="flex items-center rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <span className="bg-muted px-3 py-2 text-sm text-muted-foreground border-r font-mono select-none rounded-l-md whitespace-nowrap">
                  /
                </span>
                <input 
                    type="text"
                    placeholder="e.g., bangalore/plumbing" 
                    {...field} 
                    value={field.value || ""} 
                    onChange={(e) => field.onChange(generateSeoSlug(e.target.value.split('/')))} 
                    disabled={effectiveIsSubmitting || !isSlugEditable} 
                    className={cn(
                      "flex h-10 w-full rounded-r-md bg-transparent px-3 py-2 text-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 font-mono text-xs",
                      !isSlugEditable && "bg-muted/30"
                    )}
                />
              </div>
            </FormControl>
            {watchedSlug && watchedSlug.split('/').length >= 2 && (
              <div className="text-xs text-muted-foreground mt-1 font-mono bg-muted/20 p-2 rounded border border-dashed">
                Preview URL: <span className="text-primary font-semibold">/{watchedSlug.split('/')[0]}/category/{watchedSlug.split('/')[1]}</span>
              </div>
            )}
            <FormDescription>
                {isSlugEditable 
                  ? "Composite slug (city/category). Uniqueness is automatically checked." 
                  : "Automatically generated from selected City & Category. Click 'Edit Manually' to customize."}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}/>
        <div className="space-y-4 pt-4 border-t">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h3 className="text-md font-semibold text-muted-foreground">SEO Content</h3>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleGenerateFreeSeo} disabled={effectiveIsSubmitting || !watchedCityId || !watchedCategoryId}>
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    Auto-Fill (Free)
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleGenerateSeo} disabled={effectiveIsSubmitting || !watchedCityId || !watchedCategoryId}>
                    {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Generate AI SEO
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
        </div>
        <FormField control={form.control} name="h1_title" render={({ field }) => (<FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Plumbing Services in Bangalore" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_title" render={({ field }) => (<FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Best Plumbers in Bangalore | Yourbrand" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_description" render={({ field }) => (<FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="Find expert plumbing services in Bangalore..." {...field} value={field.value || ""} rows={3} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="meta_keywords" render={({ field }) => (<FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., plumbers bangalore, bangalore plumbing" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="seo_content" render={({ field }) => (<FormItem><FormLabel>SEO Bio / Page Content (HTML)</FormLabel><FormControl><Textarea placeholder="Long-form content for the bottom of the page..." {...field} value={field.value || ""} rows={8} disabled={effectiveIsSubmitting}/></FormControl><FormDescription>Detailed description for search engines. Use HTML tags for formatting.</FormDescription><FormMessage /></FormItem>)}/>
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
        <FormField control={form.control} name="imageHint" render={({ field }) => (<FormItem><FormLabel>Image Hint (Optional)</FormLabel><FormControl><Input placeholder="e.g., plumber tools" {...field} value={field.value || ""} disabled={effectiveIsSubmitting}/></FormControl><FormDescription>Keywords for OG image if a specific image isn't set.</FormDescription><FormMessage /></FormItem>)}/>
        <FormField control={form.control} name="isActive" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm"><div className="space-y-0.5"><FormLabel>Setting Active</FormLabel><FormDescription>Enable this SEO override.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} /></FormControl></FormItem>)}/>
        <div className="flex justify-end space-x-3 pt-4"><Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>Cancel</Button><Button type="submit" disabled={effectiveIsSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{initialData ? 'Save Changes' : 'Create Setting'}</Button></div>
      </form>
    </Form>
  );
}
