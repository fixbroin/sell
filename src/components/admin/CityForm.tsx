
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FirestoreCity } from '@/types/firestore';
import { useEffect, useState, useCallback } from "react";
import { Loader2, Wand2, Edit2, Lock, Sparkles } from "lucide-react";
import { generateCitySeo } from '@/ai/flows/generateCitySeoFlow';
import { generateFreeCitySeoData } from "@/lib/seoGenerator";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from '@/lib/mysqlDb';
import { cn } from "@/lib/utils";

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const cityFormSchema = z.object({
  name: z.string().min(2, { message: "City name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., new-delhi).").optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  latitude: z.string().or(z.number()).optional().nullable(),
  longitude: z.string().or(z.number()).optional().nullable(),
  // SEO Fields
  h1_title: z.string().optional().or(z.literal('')),
  seo_title: z.string().optional().or(z.literal('')),
  seo_description: z.string().optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
});

type CityFormData = z.infer<typeof cityFormSchema>;

interface CityFormProps {
  onSubmit: (data: Omit<FirestoreCity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreCity | null;
  onCancel: () => void;
  isSubmitting?: boolean; 
}

export default function CityForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting = false }: CityFormProps) {
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSlugEditable, setIsSlugEditable] = useState(false);
  const { toast } = useToast();

  const form = useForm<CityFormData>({
    resolver: zodResolver(cityFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      isActive: true,
      latitude: "",
      longitude: "",
      h1_title: "",
      seo_title: "",
      seo_description: "",
      seo_keywords: "",
    },
  });

  const watchedName = form.watch("name");
  const watchedSlug = form.watch("slug");

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "cities"),
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
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
        latitude: initialData.latitude || "",
        longitude: initialData.longitude || "",
        h1_title: initialData.h1_title || "",
        seo_title: initialData.seo_title || "",
        seo_description: initialData.seo_description || "",
        seo_keywords: initialData.seo_keywords || "",
      });
    } else {
      form.reset({
        name: "", slug: "", isActive: true, latitude: "", longitude: "",
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
      });
    }
    setIsSlugEditable(false);
  }, [initialData, form]);

  const handleFetchCoordinates = async () => {
    const cityName = form.getValues("name");
    if (!cityName) {
      toast({
        title: "City name required",
        description: "Please enter a city name first.",
        variant: "destructive"
      });
      return;
    }
    setIsGeocoding(true);
    try {
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(cityName + ", India")}`);
      const data = await res.json();
      if (data.lat && data.lon) {
        form.setValue("latitude", data.lat, { shouldValidate: true, shouldDirty: true });
        form.setValue("longitude", data.lon, { shouldValidate: true, shouldDirty: true });
        toast({
          title: "Location details captured!",
          description: `Coordinates resolved: ${data.lat}, ${data.lon}`
        });
      } else {
        toast({
          title: "Not found",
          description: "Could not find coordinates for this city.",
          variant: "destructive"
        });
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to fetch coordinates.",
        variant: "destructive"
      });
    } finally {
      setIsGeocoding(false);
    }
  };
  
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

  const handleGenerateFreeSeo = async () => {
    const cityName = form.getValues("name");
    if (!cityName || cityName.trim() === "") {
        toast({
            title: "City Name Required",
            description: "Please enter a city name before generating SEO content.",
            variant: "destructive",
        });
        return;
    }

    try {
        // Fetch top categories dynamically to use in city page meta text
        const catsRef = collection(db, "adminCategories");
        const snap = await getDocs(query(catsRef, where("isActive", "==", true), orderBy("order", "asc"), limit(10)));
        const categoryNames = snap.docs.map(d => d.data().name);

        const areasRef = collection(db, "areas");
        const cityId = initialData?.id || "";
        const areasSnap = cityId ? await getDocs(query(areasRef, where("cityId", "==", cityId), where("isActive", "==", true))) : { docs: [] };
        const fallbackNearby = areasSnap.docs.map(d => ({
          id: d.id,
          name: d.data().name,
          slug: d.data().slug
        }));

        const result = generateFreeCitySeoData(cityName, categoryNames, fallbackNearby);

        form.setValue("h1_title", result.h1_title, { shouldValidate: true, shouldDirty: true });
        form.setValue("seo_title", result.seo_title, { shouldValidate: true, shouldDirty: true });
        form.setValue("seo_description", result.seo_description, { shouldValidate: true, shouldDirty: true });
        form.setValue("seo_keywords", result.seo_keywords, { shouldValidate: true, shouldDirty: true });

        toast({ 
            title: "Content Generated (Free)!", 
            description: "SEO fields have been auto-populated using dynamic templates.",
            className: "bg-green-100 border-green-300 text-green-700" 
        });
    } catch (error) {
        console.error("Error generating free city SEO:", error);
        toast({ title: "Error", description: "Failed to generate free SEO content.", variant: "destructive" });
    }
  };

  const handleGenerateSeo = async () => {
    const cityName = form.getValues("name");
    if (!cityName || cityName.trim() === "") {
        toast({
            title: "City Name Required",
            description: "Please enter a city name before generating SEO content.",
            variant: "destructive",
        });
        return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
        const result = await generateCitySeo({ cityName });
        form.setValue("h1_title", result.h1_title, { shouldValidate: true });
        form.setValue("seo_title", result.seo_title, { shouldValidate: true });
        form.setValue("seo_description", result.seo_description, { shouldValidate: true });
        form.setValue("seo_keywords", result.seo_keywords, { shouldValidate: true });
        toast({ title: "Content Generated!", description: "SEO fields have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
        console.error("Error generating city SEO:", error);
        toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
        setIsGeneratingSeo(false);
    }
  };


  const handleCopyLink = () => {
    const slug = form.getValues("slug");
    if (!slug) {
      toast({ title: "Cannot copy", description: "Slug must be set first.", variant: "warning" });
      return;
    }
    const fullUrl = `${window.location.origin}/${slug}`;
    navigator.clipboard.writeText(fullUrl);
    toast({ title: "Copied!", description: "Link copied to clipboard." });
  };

  const handleVisitPage = () => {
    const slug = form.getValues("slug");
    if (!slug) {
      toast({ title: "Cannot visit", description: "Slug must be set first.", variant: "warning" });
      return;
    }
    window.open(`/${slug}`, '_blank');
  };

  const handleSubmit = async (formData: CityFormData) => {
    await onSubmitProp({
      ...formData,
      slug: formData.slug || "",
      id: initialData?.id,
      latitude: formData.latitude ? Number(formData.latitude) : undefined,
      longitude: formData.longitude ? Number(formData.longitude) : undefined,
    });
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="flex gap-2 items-end">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel>City Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., New Delhi" {...field} disabled={isSubmitting || isGeneratingSeo || isGeocoding} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleFetchCoordinates}
            disabled={isSubmitting || isGeneratingSeo || isGeocoding || !watchedName}
          >
            {isGeocoding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "📍 Auto-Fetch Coordinates"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="latitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Latitude</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="e.g., 28.6139" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : "")} disabled={isSubmitting || isGeneratingSeo || isGeocoding} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="longitude"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Longitude</FormLabel>
                <FormControl>
                  <Input type="number" step="any" placeholder="e.g., 77.2090" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : "")} disabled={isSubmitting || isGeneratingSeo || isGeocoding} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <FormLabel>Slug {initialData ? "(Editing might affect SEO)" : "(Auto-generated or custom)"}</FormLabel>
                <div className="flex flex-wrap items-center gap-1">
                  {watchedSlug && (
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
                    disabled={isSubmitting || isGeneratingSeo}
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
                    placeholder="e.g., new-delhi"
                    {...field}
                    onChange={(e) => field.onChange(generateSlug(e.target.value))}
                    disabled={isSubmitting || isGeneratingSeo || !isSlugEditable}
                    className={cn(
                      "flex h-10 w-full rounded-r-md bg-transparent px-3 py-2 text-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 font-mono text-xs",
                      !isSlugEditable && "bg-muted/30"
                    )}
                  />
                </div>
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
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5">
                <FormLabel>City Active</FormLabel>
                <FormDescription>If unchecked, this city will not be shown publicly.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting || isGeneratingSeo} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="space-y-4 pt-4 border-t">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h3 className="text-md font-semibold text-muted-foreground">SEO Settings (Optional)</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateFreeSeo}
                    disabled={isGeneratingSeo || isSubmitting || !watchedName}
                >
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    Auto-Fill (Free)
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSeo}
                    disabled={isGeneratingSeo || isSubmitting || !watchedName}
                >
                    {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Generate AI SEO
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
            <FormField control={form.control} name="h1_title" render={({ field }) => (
                <FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Best Home Services in New Delhi" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_title" render={({ field }) => (
                <FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., New Delhi Home Services | Yourbrand" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_description" render={({ field }) => (
                <FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Find top home services in New Delhi. Yourbrand offers quality and convenience." {...field} rows={3} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_keywords" render={({ field }) => (
                <FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., new delhi services, home repair delhi" {...field} disabled={isSubmitting || isGeneratingSeo} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting || isGeneratingSeo}>
                Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isGeneratingSeo}>
                {(isSubmitting || isGeneratingSeo) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? 'Save Changes' : 'Create City'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
