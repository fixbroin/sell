"use client";

import { useEffect, useState } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { KeyRound, Save, Loader2, Mail, Phone, MessageSquare } from "lucide-react";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useToast } from '@/hooks/use-toast';
import PermissionGuard from '@/components/admin/PermissionGuard';

import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from '@/lib/mysqlDb';
import type { AppSettings, LoginMethod } from '@/types/firestore';
import { triggerRefresh } from '@/lib/revalidateUtils';

const loginSettingsSchema = z.object({
  enableEmailPasswordLogin: z.boolean().default(true),
  enableOtpLogin: z.boolean().default(true),
  enableGoogleLogin: z.boolean().default(true),
  defaultLoginMethod: z.enum(['email', 'otp', 'google']).default('email'),
  defaultOtpCountryCode: z.string().startsWith('+', "Must start with '+'").min(2, "Country code is too short.").max(5, "Country code is too long."),
});

type LoginSettingsFormData = z.infer<typeof loginSettingsSchema>;

const loginMethods: { value: LoginMethod; label: string; icon: React.ElementType; fieldName: keyof LoginSettingsFormData }[] = [
  { value: 'email', label: 'Email & Password', icon: Mail, fieldName: 'enableEmailPasswordLogin' },
  { value: 'otp', label: 'Phone Number with OTP', icon: MessageSquare, fieldName: 'enableOtpLogin' },
  { value: 'google', label: 'Google / Gmail', icon: Phone, fieldName: 'enableGoogleLogin' },
];

export default function LoginSettingsPage() {
  const { config, isLoading: isLoadingConfig, error } = useApplicationConfig();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<LoginSettingsFormData>({
    resolver: zodResolver(loginSettingsSchema),
    defaultValues: {
      enableEmailPasswordLogin: true,
      enableOtpLogin: true,
      enableGoogleLogin: true,
      defaultLoginMethod: 'email',
      defaultOtpCountryCode: '+91',
    },
  });

  useEffect(() => {
    if (!isLoadingConfig && config) {
      form.reset({
        enableEmailPasswordLogin: config.enableEmailPasswordLogin ?? true,
        enableOtpLogin: config.enableOtpLogin ?? true,
        enableGoogleLogin: config.enableGoogleLogin ?? true,
        defaultLoginMethod: config.defaultLoginMethod ?? 'email',
        defaultOtpCountryCode: config.defaultOtpCountryCode ?? '+91',
      });
    }
  }, [config, isLoadingConfig, form]);

  const handleSaveSettings = async (data: LoginSettingsFormData) => {
    setIsSaving(true);
    try {
      const settingsToUpdate: Partial<AppSettings> = {
        enableEmailPasswordLogin: data.enableEmailPasswordLogin,
        enableOtpLogin: data.enableOtpLogin,
        enableGoogleLogin: data.enableGoogleLogin,
        defaultLoginMethod: data.defaultLoginMethod,
        defaultOtpCountryCode: data.defaultOtpCountryCode,
        updatedAt: Timestamp.now(),
      };
      await Promise.all([
        setDoc(doc(db, "webSettings", "applicationConfig"), settingsToUpdate, { merge: true }),
        setDoc(doc(db, "appConfiguration", "applicationConfig"), settingsToUpdate, { merge: true }),
      ]);
      if (typeof window !== 'undefined') {
        localStorage.removeItem("app-config");
        localStorage.removeItem("app-config-version");
      }
      await triggerRefresh('app-settings');
      await triggerRefresh('global-cache');
      toast({ title: "Success", description: "Login settings saved successfully." });
    } catch (error) {
      console.error("Error saving login settings:", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save login settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (isLoadingConfig) {
    return (
        <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-3">Loading login settings...</p>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <KeyRound className="mr-2 h-6 w-6 text-primary" /> Login & Authentication Settings
          </CardTitle>
          <CardDescription>
            Control how users can sign up and log in to your application.
          </CardDescription>
        </CardHeader>
      </Card>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSaveSettings)} className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Login Methods</CardTitle>
              <CardDescription>Enable or disable the available login methods for users.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="enableEmailPasswordLogin" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm"><div className="space-y-0.5"><FormLabel className="text-base">Email & Password</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl></FormItem>)}/>
              <FormField control={form.control} name="enableOtpLogin" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm"><div className="space-y-0.5"><FormLabel className="text-base">Phone Number with OTP</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl></FormItem>)}/>
              <FormField control={form.control} name="enableGoogleLogin" render={({ field }) => (<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm"><div className="space-y-0.5"><FormLabel className="text-base">Google / Gmail Login</FormLabel></div><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} disabled={isSaving} /></FormControl></FormItem>)}/>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader><CardTitle>Default Settings</CardTitle><CardDescription>Set the default experience for users on the login page.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
                <FormField control={form.control} name="defaultLoginMethod" render={({ field }) => (
                    <FormItem className="space-y-3"><FormLabel>Default Login Method</FormLabel>
                        <FormControl>
                            <RadioGroup onValueChange={field.onChange} value={field.value} className="space-y-2">
                                {loginMethods.map(method => (
                                    <FormItem key={method.value} className="flex items-center space-x-3 space-y-0">
                                        <FormControl><RadioGroupItem value={method.value} id={`method-${method.value}`} disabled={isSaving || !form.getValues(method.fieldName)}/></FormControl>
                                        <FormLabel htmlFor={`method-${method.value}`} className="font-normal flex items-center gap-2">{method.label}</FormLabel>
                                    </FormItem>
                                ))}
                            </RadioGroup>
                        </FormControl>
                        <FormMessage/>
                    </FormItem>
                )}/>
                <FormField control={form.control} name="defaultOtpCountryCode" render={({ field }) => (
                    <FormItem><FormLabel>Default Country Code for OTP</FormLabel><FormControl><Input placeholder="+91" {...field} disabled={isSaving} className="max-w-xs" /></FormControl><FormDescription>This will be the non-editable prefix for phone number inputs.</FormDescription><FormMessage /></FormItem>
                )}/>
            </CardContent>
          </Card>
          
          <div className="flex justify-end pt-4">
            <PermissionGuard moduleId="login_settings" action="write">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save All Login Settings
              </Button>
            </PermissionGuard>
          </div>
        </form>
      </Form>
    </div>
  );
}
