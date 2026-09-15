
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import type { ServiceZone, FirestoreCategory } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2, Save, Search } from "lucide-react";
import dynamic from 'next/dynamic';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, where } from '@/lib/mysqlDb';
import { ScrollArea } from "@/components/ui/scroll-area";

const ZoneMapSelector = dynamic(() => import('@/components/admin/ZoneMapSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin" /></div>,
  ssr: false
});

const serviceZoneFormSchema = z.object({
  name: z.string().min(2, "Zone name must be at least 2 characters.").max(100),
  radiusKm: z.coerce.number().min(0.1, "Radius must be at least 0.1 km."),
  center: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  categoryIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export type ServiceZoneFormData = z.infer<typeof serviceZoneFormSchema>;

interface ServiceZoneFormProps {
  onSubmit: (data: ServiceZoneFormData) => Promise<void>;
  initialData?: ServiceZone | null;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const DEFAULT_MAP_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore

export default function ServiceZoneForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting = false }: ServiceZoneFormProps) {
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [categories, setCategories] = useState<FirestoreCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categorySearch, setCategorySearch] = useState("");

  useEffect(() => {
    async function fetchCategories() {
      try {
        const q = query(collection(db, "adminCategories"), orderBy("order", "asc"));
        const snapshot = await getDocs(q);
        const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreCategory));
        setCategories(cats);
      } catch (error) {
        console.error("Error fetching categories:", error);
      } finally {
        setIsLoadingCategories(false);
      }
    }
    fetchCategories();
  }, []);

  const form = useForm<ServiceZoneFormData>({
    resolver: zodResolver(serviceZoneFormSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      radiusKm: initialData.radiusKm,
      center: { lat: initialData.center.latitude, lng: initialData.center.longitude },
      categoryIds: initialData.categoryIds || [],
      isActive: initialData.isActive,
    } : {
      name: "",
      radiusKm: 5,
      center: DEFAULT_MAP_CENTER,
      categoryIds: [],
      isActive: true,
    },
  });

  const filteredCategories = categories.filter(cat => 
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const handleMapUpdate = (center: google.maps.LatLngLiteral) => {
    form.setValue("center", center);
  };

  const handleSubmit = async (formData: ServiceZoneFormData) => {
    await onSubmitProp(formData);
  };
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full">
        <div className="p-3 space-y-6 flex-grow">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zone Name</FormLabel>
                    <FormControl><Input placeholder="e.g., South Bangalore" {...field} disabled={isSubmitting} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="radiusKm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Radius (in kilometers)</FormLabel>
                    <FormControl><Input type="number" step="0.1" placeholder="e.g., 10" {...field} disabled={isSubmitting} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
                    <div className="space-y-0.5"><FormLabel>Zone Active</FormLabel><FormDescription>If unchecked, this zone will not be used.</FormDescription></div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSubmitting} /></FormControl>
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-4">
              <FormField
                control={form.control}
                name="categoryIds"
                render={() => (
                  <FormItem>
                    <div className="mb-2">
                      <FormLabel className="text-base">Target Categories</FormLabel>
                      <FormDescription>Select categories that this service zone applies to. If none selected, it applies to all categories.</FormDescription>
                    </div>
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search categories..."
                        className="pl-8"
                        value={categorySearch}
                        onChange={(e) => setCategorySearch(e.target.value)}
                        disabled={isSubmitting || isLoadingCategories}
                      />
                    </div>
                    <Card className="border shadow-none">
                      <ScrollArea className="h-[180px] p-4">
                        {isLoadingCategories ? (
                          <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                        ) : filteredCategories.length === 0 ? (
                          <div className="text-center text-muted-foreground py-4">No categories found.</div>
                        ) : (
                          <div className="space-y-2">
                            {filteredCategories.map((category) => (
                              <FormField
                                key={category.id}
                                control={form.control}
                                name="categoryIds"
                                render={({ field }) => {
                                  return (
                                    <FormItem
                                      key={category.id}
                                      className="flex flex-row items-start space-x-3 space-y-0"
                                    >
                                      <FormControl>
                                        <Checkbox
                                          checked={field.value?.includes(category.id)}
                                          onCheckedChange={(checked) => {
                                            return checked
                                              ? field.onChange([...field.value, category.id])
                                              : field.onChange(
                                                  field.value?.filter(
                                                    (value) => value !== category.id
                                                  )
                                                )
                                          }}
                                          disabled={isSubmitting}
                                        />
                                      </FormControl>
                                      <FormLabel className="text-sm font-normal cursor-pointer">
                                        {category.name}
                                      </FormLabel>
                                    </FormItem>
                                  )
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </Card>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <FormItem>
            <FormLabel>Set Zone Center & Radius on Map</FormLabel>
            <div className="h-[400px] w-full rounded-md overflow-hidden border">
              {!isLoadingAppSettings && appConfig.googleMapsApiKey ? (
                <ZoneMapSelector
                  apiKey={appConfig.googleMapsApiKey}
                  center={form.watch('center')}
                  radiusKm={form.watch('radiusKm')}
                  onCenterChange={handleMapUpdate}
                />
              ) : (<div className="flex items-center justify-center h-full bg-muted"><p>Google Maps API key not configured.</p></div>)}
            </div>
          </FormItem>
        </div>
        <div className="p-3 border-t mt-auto flex justify-end space-x-3 bg-muted/50 sticky bottom-0">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Save Changes' : 'Create Zone'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
