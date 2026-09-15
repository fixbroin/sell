"use client";

import { useState, useEffect, useCallback } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Loader2, Save, Wallet } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { 
  getProviderWalletSettingsAction, 
  saveProviderWalletSettingsAction,
  WalletProviderSettings
} from '@/app/actions/providerWalletActions';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";

const walletSettingsSchema = z.object({
  minDepositAmount: z.coerce.number().min(1, "Minimum deposit must be at least ₹1."),
  maxDepositAmount: z.coerce.number().min(1, "Maximum deposit must be at least ₹1."),
  depositBonusPercentage: z.coerce.number().min(0).max(100, "Percentage must be between 0 and 100."),
  minBalanceForJobs: z.coerce.number().min(0, "Threshold must be non-negative."),
});

type WalletSettingsFormData = z.infer<typeof walletSettingsSchema>;

const defaultWalletSettings: WalletProviderSettings = {
  minDepositAmount: 500,
  maxDepositAmount: 10000,
  depositBonusPercentage: 0,
  minBalanceForJobs: 100,
};

export default function WalletSettingsTab() {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<WalletSettingsFormData>({
    resolver: zodResolver(walletSettingsSchema),
    defaultValues: defaultWalletSettings,
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getProviderWalletSettingsAction();
      form.reset(data);
    } catch (error) {
      toast({ title: "Error", description: "Could not load wallet settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, form]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const onSubmit = async (data: WalletSettingsFormData) => {
    setIsSaving(true);
    try {
      const result = await saveProviderWalletSettingsAction(data);
      if (result.success) {
        toast({ title: "Success", description: result.message });
      } else {
        toast({ title: "Error", description: result.message, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Could not save wallet settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Provider Wallet Settings</CardTitle>
          <CardDescription>Loading prepaid wallet settings...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          Provider Wallet Settings
        </CardTitle>
        <CardDescription>
          Configure deposits, transaction rules, and bonus incentives for prepaid provider accounts.
        </CardDescription>
      </CardHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <CardContent className="space-y-6 pt-4">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="minDepositAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Wallet Deposit ({symbol})</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>
                      The minimum amount a provider is allowed to add to their wallet per deposit.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxDepositAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximum Wallet Deposit ({symbol})</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>
                      The maximum amount a provider can add to their wallet per deposit.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="depositBonusPercentage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit Bonus Percentage (%)</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>
                      Optional bonus percentage credited to the wallet automatically. Set to 0 to disable.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="minBalanceForJobs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Balance to Receive Jobs ({symbol})</FormLabel>
                    <FormControl>
                      <Input type="number" {...field} disabled={isSaving} />
                    </FormControl>
                    <FormDescription>
                      The wallet balance threshold below which providers are prevented from accepting or being auto-assigned new bookings.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t pt-4">
            <Button type="submit" disabled={isSaving} className="flex items-center gap-2">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Wallet Settings
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
