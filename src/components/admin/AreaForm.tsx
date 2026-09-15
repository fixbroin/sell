"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FirestoreArea, FirestoreCity } from '@/types/firestore';
import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, Wand2, Edit2, Lock, Search, Building, Sparkles } from "lucide-react";
import { generateAreaSeo } from '@/ai/flows/generateAreaSeoFlow';
import { generateFreeAreaSeoData } from "@/lib/seoGenerator";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, limit, orderBy } from '@/lib/mysqlDb';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const generateSlug = (name: string) => {
  if (!name) return "";
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

const areaFormSchema = z.object({
  name: z.string().min(2, { message: "Area name must be at least 2 characters." }),
  slug: z.string().min(2, "Slug must be at least 2 characters.").regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Invalid slug format (e.g., my-area-name).").optional().or(z.literal('')),
  cityId: z.string({ required_error: "Please select a parent city." }),
  isActive: z.boolean().default(true),
  latitude: z.string().or(z.number()).optional().nullable(),
  longitude: z.string().or(z.number()).optional().nullable(),
  // SEO Fields
  h1_title: z.string().optional().or(z.literal('')),
  seo_title: z.string().optional().or(z.literal('')),
  seo_description: z.string().optional().or(z.literal('')),
  seo_keywords: z.string().optional().or(z.literal('')),
});

type AreaFormData = z.infer<typeof areaFormSchema>;

interface AreaFormProps {
  onSubmit: (data: Omit<FirestoreArea, 'id' | 'cityName' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreArea | null;
  onCancel: () => void;
  cities: FirestoreCity[]; // To populate parent city dropdown
  isSubmitting?: boolean; 
}

export default function AreaForm({ onSubmit: onSubmitProp, initialData, onCancel, cities, isSubmitting = false }: AreaFormProps) {
  const [isGeneratingSeo, setIsGeneratingSeo] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isSlugEditable, setIsSlugEditable] = useState(false);
  
  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  
  const { toast } = useToast();
  
  const form = useForm<AreaFormData>({
    resolver: zodResolver(areaFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      cityId: undefined,
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
  const watchedCityId = form.watch("cityId");
  const watchedSlug = form.watch("slug");

  const selectedCity = useMemo(() => cities.find(c => c.id === watchedCityId), [cities, watchedCityId]);
  
  const searchableCities = useMemo(() => {
    return cities.filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase()));
  }, [cities, citySearch]);

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "areas"),
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

  const handleFetchCoordinates = async () => {
    const areaName = form.getValues("name");
    if (!areaName) {
      toast({
        title: "Area name required",
        description: "Please enter an area name first.",
        variant: "destructive"
      });
      return;
    }
    if (!selectedCity) {
      toast({
        title: "City required",
        description: "Please select a parent city first to ensure geocoding accuracy.",
        variant: "destructive"
      });
      return;
    }
    setIsGeocoding(true);
    try {
      const q = `${areaName}, ${selectedCity.name}, India`;
      const res = await fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`);
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
          description: "Could not find coordinates for this area.",
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
    if (initialData) {
      form.reset({
        name: initialData.name,
        slug: initialData.slug,
        cityId: initialData.cityId,
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
        name: "", slug: "", cityId: undefined, isActive: true, latitude: "", longitude: "",
        h1_title: "", seo_title: "", seo_description: "", seo_keywords: "",
      });
    }
    setIsSlugEditable(false);
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

  const handleGenerateFreeSeo = async () => {
    const areaName = form.getValues("name");
    const cityId = form.getValues("cityId");
    const parentCity = cities.find(c => c.id === cityId);

    if (!areaName || !parentCity) {
      toast({
        title: "Area & City Required",
        description: "Please enter an area name and select a parent city first.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Fetch top categories dynamically to use in area page meta text
      const catsRef = collection(db, "adminCategories");
      const snap = await getDocs(query(catsRef, where("isActive", "==", true), orderBy("order", "asc"), limit(10)));
      const categoryNames = snap.docs.map(d => d.data().name);

      const areasRef = collection(db, "areas");
      const currentAreaId = initialData?.id || "";
      const areasSnap = cityId ? await getDocs(query(areasRef, where("cityId", "==", cityId), where("isActive", "==", true))) : { docs: [] };
      const otherAreas = areasSnap.docs
        .filter(d => d.id !== currentAreaId)
        .map(d => ({ id: d.id, name: d.data().name, slug: d.data().slug }));

      const result = generateFreeAreaSeoData(parentCity.name, areaName, categoryNames, otherAreas);

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
      console.error("Error generating free area SEO:", error);
      toast({ title: "Error", description: "Failed to generate free SEO content.", variant: "destructive" });
    }
  };

  const handleGenerateSeo = async () => {
    const areaName = form.getValues("name");
    const cityId = form.getValues("cityId");
    const parentCity = cities.find(c => c.id === cityId);

    if (!areaName || !parentCity) {
      toast({
        title: "Area & City Required",
        description: "Please enter an area name and select a parent city first.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSeo(true);
    toast({ title: "Generating SEO Content...", description: "Please wait a moment." });
    try {
      const result = await generateAreaSeo({ areaName, cityName: parentCity.name });
      form.setValue("h1_title", result.h1_title, { shouldValidate: true });
      form.setValue("seo_title", result.seo_title, { shouldValidate: true });
      form.setValue("seo_description", result.seo_description, { shouldValidate: true });
      form.setValue("seo_keywords", result.seo_keywords, { shouldValidate: true });
      toast({ title: "Content Generated!", description: "SEO fields and FAQs have been populated.", className: "bg-green-100 border-green-300 text-green-700" });
    } catch (error) {
      console.error("Error generating area SEO:", error);
      toast({ title: "AI Error", description: (error as Error).message || "Failed to generate SEO content.", variant: "destructive" });
    } finally {
      setIsGeneratingSeo(false);
    }
  };


  const handleCopyLink = () => {
    const areaSlug = form.getValues("slug");
    if (!selectedCity || !areaSlug) {
      toast({ title: "Cannot copy", description: "City and area slug must be set first.", variant: "warning" });
      return;
    }
    const fullUrl = `${window.location.origin}/${selectedCity.slug}/${areaSlug}`;
    navigator.clipboard.writeText(fullUrl);
    toast({ title: "Copied!", description: "Link copied to clipboard." });
  };

  const handleVisitPage = () => {
    const areaSlug = form.getValues("slug");
    if (!selectedCity || !areaSlug) {
      toast({ title: "Cannot visit", description: "City and area slug must be set first.", variant: "warning" });
      return;
    }
    window.open(`/${selectedCity.slug}/${areaSlug}`, '_blank');
  };

  const handleSubmit = async (formData: AreaFormData) => {
    await onSubmitProp({
      ...formData,
      slug: formData.slug || "",
      id: initialData?.id,
      latitude: formData.latitude ? Number(formData.latitude) : undefined,
      longitude: formData.longitude ? Number(formData.longitude) : undefined,
    });
  };
  
  const effectiveIsSubmitting = isSubmitting || isGeneratingSeo;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="flex gap-2 items-end">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="flex-grow">
                <FormLabel>Area Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Whitefield" {...field} disabled={effectiveIsSubmitting || isGeocoding} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleFetchCoordinates}
            disabled={effectiveIsSubmitting || isGeocoding || !watchedName || !watchedCityId}
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
                  <Input type="number" step="any" placeholder="e.g., 12.9698" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : "")} disabled={effectiveIsSubmitting || isGeocoding} />
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
                  <Input type="number" step="any" placeholder="e.g., 77.7500" {...field} value={field.value ?? ""} onChange={e => field.onChange(e.target.value ? parseFloat(e.target.value) : "")} disabled={effectiveIsSubmitting || isGeocoding} />
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
                  {selectedCity && watchedSlug && (
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
                    {selectedCity?.slug || "city"}/
                  </span>
                  <input
                    type="text"
                    placeholder="e.g., whitefield"
                    {...field}
                    onChange={(e) => field.onChange(generateSlug(e.target.value))}
                    disabled={effectiveIsSubmitting || !isSlugEditable}
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
          name="cityId"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Parent City</FormLabel>
              <Dialog open={isCityPickerOpen} onOpenChange={setIsCityPickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between text-left font-normal",
                      !field.value && "text-muted-foreground"
                    )}
                    disabled={effectiveIsSubmitting || cities.length === 0}
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
                      Search and select a parent city for this area.
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
                          searchableCities.map((city) => (
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
                              <span className="font-semibold text-sm">{city.name}</span>
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
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5">
                <FormLabel>Area Active</FormLabel>
                <FormDescription>If unchecked, this area will not be shown publicly.</FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} />
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
                    disabled={isGeneratingSeo || isSubmitting || !watchedName || !watchedCityId}
                >
                    <Sparkles className="mr-2 h-4 w-4 text-primary" />
                    Auto-Fill (Free)
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateSeo}
                    disabled={isGeneratingSeo || isSubmitting || !watchedName || !watchedCityId}
                >
                    {isGeneratingSeo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                    Generate AI SEO
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leave blank to use global SEO patterns defined in SEO Settings.</p>
            <FormField control={form.control} name="h1_title" render={({ field }) => (
                <FormItem><FormLabel>H1 Title</FormLabel><FormControl><Input placeholder="e.g., Best Services in Whitefield, Bangalore" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_title" render={({ field }) => (
                <FormItem><FormLabel>Meta Title</FormLabel><FormControl><Input placeholder="e.g., Whitefield Services | Yourbrand" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_description" render={({ field }) => (
                <FormItem><FormLabel>Meta Description</FormLabel><FormControl><Textarea placeholder="e.g., Find all home services in Whitefield, Bangalore." {...field} rows={3} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
            <FormField control={form.control} name="seo_keywords" render={({ field }) => (
                <FormItem><FormLabel>Meta Keywords (comma-separated)</FormLabel><FormControl><Input placeholder="e.g., whitefield services, bangalore repair" {...field} disabled={effectiveIsSubmitting} /></FormControl><FormMessage /></FormItem>
            )}/>
        </div>
        
        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>
                Cancel
            </Button>
            <Button type="submit" disabled={effectiveIsSubmitting || (cities.length === 0 && !initialData) }>
                {effectiveIsSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? 'Save Changes' : 'Create Area'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
