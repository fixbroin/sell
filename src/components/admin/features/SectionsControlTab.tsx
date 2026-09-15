
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, Save, LayoutGrid, Star, Clock, ListChecks, FileText, Construction, Activity } from "lucide-react"; 
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { FeaturesConfiguration } from '@/types/firestore';
import { triggerRefresh } from '@/lib/revalidateUtils';

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";

const sectionsControlSchema = z.object({
  showMostPopularServices: z.boolean().default(true),
  showRecentlyAddedServices: z.boolean().default(true),
  showCategoryWiseServices: z.boolean().default(true),
  showBlogSection: z.boolean().default(true),
  showCustomServiceButton: z.boolean().default(true),
  enableUserActivityLogging: z.boolean().default(true),
  enableProviderActivityLogging: z.boolean().default(true),
});

type SectionsControlFormData = z.infer<typeof sectionsControlSchema>;

const defaultFeaturesConfig: SectionsControlFormData = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  showCustomServiceButton: true,
  enableUserActivityLogging: true,
  enableProviderActivityLogging: true,
};

export default function SectionsControlTab() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<SectionsControlFormData>({
    resolver: zodResolver(sectionsControlSchema),
    defaultValues: defaultFeaturesConfig,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
      const docSnap = await getDoc(configDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as FeaturesConfiguration;
        form.reset({
          showMostPopularServices: data.showMostPopularServices ?? defaultFeaturesConfig.showMostPopularServices,
          showRecentlyAddedServices: data.showRecentlyAddedServices ?? defaultFeaturesConfig.showRecentlyAddedServices,
          showCategoryWiseServices: data.showCategoryWiseServices ?? defaultFeaturesConfig.showCategoryWiseServices,
          showBlogSection: data.showBlogSection ?? defaultFeaturesConfig.showBlogSection,
          showCustomServiceButton: data.showCustomServiceButton ?? defaultFeaturesConfig.showCustomServiceButton,
          enableUserActivityLogging: data.enableUserActivityLogging ?? defaultFeaturesConfig.enableUserActivityLogging,
          enableProviderActivityLogging: data.enableProviderActivityLogging ?? defaultFeaturesConfig.enableProviderActivityLogging,
        });
      } else {
        form.reset(defaultFeaturesConfig);
      }
    } catch (error) {
      console.error("Error loading features configuration:", error);
      toast({ title: "Error", description: "Could not load section visibility settings.", variant: "destructive" });
      form.reset(defaultFeaturesConfig);
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: SectionsControlFormData) => {
    setIsSaving(true);
    try {
      const configDocRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
      const dataToSave: Partial<FeaturesConfiguration> = {
        showMostPopularServices: data.showMostPopularServices,
        showRecentlyAddedServices: data.showRecentlyAddedServices,
        showCategoryWiseServices: data.showCategoryWiseServices,
        showBlogSection: data.showBlogSection,
        showCustomServiceButton: data.showCustomServiceButton,
        enableUserActivityLogging: data.enableUserActivityLogging,
        enableProviderActivityLogging: data.enableProviderActivityLogging,
        updatedAt: Timestamp.now(),
      };
      await setDoc(configDocRef, dataToSave, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Homepage section visibility saved." });
    } catch (error) {
      console.error("Error saving features configuration:", error);
      toast({ title: "Error", description: "Could not save settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center"><LayoutGrid className="mr-2 h-5 w-5"/>Section Visibility Control</CardTitle><CardDescription>Manage which content sections appear on your homepage.</CardDescription></CardHeader>
        <CardContent className="space-y-4 p-3"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center"><LayoutGrid className="mr-2 h-5 w-5"/>Section Visibility Control</CardTitle>
            <CardDescription>Toggle the visibility of different content sections on your homepage.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-3">
            <FormField
              control={form.control}
              name="showMostPopularServices"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center"><Star className="mr-2 h-4 w-4 text-yellow-500"/>Most Popular Services</FormLabel>
                    <FormDescription>Showcase your most booked services.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="showRecentlyAddedServices"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center"><Clock className="mr-2 h-4 w-4 text-blue-500"/>Recently Added Services</FormLabel>
                    <FormDescription>Display newly listed services.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="showCategoryWiseServices"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center"><ListChecks className="mr-2 h-4 w-4 text-green-500"/>Category-wise Services</FormLabel>
                    <FormDescription>Show services grouped by each enabled category.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="showBlogSection"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center"><FileText className="mr-2 h-4 w-4 text-orange-500"/>Blog Posts Section</FormLabel>
                    <FormDescription>Display latest blog posts on the homepage.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
             <FormField
              control={form.control}
              name="showCustomServiceButton"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center"><Construction className="mr-2 h-4 w-4 text-indigo-500"/>Custom Service Card</FormLabel>
                    <FormDescription>Show the "Request a Custom Service" card on category pages.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enableUserActivityLogging"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-primary/5 border-primary/20">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center"><Activity className="mr-2 h-4 w-4 text-primary"/>Customer Activity Feed Logging</FormLabel>
                    <FormDescription>Record customer action streams (logins, bookings, cart actions, page views) to display in the Admin Activity Feed.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="enableProviderActivityLogging"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm bg-primary/5 border-primary/20">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base flex items-center"><Activity className="mr-2 h-4 w-4 text-primary"/>Provider Activity Feed Logging</FormLabel>
                    <FormDescription>Record provider action streams (accepting/completing jobs, provider page views) to display in the Admin Activity Feed.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Section Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
