
      
"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Banknote, Gift, CreditCard } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { WithdrawalSettings } from '@/types/firestore';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { triggerRefresh } from '@/lib/revalidateUtils';

const WITHDRAWAL_CONFIG_COLLECTION = "appConfiguration";
const WITHDRAWAL_CONFIG_DOC_ID = "withdrawal_referral";

const withdrawalSettingsSchema = z.object({
  isWithdrawalEnabled: z.boolean().default(false),
  minWithdrawalAmount: z.coerce.number().min(0, "Minimum amount must be non-negative."),
  enabledMethods: z.object({
    amazon_gift_card: z.boolean().default(false),
    bank_transfer: z.boolean().default(true),
    upi: z.boolean().default(true),
  }),
});

type WithdrawalSettingsFormData = z.infer<typeof withdrawalSettingsSchema>;

const defaultWithdrawalSettings: WithdrawalSettings = {
  isWithdrawalEnabled: false,
  minWithdrawalAmount: 200,
  enabledMethods: {
    amazon_gift_card: false,
    bank_transfer: true,
    upi: true,
  },
};

export default function WithdrawalSettingsTab() {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<WithdrawalSettingsFormData>({
    resolver: zodResolver(withdrawalSettingsSchema),
    defaultValues: defaultWithdrawalSettings,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, WITHDRAWAL_CONFIG_COLLECTION, WITHDRAWAL_CONFIG_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        form.reset({ ...defaultWithdrawalSettings, ...docSnap.data() });
      } else {
        form.reset(defaultWithdrawalSettings);
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not load referral withdrawal settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: WithdrawalSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, WITHDRAWAL_CONFIG_COLLECTION, WITHDRAWAL_CONFIG_DOC_ID);
      await setDoc(settingsDocRef, { ...data, updatedAt: Timestamp.now() }, { merge: true });
      await triggerRefresh('withdrawal-referral-config');
      toast({ title: "Success", description: "Referral withdrawal settings saved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not save referral withdrawal settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referral Withdrawal Settings</CardTitle>
          <CardDescription>Configure how users can withdraw their earnings.</CardDescription>
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
            <CardTitle>Referral Withdrawal Settings</CardTitle>
            <CardDescription>Configure how users can withdraw their referral earnings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="isWithdrawalEnabled"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Withdrawal Option</FormLabel>
                    <FormDescription>Allow users to request withdrawal of their earnings.</FormDescription>
                  </div>
                  <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="minWithdrawalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Minimum Withdrawal Amount ({symbol})</FormLabel>
                  <FormControl><Input type="number" placeholder="e.g., 200" {...field} disabled={isSaving} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Enabled Withdrawal Methods</FormLabel>
              <FormDescription>Select which payout methods are available to users.</FormDescription>
              <div className="space-y-2 pt-2">
                <FormField
                  control={form.control}
                  name="enabledMethods.amazon_gift_card"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                        <FormLabel className="font-normal flex items-center gap-2"><Gift className="h-4 w-4"/>Amazon Gift Card</FormLabel>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="enabledMethods.bank_transfer"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                        <FormLabel className="font-normal flex items-center gap-2"><Banknote className="h-4 w-4"/>Bank Transfer</FormLabel>
                    </FormItem>
                  )}
                />
                 <FormField
                  control={form.control}
                  name="enabledMethods.upi"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3">
                        <FormControl><Checkbox checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl>
                        <FormLabel className="font-normal flex items-center gap-2"><CreditCard className="h-4 w-4"/>UPI</FormLabel>
                    </FormItem>
                  )}
                />
              </div>
            </div>

          </CardContent>
          <CardFooter className="border-t px-6 py-4">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Withdrawal Settings
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

    