
      
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Handshake } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { ReferralSettings } from '@/types/firestore';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { triggerRefresh } from '@/lib/revalidateUtils';

const REFERRAL_CONFIG_COLLECTION = "appConfiguration";
const REFERRAL_CONFIG_DOC_ID = "referral";

const referralSettingsSchema = z.object({
  isReferralSystemEnabled: z.boolean().default(false),
  referrerBonus: z.coerce.number().min(0, "Bonus must be non-negative."),
  referredUserBonus: z.coerce.number().min(0, "Bonus must be non-negative."),
  bonusType: z.enum(['fixed', 'percentage'], { required_error: "Please select a bonus type." }),
  referralCodeLength: z.coerce.number().int().min(4, "Code length must be at least 4.").max(12, "Code length cannot exceed 12."),
  preventReuse: z.boolean().default(true),
  minBookingValueForBonus: z.coerce.number().min(0, "Minimum booking value must be non-negative."),
  maxEarningsPerReferrer: z.coerce.number().min(0, "Max earnings must be non-negative.").optional().nullable(),
});

type ReferralSettingsFormData = z.infer<typeof referralSettingsSchema>;

const defaultReferralSettings: ReferralSettings = {
  isReferralSystemEnabled: false,
  referrerBonus: 100,
  referredUserBonus: 50,
  bonusType: 'fixed',
  referralCodeLength: 6,
  preventReuse: true,
  minBookingValueForBonus: 250,
  maxEarningsPerReferrer: undefined,
};

export default function ReferralSettingsTab() {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ReferralSettingsFormData>({
    resolver: zodResolver(referralSettingsSchema),
    defaultValues: defaultReferralSettings,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, REFERRAL_CONFIG_COLLECTION, REFERRAL_CONFIG_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        form.reset({ ...defaultReferralSettings, ...docSnap.data() });
      } else {
        form.reset(defaultReferralSettings);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not load referral settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: ReferralSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, REFERRAL_CONFIG_COLLECTION, REFERRAL_CONFIG_DOC_ID);
      await setDoc(settingsDocRef, { ...data, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('withdrawal-referral-config');
      toast({ title: "Success", description: "Referral settings saved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save referral settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referral Program Settings</CardTitle>
          <CardDescription>Define the rules for your referral program.</CardDescription>
        </CardHeader>
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
            <CardTitle>Referral Program Settings</CardTitle>
            <CardDescription>Define the rules and rewards for your referral program.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="isReferralSystemEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Referral System</FormLabel>
                    <FormDescription>Master switch to turn the entire referral system on or off.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
            
            <div className="space-y-4 p-4 border rounded-md">
                 <h4 className="font-medium text-lg">Bonus Settings</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField control={form.control} name="referrerBonus" render={({ field }) => (<FormItem><FormLabel>Referrer Bonus</FormLabel><FormControl><Input type="number" placeholder="e.g., 100" {...field} /></FormControl><FormDescription>Bonus for the person who refers.</FormDescription><FormMessage /></FormItem>)}/>
                  <FormField control={form.control} name="referredUserBonus" render={({ field }) => (<FormItem><FormLabel>Referred User Bonus</FormLabel><FormControl><Input type="number" placeholder="e.g., 50" {...field} /></FormControl><FormDescription>Bonus for the new user who signs up.</FormDescription><FormMessage /></FormItem>)}/>
                </div>
                 <FormField
                  control={form.control}
                  name="bonusType"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Bonus Type</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                           <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="fixed" /></FormControl><FormLabel className="font-normal">Fixed Amount ({symbol})</FormLabel></FormItem>
                           <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="percentage" /></FormControl><FormLabel className="font-normal">Percentage (%)</FormLabel></FormItem>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
            </div>

            <div className="space-y-4 p-4 border rounded-md">
                <h4 className="font-medium text-lg">Rules & Conditions</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <FormField control={form.control} name="minBookingValueForBonus" render={({ field }) => (<FormItem><FormLabel>Minimum Booking Value ({symbol})</FormLabel><FormControl><Input type="number" placeholder="e.g., 250" {...field} /></FormControl><FormDescription>Bonus is credited only if the referred user's first booking is above this value.</FormDescription><FormMessage /></FormItem>)}/>
                     <FormField control={form.control} name="maxEarningsPerReferrer" render={({ field }) => (<FormItem><FormLabel>Max Earnings Per Referrer ({symbol}, Optional)</FormLabel><FormControl><Input type="number" placeholder="e.g., 5000" {...field} value={field.value ?? ""} /></FormControl><FormDescription>Leave blank for no limit.</FormDescription><FormMessage /></FormItem>)}/>
                </div>
                <FormField control={form.control} name="referralCodeLength" render={({ field }) => (<FormItem><FormLabel>Referral Code Length</FormLabel><FormControl><Input type="number" placeholder="e.g., 6" {...field} /></FormControl><FormDescription>Length of the auto-generated unique referral code.</FormDescription><FormMessage /></FormItem>)}/>
                 <FormField control={form.control} name="preventReuse" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-3"><div className="space-y-0.5"><FormLabel>Prevent Reuse</FormLabel><FormDescription className="text-xs">Attempt to detect and block abuse from the same device/IP.</FormDescription></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl></FormItem>)}/>
            </div>
          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Referral Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

    