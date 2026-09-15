
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Send, MessageSquare, AlertTriangle } from "lucide-react"; 
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { MarketingAutomationSettings } from '@/types/firestore';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from '@/components/ui/alert';

const MARKETING_AUTOMATION_COLLECTION = "webSettings";
const MARKETING_AUTOMATION_DOC_ID = "marketingAutomation";

const whatsappAutomationSchema = z.object({
  isWhatsAppEnabled: z.boolean().default(false),
  whatsAppOnSignup: z.object({
    enabled: z.boolean().default(false),
    template: z.string().max(1024, "Template is too long.").optional(),
  }).optional(),
  whatsAppOnBookingConfirmed: z.object({
    enabled: z.boolean().default(false),
    template: z.string().max(1024, "Template is too long.").optional(),
  }).optional(),
  whatsAppOnBookingCompleted: z.object({
    enabled: z.boolean().default(false),
    template: z.string().max(1024, "Template is too long.").optional(),
  }).optional(),
  whatsAppOnBookingCancelled: z.object({
    enabled: z.boolean().default(false),
    template: z.string().max(1024, "Template is too long.").optional(),
  }).optional(),
  whatsAppOnPaymentSuccess: z.object({
    enabled: z.boolean().default(false),
    template: z.string().max(1024, "Template is too long.").optional(),
  }).optional(),
});

type WhatsAppAutomationFormData = z.infer<typeof whatsappAutomationSchema>;

const defaultWhatsAppSettings = {
  isWhatsAppEnabled: false,
  whatsAppOnSignup: { enabled: false, template: "Hi {{name}}, welcome to {{websiteName}}! We're thrilled to have you." },
  whatsAppOnBookingConfirmed: { enabled: false, template: "Your booking #{{bookingId}} for {{serviceName}} on {{bookingDate}} is confirmed! We look forward to serving you." },
  whatsAppOnBookingCompleted: { enabled: false, template: "Your service for booking #{{bookingId}} is complete. We hope you're satisfied! Please leave us a review." },
  whatsAppOnBookingCancelled: { enabled: false, template: "Your booking #{{bookingId}} has been cancelled as requested." },
  whatsAppOnPaymentSuccess: { enabled: false, template: "We've received your payment for booking #{{bookingId}}. Thank you!" },
};

const automationEvents = [
    { id: 'whatsAppOnSignup', label: 'On New User Signup' },
    { id: 'whatsAppOnBookingConfirmed', label: 'On Booking Confirmed' },
    { id: 'whatsAppOnBookingCompleted', label: 'On Booking Completed' },
    { id: 'whatsAppOnBookingCancelled', label: 'On Booking Cancelled' },
    { id: 'whatsAppOnPaymentSuccess', label: 'On Payment Success' },
] as const;


export default function WhatsAppAutomationForm() {
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
            isWhatsAppEnabled: data.isWhatsAppEnabled ?? defaultWhatsAppSettings.isWhatsAppEnabled,
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
      toast({ title: "Error", description: "Could not load WhatsApp settings.", variant: "destructive" });
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
        <CardHeader><CardTitle>WhatsApp Automation</CardTitle></CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Automation Settings</CardTitle>
            <CardDescription>
                Configure automated WhatsApp messages for key customer journey events.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="isWhatsAppEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable WhatsApp Automation</FormLabel>
                    <FormDescription>
                      Master switch to turn all WhatsApp messages on or off.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This feature requires a configured WhatsApp Business API provider. These settings only prepare the message templates.
              </AlertDescription>
            </Alert>

            <Accordion type="multiple" className="w-full" disabled={!form.watch('isWhatsAppEnabled')}>
              {automationEvents.map((event) => (
                <AccordionItem value={event.id} key={event.id}>
                  <AccordionTrigger className="text-md font-medium">{event.label}</AccordionTrigger>
                  <AccordionContent className="p-4 border-l-2 ml-2 space-y-4">
                     <FormField
                        control={form.control}
                        name={`${event.id}.enabled`}
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                            <FormLabel className="text-sm">Enable this Message</FormLabel>
                            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving || !form.watch('isWhatsAppEnabled')} /></FormControl>
                            </FormItem>
                        )}
                        />
                     <FormField
                        control={form.control}
                        name={`${event.id}.template`}
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Message Template</FormLabel>
                            <FormControl><Textarea placeholder="Enter your WhatsApp message template. Use {{name}} for customer name." {...field} value={field.value || ''} rows={4} disabled={isSaving || !form.watch('isWhatsAppEnabled')} /></FormControl>
                            <FormDescription className="text-xs">Use placeholders like {"{{name}}"}, {"{{bookingId}}"}, {"{{serviceName}}"}, etc.</FormDescription>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save WhatsApp Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
