
"use client";

import { useEffect, useState } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import type { UserCredential } from 'firebase/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, User, Mail, Phone, ShieldCheck } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

interface AdminCompleteProfileDialogProps {
  isOpen: boolean;
  userCredential: UserCredential;
  onSubmit: (details: { fullName: string; email?: string; mobileNumber: string }) => Promise<void>;
  onClose: () => void;
}

const adminProfileSchema = z.object({
  fullName: z.string().min(2, "Full name must be at least 2 characters."),
  mobileNumber: z.string()
    .min(10, { message: "A valid 10-digit mobile number is required." })
    .regex(/^\d{10}$/, { message: "Please enter exactly 10 digits." }),
  email: z.string().email("Invalid email address.").optional(),
});

type AdminProfileFormData = z.infer<typeof adminProfileSchema>;

export default function AdminCompleteProfileDialog({
  isOpen,
  userCredential,
  onSubmit,
  onClose
}: AdminCompleteProfileDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { config, isLoading: isLoadingConfig } = useApplicationConfig();
  
  const form = useForm<AdminProfileFormData>({
    resolver: zodResolver(adminProfileSchema),
    defaultValues: {
      fullName: userCredential.user.displayName || "",
      email: userCredential.user.email || "",
      mobileNumber: "",
    },
  });

  useEffect(() => {
    form.reset({
      fullName: userCredential.user.displayName || "",
      email: userCredential.user.email || "",
      mobileNumber: "",
    });
  }, [userCredential, form]);

  const handleSubmit = async (data: AdminProfileFormData) => {
    setIsSubmitting(true);
    try {
      const formattedMobile = `${config.defaultOtpCountryCode || '+91'}${data.mobileNumber}`;
      await onSubmit({
        fullName: data.fullName,
        email: data.email || userCredential.user.email || undefined,
        mobileNumber: formattedMobile,
      });
      toast({ title: "Profile Completed", description: "Your admin account is now ready." });
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message || "Could not save profile details.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent 
        className="max-w-[90%] sm:max-w-md border-none shadow-2xl rounded-[2rem]"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideCloseButton={true}
      >
        <DialogHeader className="space-y-3">
          <div className="bg-primary/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-2xl font-black tracking-tight uppercase">Admin Onboarding</DialogTitle>
          <DialogDescription className="text-sm font-medium">
            Welcome to the Yourbrand Team! Please verify your official contact details to secure your account.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Legal Full Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                        <Input placeholder="Enter your full name" {...field} disabled={isSubmitting} className="pl-10 h-12 rounded-xl bg-muted/30 border-none" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="mobileNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Official Mobile Number</FormLabel>
                   <div className="flex items-center">
                      <span className="inline-flex items-center px-4 rounded-l-xl bg-muted text-muted-foreground h-12 text-sm font-bold border-r border-background/20">
                        {isLoadingConfig ? '...' : config.defaultOtpCountryCode || '+91'}
                      </span>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="10-digit number"
                          {...field}
                          className="rounded-l-none rounded-r-xl bg-muted/30 border-none h-12"
                          disabled={isSubmitting || isLoadingConfig}
                        />
                      </FormControl>
                    </div>
                  <FormDescription className="text-[10px] ml-1">Used for system alerts and security verification.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
             
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Email Address</FormLabel>
                  <FormControl>
                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                        <Input type="email" {...field} disabled={true} className="pl-10 h-12 rounded-xl bg-muted/50 border-none opacity-80" />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
                <Button type="submit" disabled={isSubmitting || isLoadingConfig} className="w-full h-14 rounded-2xl bg-primary font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-primary/20">
                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Verify & Access Dashboard
                </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
