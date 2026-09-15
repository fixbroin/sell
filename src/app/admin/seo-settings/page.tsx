"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Target, Globe, FileText, Type, Pilcrow, BarChart, Save, Loader2, Settings2, Map, Layers, RefreshCw, Sparkles, MessageSquareQuote, Building, MapPin, Briefcase } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { FirestoreSEOSettings, StructuredDataSocialProfiles } from '@/types/firestore';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { defaultSeoValues } from '@/lib/seoUtils';
import { useGlobalSEOSettings } from '@/hooks/useGlobalSEOSettings';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { triggerRefresh } from '@/lib/revalidateUtils';

const SEO_SETTINGS_DOC_ID = "global";
const SEO_SETTINGS_COLLECTION = "seoSettings";

const seoSettingsSchema = z.object({
  siteName: z.string().min(1, "Site Name is required.").optional(),
  defaultMetaTitleSuffix: z.string().optional(),
  defaultMetaDescription: z.string().optional(),
  defaultMetaKeywords: z.string().optional(),
  homepageMetaTitle: z.string().optional(),
  homepageMetaDescription: z.string().optional(),
  homepageMetaKeywords: z.string().optional(),
  homepageH1: z.string().optional(),
  categoryPageTitlePattern: z.string().optional(),
  categoryPageDescriptionPattern: z.string().optional(),
  categoryPageKeywordsPattern: z.string().optional(),
  categoryPageH1Pattern: z.string().optional(),
  cityCategoryPageTitlePattern: z.string().optional(),
  cityCategoryPageDescriptionPattern: z.string().optional(),
  cityCategoryPageKeywordsPattern: z.string().optional(),
  cityCategoryPageH1Pattern: z.string().optional(),
  areaCategoryPageTitlePattern: z.string().optional(),
  areaCategoryPageDescriptionPattern: z.string().optional(),
  areaCategoryPageKeywordsPattern: z.string().optional(),
  areaCategoryPageH1Pattern: z.string().optional(),
  servicePageTitlePattern: z.string().optional(),
  servicePageDescriptionPattern: z.string().optional(),
  servicePageKeywordsPattern: z.string().optional(),
  servicePageH1Pattern: z.string().optional(),
  areaPageTitlePattern: z.string().optional(),
  areaPageDescriptionPattern: z.string().optional(),
  areaPageKeywordsPattern: z.string().optional(),
  areaPageH1Pattern: z.string().optional(),
  structuredDataType: z.string().optional(),
  structuredDataName: z.string().optional(),
  structuredDataStreetAddress: z.string().optional(),
  structuredDataLocality: z.string().optional(),
  structuredDataRegion: z.string().optional(),
  structuredDataPostalCode: z.string().optional(),
  structuredDataCountry: z.string().optional(),
  structuredDataTelephone: z.string().optional(),
  structuredDataImage: z.string().refine((val) => !val || val === '' || val.startsWith('/') || val.startsWith('http://') || val.startsWith('https://') || val.startsWith('uploads/'), { message: "Must be a valid URL or relative path if provided." }).optional().or(z.literal('')),
  socialProfileUrls: z.object({
    facebook: z.string().url("Invalid URL").optional().or(z.literal('')),
    twitter: z.string().url("Invalid URL").optional().or(z.literal('')),
    instagram: z.string().url("Invalid URL").optional().or(z.literal('')),
    linkedin: z.string().url("Invalid URL").optional().or(z.literal('')),
    youtube: z.string().url("Invalid URL").optional().or(z.literal('')),
  }).optional(),
  // New Fields
  cityCategorySeoContentTemplate: z.string().optional(),
  cityCategoryFaqsTemplate: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).optional(),
  areaCategorySeoContentTemplate: z.string().optional(),
  areaCategoryFaqsTemplate: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).optional(),
  areaServiceSeoContentTemplate: z.string().optional(),
  areaServiceFaqsTemplate: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })).optional(),
});

type SEOSettingsFormData = z.infer<typeof seoSettingsSchema>;

export default function SEOSettingsPage() {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const form = useForm<SEOSettingsFormData>({
    resolver: zodResolver(seoSettingsSchema),
    defaultValues: defaultSeoValues,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, SEO_SETTINGS_COLLECTION, SEO_SETTINGS_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as FirestoreSEOSettings;
        form.reset({ ...defaultSeoValues, ...data });
      } else {
        form.reset(defaultSeoValues);
      }
    } catch (error) {
      console.error("Error loading SEO settings:", error);
      toast({ title: "Error", description: "Could not load SEO settings.", variant: "destructive" });
      form.reset(defaultSeoValues);
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSaveSettings = async (data: SEOSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, SEO_SETTINGS_COLLECTION, SEO_SETTINGS_DOC_ID);
      const dataToSave: FirestoreSEOSettings = {
        ...data,
        socialProfileUrls: data.socialProfileUrls || {},
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      await triggerRefresh('seo-settings');
      await triggerRefresh('global-cache');
      await triggerRefresh('sitemap');
      await triggerRefresh('global'); // SmartSync: Refresh all SEO metadata
      toast({ title: "Success", description: "SEO settings saved successfully." });
    } catch (error) {
      console.error("Error saving SEO settings:", error);
      toast({ title: "Error", description: "Could not save SEO settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, SEO_SETTINGS_COLLECTION, SEO_SETTINGS_DOC_ID);
      const dataToSave: FirestoreSEOSettings = {
        ...defaultSeoValues,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      await triggerRefresh('seo-settings');
      await triggerRefresh('global-cache');
      await triggerRefresh('sitemap');
      await triggerRefresh('global'); // SmartSync: Refresh all SEO metadata
      form.reset(defaultSeoValues);
      toast({ title: "Reset Successful", description: "SEO settings have been restored to defaults." });
    } catch (error) {
      console.error("Error resetting SEO settings:", error);
      toast({ title: "Reset Failed", description: "Could not restore default SEO settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const renderSEOField = (name: any, label: string, placeholder?: string, description?: string, isTextarea = false, Icon?: React.ElementType) => {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              {Icon && <Icon className="mr-2 h-4 w-4 text-muted-foreground" />}
              {label}
            </FormLabel>
            <FormControl>
              {isTextarea ? (
                <Textarea placeholder={placeholder} {...field} value={field.value as string || ""} disabled={isSaving} rows={name.toLowerCase().includes('description') || name.toLowerCase().includes('template') ? 5 : 2} />
              ) : (
                <Input placeholder={placeholder} {...field} value={field.value as string || ""} disabled={isSaving} />
              )}
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  const renderFaqTemplateField = (name: any, label: string, description?: string) => {
    return (
      <FormField
        control={form.control}
        name={name}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center">
              <MessageSquareQuote className="mr-2 h-4 w-4 text-muted-foreground" />
              {label}
            </FormLabel>
            <FormControl>
              <Textarea 
                placeholder='[{"question": "How to book in {{areaName}}?", "answer": "Simple..."}]' 
                value={field.value ? JSON.stringify(field.value, null, 2) : "[]"} 
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    field.onChange(parsed);
                  } catch (err) {}
                }}
                rows={10} 
                className="font-mono text-xs"
                disabled={isSaving} 
              />
            </FormControl>
            {description && <FormDescription>{description}</FormDescription>}
            <FormMessage />
          </FormItem>
        )}
      />
    );
  };

  const renderSocialField = (name: keyof StructuredDataSocialProfiles, label: string, Icon: React.ElementType) => (
    <FormField
      control={form.control}
      name={`socialProfileUrls.${name}` as any}
      render={({ field }) => (
        <FormItem>
          <FormLabel className="flex items-center"><Icon className="mr-2 h-4 w-4 text-muted-foreground"/>{label}</FormLabel>
          <FormControl><Input placeholder={`https://${name}.com/yourpage`} {...field} value={field.value as string || ""} disabled={isSaving}/></FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading SEO settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Target className="mr-2 h-6 w-6 text-primary" /> SEO Settings
          </CardTitle>
          <CardDescription>
            Manage Search Engine Optimization settings for your website. Use placeholders like <code>{"{{categoryName}}"}</code>, <code>{"{{cityName}}"}</code>, <code>{"{{areaName}}"}</code> in patterns and templates.
          </CardDescription>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSaveSettings)}>
          <Tabs defaultValue="global" className="w-full">
            <div className="relative mb-6">
              <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
                <TabsTrigger 
                  value="global"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <Globe className="mr-2 h-4 w-4"/>Global & Homepage
                </TabsTrigger>
                <TabsTrigger 
                  value="patterns"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <FileText className="mr-2 h-4 w-4"/>Meta Patterns
                </TabsTrigger>
                <TabsTrigger 
                  value="dynamic_templates"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <Sparkles className="mr-2 h-4 w-4"/>Dynamic Templates
                </TabsTrigger>
                <TabsTrigger 
                  value="structured_data"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <BarChart className="mr-2 h-4 w-4"/>Structured Data
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="global" className="mt-0 focus-visible:outline-none">
              <Card>
                <CardHeader><CardTitle>Global Defaults & Homepage SEO</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  {renderSEOField("siteName", "Site Name (for OG & Structured Data)", "e.g., Yourbrand Services", undefined, false, Settings2)}
                  {renderSEOField("defaultMetaTitleSuffix", "Default Meta Title Suffix", "e.g., | Yourbrand", "Appended to most page titles.")}
                  {renderSEOField("defaultMetaDescription", "Default Meta Description", "e.g., Quality home services at your doorstep.", "Fallback description if a specific one isn't set.", true)}
                  {renderSEOField("defaultMetaKeywords", "Default Meta Keywords (comma-separated)", "e.g., home repair, plumbing, electrician")}
                  <hr className="my-6"/>
                  <h4 className="text-md font-semibold">Homepage Specific SEO:</h4>
                  {renderSEOField("homepageH1", "Homepage H1 Title", "e.g., Reliable Home Services", undefined, false, Type)}
                  {renderSEOField("homepageMetaTitle", "Homepage Meta Title", "e.g., Yourbrand - Trusted Home Services", undefined, false, Type)}
                  {renderSEOField("homepageMetaDescription", "Homepage Meta Description", "e.g., Book expert home services online.", undefined, true, FileText)}
                  {renderSEOField("homepageMetaKeywords", "Homepage Meta Keywords (comma-separated)", "e.g., yourbrand, home services, repair", undefined, false, Target)}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="patterns">
              <Card>
                <CardHeader><CardTitle>Meta Tag Patterns</CardTitle><CardDescription>Dynamic patterns for Titles, Descriptions, and Keywords.</CardDescription></CardHeader>
                <CardContent className="space-y-8">
                  <div>
                    <h4 className="text-md font-semibold mb-3">Default Category Pages (e.g., /category/slug):</h4>
                    <div className="space-y-4">
                      {renderSEOField("categoryPageH1Pattern", "H1 Title Pattern", "e.g., {{categoryName}} Services", undefined, false, Pilcrow)}
                      {renderSEOField("categoryPageTitlePattern", "Meta Title Pattern", "e.g., {{categoryName}} | Yourbrand", undefined, false, Type)}
                      {renderSEOField("categoryPageDescriptionPattern", "Meta Description Pattern", "e.g., Best {{categoryName}} services.", undefined, true, FileText)}
                      {renderSEOField("categoryPageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{categoryName}}, book {{categoryName}}", undefined, false, Target)}
                    </div>
                  </div>
                  <hr/>
                   <div>
                    <h4 className="text-md font-semibold mb-3 flex items-center"><Map className="mr-2 h-5 w-5 text-muted-foreground"/>City-Specific Category Pages (e.g., /city/category):</h4>
                    <div className="space-y-4 mt-3">
                      {renderSEOField("cityCategoryPageH1Pattern", "H1 Title Pattern", "e.g., {{categoryName}} in {{cityName}}", undefined, false, Pilcrow)}
                      {renderSEOField("cityCategoryPageTitlePattern", "Meta Title Pattern", "e.g., {{categoryName}} Services in {{cityName}} | Yourbrand", undefined, false, Type)}
                      {renderSEOField("cityCategoryPageDescriptionPattern", "Meta Description Pattern", "e.g., Find {{categoryName}} experts in {{cityName}}.", undefined, true, FileText)}
                      {renderSEOField("cityCategoryPageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{categoryName}} {{cityName}}, {{categoryName}} services", undefined, false, Target)}
                    </div>
                  </div>
                  <hr/>
                  <div>
                    <h4 className="text-md font-semibold mb-3 flex items-center"><Layers className="mr-2 h-5 w-5 text-muted-foreground"/>Area-Specific Category Pages (e.g., /city/area/category):</h4>
                    <div className="space-y-4 mt-3">
                      {renderSEOField("areaCategoryPageH1Pattern", "H1 Title Pattern", "e.g., {{categoryName}} in {{areaName}}, {{cityName}}", undefined, false, Pilcrow)}
                      {renderSEOField("areaCategoryPageTitlePattern", "Meta Title Pattern", "e.g., {{categoryName}} - {{areaName}}, {{cityName}} | Yourbrand", undefined, false, Type)}
                      {renderSEOField("areaCategoryPageDescriptionPattern", "Meta Description Pattern", "e.g., Best {{categoryName}} in {{areaName}}, {{cityName}}.", undefined, true, FileText)}
                      {renderSEOField("areaCategoryPageKeywordsPattern", "Meta Keywords Pattern", "e.g., {{categoryName}} {{areaName}}, {{areaName}} {{cityName}} services", undefined, false, Target)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="dynamic_templates">
              <Card>
                <CardHeader>
                  <CardTitle>Global Content Templates</CardTitle>
                  <CardDescription>
                    Define default SEO Bio (bottom content) and FAQs using placeholders. These are used when no specific override exists.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-10">
                  <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <Building className="h-5 w-5 text-primary" />
                        <h4 className="text-lg font-bold">City-Category Defaults</h4>
                    </div>
                    {renderSEOField("cityCategorySeoContentTemplate", "Default Bio Template (HTML)", "e.g., <h3>Professional {{categoryName}} in {{cityName}}</h3>...", "Placeholder: {{cityName}}, {{categoryName}}", true)}
                    {renderFaqTemplateField("cityCategoryFaqsTemplate", "Default FAQ Template (JSON)", "JSON array with {{cityName}}, {{categoryName}} placeholders.")}
                  </div>
                  
                  <div className="space-y-6 pt-6 border-t">
                    <div className="flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        <h4 className="text-lg font-bold">Area-Category Defaults</h4>
                    </div>
                    {renderSEOField("areaCategorySeoContentTemplate", "Default Bio Template (HTML)", "e.g., <h3>Top-rated {{categoryName}} in {{areaName}}</h3>...", "Placeholder: {{areaName}}, {{cityName}}, {{categoryName}}", true)}
                    {renderFaqTemplateField("areaCategoryFaqsTemplate", "Default FAQ Template (JSON)", "JSON array with {{areaName}}, {{cityName}}, {{categoryName}} placeholders.")}
                  </div>

                  <div className="space-y-6 pt-6 border-t">
                    <div className="flex items-center gap-2">
                        <Briefcase className="h-5 w-5 text-primary" />
                        <h4 className="text-lg font-bold">Area-Service Defaults</h4>
                    </div>
                    {renderSEOField("areaServiceSeoContentTemplate", "Default Bio Template (HTML)", "e.g., <h3>Top-rated {{serviceName}} in {{areaName}}</h3>...", "Placeholder: {{areaName}}, {{cityName}}, {{serviceName}}", true)}
                    {renderFaqTemplateField("areaServiceFaqsTemplate", "Default FAQ Template (JSON)", "JSON array with {{areaName}}, {{cityName}}, {{serviceName}} placeholders.")}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="structured_data">
              <Card>
                <CardHeader><CardTitle>Structured Data Defaults (LocalBusiness)</CardTitle><CardDescription>Helps search engines understand your business.</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  {renderSEOField("structuredDataType", "Schema Type", "e.g., LocalBusiness, Organization")}
                  {renderSEOField("structuredDataName", "Business Name", "e.g., Yourbrand")}
                  {renderSEOField("structuredDataStreetAddress", "Street Address", "e.g., 123 Main St")}
                  {renderSEOField("structuredDataLocality", "City / Locality", "e.g., Bangalore")}
                  {renderSEOField("structuredDataRegion", "State / Region", "e.g., KA")}
                  {renderSEOField("structuredDataPostalCode", "Postal Code", "e.g., 560001")}
                  {renderSEOField("structuredDataCountry", "Country Code", "e.g., IN")}
                  {renderSEOField("structuredDataTelephone", "Telephone Number", "e.g., +919876543210")}
                  {renderSEOField("structuredDataImage", "Default Business Image URL", "URL to your logo or a representative image")}
                  <h4 className="text-md font-semibold pt-2">Social Profile URLs (for 'sameAs'):</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderSocialField("facebook", "Facebook URL", Type)}
                    {renderSocialField("twitter", "Twitter (X) URL", Type)}
                    {renderSocialField("instagram", "Instagram URL", Type)}
                    {renderSocialField("linkedin", "LinkedIn URL", Type)}
                    {renderSocialField("youtube", "YouTube URL", Type)}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6 mt-6">
            <PermissionGuard moduleId="seo_settings" action="write">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={isSaving}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Reset All to Default
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will reset ALL global SEO settings, patterns, and structured data to their original defaults. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleResetToDefault} disabled={isSaving} className="bg-destructive hover:bg-destructive/90">
                      {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Yes, Reset All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </PermissionGuard>
            <PermissionGuard moduleId="seo_settings" action="write">
              <Button type="submit" disabled={isSaving} size="lg">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save All SEO Settings
              </Button>
            </PermissionGuard>
          </CardFooter>
        </form>
      </Form>
    </div>
  );
}
