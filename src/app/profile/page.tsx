
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { Mail, ShieldAlert, KeyRound, Trash2, Loader2, Phone, ShieldCheck, MapPin, Edit3, Save, User as UserIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { updateProfile, sendPasswordResetEmail, deleteUser, updateEmail, sendEmailVerification, RecaptchaVerifier, type ConfirmationResult, type User, linkWithPhoneNumber } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, Timestamp, collection, query, where, getDocs, limit } from '@/lib/mysqlDb';
import { useToast } from '@/hooks/use-toast';
import type { FirestoreUser } from '@/types/firestore';
import Link from 'next/link';
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { triggerRefresh } from '@/lib/revalidateUtils';
import ProviderProfileDetails from "@/components/provider/ProviderProfileDetails";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

const updateNameSchema = z.object({
  displayName: z.string().min(2, { message: "Name must be at least 2 characters." }).max(50, "Name too long."),
});
type UpdateNameFormValues = z.infer<typeof updateNameSchema>;

const updateMobileSchema = z.object({
  mobileNumber: z.string()
    .min(10, "Please enter a valid 10-digit mobile number.")
    .max(10, "Please enter a valid 10-digit mobile number.")
    .regex(/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian mobile number."),
});
type UpdateMobileFormValues = z.infer<typeof updateMobileSchema>;

const updateEmailSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
});
type UpdateEmailFormValues = z.infer<typeof updateEmailSchema>;

const otpSchema = z.object({
  otp: z.string().min(6, "OTP must be 6 digits.").max(6, "OTP must be 6 digits."),
});
type OtpFormData = z.infer<typeof otpSchema>;

export default function ProfilePage() {
  const { user, firestoreUser, isLoading: authIsLoading, setUser, logOut } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isNameDialogOpen, setIsNameDialogOpen] = useState(false);
  const [isSubmittingName, setIsSubmittingName] = useState(false);
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  const [isSubmittingMobile, setIsSubmittingMobile] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isOtpDialogOpen, setIsOtpDialogOpen] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  const nameForm = useForm<UpdateNameFormValues>({ resolver: zodResolver(updateNameSchema) });
  const mobileForm = useForm<UpdateMobileFormValues>({ resolver: zodResolver(updateMobileSchema) });
  const emailForm = useForm<UpdateEmailFormValues>({ resolver: zodResolver(updateEmailSchema) });
  const otpForm = useForm<OtpFormData>({ resolver: zodResolver(otpSchema) });

  useEffect(() => {
    if (user && firestoreUser) {
      nameForm.reset({ displayName: firestoreUser.displayName || user.displayName || "" });
      mobileForm.reset({ mobileNumber: (firestoreUser.mobileNumber || user.phoneNumber || "").replace(appConfig?.defaultOtpCountryCode || '+91', '') });
      emailForm.reset({ email: firestoreUser.email || user.email || "" });
      setIsLoadingData(false);
    } else if (!authIsLoading && !user) {
      setIsLoadingData(false); // User not logged in, stop loading
    }
  }, [user, firestoreUser, authIsLoading, appConfig, nameForm, mobileForm, emailForm]);

  const setupAndRenderRecaptcha = useCallback(async (): Promise<RecaptchaVerifier> => {
    if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
    }
    const recaptchaContainer = document.getElementById('recaptcha-container-profile');
    if (!recaptchaContainer) {
        throw new Error("reCAPTCHA container not found.");
    }
    try {
        const verifier = new RecaptchaVerifier(auth, recaptchaContainer, {
            'size': 'invisible',
            'callback': () => console.log("reCAPTCHA solved for profile verification."),
        });
        await verifier.render();
        recaptchaVerifierRef.current = verifier;
        return verifier;
    } catch (e) {
        console.error("Error setting up reCAPTCHA for profile:", e);
        throw new Error("Failed to initialize reCAPTCHA. Please refresh and try again.");
    }
  }, []);

  const handleSendVerificationOtp = async () => {
    const mobileNumber = firestoreUser?.mobileNumber || user?.phoneNumber;
    if (!mobileNumber) {
        toast({ title: "Mobile Number Missing", description: "Please add a mobile number to your profile first.", variant: "destructive" });
        return;
    }
    if (!auth.currentUser) {
        toast({ title: "Authentication Error", description: "User not found. Please log in again.", variant: "destructive" });
        return;
    }
    
    setIsSendingOtp(true);
    const countryCode = appConfig?.defaultOtpCountryCode || '+91';
    let fullPhoneNumber = mobileNumber;
    if (!fullPhoneNumber.startsWith('+')) {
      fullPhoneNumber = `${countryCode}${fullPhoneNumber.replace(/\D/g, '')}`;
    }
    
    try {
        const appVerifier = await setupAndRenderRecaptcha();
        const confirmation = await linkWithPhoneNumber(auth.currentUser, fullPhoneNumber, appVerifier);
        setConfirmationResult(confirmation);
        setIsOtpDialogOpen(true);
        toast({ title: "OTP Sent", description: `An OTP has been sent to ${fullPhoneNumber}.` });
    } catch (error: any) {
        console.error("Error sending OTP for verification:", error);
        toast({ title: "OTP Error", description: error.message || "Failed to send OTP. The number might be invalid or already in use.", variant: "destructive" });
    } finally {
        setIsSendingOtp(false);
    }
  };
  
  const handleVerifyOtp = async (data: OtpFormData) => {
    if (!confirmationResult || !user) return;
    setIsVerifyingOtp(true);
    try {
        await confirmationResult.confirm(data.otp);
        await setDoc(doc(db, "users", user.uid), { mobileNumberVerified: true }, { merge: true });
        toast({ title: "Success!", description: "Your mobile number has been verified." });
        setIsOtpDialogOpen(false);
        otpForm.reset();
        await auth.currentUser?.reload();
        setUser(auth.currentUser);
    } catch (error: any) {
        otpForm.setError("otp", { type: "manual", message: "Invalid OTP or error verifying." });
        toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
    } finally {
        setIsVerifyingOtp(false);
    }
  };

  const handleUpdateName = async (values: UpdateNameFormValues) => {
    if (!user || !auth.currentUser) return;
    setIsSubmittingName(true);
    try {
      await updateProfile(auth.currentUser, { displayName: values.displayName });
      await setDoc(doc(db, "users", user.uid), { displayName: values.displayName }, { merge: true });
      toast({ title: "Success", description: "Your name has been updated." });
      setIsNameDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not update name.", variant: "destructive" });
    } finally {
      setIsSubmittingName(false);
    }
  };
  
  const handleUpdateEmail = async (values: UpdateEmailFormValues) => {
    if (!user || !auth.currentUser) return;
    setIsSubmittingEmail(true);
    try {
      // Verify email uniqueness
      const emailQuery = query(collection(db, "users"), where("email", "==", values.email.toLowerCase()), limit(1));
      const emailSnap = await getDocs(emailQuery);
      if (!emailSnap.empty && emailSnap.docs[0].id !== user.uid) {
        throw new Error("This email address is already linked to another account.");
      }

      await updateEmail(auth.currentUser, values.email); 
      await setDoc(doc(db, "users", user.uid), { email: values.email }, { merge: true });
      toast({ title: "Email Updated", description: "A verification link has been sent to your new email address." });
      setIsEmailDialogOpen(false);
    } catch (error: any) {
      if (error.code === 'auth/requires-recent-login') {
         toast({ title: "Action Requires Recent Login", description: "Please log out and log back in to update your email.", variant: "destructive" });
      } else {
         toast({ title: "Error", description: error.message || "Could not update email.", variant: "destructive" });
      }
    } finally {
      setIsSubmittingEmail(false);
    }
  };

  const handleUpdateMobileNumber = async (values: UpdateMobileFormValues) => {
    if (!user) return;
    setIsSubmittingMobile(true);
    const countryCode = appConfig?.defaultOtpCountryCode || '+91';
    const fullPhoneNumber = `${countryCode}${values.mobileNumber}`;
    try {
      // Verify mobile number uniqueness
      const phoneQuery = query(collection(db, "users"), where("mobileNumber", "==", fullPhoneNumber), limit(1));
      const phoneSnap = await getDocs(phoneQuery);
      if (!phoneSnap.empty && phoneSnap.docs[0].id !== user.uid) {
        throw new Error("This mobile number is already linked to another account.");
      }

      await setDoc(doc(db, "users", user.uid), {
        mobileNumber: fullPhoneNumber,
        mobileNumberVerified: false,
      }, { merge: true });
      toast({ title: "Success", description: "Your mobile number has been updated. Please verify it." });
      setIsMobileDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Could not update mobile number.", variant: "destructive" });
    } finally {
      setIsSubmittingMobile(false);
    }
  };

  const handleChangePassword = async () => {
    const emailToUse = user?.email || firestoreUser?.email;
    if (!emailToUse) {
      toast({ title: "Email Required", description: "You must have an email address set to change your password.", variant: "destructive" });
      return;
    }
    setIsSendingResetEmail(true);
    try {
      await sendPasswordResetEmail(auth, emailToUse);
      toast({ title: "Password Reset Email Sent", description: "Check your inbox for a password reset link." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSendingResetEmail(false);
    }
  };

  const handleSendVerificationEmail = async () => {
    if (!user || !auth.currentUser || !user.email) return;
    setIsSendingVerification(true);
    try {
        const actionCodeSettings = { url: `${window.location.origin}/profile`, handleCodeInApp: true };
        await sendEmailVerification(auth.currentUser, actionCodeSettings);
        toast({title: "Verification Email Sent", description: "Please check your inbox."});
    } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
        setIsSendingVerification(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || !auth.currentUser) return;

    setIsDeletingAccount(true);

    try {
      const uid = user.uid;
      await Promise.all([
        deleteDoc(doc(db, "users", uid)),
        deleteDoc(doc(db, "providerApplications", uid)),
      ]);
      await deleteUser(auth.currentUser);
      await logOut();
      await triggerRefresh('users');

      toast({
        title: "Account Deleted",
        description: "Your account and all associated data have been permanently deleted."
      });

      router.push("/");
    } catch (error: any) {
      if (error.code === "auth/requires-recent-login") {
        toast({
          title: "Please login again",
          description: "For security, logout and login again before deleting account.",
          variant: "destructive"
        });

        await logOut();
      } else {
        toast({
          title: "Delete failed",
          description: error.message,
          variant: "destructive"
        });
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (authIsLoading || isLoadingData || isLoadingAppSettings || !user) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  return (
    <ProtectedRoute>
      <div id="recaptcha-container-profile" className="fixed bottom-0 right-0"></div>
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        <ProviderProfileDetails
          user={user}
          firestoreUser={firestoreUser}
          onSendVerificationOtp={handleSendVerificationOtp}
          isSendingOtp={isSendingOtp}
          isPhoneVerified={user?.providerData?.some(p => p.providerId === 'phone') || firestoreUser?.mobileNumberVerified}
          onEditName={() => setIsNameDialogOpen(true)}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Account Security</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
           
             <Button variant="outline" onClick={handleChangePassword} disabled={isSendingResetEmail}>
                {isSendingResetEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Change Password
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="destructive" className="sm:ml-auto" disabled={isDeletingAccount}>{isDeletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}Delete Account</Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescriptionComponent>This will permanently delete your account and remove your data from our servers.</AlertDialogDescriptionComponent></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={isDeletingAccount}>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDeleteAccount} disabled={isDeletingAccount} className="bg-destructive hover:bg-destructive/90">{isDeletingAccount && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Yes, delete account</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
              </AlertDialog>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isNameDialogOpen} onOpenChange={setIsNameDialogOpen}>
        <DialogContent className="sm:max-w-[425px]"><DialogHeader><DialogTitle>Update Your Name</DialogTitle><DialogDescription>Enter your new display name.</DialogDescription></DialogHeader>
          <Form {...nameForm}><form onSubmit={nameForm.handleSubmit(handleUpdateName)} className="space-y-4 py-2">
            <FormField control={nameForm.control} name="displayName" render={({ field }) => (<FormItem><FormLabel htmlFor="displayName">Full Name</FormLabel><FormControl><Input id="displayName" {...field} disabled={isSubmittingName} /></FormControl><FormMessage /></FormItem>)}/>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingName}>Cancel</Button></DialogClose><Button type="submit" disabled={isSubmittingName}>{isSubmittingName && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Changes</Button></DialogFooter>
          </form></Form>
        </DialogContent>
      </Dialog>
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="sm:max-w-[425px]"><DialogHeader><DialogTitle>Update Email</DialogTitle><DialogDescription>Enter your new email address. You will need to verify it.</DialogDescription></DialogHeader>
          <Form {...emailForm}><form onSubmit={emailForm.handleSubmit(handleUpdateEmail)} className="space-y-4 py-2">
            <FormField control={emailForm.control} name="email" render={({ field }) => (<FormItem><FormLabel htmlFor="email">Email</FormLabel><FormControl><Input type="email" id="email" {...field} disabled={isSubmittingEmail} /></FormControl><FormMessage /></FormItem>)}/>
            <DialogFooter><DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingEmail}>Cancel</Button></DialogClose><Button type="submit" disabled={isSubmittingEmail}>{isSubmittingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update Email</Button></DialogFooter>
          </form></Form>
        </DialogContent>
      </Dialog>
      <Dialog open={isMobileDialogOpen} onOpenChange={setIsMobileDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Mobile Number</DialogTitle>
            <DialogDescription>Enter your 10-digit mobile number.</DialogDescription>
          </DialogHeader>
          <Form {...mobileForm}>
            <form onSubmit={mobileForm.handleSubmit(handleUpdateMobileNumber)} className="space-y-4 py-2">
              <FormField control={mobileForm.control} name="mobileNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="mobileNumber">Mobile Number</FormLabel>
                  <div className="flex items-center">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground h-10">
                      {appConfig?.defaultOtpCountryCode || '+91'}
                    </span>
                    <FormControl>
                      <Input
                        type="tel"
                        id="mobileNumber"
                        placeholder="9876543210"
                        {...field}
                        className="rounded-l-none"
                        disabled={isSubmittingMobile}
                      />
                    </FormControl>
                  </div>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmittingMobile}>Cancel</Button></DialogClose>
                <Button type="submit" disabled={isSubmittingMobile}>
                  {isSubmittingMobile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Dialog open={isOtpDialogOpen} onOpenChange={setIsOtpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Mobile Number</DialogTitle>
            <DialogDescription>Enter the 6-digit OTP sent to {firestoreUser?.mobileNumber || user.phoneNumber}.</DialogDescription>
          </DialogHeader>
          <Form {...otpForm}>
            <form onSubmit={otpForm.handleSubmit(handleVerifyOtp)} className="space-y-4 py-2">
                <FormField
                  control={otpForm.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="sr-only">OTP</FormLabel>
                      <FormControl>
                        <div className="flex justify-center">
                            <InputOTP maxLength={6} {...field}>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsOtpDialogOpen(false)} disabled={isVerifyingOtp}>Cancel</Button>
                <Button type="submit" disabled={isVerifyingOtp}>
                  {isVerifyingOtp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verify OTP
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}
