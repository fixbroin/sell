
"use client";

import { useEffect, useState } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { UserCredential } from 'firebase/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, User, Mail, Phone, Gift } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

interface CompleteProfileDialogProps {
  isOpen: boolean;
  userCredential: UserCredential;
  onSubmit: (details: { fullName: string; email?: string; mobileNumber?: string; referralCode?: string }) => Promise<void>;
  onClose: () => void; // For cancelling/logging out the partial user
}

const profileSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  mobileNumber: z.string().optional(),
  email: z.string().optional(),
  referralCode: z.string().optional(),
}).superRefine((data, ctx) => {
  // Logic handled in handleSubmit for specific provider requirements
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function CompleteProfileDialog({
  isOpen,
  userCredential,
  onSubmit,
  onClose
}: CompleteProfileDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { config, isLoading: isLoadingConfig } = useApplicationConfig();
  
  const providerId = userCredential.user.providerData[0]?.providerId;
  const isGoogleSignIn = providerId === 'google.com';
  const isPhoneSignIn = providerId === 'phone';
  const isEmailPasswordSignUp = providerId === 'password';

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: userCredential.user.displayName || "",
      email: userCredential.user.email || "",
      mobileNumber: userCredential.user.phoneNumber ? userCredential.user.phoneNumber.replace(config.defaultOtpCountryCode || '+91', '') : "",
      referralCode: "",
    },
  });

  useEffect(() => {
    // Reset form when initial data or config changes
    form.reset({
      fullName: userCredential.user.displayName || "",
      email: userCredential.user.email || "",
      mobileNumber: userCredential.user.phoneNumber ? userCredential.user.phoneNumber.replace(config.defaultOtpCountryCode || '+91', '') : "",
      referralCode: "",
    });
  }, [userCredential, config, form]);

  const cleanMobileNumber = (val: string, countryCode: string = "+91") => {
    let cleaned = val.replace(/\s+/g, '').replace(/[-()]/g, ''); // strip spaces, dashes, parens
    
    const prefixWithPlus = countryCode.startsWith('+') ? countryCode : `+${countryCode}`; // e.g. "+91"
    
    // 1. If it starts with "+" (e.g., "+919876543210"), strip country code prefix
    if (cleaned.startsWith('+')) {
      if (cleaned.startsWith(prefixWithPlus)) {
        cleaned = cleaned.substring(prefixWithPlus.length);
      }
    } 
    // 2. If it starts with "0" and is longer than 10 digits, strip the leading "0"
    else if (cleaned.startsWith('0') && cleaned.length > 10) {
      cleaned = cleaned.substring(1);
    }
    
    return cleaned.replace(/\D/g, ''); // Only digits
  };

  const handleSubmit = async (data: ProfileFormData) => {
    let mobileNumberForSubmit = data.mobileNumber;

    if (isGoogleSignIn || isEmailPasswordSignUp) {
      if (!data.mobileNumber || !/^\d{10}$/.test(data.mobileNumber)) {
        form.setError("mobileNumber", { type: "manual", message: "A valid 10-digit mobile number is required." });
        return;
      }
      mobileNumberForSubmit = `${config.defaultOtpCountryCode || '+91'}${data.mobileNumber}`;
    }

    if (isPhoneSignIn && (!data.email || !z.string().email().safeParse(data.email).success)) {
      form.setError("email", { type: "manual", message: "A valid email address is required." });
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit({
        fullName: data.fullName,
        email: data.email || userCredential.user.email || undefined,
        mobileNumber: mobileNumberForSubmit || userCredential.user.phoneNumber || undefined,
        referralCode: data.referralCode,
      });
    } catch (error: any) {
      const errorMessage = error.message || "Could not save profile. Please try again.";
      toast({ title: "Registration Update", description: errorMessage, variant: errorMessage.includes('referral') ? "warning" : "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasAutoReferral = typeof window !== 'undefined' && !!localStorage.getItem('referralCode');

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        className="max-w-[90%] sm:max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
            e.preventDefault();
            onClose(); 
        }}
        hideCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">Complete Your Profile</DialogTitle>
          <DialogDescription>
            Welcome! We just need a few more details to create your account.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4" />Full Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Your full name" {...field} disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {(isGoogleSignIn || isEmailPasswordSignUp) && (
              <FormField
                control={form.control}
                name="mobileNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4" />Mobile Number</FormLabel>
                     <div className="flex items-center">
                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground h-10">
                          {isLoadingConfig ? '...' : config.defaultOtpCountryCode}
                        </span>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="10-digit number"
                            {...field}
                            onChange={(e) => {
                              const cleaned = cleanMobileNumber(e.target.value, config.defaultOtpCountryCode);
                              field.onChange(cleaned);
                            }}
                            className="rounded-l-none"
                            disabled={isSubmitting || isLoadingConfig}
                          />
                        </FormControl>
                      </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
             
            {isPhoneSignIn && (
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4" />Email Address</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="Your email address" {...field} disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!hasAutoReferral && (
              <FormField
                control={form.control}
                name="referralCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-primary/80"><Gift className="mr-2 h-4 w-4" />Referral Code (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter referral code" {...field} disabled={isSubmitting} className="uppercase font-mono" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            
            <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button type="submit" disabled={isSubmitting || isLoadingConfig}>
                    {(isSubmitting || isLoadingConfig) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Account
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
