

"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Database, UploadCloud, Download, Loader2, AlertTriangle, MessageSquare, Smartphone, KeyRound, Server, BarChart2, Tv, ListChecks, HelpCircle, FileText, Code, FacebookIcon, Megaphone, Save } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import type { MarketingSettings, FirebaseClientConfig } from '@/types/firestore';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useMarketingSettings } from '@/hooks/useMarketingSettings'; // Use the dedicated hook
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"; // Import Tabs
import { defaultMarketingValues } from '@/hooks/useMarketingSettings'; // Import defaults
import PermissionGuard from '@/components/admin/PermissionGuard';

const marketingSettingsSchema = z.object({
  // Google
  googleTagManagerId: z.string().optional().or(z.literal('')),
  googleAnalyticsId: z.string().optional().or(z.literal('')),
  googleAdsConversionId: z.string().optional().or(z.literal('')),
  googleAdsConversionLabel: z.string().optional().or(z.literal('')),
  googleOptimizeContainerId: z.string().optional().or(z.literal('')),
  googleRemarketingTag: z.string().optional().or(z.literal('')),
  // Meta
  metaPixelId: z.string().optional().or(z.literal('')),
  metaConversionApi: z.object({
    accessToken: z.string().optional().or(z.literal('')),
    pixelId: z.string().optional().or(z.literal('')),
    testEventCode: z.string().optional().or(z.literal('')),
  }).optional(),
  // Other Platforms
  bingUetTagId: z.string().optional().or(z.literal('')),
  pinterestTagId: z.string().optional().or(z.literal('')),
  microsoftClarityProjectId: z.string().optional().or(z.literal('')),
  // Feeds
  googleMerchantCenter: z.object({ feedUrl: z.string().url("Invalid URL").optional().or(z.literal('')), accountId: z.string().optional().or(z.literal('')), }).optional(),
  facebookCatalog: z.object({ feedUrl: z.string().url("Invalid URL").optional().or(z.literal('')), pixelId: z.string().optional().or(z.literal('')), }).optional(),
  // ads.txt
  adsTxtContent: z.string().optional().or(z.literal('')),
  // Custom Scripts
  customHeadScript: z.string().optional().or(z.literal('')),
  customBodyScript: z.string().optional().or(z.literal('')),
  // Firebase
  firebasePublicVapidKey: z.string().optional().or(z.literal('')),
  firebaseAdminSdkJson: z.string().optional().or(z.literal('')),
  firebaseClientConfig: z.object({
    apiKey: z.string().optional().or(z.literal('')), authDomain: z.string().optional().or(z.literal('')), projectId: z.string().optional().or(z.literal('')),
    storageBucket: z.string().optional().or(z.literal('')), messagingSenderId: z.string().optional().or(z.literal('')), appId: z.string().optional().or(z.literal('')),
    measurementId: z.string().optional().or(z.literal('')),
  }).optional(),
  // WhatsApp
  whatsAppApiToken: z.string().optional().or(z.literal('')),
  whatsAppPhoneNumberId: z.string().optional().or(z.literal('')),
  whatsAppBusinessAccountId: z.string().optional().or(z.literal('')),
  whatsAppVerifyToken: z.string().optional().or(z.literal('')),
});

type MarketingSettingsFormData = z.infer<typeof marketingSettingsSchema>;

const MARKETING_CONFIG_COLLECTION = "webSettings";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";

export default function MarketingSettingsPage() {
  const { toast } = useToast();
  const { settings, isLoading, error: settingsError } = useMarketingSettings();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<MarketingSettingsFormData>({
    resolver: zodResolver(marketingSettingsSchema),
    defaultValues: defaultMarketingValues,
  });

  useEffect(() => {
    if (!isLoading && settings) {
      form.reset({
        ...defaultMarketingValues,
        ...settings,
        metaConversionApi: { ...defaultMarketingValues.metaConversionApi, ...settings.metaConversionApi },
        googleMerchantCenter: { ...defaultMarketingValues.googleMerchantCenter, ...settings.googleMerchantCenter },
        facebookCatalog: { ...defaultMarketingValues.facebookCatalog, ...settings.facebookCatalog },
        firebaseClientConfig: { ...defaultMarketingValues.firebaseClientConfig, ...settings.firebaseClientConfig },
      });
    }
  }, [settings, isLoading, form]);

  const handleSaveSettings = async (data: MarketingSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, MARKETING_CONFIG_COLLECTION, MARKETING_CONFIG_DOC_ID);
      const dataToSave: MarketingSettings = {
        ...data,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      await triggerRefresh('marketing-settings');
      await triggerRefresh('global-cache');
      await triggerRefresh('sitemap');
      toast({ title: "Success", description: "Marketing settings saved successfully." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save marketing settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-200px)]"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3">Loading settings...</p></div>;
  }
  if (settingsError) {
    return <div className="text-destructive p-4">Error: {settingsError}</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Megaphone className="mr-2 h-6 w-6 text-primary" /> Marketing & Analytics Settings
          </CardTitle>
          <CardDescription>
            Configure IDs and settings for various marketing, analytics, and service integrations.
          </CardDescription>
        </CardHeader>
      </Card>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSaveSettings)}>
        <Tabs defaultValue="google" className="w-full">
            <div className="relative mb-6">
              <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
                <TabsTrigger 
                  value="google"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <BarChart2 className="mr-2 h-4 w-4"/>Google
                </TabsTrigger>
                <TabsTrigger 
                  value="meta"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <FacebookIcon className="mr-2 h-4 w-4"/>Meta
                </TabsTrigger>
                <TabsTrigger 
                  value="other"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <ListChecks className="mr-2 h-4 w-4"/>Other Platforms
                </TabsTrigger>
                <TabsTrigger 
                  value="feeds"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <HelpCircle className="mr-2 h-4 w-4"/>Feeds
                </TabsTrigger>
                <TabsTrigger 
                  value="ads_txt"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <FileText className="mr-2 h-4 w-4"/>ads.txt
                </TabsTrigger>
                <TabsTrigger 
                  value="custom_scripts"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <Code className="mr-2 h-4 w-4"/>Custom Scripts
                </TabsTrigger>
                <TabsTrigger 
                  value="firebase"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <Smartphone className="mr-2 h-4 w-4"/>Firebase
                </TabsTrigger>
                <TabsTrigger 
                  value="whatsapp"
                  className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
                >
                  <MessageSquare className="mr-2 h-4 w-4"/>WhatsApp
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="google" className="mt-0 focus-visible:outline-none">
                <Card>
                    <CardHeader><CardTitle>Google Integrations</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={form.control} name="googleTagManagerId" render={({ field }) => (<FormItem><FormLabel>Google Tag Manager ID</FormLabel><FormControl><Input placeholder="GTM-XXXXXXX" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="googleAnalyticsId" render={({ field }) => (<FormItem><FormLabel>Google Analytics 4 Measurement ID</FormLabel><FormControl><Input placeholder="G-XXXXXXXXXX" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="googleAdsConversionId" render={({ field }) => (<FormItem><FormLabel>Google Ads Conversion ID</FormLabel><FormControl><Input placeholder="AW-XXXXXXXXXX" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="googleAdsConversionLabel" render={({ field }) => (<FormItem><FormLabel>Google Ads Conversion Label</FormLabel><FormControl><Input placeholder="e.g., ABC-dE_fgHIjK-LmnOp" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="googleOptimizeContainerId" render={({ field }) => (<FormItem><FormLabel>Google Optimize Container ID</FormLabel><FormControl><Input placeholder="OPT-XXXXXXX or GTM-XXXXXXX" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="googleRemarketingTag" render={({ field }) => (<FormItem><FormLabel>Google Remarketing Tag</FormLabel><FormControl><Input placeholder="AW-XXXXXXXXXX" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                    </CardContent>
                </Card>
            </TabsContent>
            
            <TabsContent value="meta">
              <Card><CardHeader><CardTitle>Meta (Facebook) Integrations</CardTitle></CardHeader><CardContent className="space-y-4">
                 <FormField control={form.control} name="metaPixelId" render={({ field }) => (<FormItem><FormLabel>Meta Pixel ID</FormLabel><FormControl><Input placeholder="Your Meta Pixel ID" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                 <h4 className="text-md font-semibold pt-2">Meta Conversion API (CAPI)</h4>
                 <FormField control={form.control} name="metaConversionApi.pixelId" render={({ field }) => (<FormItem><FormLabel>CAPI Pixel ID</FormLabel><FormControl><Input placeholder="Pixel ID for CAPI (often same as above)" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="metaConversionApi.accessToken" render={({ field }) => (<FormItem><FormLabel>CAPI Access Token</FormLabel><FormControl><Input type="password" placeholder="Your CAPI Access Token" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                 <FormField control={form.control} name="metaConversionApi.testEventCode" render={({ field }) => (<FormItem><FormLabel>CAPI Test Event Code (Optional)</FormLabel><FormControl><Input placeholder="TESTXXXXX" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="other">
                <Card>
                    <CardHeader><CardTitle>Other Platform Integrations</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={form.control} name="bingUetTagId" render={({ field }) => (<FormItem><FormLabel>Microsoft Bing Ads UET Tag ID</FormLabel><FormControl><Input placeholder="Your UET Tag ID" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="pinterestTagId" render={({ field }) => (<FormItem><FormLabel>Pinterest Tag ID</FormLabel><FormControl><Input placeholder="Your Pinterest Tag ID" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                        <FormField control={form.control} name="microsoftClarityProjectId" render={({ field }) => (<FormItem><FormLabel>Microsoft Clarity Project ID</FormLabel><FormControl><Input placeholder="Your Clarity Project ID" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                    </CardContent>
                </Card>
            </TabsContent>

             <TabsContent value="feeds">
                <Card><CardHeader><CardTitle>Product Feeds</CardTitle></CardHeader><CardContent className="space-y-6">
                    <h4 className="text-md font-semibold">Google Merchant Center</h4>
                    <FormField control={form.control} name="googleMerchantCenter.feedUrl" render={({ field }) => (<FormItem><FormLabel>Feed URL</FormLabel><FormControl><Input placeholder="URL of your Google Merchant Center feed" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="googleMerchantCenter.accountId" render={({ field }) => (<FormItem><FormLabel>Account ID</FormLabel><FormControl><Input placeholder="Your Google Merchant Center Account ID" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                    <h4 className="text-md font-semibold pt-2">Facebook Catalog</h4>
                    <FormField control={form.control} name="facebookCatalog.feedUrl" render={({ field }) => (<FormItem><FormLabel>Feed URL</FormLabel><FormControl><Input placeholder="URL of your Facebook Catalog feed" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="facebookCatalog.pixelId" render={({ field }) => (<FormItem><FormLabel>Associated Pixel ID</FormLabel><FormControl><Input placeholder="Meta Pixel ID for this catalog" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>)} />
                </CardContent></Card>
            </TabsContent>

             <TabsContent value="ads_txt">
                <Card><CardHeader><CardTitle>ads.txt Content</CardTitle><CardDescription>Enter the content for your ads.txt file. This will be served at /ads.txt.</CardDescription></CardHeader><CardContent>
                    <FormField control={form.control} name="adsTxtContent" render={({ field }) => (<FormItem><FormLabel>ads.txt</FormLabel><FormControl><Textarea placeholder="google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0..." {...field} value={field.value || ''} rows={10} className="font-mono text-xs" /></FormControl><FormMessage /></FormItem>)} />
                </CardContent></Card>
            </TabsContent>

            <TabsContent value="custom_scripts">
                <Card>
                    <CardHeader><CardTitle>Custom Scripts</CardTitle><CardDescription>Be careful, incorrect scripts can break your site.</CardDescription></CardHeader>
                    <CardContent className="space-y-4">
                        <FormField control={form.control} name="customHeadScript" render={({ field }) => (<FormItem><FormLabel>Custom Head Script</FormLabel><FormControl><Textarea placeholder="<script>...</script> or <style>...</style>" {...field} value={field.value || ''} rows={8} className="font-mono text-xs" /></FormControl><FormDescription>This will be injected into the `&lt;head&gt;` tag on all pages.</FormDescription></FormItem>)} />
                        <FormField control={form.control} name="customBodyScript" render={({ field }) => (<FormItem><FormLabel>Custom Body Script</FormLabel><FormControl><Textarea placeholder="<script>... (e.g. for chat widgets)</script>" {...field} value={field.value || ''} rows={8} className="font-mono text-xs" /></FormControl><FormDescription>This will be injected at the end of the `&lt;body&gt;` tag.</FormDescription></FormItem>)} />
                    </CardContent>
                </Card>
            </TabsContent>

            <TabsContent value="firebase">
              <Card>
                <CardHeader>
                  <CardTitle>Firebase Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="firebasePublicVapidKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Firebase Public VAPID Key</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Your FCM VAPID Key"
                            {...field}
                            value={field.value || ''}
                          />
                        </FormControl>
                        <FormDescription>
                          For Web Push notifications.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                  <h4 className="text-md font-semibold pt-2">
                    Full Client Config (for reference, usually auto-managed)
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="firebaseClientConfig.apiKey" render={({ field }) => ( <FormItem> <FormLabel>API Key</FormLabel> <FormControl><Input {...field} value={field.value || ''} /></FormControl> </FormItem> )}/>
                    <FormField control={form.control} name="firebaseClientConfig.authDomain" render={({ field }) => ( <FormItem> <FormLabel>Auth Domain</FormLabel> <FormControl><Input {...field} value={field.value || ''} /></FormControl> </FormItem> )}/>
                    <FormField control={form.control} name="firebaseClientConfig.projectId" render={({ field }) => ( <FormItem> <FormLabel>Project ID</FormLabel> <FormControl><Input {...field} value={field.value || ''} /></FormControl> </FormItem> )}/>
                    <FormField control={form.control} name="firebaseClientConfig.storageBucket" render={({ field }) => ( <FormItem> <FormLabel>Storage Bucket</FormLabel> <FormControl><Input {...field} value={field.value || ''} /></FormControl> </FormItem> )}/>
                    <FormField control={form.control} name="firebaseClientConfig.messagingSenderId" render={({ field }) => ( <FormItem> <FormLabel>Messaging Sender ID</FormLabel> <FormControl><Input {...field} value={field.value || ''} /></FormControl> </FormItem> )}/>
                    <FormField control={form.control} name="firebaseClientConfig.appId" render={({ field }) => ( <FormItem> <FormLabel>App ID</FormLabel> <FormControl><Input {...field} value={field.value || ''} /></FormControl> </FormItem> )}/>
                    <FormField control={form.control} name="firebaseClientConfig.measurementId" render={({ field }) => ( <FormItem> <FormLabel>Measurement ID</FormLabel> <FormControl><Input {...field} value={field.value || ''} /></FormControl> </FormItem> )}/>
                  </div>
                  <FormField
                    control={form.control}
                    name="firebaseAdminSdkJson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Admin SDK JSON</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste your Firebase Admin SDK JSON here"
                            {...field}
                            value={field.value || ''}
                            rows={10}
                            className="font-mono text-xs"
                          />
                        </FormControl>
                        <FormDescription className="text-destructive">
                          Contains sensitive credentials. Ensure Firestore rules
                          protect this document.
                        </FormDescription>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="whatsapp">
              <Card>
                <CardHeader>
                  <CardTitle>WhatsApp Cloud API Settings</CardTitle>
                  <CardDescription>Enter your credentials from Meta for Business.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField control={form.control} name="whatsAppApiToken" render={({ field }) => (<FormItem><FormLabel>API Token</FormLabel><FormControl><Input type="password" placeholder="WhatsApp API Token" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="whatsAppPhoneNumberId" render={({ field }) => (<FormItem><FormLabel>Phone Number ID</FormLabel><FormControl><Input placeholder="Your WhatsApp Phone Number ID" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="whatsAppBusinessAccountId" render={({ field }) => (<FormItem><FormLabel>Business Account ID</FormLabel><FormControl><Input placeholder="Your WhatsApp Business Account ID" {...field} value={field.value || ''} /></FormControl></FormItem>)} />
                  <FormField control={form.control} name="whatsAppVerifyToken" render={({ field }) => (<FormItem><FormLabel>Webhook Verify Token</FormLabel><FormControl><Input placeholder="A secure, random string" {...field} value={field.value || ''} /></FormControl><FormDescription>A secret string you create. You'll enter this in the Meta developer portal to verify your webhook.</FormDescription></FormItem>)} />
                </CardContent>
              </Card>
            </TabsContent>
            
        </Tabs>
        <CardFooter className="mt-6 border-t pt-6 flex justify-end">
            <PermissionGuard moduleId="marketing_settings" action="write">
                <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save All Marketing Settings
                </Button>
            </PermissionGuard>
        </CardFooter>
        </form>
      </Form>
    </div>
  );
}
