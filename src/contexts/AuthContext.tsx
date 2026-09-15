"use client";

import type { PropsWithChildren } from 'react';
import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  type User,
  type AuthError,
  type UserCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { initializeFCM, onForegroundMessage } from '@/lib/fcmUtils';
import { doc, setDoc, Timestamp, getDoc, onSnapshot, collection, query, where, getDocs, limit, runTransaction, or } from '@/lib/mysqlDb';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { FirestoreUser, MarketingAutomationSettings, ReferralSettings, Referral, FirestoreNotification, ProviderApplicationStatus } from '@/types/firestore';
import { logUserActivity } from '@/lib/activityLogger';
import { assignNewUserNumber } from '@/lib/webServerUtils';
import { getGuestId, clearGuestId } from '@/lib/guestIdManager';
import { sendWelcomeEmail } from '@/ai/flows/sendWelcomeEmailFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { nanoid } from 'nanoid';
import { syncCartOnLogin } from '@/lib/cartManager';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { incrementSystemStats } from '@/lib/systemStatsUtils';
import type { AdminPermissions, AdminRole } from '@/config/rbac';
import { SUPER_ADMIN_PERMISSIONS, getFirstAccessiblePath } from '@/config/rbac';
// Define and export ADMIN_EMAIL here
export const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com";

export interface SignUpData {
  email: string;
  password: string;
}

export interface LogInData {
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  firestoreUser: FirestoreUser | null;
  adminPermissions: AdminPermissions | null;
  adminRole: AdminRole | null;
  isSuperAdmin: boolean;
  isLoading: boolean;
  isInitialAuthCheckComplete: boolean;
  providerStatus: ProviderApplicationStatus | null;
  isAdminLoading: boolean;
  authActionRedirectPath: string | null;
  triggerAuthRedirect: (intendedPath: string) => void;
  signUp: (data: SignUpData) => Promise<void>;
  logIn: (data: LogInData) => Promise<void>;
  logOut: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  handleSuccessfulAuth: (userCredential: UserCredential) => Promise<void>;
  isCompletingProfile: boolean;
  isCompletingProfileAsAdmin: boolean;
  userCredentialForProfileCompletion: UserCredential | null;
  completeProfileSetup: (details: { fullName: string; email?: string; mobileNumber?: string; referralCode?: string }) => Promise<void>;
  cancelProfileCompletion: () => void;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const generateReferralCode = (length: number) => {
  return nanoid(length).toUpperCase();
};

const getSimpleDeviceId = (): string => {
    if (typeof window === 'undefined') return 'server';
    const { userAgent, hardwareConcurrency, language } = window.navigator;
    const { width, height, colorDepth, pixelDepth } = window.screen;
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    let webglVendor = 'unknown';
    if (gl) {
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            webglVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
    }
    const dataString = `${userAgent}|${width}x${height}|${colorDepth}|${pixelDepth}|${hardwareConcurrency}|${language}|${webglVendor}`;
    let hash = 0;
    for (let i = 0; i < dataString.length; i++) {
        const char = dataString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
};


export const AuthProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUser | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderApplicationStatus | null>(null);
  const [adminPermissions, setAdminPermissions] = useState<AdminPermissions | null>(null);
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialAuthCheckComplete, setIsInitialAuthCheckComplete] = useState(false);
  const [adminCheckCompleteFor, setAdminCheckCompleteFor] = useState<string | null>(null);
  const isAdminLoading = user ? adminCheckCompleteFor !== user.uid : false;
  const [authActionRedirectPath, setAuthActionRedirectPath] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  const [isCompletingProfile, setIsCompletingProfile] = useState(false);
  const [isCompletingProfileAsAdmin, setIsCompletingProfileAsAdmin] = useState(false);
  const [userCredentialForProfileCompletion, setUserCredentialForProfileCompletion] = useState<UserCredential | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (isCompletingProfile || isCompletingProfileAsAdmin) {
        setUser(null);
      } else {
        setUser(currentUser);
      }
      setIsLoading(false);
      setIsInitialAuthCheckComplete(true);
    });
    return () => unsubscribe();
  }, [isCompletingProfile, isCompletingProfileAsAdmin]);

  useEffect(() => {
    if (user?.uid) {
        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setFirestoreUser({ id: docSnap.id, ...docSnap.data() } as FirestoreUser);
            } else {
                setFirestoreUser(null);
            }
        }, (error) => {
            console.error("AuthContext: Error fetching Firestore user data:", error);
            setFirestoreUser(null);
        });
        return () => unsubscribe();
    } else {
        setFirestoreUser(null);
    }
  }, [user]);

  // Block disabled users in real-time
  useEffect(() => {
    if (firestoreUser && firestoreUser.isActive === false && user) {
      toast({
        title: "Account Disabled",
        description: "Your account has been disabled. Please contact support.",
        variant: "destructive"
      });
      signOut(auth).then(() => {
        setUser(null);
        setFirestoreUser(null);
        router.push('/auth/login');
      });
    }
  }, [firestoreUser, user, router, toast]);

  // NEW: Real-time Provider Application Status Sync
  useEffect(() => {
    if (user?.uid) {
        const appDocRef = doc(db, 'providerApplications', user.uid);
        const unsubscribe = onSnapshot(appDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setProviderStatus(docSnap.data()?.status as ProviderApplicationStatus || null);
            } else {
                setProviderStatus(null);
            }
        }, (error) => {
            console.error("AuthContext: Error fetching Provider Application status:", error);
            setProviderStatus(null);
        });
        return () => unsubscribe();
    } else {
        setProviderStatus(null);
    }
  }, [user]);

  // NEW: Admin Granular Permissions Sync & Bootstrap
  useEffect(() => {
    if (user?.uid) {
      const adminDocRef = doc(db, 'admins', user.uid);
      const unsubscribe = onSnapshot(adminDocRef, async (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.status === 'active') {
            setAdminRole(data.role || 'staff');
            // Self-healing: If they are a super_admin but missing the permissions object, give them full access
            if (data.role === 'super_admin') {
              setAdminPermissions(SUPER_ADMIN_PERMISSIONS);
              setIsSuperAdmin(true);
            } else {
              setAdminPermissions(data.permissions || null);
              setIsSuperAdmin(false);
            }
          } else {
            setAdminRole(null);
            setAdminPermissions(null);
            setIsSuperAdmin(false);
          }
        } else if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          // BOOTSTRAP SUPER ADMIN with full permissions
          console.log("AuthContext: Bootstrapping granular super_admin for", user.email);
          const bootstrapData = {
            email: user.email,
            name: user.displayName || 'Super Admin',
            role: 'super_admin',
            permissions: SUPER_ADMIN_PERMISSIONS,
            status: 'active',
            createdAt: Timestamp.now(),
          };
          await setDoc(adminDocRef, bootstrapData);
          setAdminRole('super_admin');
          setAdminPermissions(SUPER_ADMIN_PERMISSIONS);
          setIsSuperAdmin(true);
        } else {
          setAdminRole(null);
          setAdminPermissions(null);
          setIsSuperAdmin(false);
        }
        setAdminCheckCompleteFor(user.uid);
      }, (error) => {
        console.error("AuthContext: Error fetching admin data:", error);
        setAdminPermissions(null);
        setIsSuperAdmin(false);
        setAdminCheckCompleteFor(user.uid);
      });
      return () => unsubscribe();
    } else {
      setAdminPermissions(null);
      setIsSuperAdmin(false);
      setAdminCheckCompleteFor(null);
    }
  }, [user]);

  // Sync user role and name to localStorage for immediate hydration/loading state check on direct reload
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (user?.uid) {
      let role = 'customer';
      if (adminRole) {
        role = 'admin';
      } else if (providerStatus === 'approved') {
        role = 'provider';
      }
      localStorage.setItem('yourbrand_user_role', role);

      const name = firestoreUser?.displayName || user.displayName || '';
      if (name) {
        localStorage.setItem('yourbrand_user_name', name);
      }
    } else {
      if (isInitialAuthCheckComplete) {
        localStorage.removeItem('yourbrand_user_role');
        localStorage.removeItem('yourbrand_user_name');
      }
    }
  }, [user, adminRole, providerStatus, firestoreUser, isInitialAuthCheckComplete]);

  const internalTriggerAuthRedirect = useCallback((intendedPath: string) => {
    setAuthActionRedirectPath(intendedPath);
    if (intendedPath.startsWith('/admin')) {
      router.push(`/admin/login?redirect=${encodeURIComponent(intendedPath)}`);
    } else {
      router.push(`/auth/login?redirect=${encodeURIComponent(intendedPath)}`);
    }
  }, [router, setAuthActionRedirectPath]);

  const handleSuccessfulAuth = useCallback(async (userCredential: UserCredential) => {
    setIsLoading(true);
    const guestIdBeforeAuth = getGuestId();
    const { user } = userCredential;

    try {
      // 1. Check if user is an authorized admin
      const adminDocRef = doc(db, 'admins', user.uid);
      const adminDocSnap = await getDoc(adminDocRef);
      const isAdmin = adminDocSnap.exists() && adminDocSnap.data()?.status === 'active';

      // 2. Fetch or check users collection for profile completion
      const userDocRef = doc(db, "users", user.uid);
      const docSnap = await getDoc(userDocRef);
      const userData = docSnap.data();

      if (userData && userData.isActive === false) {
        toast({
          title: "Account Disabled",
          description: "Your account has been disabled. Please contact support.",
          variant: "destructive"
        });
        await signOut(auth);
        setIsLoading(false);
        return;
      }

      const isProfileIncomplete = !docSnap.exists() || !userData?.displayName || !userData?.mobileNumber || !userData?.email;

      if (isProfileIncomplete) {
          setUserCredentialForProfileCompletion(userCredential);
          if (isAdmin) {
              setIsCompletingProfileAsAdmin(true);
          } else {
              setIsCompletingProfile(true);
          }
          setIsLoading(false);
          return;
      }

      // EXISTING USER FLOW
      await setDoc(userDocRef, { lastLoginAt: Timestamp.now() }, { merge: true });
      logUserActivity('userLogin', {
        email: user.email || undefined,
        mobileNumber: userData?.mobileNumber || user.phoneNumber || undefined,
        loginMethod: user.providerData[0]?.providerId || 'password',
        sourceGuestId: guestIdBeforeAuth
      }, user.uid, null, userData?.displayName);
      
      clearGuestId();
      await syncCartOnLogin(user.uid);

      toast({ title: "Success", description: "Logged in successfully!" });
      
      setUser(user);

      const redirectPathFromQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : null;
      let finalRedirectPath = '/';
      
      if (isAdmin) {
          // Find the best admin route based on their permissions
          const adminData = adminDocSnap.data();
          let permissionsToUse = adminData?.permissions;
          if (adminData?.role === 'super_admin') {
              permissionsToUse = SUPER_ADMIN_PERMISSIONS;
          }
          finalRedirectPath = getFirstAccessiblePath(permissionsToUse);
      } else if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        finalRedirectPath = '/admin'; // Fallback for grandfathered master before db sync
      } else if (redirectPathFromQuery && !redirectPathFromQuery.startsWith('/auth/')) {
        finalRedirectPath = redirectPathFromQuery;
      } else if (authActionRedirectPath && !authActionRedirectPath.startsWith('/auth/')) {
        finalRedirectPath = authActionRedirectPath;
      }
      
      router.push(finalRedirectPath);
      if (authActionRedirectPath) setAuthActionRedirectPath(null);

    } catch (error) {
      const authError = error as AuthError;
      console.error("Post-authentication error:", authError);
      toast({ title: "Authentication Error", description: authError.message || "An error occurred after signing in.", variant: "destructive" });
      throw authError;
    } finally {
      setIsLoading(false);
    }
  }, [router, toast, authActionRedirectPath, setAuthActionRedirectPath]);

  const cancelProfileCompletion = useCallback(async () => {
    setIsCompletingProfile(false);
    setUserCredentialForProfileCompletion(null);
    await signOut(auth);
    setUser(null);
  }, []);

  const completeProfileSetup = useCallback(async (details: { fullName: string; email?: string; mobileNumber?: string; referralCode?: string }) => {
    if (!userCredentialForProfileCompletion) return;
    setIsLoading(true);
    const { user } = userCredentialForProfileCompletion;
    const providerId = user.providerData[0]?.providerId;
    const isCustomAuth = providerId === 'password' || providerId === 'phone';
    let initialWalletBalance = 0;
    try {
      // 1. Email Uniqueness Verification
      const targetEmail = (details.email || user.email)?.toLowerCase();
      if (targetEmail) {
        const emailQuery = query(collection(db, "users"), where("email", "==", targetEmail), limit(1));
        const emailSnap = await getDocs(emailQuery);
        if (!emailSnap.empty && emailSnap.docs[0].id !== user.uid) {
          throw new Error("This email address is already linked to another account.");
        }
      }

      // 2. Mobile Number Uniqueness Verification
      const targetMobile = details.mobileNumber || user.phoneNumber;
      if (targetMobile) {
        const phoneQuery = query(collection(db, "users"), where("mobileNumber", "==", targetMobile), limit(1));
        const phoneSnap = await getDocs(phoneQuery);
        if (!phoneSnap.empty && phoneSnap.docs[0].id !== user.uid) {
          throw new Error("This mobile number is already linked to another account.");
        }
      }

      // 3. Device account limit check (max 2 accounts per device for email signup)
      let deviceId: string | null = null;
      if (typeof window !== 'undefined') {
        deviceId = getSimpleDeviceId();
      }
      if (providerId === 'password' && deviceId) {
        const deviceQuery = query(collection(db, "users"), where("deviceId", "==", deviceId));
        const deviceSnap = await getDocs(deviceQuery);
        if (deviceSnap.size >= 2) {
          throw new Error("Device account limit exceeded. You cannot create more than 2 accounts on this device using email sign-up.");
        }
      }

      await updateProfile(user, { displayName: details.fullName });
  
      if (details.email && user.providerData[0]?.providerId === 'phone') {
  const actionCodeSettings = { url: `${window.location.origin}/`, handleCodeInApp: true };

  try {
    await verifyBeforeUpdateEmail(user, details.email, actionCodeSettings);

    toast({
      title: "Verification Email Sent",
      description: `A verification link has been sent to ${details.email}. Please check your inbox to link it to your account.`,
      duration: 3000,
    });

  } catch (error: unknown) {

    if (error && typeof error === 'object' && 'code' in error && error.code === "auth/requires-recent-login") {

      toast({
        title: "Please login again",
        description: "For security reasons please login again before linking your email.",
        variant: "destructive",
      });

      await signOut(auth);
      router.push("/auth/login");
      return;
    }

    throw error;
  }
}
  
      await runTransaction(db, async (transaction) => {
        const referralCodeParam = localStorage.getItem("referralCode") || details.referralCode;
        const referralSettingsDocRef = doc(db, "appConfiguration", "referral");
        const referralSettingsSnap = await transaction.get(referralSettingsDocRef);
        const referralSettings = referralSettingsSnap.exists() ? referralSettingsSnap.data() as ReferralSettings : null;
        initialWalletBalance = 0;
        let referrerId: string | null = null;
        let deviceId: string | null = null;
        let ipAddress: string | null = null;
        
        const newUsersEmail = details.email || user.email;

        try {
            const ipResponse = await fetch('/api/auth/get-client-ip');
            if (ipResponse.ok) {
                const ipData = await ipResponse.json();
                ipAddress = ipData.ip || null;
            }
        } catch (e) { console.warn("Could not fetch IP address via server API."); }
        if (typeof window !== 'undefined') deviceId = getSimpleDeviceId();

        const newUserDocRef = doc(db, "users", user.uid);
        const authProvider = user.providerData[0]?.providerId; // e.g. 'google.com', 'phone', 'password'
  
        // Get next sequential user number
        const nextUserNumber = await assignNewUserNumber();

        if (referralCodeParam && referralSettings?.isReferralSystemEnabled && (authProvider === 'google.com' || authProvider === 'phone')) {
          const orConditions = [];
          if (newUsersEmail) orConditions.push(where("referredUserEmail", "==", newUsersEmail));
          if (ipAddress && ipAddress !== 'unknown') orConditions.push(where("ipAddress", "==", ipAddress));
          if (deviceId) orConditions.push(where("deviceId", "==", deviceId));

          let existingReferralSnap = { empty: true };
          if (orConditions.length > 0) {
            const existingReferralQuery = query(collection(db, "referrals"), or(...orConditions), limit(1));
            existingReferralSnap = await getDocs(existingReferralQuery);
          }
          
          if (existingReferralSnap.empty) {
            const referrerQuery = query(collection(db, "users"), where("referralCode", "==", referralCodeParam), limit(1));
            const referrerSnapshot = await getDocs(referrerQuery);
    
            if (!referrerSnapshot.empty) {
              const referrerDoc = referrerSnapshot.docs[0];
              referrerId = referrerDoc.id;

              // Fraud Prevention: A user cannot refer themselves
              if (referrerId === user.uid) {
                console.warn("Self-referral attempt blocked.");
                toast({ title: "Referral Notice", description: "Self-referrals are not eligible for bonuses.", variant: "warning" });
              } else {
                const referredBonus = referralSettings.referredUserBonus || 0;
                if (referredBonus > 0) {
                    initialWalletBalance = referredBonus;
                }
        
                const referralDocRef = doc(collection(db, "referrals"));
                const newReferral: Omit<Referral, 'id'> = {
                    referrerId: referrerId || "",
                    referredUserId: user.uid,
                    referredUserEmail: newUsersEmail || "N/A",
                    status: 'pending',
                    referrerBonus: referralSettings.referrerBonus || 0,
                    referredBonus: referredBonus,
                    createdAt: Timestamp.now(),
                    ipAddress: ipAddress,
                    deviceId: deviceId,
                };
                transaction.set(referralDocRef, newReferral);
        
                const referrerNotification: Omit<FirestoreNotification, 'id'> = {
                    userId: referrerId || "",
                    title: "New Referral Signup!",
                    message: `${details.fullName} has signed up using your link. You'll get your bonus when they complete their first booking.`,
                    type: 'success',
                    href: '/referral',
                    read: false,
                    createdAt: Timestamp.now(),
                };
                transaction.set(doc(collection(db, "userNotifications")), referrerNotification);
              }
            }
          } else {
            console.warn("This device or network has already used a referral link.");
            toast({ title: "Referral Notice", description: "This device or network has already used a referral link. Account created without bonus.", variant: "warning" });
          }
        }
  
        const newUserFirestoreData: FirestoreUser = {
          id: user.uid,
          uid: user.uid,
          userNumber: nextUserNumber,
          email: details.email || user.email || null,
          displayName: details.fullName,
          mobileNumber: user.phoneNumber || details.mobileNumber || null,
          photoURL: user.photoURL || null,
          isActive: true,
          createdAt: Timestamp.now(),
          lastLoginAt: Timestamp.now(),
          walletBalance: initialWalletBalance,
          referralCode: generateReferralCode(referralSettings?.referralCodeLength || 6),
          deviceId: deviceId || null,
          ...(referrerId && { referredBy: referrerId }),
        };
        transaction.set(newUserDocRef, newUserFirestoreData);
        // Track stats for new user
        incrementSystemStats({ totalUsers: 1, newSignups30d: 1 }).catch(e => console.error("Stats increment error:", e));
      });
  
      const guestIdBeforeAuth = getGuestId();
      logUserActivity('newUser', {
        email: user.email || undefined,
        fullName: details.fullName,
        mobileNumber: user.phoneNumber || details.mobileNumber,
        loginMethod: user.providerData[0]?.providerId || 'unknown',
        sourceGuestId: guestIdBeforeAuth,
        usedReferral: !!localStorage.getItem('referralCode'),
      }, user.uid, null);
      clearGuestId();
      localStorage.removeItem('referralCode');
      
      await syncCartOnLogin(user.uid);

      if (initialWalletBalance > 0) {
        triggerPushNotification({
          userId: user.uid,
          title: "Welcome Reward!",
          body: `You received a ₹${initialWalletBalance} welcome bonus in your wallet!`,
          href: '/referral',
          type: 'referral_signup_bonus',
          variables: {
            amount: String(initialWalletBalance)
          }
        }).catch(err => console.error("Error sending welcome referral push:", err));
      }
  
      if (appConfig.smtpHost && details.email) {
          sendWelcomeEmail({
              userName: details.fullName,
              userEmail: details.email,
              smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort,
              smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail,
          }).catch(err => console.error("Failed to send welcome email:", err));
      }

      const marketingConfigDoc = await getDoc(doc(db, "webSettings", "marketingAutomation"));
      if (marketingConfigDoc.exists()) {
          const marketingConfig = marketingConfigDoc.data() as MarketingAutomationSettings;
          if (marketingConfig?.isWhatsAppEnabled && marketingConfig.whatsAppOnSignup?.enabled && marketingConfig.whatsAppOnSignup.templateName && (user.phoneNumber || details.mobileNumber)) {
              try {
                  await fetch('/api/whatsapp/send', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                          to: user.phoneNumber || details.mobileNumber,
                          templateName: marketingConfig.whatsAppOnSignup.templateName,
                          parameters: [details.fullName, "Yourbrand"],
                      }),
                  });
              } catch (waError) {
                  console.error("Failed to trigger welcome WhatsApp message:", waError);
              }
          }
      }
      
      setUser(user);
      setIsCompletingProfile(false);
      setIsCompletingProfileAsAdmin(false);
      setUserCredentialForProfileCompletion(null);

      // --- SEND SIGNUP NOTIFICATIONS (Push + In-App) ---
      try {
        // 1. Notify User
        const userNotification: Omit<FirestoreNotification, 'id'> = {
          userId: user.uid,
          title: "Welcome to Yourbrand!",
          message: `Hi ${details.fullName}, thank you for joining us! We're excited to help you with your home services.`,
          type: 'success',
          href: '/profile',
          read: false,
          createdAt: Timestamp.now(),
        };
        await setDoc(doc(collection(db, "userNotifications")), userNotification);
        triggerPushNotification({
          userId: user.uid,
          title: userNotification.title,
          body: userNotification.message,
          href: userNotification.href
        }).catch(err => console.error("Error sending user signup push:", err));

        // 2. Notify Admin
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          const adminId = adminSnapshot.docs[0].id;
          const adminNotification: Omit<FirestoreNotification, 'id'> = {
            userId: adminId,
            title: "New User Registered!",
            message: `${details.fullName} has just signed up on Yourbrand.`,
            type: 'info',
            href: `/admin/users`, // Assuming there's a users management page
            read: false,
            createdAt: Timestamp.now(),
          };
          await setDoc(doc(collection(db, "userNotifications")), adminNotification);
          triggerPushNotification({
            userId: adminId,
            title: adminNotification.title,
            body: adminNotification.message,
            href: adminNotification.href
          }).catch(err => console.error("Error sending admin signup push:", err));
        }
      } catch (notifyError) {
        console.error("Error sending signup notifications:", notifyError);
      }
      // --- END SIGNUP NOTIFICATIONS ---
  
      toast({ title: "Account Created!", description: "Welcome to Yourbrand!" });
  
      const redirectPathFromQuery = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('redirect') : null;
      let finalRedirectPath = '/';
      if (user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        finalRedirectPath = '/admin';
      } else if (redirectPathFromQuery && !redirectPathFromQuery.startsWith('/auth/')) {
        finalRedirectPath = redirectPathFromQuery;
      } else if (authActionRedirectPath && !authActionRedirectPath.startsWith('/auth/')) {
        finalRedirectPath = authActionRedirectPath;
      }
      router.push(finalRedirectPath);
      if (authActionRedirectPath) setAuthActionRedirectPath(null);
  
    } catch (error: any) {
      console.error("Error completing profile setup:", error);
      
      // Clean up incomplete custom auth user to prevent orphaned auth records
      if (isCustomAuth) {
        try {
          await user.delete();
          setUserCredentialForProfileCompletion(null);
          setIsCompletingProfile(false);
          setUser(null);
        } catch (delErr) {
          console.warn("Could not delete orphaned auth user:", delErr);
        }
      }

      toast({ title: "Registration Blocked", description: error.message || "Could not save profile details.", variant: "destructive" });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [userCredentialForProfileCompletion, toast, router, authActionRedirectPath, appConfig]);
  
  const signUp = useCallback(async (data: SignUpData) => {
    if (!data.password) {
      toast({ title: "Error", description: "Password is required.", variant: "destructive" });
      throw new Error("Password is required");
    }
    setIsLoading(true);
    try {
      // 1. Verify email uniqueness
      const emailQuery = query(collection(db, "users"), where("email", "==", data.email.toLowerCase()), limit(1));
      const emailSnap = await getDocs(emailQuery);
      if (!emailSnap.empty) {
        throw new Error("This email address is already linked to another account.");
      }

      // 2. Check device registration limit (max 2 accounts per device for email signup)
      let deviceId: string | null = null;
      if (typeof window !== 'undefined') {
        deviceId = getSimpleDeviceId();
      }
      if (deviceId) {
        const deviceQuery = query(collection(db, "users"), where("deviceId", "==", deviceId));
        const deviceSnap = await getDocs(deviceQuery);
        if (deviceSnap.size >= 2) {
          throw new Error("Device account limit exceeded. You cannot create more than 2 accounts on this device using email sign-up.");
        }
      }

      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      setUserCredentialForProfileCompletion(userCredential);
      setIsCompletingProfile(true);
      setIsLoading(false);
    } catch (error: any) {
      const authError = error as AuthError;
      console.error("Signup error:", authError);
      toast({ title: "Signup Failed", description: authError.message, variant: "destructive" });
      setIsLoading(false);
      throw authError;
    }
  }, [toast]);

  const logIn = useCallback(async (data: LogInData) => {
    if (!data.password) {
      toast({ title: "Error", description: "Password is required.", variant: "destructive" });
      throw new Error("Password is required");
    }
    setIsLoading(true);
    try {
      // Attempt Firebase Auth sign-in directly (prevent email enumeration)
      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      await handleSuccessfulAuth(userCredential);
    } catch (error) {
      const authError = error as AuthError;
      console.error("Login error:", authError);
      
      let message = "Invalid email or password. Please check your credentials.";
      if (
        authError.code === 'auth/user-not-found' || 
        authError.code === 'auth/invalid-credential' || 
        authError.code === 'auth/wrong-password'
      ) {
        message = "Invalid email or password. Please check your credentials.";
      } else if (authError.code === 'auth/too-many-requests') {
        message = "Too many failed login attempts. Please try again later.";
      } else if (authError.message) {
        message = authError.message;
      }

      toast({ title: "Login Failed", description: message, variant: "destructive" });
      setIsLoading(false);
      throw new Error(message);
    }
  }, [toast, handleSuccessfulAuth]);
  
  const signInWithGoogle = useCallback(async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      await handleSuccessfulAuth(result);
    } catch (error) {
      const authError = error as AuthError;
      if (authError.code !== 'auth/popup-closed-by-user') {
        console.error("Google Sign-in error:", authError);
        toast({ title: "Google Sign-in Failed", description: authError.message || "Could not sign in with Google.", variant: "destructive" });
      }
      setIsLoading(false); 
      if (authError.code !== 'auth/popup-closed-by-user') {
        throw authError;
      }
    }
  }, [toast, handleSuccessfulAuth]);


  const logOut = useCallback(async () => {
    setIsLoading(true);
    const userIdForLog = user?.uid;
    const userEmailForLog = user?.email;
    try {
      if (userIdForLog) {
        try {
          await logUserActivity('userLogout', { logoutMethod: 'manual', email: userEmailForLog ?? undefined }, userIdForLog, null);
        } catch (logErr) {
          console.error("Error logging logout activity:", logErr);
        }
      }
      await signOut(auth);
      setUser(null);
      setAuthActionRedirectPath(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('yourbrand_user_role');
        localStorage.removeItem('yourbrand_user_name');
      }
      toast({ title: "Logged Out", description: "You have been logged out." });
      router.push('/auth/login');
    } catch (error) {
      const authError = error as AuthError;
      console.error("Logout error:", authError);
      toast({ title: "Logout Failed", description: authError.message || "Could not log out.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [router, toast, user]);

  useEffect(() => {
    if (user?.uid) { 
      const setupFCM = async () => {
        try {
          await initializeFCM(user.uid);
          onForegroundMessage();
        } catch (error) {
          console.error("AuthContext: Error setting up FCM:", error);
        }
      };
      setupFCM();
    }
  }, [user]);

  const contextValue: AuthContextType = useMemo(() => {
    return {
      user,
      firestoreUser,
      adminPermissions,
      adminRole,
      isSuperAdmin,
      isLoading,
      isInitialAuthCheckComplete,
      providerStatus,
      isAdminLoading,
      authActionRedirectPath,
      triggerAuthRedirect: internalTriggerAuthRedirect,
      signUp,
      logIn,
      logOut,
      signInWithGoogle,
      handleSuccessfulAuth,
      isCompletingProfile,
      isCompletingProfileAsAdmin,
      userCredentialForProfileCompletion,
      completeProfileSetup,
      cancelProfileCompletion,
      setUser,
    };
  }, [user, firestoreUser, adminPermissions, adminRole, isSuperAdmin, isLoading, isInitialAuthCheckComplete, providerStatus, isAdminLoading, authActionRedirectPath, internalTriggerAuthRedirect, signUp, logIn, logOut, signInWithGoogle, handleSuccessfulAuth, isCompletingProfile, isCompletingProfileAsAdmin, userCredentialForProfileCompletion, completeProfileSetup, cancelProfileCompletion, setUser]);

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export default AuthContext;
