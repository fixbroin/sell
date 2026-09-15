"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Send, MessageSquare, AlertTriangle, FileText } from "lucide-react"; 
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { MarketingAutomationSettings } from '@/types/firestore';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from '@/components/ui/input';

const MARKETING_AUTOMATION_COLLECTION = "webSettings";
const MARKETING_AUTOMATION_DOC_ID = "marketingAutomation";

const whatsappAutomationSchema = z.object({
  isWhatsAppEnabled: z.boolean().default(false),
  whatsAppOnSignup: z.object({
    enabled: z.boolean().default(false),
    templateName: z.string().optional(),
  }).optional(),
  whatsAppOnBookingConfirmed: z.object({
    enabled: z.boolean().default(false),
    templateName: z.string().optional(),
  }).optional(),
  whatsAppOnBookingCompleted: z.object({
    enabled: z.boolean().default(false),
    templateName: z.string().optional(),
  }).optional(),
  whatsAppOnBookingCancelled: z.object({
    enabled: z.boolean().default(false),
    templateName: z.string().optional(),
  }).optional(),
  whatsAppOnPaymentSuccess: z.object({
    enabled: z.boolean().default(false),
    templateName: z.string().optional(),
  }).optional(),
});

type WhatsAppAutomationFormData = z.infer<typeof whatsappAutomationSchema>;

const defaultWhatsAppSettings = {
  isWhatsAppEnabled: false,
  whatsAppOnSignup: { enabled: false, templateName: "user_welcome" },
  whatsAppOnBookingConfirmed: { enabled: false, templateName: "booking_confirmed" },
  whatsAppOnBookingCompleted: { enabled: false, templateName: "booking_completed" },
  whatsAppOnBookingCancelled: { enabled: false, templateName: "booking_cancelled_1" },
  whatsAppOnPaymentSuccess: { enabled: false, templateName: "payment_successful_1" },
};

const automationEvents = [
    { id: 'whatsAppOnSignup', label: 'On New User Signup' },
    { id: 'whatsAppOnBookingConfirmed', label: 'On Booking Confirmed' },
    { id: 'whatsAppOnBookingCompleted', label: 'On Booking Completed' },
    { id: 'whatsAppOnBookingCancelled', label: 'On Booking Cancelled' },
    { id: 'whatsAppOnPaymentSuccess', label: 'On Payment Success' },
] as const;

export default function WhatsAppTemplateManagementTab() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<WhatsAppAutomationFormData>({
    resolver: zodResolver(whatsappAutomationSchema),
    defaultValues: defaultWhatsAppSettings,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, MARKETING_AUTOMATION_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as MarketingAutomationSettings;
        form.reset({
            isWhatsAppEnabled: data.isWhatsAppEnabled ?? false,
            whatsAppOnSignup: { ...defaultWhatsAppSettings.whatsAppOnSignup, ...data.whatsAppOnSignup },
            whatsAppOnBookingConfirmed: { ...defaultWhatsAppSettings.whatsAppOnBookingConfirmed, ...data.whatsAppOnBookingConfirmed },
            whatsAppOnBookingCompleted: { ...defaultWhatsAppSettings.whatsAppOnBookingCompleted, ...data.whatsAppOnBookingCompleted },
            whatsAppOnBookingCancelled: { ...defaultWhatsAppSettings.whatsAppOnBookingCancelled, ...data.whatsAppOnBookingCancelled },
            whatsAppOnPaymentSuccess: { ...defaultWhatsAppSettings.whatsAppOnPaymentSuccess, ...data.whatsAppOnPaymentSuccess },
        });
      } else {
        form.reset(defaultWhatsAppSettings);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not load WhatsApp automation settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: WhatsAppAutomationFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, MARKETING_AUTOMATION_COLLECTION, MARKETING_AUTOMATION_DOC_ID);
      const dataToSave: Partial<MarketingAutomationSettings> = {
        isWhatsAppEnabled: data.isWhatsAppEnabled,
        whatsAppOnSignup: data.whatsAppOnSignup,
        whatsAppOnBookingConfirmed: data.whatsAppOnBookingConfirmed,
        whatsAppOnBookingCompleted: data.whatsAppOnBookingCompleted,
        whatsAppOnBookingCancelled: data.whatsAppOnBookingCancelled,
        whatsAppOnPaymentSuccess: data.whatsAppOnPaymentSuccess,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, dataToSave, { merge: true });
      await triggerRefresh('marketing-settings');
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "WhatsApp automation settings have been saved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save WhatsApp settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>WhatsApp Message Templates</CardTitle></CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Automation Rules</CardTitle>
            <CardDescription>
              Enable or disable automated WhatsApp messages for key events and specify the template name to use for each.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="isWhatsAppEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-xl border-2 border-primary/20 bg-primary/5 p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-bold flex items-center text-primary">
                      <MessageSquare className="mr-2 h-5 w-5" />
                      Global WhatsApp Notifications
                    </FormLabel>
                    <FormDescription>
                      Master switch to enable or disable all WhatsApp outgoing notifications.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isSaving}
                      className="data-[state=checked]:bg-primary"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className={!form.watch('isWhatsAppEnabled') ? 'opacity-50 pointer-events-none' : ''}>
              <Accordion type="multiple" className="w-full">
              {automationEvents.map((event) => (
                <AccordionItem value={event.id} key={event.id}>
                  <AccordionTrigger className="text-md font-medium">{event.label}</AccordionTrigger>
                  <AccordionContent className="p-4 border-l-2 ml-2 space-y-4">
                     <FormField
                        control={form.control}
                        name={`${event.id}.enabled`}
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <FormLabel className="text-sm">Enable this Automation</FormLabel>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                            </FormItem>
                        )}
                        />
                     <FormField
                        control={form.control}
                        name={`${event.id}.templateName`}
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Template Name</FormLabel>
                            <FormControl><Input placeholder="e.g., booking_confirmed_v1" {...field} value={field.value || ''} disabled={isSaving} /></FormControl>
                            <FormDescription className="text-xs">Enter the exact, case-sensitive template name from Meta Business Suite.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            </div>
          </CardContent>
           <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Automation Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
