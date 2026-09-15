
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Cookie, Save, Loader2 } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { GlobalWebSettings } from '@/types/firestore';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";

const cookieSettingsSchema = z.object({
  isCookieConsentEnabled: z.boolean().default(false),
  cookieConsentMessage: z.string().min(10, "Message is too short.").max(250, "Message is too long (max 250 characters)."),
  cookiePolicyContent: z.string().min(20, "Policy content is too short."),
});

type CookieSettingsFormData = z.infer<typeof cookieSettingsSchema>;

export default function CookieSettingsPage() {
  const { toast } = useToast();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings, error: globalSettingsError } = useGlobalSettings();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<CookieSettingsFormData>({
    resolver: zodResolver(cookieSettingsSchema),
    defaultValues: {
      isCookieConsentEnabled: false,
      cookieConsentMessage: "We use cookies to improve your experience. By continuing, you agree to our Cookie Policy.",
      cookiePolicyContent: "<p>Our Cookie Policy details will be updated here soon.</p>",
    },
  });

  useEffect(() => {
    if (globalSettings && !isLoadingGlobalSettings) {
      form.reset({
        isCookieConsentEnabled: globalSettings.isCookieConsentEnabled || false,
        cookieConsentMessage: globalSettings.cookieConsentMessage || "We use cookies to improve your experience. By continuing, you agree to our Cookie Policy.",
        cookiePolicyContent: globalSettings.cookiePolicyContent || "<p>Our Cookie Policy details will be updated here soon.</p>",
      });
    }
  }, [globalSettings, isLoadingGlobalSettings, form]);

  const handleSaveSettings = async (data: CookieSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const dataToSave: Partial<GlobalWebSettings> = {
        isCookieConsentEnabled: data.isCookieConsentEnabled,
        cookieConsentMessage: data.cookieConsentMessage,
        cookiePolicyContent: data.cookiePolicyContent,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Cookie settings saved successfully." });
    } catch (error) {
      console.error("Error saving cookie settings:", error);
      toast({ title: "Error", description: "Could not save cookie settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingGlobalSettings) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center">
              <Cookie className="mr-2 h-6 w-6 text-primary" /> Cookie Consent Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-2">Loading settings...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Cookie className="mr-2 h-6 w-6 text-primary" /> Cookie Consent Settings
          </CardTitle>
          <CardDescription>
            Manage the cookie consent banner and policy content for your website.
          </CardDescription>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSaveSettings)}>
          <Card>
            <CardHeader>
              <CardTitle>Banner Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="isCookieConsentEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Cookie Consent Banner</FormLabel>
                      <FormDescription>
                        Show a cookie consent banner to new visitors.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSaving}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cookieConsentMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Banner Message</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="e.g., We use cookies to enhance your experience..."
                        {...field}
                        rows={3}
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormDescription>This short message will appear on the consent banner. Max 250 characters.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Cookie Policy Page Content</CardTitle>
              <FormDescription>This content will be displayed on the /cookie-policy page.</FormDescription>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="cookiePolicyContent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Cookie Policy Text</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Write your full cookie policy here..."
                        rows={20}
                        {...field}
                        value={field.value || ""}
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <CardFooter className="mt-6 border-t pt-6 flex justify-end">
            <PermissionGuard moduleId="cookie_settings" action="write">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Cookie Settings
              </Button>
            </PermissionGuard>
          </CardFooter>
        </form>
      </Form>
    </div>
  );
}
