
"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import Logo from '@/components/shared/Logo';
import { Mail, Loader2, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react'; // Added useEffect
import { useAuth } from '@/hooks/useAuth'; // Added useAuth
import { ADMIN_EMAIL } from '@/contexts/AuthContext'; // Added ADMIN_EMAIL
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmittingForm, setIsSubmittingForm] = useState(false); // Renamed from isLoading
  const { user, isLoading: authContextIsLoading } = useAuth(); // Get user and auth loading state
  const { settings: globalSettings, isLoading: isLoadingSettings } = useGlobalSettings();

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  useEffect(() => {
    if (user && !authContextIsLoading) {
      // User is logged in, redirect them away from forgot password page
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        router.push('/admin');
      } else {
        // Potentially check for provider role and redirect to /provider
        // For now, default to home
        router.push('/');
      }
    }
  }, [user, authContextIsLoading, router]);

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsSubmittingForm(true);
    try {
      await sendPasswordResetEmail(auth, data.email);
      toast({
        title: "Password Reset Email Sent",
        description: "If an account exists for this email, a password reset link has been sent. Please check your inbox (and spam folder).",
        duration: 7000,
      });
      form.reset(); 
    } catch (error: any) {
      console.error("Forgot password error:", error);
      const errorMessage = "Could not send password reset email. Please try again.";
      if (error.code === 'auth/user-not-found') {
        console.warn("Attempt to reset password for non-existent user:", data.email);
        toast({
            title: "Password Reset Email Sent (If Account Exists)",
            description: "If an account is registered with this email, a password reset link has been sent.",
            duration: 7000,
        });
      } else {
        toast({
            title: "Error",
            description: error.message || errorMessage,
            variant: "destructive",
        });
      }
    } finally {
      setIsSubmittingForm(false);
    }
  };

  if (authContextIsLoading || isLoadingSettings) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
         <Loader2 className="h-12 w-12 animate-spin text-primary" />
         <p className="ml-3 text-muted-foreground">Loading session...</p>
      </div>
    );
  }

  if (user && !authContextIsLoading) { // User is logged in, useEffect will redirect
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
         <Loader2 className="h-12 w-12 animate-spin text-primary" />
         <p className="ml-3 text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Logo
            className="mx-auto mb-4"
            size="large"
            logoUrl={globalSettings?.logoUrl}
            websiteName={globalSettings?.websiteName}
          />
          <CardTitle className="text-2xl font-headline">Reset Your Password</CardTitle>
          <CardDescription>Enter your email address and we'll send you a link to reset your password.</CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="email" className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground" />Email Address</FormLabel>
                    <FormControl>
                      <Input id="email" type="email" placeholder="you@example.com" {...field} disabled={isSubmittingForm} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex flex-col gap-4">
              <Button type="submit" className="w-full" size="lg" disabled={isSubmittingForm}>
                {isSubmittingForm ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send Reset Link
              </Button>
              <Link href="/auth/login" passHref className="w-full">
                <Button variant="link" className="w-full text-sm">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
                </Button>
              </Link>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
