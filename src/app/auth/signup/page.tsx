
"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import Logo from '@/components/shared/Logo';
import { Mail, KeyRound, User, Loader2, Phone } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { SignUpData } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { Separator } from '@/components/ui/separator';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

const signUpSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignUpFormValues = z.infer<typeof signUpSchema>;

const GoogleIcon = () => (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.088,5.571l6.19,5.238C44.434,36.336,48,30.836,48,24C48,22.659,47.862,21.35,47.611,20.083z"></path>
    </svg>
);


export default function SignupPage() {
  const router = useRouter();
  const { user, signUp, signInWithGoogle, isLoading: authContextIsLoading } = useAuth();
  const { config, isLoading: isLoadingConfig } = useApplicationConfig();
  const { settings: globalSettings, isLoading: isLoadingSettings } = useGlobalSettings();
  const searchParams = useSearchParams();

  const form = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
    },
  });
  
  useEffect(() => {
    // Capture referral code from URL and store it
    const refCode = searchParams.get('ref');
    if (refCode) {
      try {
        localStorage.setItem("referralCode", refCode);
        console.log(`Referral code "${refCode}" captured on signup page and stored.`);
      } catch (e) {
        console.error("Could not save referral code to localStorage from signup page:", e);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    // Only redirect if user is fully authenticated and NOT completing profile
    if (user && !authContextIsLoading) {
      const redirectPathFromQuery = searchParams.get('redirect');
      let finalRedirectPath = '/';

      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        finalRedirectPath = '/admin';
      } else if (redirectPathFromQuery && !redirectPathFromQuery.startsWith('/auth/')) {
        finalRedirectPath = redirectPathFromQuery;
      }
      router.push(finalRedirectPath);
    }
  }, [user, authContextIsLoading, router, searchParams]);


  const onEmailSubmit = async (data: SignUpFormValues) => {
    await signUp(data);
  };
  
  const onGoogleSubmit = async () => {
    await signInWithGoogle();
  };

  if (authContextIsLoading || isLoadingConfig || isLoadingSettings || (user && !authContextIsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
         <Loader2 className="h-12 w-12 animate-spin text-primary" />
         <p className="ml-3 text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <Logo 
              className="mx-auto mb-4" 
              size="large"
              logoUrl={globalSettings?.logoUrl}
              websiteName={globalSettings?.websiteName}
            />
            <CardTitle className="text-2xl font-headline">Create Your Account</CardTitle>
            <CardDescription>Join Yourbrand to easily book home services.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {config.enableGoogleLogin && (
              <>
                <Button variant="outline" className="w-full h-11" onClick={onGoogleSubmit} disabled={authContextIsLoading}>
                  <GoogleIcon /> Continue with Google
                </Button>
                {config.enableEmailPasswordLogin && <div className="relative my-4"><Separator /><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">OR</div></div>}
              </>
            )}

            {config.enableEmailPasswordLogin ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <FormField control={form.control} name="email" render={({ field }) => (<FormItem><FormLabel htmlFor="email"><Mail className="inline mr-2 h-4 w-4 text-muted-foreground" />Email</FormLabel><FormControl><Input id="email" type="email" placeholder="you@example.com" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <FormField control={form.control} name="password" render={({ field }) => (<FormItem><FormLabel htmlFor="password"><KeyRound className="inline mr-2 h-4 w-4 text-muted-foreground" />Password</FormLabel><FormControl><Input id="password" type="password" placeholder="Choose a strong password" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <FormField control={form.control} name="confirmPassword" render={({ field }) => (<FormItem><FormLabel htmlFor="confirmPassword"><KeyRound className="inline mr-2 h-4 w-4 text-muted-foreground" />Confirm Password</FormLabel><FormControl><Input id="confirmPassword" type="password" placeholder="Re-enter your password" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <Button type="submit" className="w-full" size="lg" disabled={authContextIsLoading}>
                    {authContextIsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign Up with Email
                  </Button>
                </form>
              </Form>
            ) : !config.enableGoogleLogin ? (
              <p className="text-center text-muted-foreground p-4">Sign up is currently disabled. Please contact support.</p>
            ) : null }
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <p className="text-sm text-center text-muted-foreground">Already have an account?{' '}<Link href="/auth/login" passHref><Button variant="link" className="px-1">Login</Button></Link></p>
          </CardFooter>
        </Card>
        <p className="mt-4 px-2 text-center text-xs text-muted-foreground">
            By Clicking Continue You Agree To Our{' '}
            <Link href="/terms-and-conditions" className="underline hover:text-primary">
                Terms and Conditions
            </Link>{' '}
            &{' '}
            <Link href="/privacy-policy" className="underline hover:text-primary">
                Privacy Policy
            </Link>
        </p>
      </div>
    </div>
  );
}
