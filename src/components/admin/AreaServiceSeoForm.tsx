"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FirestoreCity, FirestoreArea, FirestoreService, AreaServiceSeoSetting } from '@/types/firestore';
import { useEffect, useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Loader2, Edit2, Lock, CheckCircle, Search, MapPin, Building, Tags, Plus, Trash2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { generateFreeAreaServiceSeoData, getNearbyAreasSorted } from "@/lib/seoGenerator";
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, limit } from '@/lib/mysqlDb';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { replacePlaceholders, defaultSeoValues } from "@/lib/seoUtils";

const generateSeoSlug = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).map(part => part!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).join('/');
};

const areaServiceSeoFormSchema = z.object({
  cityId: z.string({ required_error: "Please select a city." }),
  areaId: z.string({ required_error: "Please select an area." }),
  serviceId: z.string({ required_error: "Please select a service." }),
  slug: z.string().optional().or(z.literal('')),
  h1_title: z.string().optional().or(z.literal('')),
  meta_title: z.string().optional().or(z.literal('')),
  meta_description: z.string().optional().or(z.literal('')),
  meta_keywords: z.string().optional().or(z.literal('')),
  seo_content: z.string().optional().or(z.literal('')),
  faqs: z.array(z.object({
    question: z.string().min(5, "Question must be at least 5 characters."),
    answer: z.string().min(5, "Answer must be at least 5 characters."),
  })).optional(),
  isActive: z.boolean().default(true),
});

export type AreaServiceSeoFormData = z.infer<typeof areaServiceSeoFormSchema>;

interface AreaServiceSeoFormProps {
  onSubmit: (data: AreaServiceSeoFormData & { id?: string }) => Promise<void>;
  initialData?: AreaServiceSeoSetting | null;
  existingSettings?: AreaServiceSeoSetting[];
  cities: FirestoreCity[];
  areas: FirestoreArea[];
  services: FirestoreService[];
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function AreaServiceSeoForm({ 
  onSubmit: onSubmitProp, 
  initialData, 
  existingSettings = [],
  cities, 
  areas, 
  services, 
  onCancel, 
  isSubmitting = false 
}: AreaServiceSeoFormProps) {
  const [filteredAreas, setFilteredAreas] = useState<FirestoreArea[]>([]);
  const [isSlugEditable, setIsSlugEditable] = useState(false);
  const [globalSeo, setGlobalSeo] = useState<any>(null);
  
  const initialId = initialData?.id;
  const initialCityId = initialData?.cityId;

  useEffect(() => {
    getDoc(doc(db, "seoSettings", "global")).then(snap => {
      if (snap.exists()) {
        setGlobalSeo(snap.data());
      }
    });
  }, []);

  const [isCityPickerOpen, setIsCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [isAreaPickerOpen, setIsAreaPickerOpen] = useState(false);
  const [areaSearch, setAreaSearch] = useState("");
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  
  const { toast } = useToast();

  const form = useForm<AreaServiceSeoFormData>({
    resolver: zodResolver(areaServiceSeoFormSchema),
    defaultValues: {
      cityId: undefined, 
      areaId: undefined, 
      serviceId: undefined, 
      slug: "", 
      h1_title: "", 
      meta_title: "", 
      meta_description: "", 
      meta_keywords: "", 
      seo_content: "", 
      faqs: [], 
      isActive: true,
    },
  });

  const watchedCityId = form.watch("cityId");
  const watchedAreaId = form.watch("areaId");
  const watchedServiceId = form.watch("serviceId");
  const watchedSlug = form.watch("slug");

  const selectedCity = useMemo(() => cities.find(c => c.id === watchedCityId), [cities, watchedCityId]);
  const selectedArea = useMemo(() => areas.find(a => a.id === watchedAreaId), [areas, watchedAreaId]);
  const selectedService = useMemo(() => services.find(s => s.id === watchedServiceId), [services, watchedServiceId]);

  const searchableCities = useMemo(() => {
    return cities.filter(c => c.name.toLowerCase().includes(citySearch.toLowerCase()));
  }, [cities, citySearch]);

  const searchableAreas = useMemo(() => {
    return filteredAreas.filter(a => a.name.toLowerCase().includes(areaSearch.toLowerCase()));
  }, [filteredAreas, areaSearch]);

  const searchableServices = useMemo(() => {
    return services.filter(s => s.name.toLowerCase().includes(serviceSearch.toLowerCase()));
  }, [services, serviceSearch]);

  const isEditing = !!initialData;
  const effectiveIsSubmitting = isSubmitting;

  const checkSlugUniqueness = useCallback(async (baseSlug: string, currentId?: string) => {
    let uniqueSlug = baseSlug;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      const q = query(
        collection(db, "areaServiceSeoSettings"),
        where("slug", "==", uniqueSlug),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        isUnique = true;
      } else {
        const docSnap = querySnapshot.docs[0];
        if (currentId && docSnap.id === currentId) {
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
      const areasForInitialCity = areas.filter(a => a.cityId === initialData.cityId);
      setFilteredAreas(areasForInitialCity);
      form.reset({
        cityId: initialData.cityId,
        areaId: initialData.areaId,
        serviceId: initialData.serviceId,
        slug: initialData.slug || "",
        h1_title: initialData.h1_title || "",
        meta_title: initialData.meta_title || "",
        meta_description: initialData.meta_description || "",
        meta_keywords: initialData.meta_keywords || "",
        seo_content: initialData.seo_content || "",
        faqs: initialData.faqs || [],
        isActive: initialData.isActive !== false,
      });
    }
  }, [initialData, areas, form]);

  useEffect(() => {
    if (watchedCityId) {
      const filtered = areas.filter(a => a.cityId === watchedCityId);
      setFilteredAreas(filtered);
      
      if (!isEditing && initialCityId !== watchedCityId) {
        form.setValue("areaId", "");
      }
    } else {
      setFilteredAreas([]);
      if (!isEditing) {
        form.setValue("areaId", "");
      }
    }
  }, [watchedCityId, areas, form, isEditing, initialCityId]);

  // Auto-generate Slug, Title, SEO Content & FAQs
  useEffect(() => {
    if (!isEditing && selectedCity && selectedArea && selectedService && !isSlugEditable) {
      const generated = generateSeoSlug([selectedCity.slug, selectedArea.slug, "service", selectedService.slug]);
      
      checkSlugUniqueness(generated, initialId).then(uniqueSlug => {
        form.setValue("slug", uniqueSlug);
      });

      // Set fallback titles
      const cleanServiceName = selectedService.name;
      form.setValue("h1_title", `${cleanServiceName} in ${selectedArea.name}, ${selectedCity.name}`);
      form.setValue("meta_title", `${cleanServiceName} in ${selectedArea.name}, ${selectedCity.name} | Yourbrand`);
      form.setValue("meta_description", `Professional ${cleanServiceName} services in ${selectedArea.name}, ${selectedCity.name}. Trusted, transparent pricing, verified experts by Yourbrand.`);
      form.setValue("meta_keywords", `${cleanServiceName} in ${selectedArea.name}, ${cleanServiceName} near me, best ${cleanServiceName} in ${selectedCity.name}`);

      // Auto-populate SEO Content details from global/default template
      const contentTemplate = globalSeo?.areaServiceSeoContentTemplate || defaultSeoValues.areaServiceSeoContentTemplate || "";
      const parsedContent = replacePlaceholders(contentTemplate, {
        cityName: selectedCity.name,
        areaName: selectedArea.name,
        serviceName: selectedService.name
      });
      form.setValue("seo_content", parsedContent);

      // Auto-populate FAQ Q&As from global/default template
      const faqsTemplate = globalSeo?.areaServiceFaqsTemplate || defaultSeoValues.areaServiceFaqsTemplate || [];
      const parsedFaqs = faqsTemplate.map((f: any) => ({
        question: replacePlaceholders(f.question, {
          cityName: selectedCity.name,
          areaName: selectedArea.name,
          serviceName: selectedService.name
        }),
        answer: replacePlaceholders(f.answer, {
          cityName: selectedCity.name,
          areaName: selectedArea.name,
          serviceName: selectedService.name
        })
      }));
      form.setValue("faqs", parsedFaqs);
    }
  }, [selectedCity, selectedArea, selectedService, isEditing, isSlugEditable, form, checkSlugUniqueness, initialId, globalSeo]);

  const handleGenerateFreeSeo = async () => {
    const cityId = form.getValues("cityId");
    const areaId = form.getValues("areaId");
    const serviceId = form.getValues("serviceId");

    const selectedCityObj = cities.find(c => c.id === cityId);
    const selectedAreaObj = areas.find(a => a.id === areaId);
    const selectedServiceObj = services.find(s => s.id === serviceId);

    if (!selectedCityObj || !selectedAreaObj || !selectedServiceObj) {
      toast({
        title: "City, Area & Service Required",
        description: "Please select a city, area, and service first.",
        variant: "destructive",
      });
      return;
    }

    try {
      let categoryName = "Home Services";
      if (selectedServiceObj.parentCategoryId) {
        const catDoc = await getDoc(doc(db, "adminCategories", selectedServiceObj.parentCategoryId));
        if (catDoc.exists()) {
          categoryName = catDoc.data().name;
        }
      }

      const fallbackNearby = getNearbyAreasSorted(selectedAreaObj, areas.filter(a => a.cityId === cityId), 10);

      const result = generateFreeAreaServiceSeoData(
        selectedCityObj.name,
        selectedAreaObj.name,
        categoryName,
        selectedServiceObj.name,
        fallbackNearby
      );

      form.setValue("h1_title", result.h1_title, { shouldValidate: true, shouldDirty: true });
      form.setValue("meta_title", result.seo_title, { shouldValidate: true, shouldDirty: true });
      form.setValue("meta_description", result.seo_description, { shouldValidate: true, shouldDirty: true });
      form.setValue("meta_keywords", result.seo_keywords, { shouldValidate: true, shouldDirty: true });
      form.setValue("seo_content", result.seo_content, { shouldValidate: true, shouldDirty: true });
      form.setValue("faqs", result.faqs, { shouldValidate: true, shouldDirty: true });

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

  const handleSlugBlur = async () => {
    const rawVal = form.getValues("slug");
    if (!rawVal) return;
    const formatted = generateSeoSlug([rawVal]);
    const unique = await checkSlugUniqueness(formatted, initialId);
    form.setValue("slug", unique);
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

  const onSubmit = async (formData: AreaServiceSeoFormData) => {
    try {
      const uniqueSlug = watchedSlug ? watchedSlug : generateSeoSlug([selectedCity?.slug, selectedArea?.slug, "service", selectedService?.slug]);
      const finalSlug = await checkSlugUniqueness(uniqueSlug, initialId);
      
      await onSubmitProp({
        ...formData,
        slug: finalSlug,
        id: initialId
      });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to validate SEO config slug.", variant: "destructive" });
    }
  };

  // FAQ handlers
  const faqsList = form.watch("faqs") || [];
  const handleAddFaq = () => {
    form.setValue("faqs", [...faqsList, { question: "", answer: "" }]);
  };

  const handleRemoveFaq = (index: number) => {
    const copy = [...faqsList];
    copy.splice(index, 1);
    form.setValue("faqs", copy);
  };

  const handleFaqChange = (index: number, field: "question" | "answer", value: string) => {
    const copy = [...faqsList];
    copy[index] = { ...copy[index], [field]: value };
    form.setValue("faqs", copy);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* City Picker */}
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
                    <DialogDescription>Search and select a city. ✅ indicates existing SEO settings.</DialogDescription>
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
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        {searchableCities.length === 0 ? (
                          <p className="text-center py-4 text-sm text-muted-foreground">No cities found.</p>
                        ) : (
                          searchableCities.map((city) => {
                            const generatedAreas = Array.from(new Set(existingSettings
                              .filter(s => s.cityId === city.id)
                              .map(s => s.areaName)));
                            const hasGenerated = generatedAreas.length > 0;

                            return (
                              <Button
                                key={city.id}
                                variant={field.value === city.id ? "secondary" : "ghost"}
                                className="w-full justify-start text-left h-auto py-2.5 px-3 relative whitespace-normal"
                                onClick={() => {
                                  field.onChange(city.id);
                                  setIsCityPickerOpen(false);
                                  setCitySearch("");
                                }}
                              >
                                <div className="flex flex-col gap-1 pr-6 text-left">
                                  <span className="font-semibold text-sm">{city.name}</span>
                                  {hasGenerated && (
                                    <span className="text-[10px] text-muted-foreground whitespace-normal break-words text-left">
                                      Has overrides: {generatedAreas.join(", ")}
                                    </span>
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

          {/* Area Picker */}
          <FormField control={form.control} name="areaId" render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Area</FormLabel>
              <Dialog open={isAreaPickerOpen} onOpenChange={setIsAreaPickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between text-left font-normal",
                      !field.value && "text-muted-foreground"
                    )}
                    disabled={effectiveIsSubmitting || isEditing || !watchedCityId || filteredAreas.length === 0}
                  >
                    {selectedArea ? (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-primary" />
                        <span>{selectedArea.name}</span>
                      </div>
                    ) : (
                      !watchedCityId ? "Select city first" : "Search and select area..."
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Area</DialogTitle>
                    <DialogDescription>Search areas in the selected city. ✅ indicates existing SEO settings.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Type area name..."
                        className="pl-8"
                        value={areaSearch}
                        onChange={(e) => setAreaSearch(e.target.value)}
                      />
                    </div>
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        {searchableAreas.length === 0 ? (
                          <p className="text-center py-4 text-sm text-muted-foreground">No areas found.</p>
                        ) : (
                          searchableAreas.map((area) => {
                            const generatedServices = existingSettings
                              .filter(s => s.areaId === area.id)
                              .map(s => s.serviceName);
                            const hasGenerated = generatedServices.length > 0;
                            
                            return (
                              <Button
                                key={area.id}
                                variant={field.value === area.id ? "secondary" : "ghost"}
                                className="w-full justify-start text-left h-auto py-2.5 px-3 relative whitespace-normal"
                                onClick={() => {
                                  field.onChange(area.id);
                                  setIsAreaPickerOpen(false);
                                  setAreaSearch("");
                                }}
                              >
                                <div className="flex flex-col gap-1 pr-6 text-left">
                                  <span className="font-semibold text-sm">{area.name}</span>
                                  {hasGenerated && (
                                    <span className="text-[10px] text-muted-foreground whitespace-normal break-words text-left">
                                      Has overrides: {generatedServices.join(", ")}
                                    </span>
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

          {/* Service Picker */}
          <FormField control={form.control} name="serviceId" render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Service</FormLabel>
              <Dialog open={isServicePickerOpen} onOpenChange={setIsServicePickerOpen}>
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
                    {selectedService ? (
                      <div className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-primary" />
                        <span>{selectedService.name}</span>
                      </div>
                    ) : (
                      "Search and select service..."
                    )}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Service</DialogTitle>
                    <DialogDescription>Search services. ✅ indicates existing SEO for the chosen area.</DialogDescription>
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
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        {searchableServices.length === 0 ? (
                          <p className="text-center py-4 text-sm text-muted-foreground">No services found.</p>
                        ) : (
                          searchableServices.map((service) => {
                            const isGenerated = watchedCityId && watchedAreaId && existingSettings.some(
                              s => s.cityId === watchedCityId && s.areaId === watchedAreaId && s.serviceId === service.id
                            );

                            return (
                              <Button
                                key={service.id}
                                variant={field.value === service.id ? "secondary" : "ghost"}
                                className="w-full justify-start text-left h-auto py-3 px-3 relative group whitespace-normal break-words"
                                onClick={() => {
                                  field.onChange(service.id);
                                  setIsServicePickerOpen(false);
                                  setServiceSearch("");
                                }}
                              >
                                <div className="flex flex-col gap-1 pr-8">
                                  <span className="font-semibold text-sm">{service.name}</span>
                                  {isGenerated && (
                                    <Badge variant="outline" className="text-[10px] py-0 h-4 bg-green-50 text-green-700 border-green-200 w-fit">
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
        </div>

        {/* Slug Input */}
        <FormField control={form.control} name="slug" render={({ field }) => (
          <FormItem>
            <FormLabel className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span>SEO Slug URL Path</span>
              <div className="flex flex-wrap items-center gap-1">
                {watchedSlug && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyLink}
                      className="h-6 text-[10px] py-0 px-2 text-primary hover:text-primary/80 hover:bg-muted"
                    >
                      Copy Link
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleVisitPage}
                      className="h-6 text-[10px] py-0 px-2 text-primary hover:text-primary/80 hover:bg-muted"
                    >
                      Open Page
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-6 text-[10px] py-0 px-2"
                  onClick={() => setIsSlugEditable(!isSlugEditable)}
                >
                  {isSlugEditable ? <Lock className="mr-1 h-3 w-3" /> : <Edit2 className="mr-1 h-3 w-3" />}
                  {isSlugEditable ? "Lock Auto-slug" : "Customize Slug"}
                </Button>
              </div>
            </FormLabel>
            <FormControl>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-xs text-muted-foreground font-mono select-none">/</span>
                <Input
                  {...field}
                  className="pl-6 font-mono text-sm"
                  disabled={!isSlugEditable || effectiveIsSubmitting}
                  onBlur={handleSlugBlur}
                  placeholder="bangalore/whitefield/service/bed-dismantle"
                />
              </div>
            </FormControl>
            <FormDescription>The clean, localized canonical path that visitors will navigate to.</FormDescription>
            <FormMessage />
          </FormItem>
        )}/>

        <div className="space-y-4 pt-4 border-t">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <h3 className="text-md font-semibold text-muted-foreground">SEO Content</h3>
            <Button type="button" variant="outline" size="sm" onClick={handleGenerateFreeSeo} disabled={effectiveIsSubmitting || !watchedCityId || !watchedAreaId || !watchedServiceId}>
              <Sparkles className="mr-2 h-4 w-4 text-primary" />
              Auto-Fill (Free)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Generate localized spinned description and FAQ schema blocks for free.</p>
        </div>

        {/* H1 Title */}
        <FormField control={form.control} name="h1_title" render={({ field }) => (
          <FormItem>
            <FormLabel>H1 Page Heading</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Bed dismantling services in Whitefield" {...field} disabled={effectiveIsSubmitting} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}/>

        {/* Meta Title & Keywords */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField control={form.control} name="meta_title" render={({ field }) => (
            <FormItem>
              <FormLabel>SEO Meta Title</FormLabel>
              <FormControl>
                <Input placeholder="Search Engine Snippet Title" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}/>

          <FormField control={form.control} name="meta_keywords" render={({ field }) => (
            <FormItem>
              <FormLabel>SEO Meta Keywords (Comma separated)</FormLabel>
              <FormControl>
                <Input placeholder="bed dismantle, whitefield carpenter" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}/>
        </div>

        {/* Meta Description */}
        <FormField control={form.control} name="meta_description" render={({ field }) => (
          <FormItem>
            <FormLabel>SEO Meta Description</FormLabel>
            <FormControl>
              <Textarea placeholder="Write a description to show in search results..." {...field} disabled={effectiveIsSubmitting} rows={3} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}/>

        {/* SEO Long Form Text Details */}
        <FormField control={form.control} name="seo_content" render={({ field }) => (
          <FormItem>
            <FormLabel>SEO Content Details (Shown on bottom of landing page)</FormLabel>
            <FormControl>
              <Textarea placeholder="HTML/text describing service details, pricing, highlights, etc. in this area..." {...field} disabled={effectiveIsSubmitting} rows={8} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}/>

        {/* Dynamic FAQ Builder */}
        <div className="space-y-4 border rounded-xl p-4 bg-muted/20">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-foreground">SEO Question & Answers (FAQs)</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddFaq}
              disabled={effectiveIsSubmitting}
            >
              <Plus className="mr-1 h-4 w-4" /> Add FAQ
            </Button>
          </div>

          {faqsList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No FAQs defined. Click button to add.</p>
          ) : (
            <div className="space-y-4">
              {faqsList.map((faq, index) => (
                <div key={index} className="flex gap-3 items-start border p-3 rounded-lg bg-card shadow-sm">
                  <div className="flex-grow space-y-2.5">
                    <Input
                      placeholder={`Question ${index + 1}`}
                      value={faq.question}
                      onChange={(e) => handleFaqChange(index, "question", e.target.value)}
                      disabled={effectiveIsSubmitting}
                      className="h-9"
                    />
                    <Textarea
                      placeholder={`Answer ${index + 1}`}
                      value={faq.answer}
                      onChange={(e) => handleFaqChange(index, "answer", e.target.value)}
                      disabled={effectiveIsSubmitting}
                      rows={2}
                      className="text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFaq(index)}
                    disabled={effectiveIsSubmitting}
                    className="text-destructive hover:bg-destructive/5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Toggle Switch */}
        <FormField control={form.control} name="isActive" render={({ field }) => (
          <FormItem className="flex items-center justify-between border p-3 rounded-lg">
            <div className="space-y-0.5">
              <FormLabel className="text-sm">Status Active</FormLabel>
              <FormDescription className="text-xs">Publish this localized service landing page to visual maps and search indexing.</FormDescription>
            </div>
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={effectiveIsSubmitting} />
            </FormControl>
          </FormItem>
        )}/>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={effectiveIsSubmitting} className="min-w-[120px]">
            {effectiveIsSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              "Save Override"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
