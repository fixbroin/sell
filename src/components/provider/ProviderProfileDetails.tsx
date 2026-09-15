
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Mail, User, Phone, ShieldCheck, ShieldAlert, Edit3, Loader2 } from "lucide-react";
import type { FirestoreUser } from '@/types/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { verifyBeforeUpdateEmail, sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface ProviderProfileDetailsProps {
    user: ReturnType<typeof useAuth>['user'];
    firestoreUser: FirestoreUser | null;
    onSendVerificationOtp: () => void;
    isSendingOtp: boolean;
    isPhoneVerified?: boolean;
    onEditName?: () => void; 
}

export default function ProviderProfileDetails({
    user,
    firestoreUser,
    onSendVerificationOtp,
    isSendingOtp,
    isPhoneVerified,
    onEditName,
}: ProviderProfileDetailsProps) {
    const { toast } = useToast();
    const [isSendingVerification, setIsSendingVerification] = useState(false);

    if (!user) return null;

    const displayName = firestoreUser?.displayName || user.displayName;
    const displayEmail = user.email || firestoreUser?.email;
    const isEmailVerified = user.emailVerified;

    const handleSendVerificationEmail = async () => {
        const emailToVerify = firestoreUser?.email;

        if (!auth.currentUser || !emailToVerify) {
            toast({ title: "Email not found", description: "Provider email is not set in the profile.", variant: "destructive" });
            return;
        }

        if (auth.currentUser.email === emailToVerify && !auth.currentUser.emailVerified) {
             setIsSendingVerification(true);
             try {
                const actionCodeSettings = { url: `${window.location.origin}/provider/profile`, handleCodeInApp: true };
                await sendEmailVerification(auth.currentUser, actionCodeSettings);
                toast({title: "Verification Email Sent", description: "Please check your inbox."});
            } catch (error: any) {
                toast({ title: "Error", description: error.message, variant: "destructive" });
            } finally {
                setIsSendingVerification(false);
            }
        }
        else if (auth.currentUser.email !== emailToVerify) {
            setIsSendingVerification(true);
            try {
                const actionCodeSettings = { url: `${window.location.origin}/provider/profile`, handleCodeInApp: true };
                await verifyBeforeUpdateEmail(auth.currentUser, emailToVerify, actionCodeSettings);
                toast({ title: "Verification Email Sent", description: `A verification link was sent to ${emailToVerify}. Please click the link to verify and link this email to your account.` });
            } catch (error: any) {
                toast({ title: "Error", description: error.message || "Could not send verification email. This email may already be in use.", variant: "destructive" });
            } finally {
                setIsSendingVerification(false);
            }
        } else {
             toast({ title: "Email Already Verified", description: "This email address is already verified.", variant: "default" });
        }
    };

    return (
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <Avatar className="w-24 h-24 mx-auto mb-4 border-2 border-primary">
              <AvatarImage src={user.photoURL || undefined} alt={displayName || "User"} />
              <AvatarFallback className="text-3xl">{displayName ? displayName[0].toUpperCase() : "U"}</AvatarFallback>
            </Avatar>
            <CardTitle className="text-3xl font-headline">{displayName || "Your Profile"}</CardTitle>
            <CardDescription className="text-md text-muted-foreground">Manage your personal information and account settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center"><User className="mr-2 h-5 w-5 text-primary" /> Full Name</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-secondary/30 rounded-md gap-2">
                <p className="text-muted-foreground break-words">{displayName || "Not set"}</p>
                {onEditName ? (
                    <Button variant="ghost" size="sm" onClick={onEditName}><Edit3 className="mr-1 h-4 w-4" /> Edit</Button>
                ) : (
                 <Link href="/provider-registration?edit=profile" passHref>
                    <Button variant="ghost" size="sm"><Edit3 className="mr-1 h-4 w-4" /> Edit Profile</Button>
                </Link>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center"><Mail className="mr-2 h-5 w-5 text-primary" /> Email Address</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-secondary/30 rounded-md gap-2">
                <p className="text-muted-foreground break-all">{displayEmail || "Not set"}</p>
                {isEmailVerified ? (
                  <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <ShieldCheck className="h-4 w-4" /> Verified
                  </div>
                ) : displayEmail ? (
                  <Button variant="outline" size="sm" onClick={handleSendVerificationEmail} disabled={isSendingVerification} className="w-full sm:w-auto">
                    {isSendingVerification ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldAlert className="mr-2 h-4 w-4" />}
                    Verify Email
                  </Button>
                ) : (
                  <Badge variant="destructive" className="text-xs">Not Set</Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold flex items-center"><Phone className="mr-2 h-5 w-5 text-primary" /> Mobile Number</h3>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-secondary/30 rounded-md gap-2">
                <p className="text-muted-foreground break-all">{firestoreUser?.mobileNumber || user.phoneNumber || "Not set"}</p>
                {isPhoneVerified ? (
                    <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <ShieldCheck className="h-4 w-4" /> Verified
                    </div>
                 ) : (firestoreUser?.mobileNumber || user.phoneNumber) ? (
                    <Button variant="ghost" size="sm" onClick={onSendVerificationOtp} disabled={isSendingOtp} className="w-full sm:w-auto">
                      {isSendingOtp && <Loader2 className="mr-1 h-3 w-3 animate-spin"/>} Verify
                    </Button>
                 ) : (
                    <Link href="/provider-registration?edit=profile" passHref>
                        <Button variant="ghost" size="sm"><Edit3 className="mr-1 h-4 w-4" /> Add</Button>
                    </Link>
                 )}
              </div>
            </div>
          </CardContent>
        </Card>
    );
}
