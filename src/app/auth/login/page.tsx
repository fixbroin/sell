
"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import Logo from '@/components/shared/Logo';
import { Mail, KeyRound, Loader2, Phone, MessageSquare, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { LogInData } from '@/contexts/AuthContext';
import { useEffect, useState, useRef, useCallback } from 'react';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { Separator } from '@/components/ui/separator';
import { auth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from '@/hooks/use-toast';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { isWebView, requestNativeGoogleSignIn } from '@/lib/webview-bridge';

const loginSchema = z.object({
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});
type LoginFormValues = z.infer<typeof loginSchema>;

const phoneSchema = z.object({
  phone: z.string().min(10, "Please enter a valid 10-digit mobile number."),
});
type PhoneFormValues = z.infer<typeof phoneSchema>;

const otpSchema = z.object({
  otp: z.string().min(6, "OTP must be 6 digits.").max(6, "OTP must be 6 digits."),
});
type OtpFormValues = z.infer<typeof otpSchema>;

const GoogleIcon = () => (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48">
        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.088,5.571l6.19,5.238C44.434,36.336,48,30.836,48,24C48,22.659,47.862,21.35,47.611,20.083z"></path>
    </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const { user, logIn, signInWithGoogle, handleSuccessfulAuth, isLoading: authContextIsLoading, isInitialAuthCheckComplete } = useAuth();
  const { config, isLoading: isLoadingConfig } = useApplicationConfig();
  const { settings: globalSettings, isLoading: isLoadingSettings } = useGlobalSettings();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [phoneFormStage, setPhoneFormStage] = useState<'phone' | 'otp'>('phone');
  const [activeTab, setActiveTab] = useState<'email' | 'otp'>('email');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [fullPhoneNumberForDisplay, setFullPhoneNumberForDisplay] = useState('');
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('login-active-tab');
      if (saved === 'email' || saved === 'otp') {
        setActiveTab(saved);
        return;
      }
    }
    setActiveTab(config.defaultLoginMethod === 'otp' ? 'otp' : 'email');
  }, [config.defaultLoginMethod]);

  const handleTabChange = (val: string) => {
    const tab = val as 'email' | 'otp';
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('login-active-tab', tab);
    }
  };
  
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const emailLoginForm = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });
  const phoneForm = useForm<PhoneFormValues>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: "" } });
  const otpForm = useForm<OtpFormValues>({ resolver: zodResolver(otpSchema), defaultValues: { otp: "" } });

  useEffect(() => {
    // Capture referral code from URL and store it
    const refCode = searchParams.get('ref');
    if (refCode) {
      try {
        localStorage.setItem("referralCode", refCode);
        console.log(`Referral code "${refCode}" captured on login page and stored.`);
      } catch (e) {
        console.error("Could not save referral code to localStorage from login page:", e);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    // Only redirect if the user is fully authenticated and NOT in the middle of profile completion
    if (user && !authContextIsLoading) {
      const redirectPathFromQuery = searchParams.get('redirect');
      const finalRedirectPath = redirectPathFromQuery || (user.email === ADMIN_EMAIL ? '/admin' : '/');
      router.push(finalRedirectPath);
    }
  }, [user, authContextIsLoading, router, searchParams]);

  const onEmailSubmit = async (data: LoginFormValues) => {
    emailLoginForm.clearErrors('email');
    emailLoginForm.clearErrors('password');
    try {
      await logIn(data);
    } catch (error: any) {
      console.error("Login page error:", error);
      const errMsg = error?.message || "Wrong password you entered";
      if (errMsg.toLowerCase().includes("registered") || errMsg.toLowerCase().includes("not found")) {
        emailLoginForm.setError("email", {
          type: "manual",
          message: errMsg
        });
      } else {
        emailLoginForm.setError("password", {
          type: "manual",
          message: errMsg
        });
      }
    }
  };
  
  const onGoogleSubmit = async () => {
    if (isWebView()) {
      requestNativeGoogleSignIn();
      return;
    }
    try {
      await signInWithGoogle();
    } catch (error) {
      console.log("Login page: Google sign-in was closed or failed.");
    }
  };

  const setupAndRenderRecaptcha = async (): Promise<RecaptchaVerifier> => {
    if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
    }
    
    const recaptchaContainer = document.getElementById('recaptcha-container');
    if (!recaptchaContainer) {
        throw new Error("reCAPTCHA container not found.");
    }
    
    try {
        const verifier = new RecaptchaVerifier(auth, recaptchaContainer, {
            'size': 'invisible',
            'callback': () => console.log("reCAPTCHA solved for login."),
        });
        await verifier.render();
        recaptchaVerifierRef.current = verifier;
        return verifier;
    } catch (e) {
        console.error("Error setting up login reCAPTCHA:", e);
        throw new Error("Failed to initialize reCAPTCHA. Please check your connection and refresh.");
    }
  };


  const onPhoneSubmit = async (data: PhoneFormValues) => {
    setIsSendingOtp(true);
    const fullPhoneNumber = `${config.defaultOtpCountryCode}${data.phone}`;
    setFullPhoneNumberForDisplay(fullPhoneNumber);
    try {
      const verifier = await setupAndRenderRecaptcha();
      const result = await signInWithPhoneNumber(auth, fullPhoneNumber, verifier);
      setConfirmationResult(result);
      setPhoneFormStage('otp');
    } catch (error) {
      console.error("Error sending OTP:", error);
      phoneForm.setError("phone", { type: "manual", message: "Failed to send OTP. Check number or try again." });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const onOtpSubmit = async (data: OtpFormValues) => {
    if (!confirmationResult) return;
    setIsVerifyingOtp(true);
    try {
      const userCredential = await confirmationResult.confirm(data.otp);
      await handleSuccessfulAuth(userCredential);
    } catch (error) {
      otpForm.setError("otp", { type: "manual", message: "Invalid OTP. Please try again." });
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const prefix = config.defaultOtpCountryCode || "+91";
    let value = e.target.value;
    if (!value.startsWith(prefix)) {
      value = prefix;
    }
    phoneForm.setValue('phone', value.substring(prefix.length));
    e.target.value = value;
  };

  const handlePhoneKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const prefix = config.defaultOtpCountryCode || "+91";
    const input = e.target as HTMLInputElement;
    if (e.key === 'Backspace' && (input.value === prefix || input.selectionStart! <= prefix.length)) {
      e.preventDefault();
    }
  };

  if (!isInitialAuthCheckComplete || isLoadingConfig || isLoadingSettings || (user && !isInitialAuthCheckComplete)) {
    return <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-muted-foreground">Loading...</p></div>;
  }

  const enabledMethods = [
    config.enableEmailPasswordLogin && 'email',
    config.enableOtpLogin && 'otp'
  ].filter(Boolean) as ('email' | 'otp')[];
  const defaultTab = config.defaultLoginMethod === 'otp' ? 'otp' : 'email';

  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary/30 p-4">
      <div id="recaptcha-container"></div>
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <Logo 
              className="mx-auto mb-4" 
              size="large"
              logoUrl={globalSettings?.logoUrl}
              websiteName={globalSettings?.websiteName}
            />
            <CardTitle className="text-2xl font-headline">Welcome Back!</CardTitle>
            <CardDescription>Login or Sign up to access your account.</CardDescription>
          </CardHeader>

          {phoneFormStage === 'otp' ? (
              <CardContent>
                  <Form {...otpForm}>
                      <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                          <p className="text-sm text-center text-muted-foreground">Enter the 6-digit OTP sent to {fullPhoneNumberForDisplay}</p>
                          <FormField
                            control={otpForm.control}
                            name="otp"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="otp" className="sr-only">One-Time Password</FormLabel>
                                <FormControl>
                                  <div className="flex justify-center">
                                    <InputOTP maxLength={6} {...field} autoComplete="one-time-code">
                                      <InputOTPGroup>
                                        <InputOTPSlot index={0} />
                                        <InputOTPSlot index={1} />
                                        <InputOTPSlot index={2} />
                                      </InputOTPGroup>
                                      <InputOTPGroup>
                                        <InputOTPSlot index={3} />
                                        <InputOTPSlot index={4} />
                                        <InputOTPSlot index={5} />
                                      </InputOTPGroup>
                                    </InputOTP>
                                  </div>
                                </FormControl>
                                <FormDescription className="text-center">
                                  Please enter the one-time password sent to your phone.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button type="submit" className="w-full" disabled={isVerifyingOtp}>
                              {isVerifyingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verify & Login
                          </Button>
                          <Button variant="link" size="sm" onClick={() => { setPhoneFormStage('phone'); otpForm.reset(); }}>
                              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
                          </Button>
                      </form>
                  </Form>
              </CardContent>
          ) : (
          <CardContent className="space-y-4">
            {config.enableGoogleLogin && (
              <>
                <Button variant="outline" className="w-full h-11" onClick={onGoogleSubmit} disabled={authContextIsLoading}><GoogleIcon /> Continue with Google</Button>
                {enabledMethods.length > 0 && <div className="relative my-4"><Separator /><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">OR</div></div>}
              </>
            )}

            {enabledMethods.length > 1 ? (
                <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="email">Email</TabsTrigger>
                    <TabsTrigger value="otp">Phone OTP</TabsTrigger>
                  </TabsList>
                  <TabsContent value="email" className="pt-4">
                      <Form {...emailLoginForm}><form onSubmit={emailLoginForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                          <FormField control={emailLoginForm.control} name="email" render={({ field }) => (<FormItem><FormLabel htmlFor="email"><Mail className="inline mr-2 h-4 w-4 text-muted-foreground" />Email</FormLabel><FormControl><Input id="email" type="email" placeholder="you@example.com" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                          <FormField control={emailLoginForm.control} name="password" render={({ field }) => (<FormItem><FormLabel htmlFor="password"><KeyRound className="inline mr-2 h-4 w-4 text-muted-foreground" />Password</FormLabel><FormControl><Input id="password" type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                          <div className="flex items-center justify-between"><Link href="/auth/forgot-password" passHref><Button variant="link" className="text-sm px-0">Forgot password?</Button></Link></div>
                          <Button type="submit" className="w-full" disabled={authContextIsLoading}>{authContextIsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Login with Email</Button>
                      </form></Form>
                  </TabsContent>
                  <TabsContent value="otp" className="pt-4">
                      <Form {...phoneForm}><form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                          <FormField control={phoneForm.control} name="phone" render={({ field }) => (<FormItem><FormLabel htmlFor="phone"><Phone className="inline mr-2 h-4 w-4 text-muted-foreground" />Phone Number</FormLabel><FormControl><Input id="phone" type="tel" placeholder="Enter mobile number" onChange={handlePhoneInputChange} onKeyDown={handlePhoneKeyDown} defaultValue={config.defaultOtpCountryCode} /></FormControl><FormMessage /></FormItem>)}/>
                          <Button type="submit" className="w-full" disabled={isSendingOtp}>{isSendingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send OTP</Button>
                      </form></Form>
                  </TabsContent>
               </Tabs>
            ) : enabledMethods[0] === 'email' ? (
                <Form {...emailLoginForm}><form onSubmit={emailLoginForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                  <FormField control={emailLoginForm.control} name="email" render={({ field }) => (<FormItem><FormLabel htmlFor="email"><Mail className="inline mr-2 h-4 w-4 text-muted-foreground" />Email</FormLabel><FormControl><Input id="email" type="email" placeholder="you@example.com" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <FormField control={emailLoginForm.control} name="password" render={({ field }) => (<FormItem><FormLabel htmlFor="password"><KeyRound className="inline mr-2 h-4 w-4 text-muted-foreground" />Password</FormLabel><FormControl><Input id="password" type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>)}/>
                  <div className="flex items-center justify-between"><Link href="/auth/forgot-password" passHref><Button variant="link" className="text-sm px-0">Forgot password?</Button></Link></div>
                  <Button type="submit" className="w-full" disabled={authContextIsLoading}>{authContextIsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Login with Email</Button>
              </form></Form>
            ) : enabledMethods[0] === 'otp' ? (
              <Form {...phoneForm}><form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                  <FormField control={phoneForm.control} name="phone" render={({ field }) => (<FormItem><FormLabel htmlFor="phone"><Phone className="inline mr-2 h-4 w-4 text-muted-foreground" />Phone Number</FormLabel><FormControl><Input id="phone" type="tel" placeholder="Enter mobile number" onChange={handlePhoneInputChange} onKeyDown={handlePhoneKeyDown} defaultValue={config.defaultOtpCountryCode}/></FormControl><FormMessage /></FormItem>)}/>
                  <Button type="submit" className="w-full" disabled={isSendingOtp}>{isSendingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send OTP</Button>
              </form></Form>
            ) : (
              <p className="text-center text-sm text-muted-foreground">No login methods are currently enabled. Please contact support.</p>
            )}
          </CardContent>
          )}

          <CardFooter className="flex flex-col gap-2 pt-4">
            <p className="text-sm text-center text-muted-foreground">Don't have an account?{' '}<Link href="/auth/signup" passHref><Button variant="link" className="px-1">Sign up</Button></Link></p>
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
