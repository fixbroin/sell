

"use client";

import type { PropsWithChildren } from 'react';
import React, { Suspense, useEffect, useState, useRef, useCallback } from 'react'; // Added useRef, useCallback
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import ProviderSidebarContent from '@/components/provider/ProviderSidebarContent';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Logo from '@/components/shared/Logo';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { UserCircle, KeyRound, LogOut, Loader2, Bell, ChevronDown, Wallet, CalendarOff } from 'lucide-react';
import { auth, db } from '@/lib/firebase'; 
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useLoading } from '@/contexts/LoadingContext';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, limit, Timestamp, updateDoc } from '@/lib/mysqlDb';
import type { ProviderApplication, FirestoreNotification } from '@/types/firestore';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount'; 
import { useGlobalSettings } from '@/hooks/useGlobalSettings'; 
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import ProviderBottomNavigationBar from '@/components/provider/ProviderBottomNavigationBar'; 
import { useIsMobile } from '@/hooks/use-mobile'; 
import { cn } from '@/lib/utils';
import NewJobProviderPopup from '@/components/provider/NewJobProviderPopup'; // Added
import { Switch } from '@/components/ui/switch';

const ProviderPageLoader = () => (
  <div className="flex justify-center items-center min-h-[calc(100vh-120px)]">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
    <p className="ml-2 text-muted-foreground">Loading Provider Panel...</p>
  </div>
);

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";
const PROCESSED_JOB_NOTIFICATIONS_KEY = 'yourbrand_processedJobNotifications';

export default function ProviderLayout({ children }: PropsWithChildren) {
  const { user: providerUser, isLoading: authIsLoading, logOut: handleLogoutAuth } = useAuth();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const { showLoading, hideLoading } = useLoading();
  const [isProviderApproved, setIsProviderApproved] = useState<boolean | null>(() => {
    if (typeof window !== 'undefined') {
      const cached = sessionStorage.getItem(`provider_approved_${providerUser?.uid}`);
      return cached === 'true' ? true : cached === 'false' ? false : null;
    }
    return null;
  });
  const [isCheckingApproval, setIsCheckingApproval] = useState(false); 

  const { count: unreadProviderNotificationsCount, isLoading: isLoadingProviderNotifications } = useUnreadNotificationsCount(providerUser?.uid); 
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const providerNotificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const providerOrderAudioRef = useRef<HTMLAudioElement | null>(null); // Added for order sound
  const seenNotificationIdsRef = useRef<string[]>([]);
  const isFirstLoadNotificationsRef = useRef(true);
  const isMobile = useIsMobile(); 

  const [showNewJobPopup, setShowNewJobPopup] = useState(false);
  const [newJobPopupDetails, setNewJobPopupDetails] = useState<{ bookingDocId: string; bookingHumanId: string; notificationId: string; } | null>(null);
  const [hasNewJobInUnread, setHasNewJobInUnread] = useState(false); // Track if any unread is a new job
  // Use a ref for tracking processed/dismissed IDs within the current instance to avoid effect re-runs
  const processedJobNotificationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    // Dynamically update manifest
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = '/manifest-provider.json';
    } else {
      const newManifestLink = document.createElement('link');
      newManifestLink.rel = 'manifest';
      newManifestLink.href = '/manifest-provider.json';
      document.head.appendChild(newManifestLink);
    }
  }, []);

  // Update cached value when providerUser changes
  useEffect(() => {
    if (providerUser?.uid) {
      const cached = sessionStorage.getItem(`provider_approved_${providerUser.uid}`);
      if (cached === 'true') setIsProviderApproved(true);
      else if (cached === 'false') setIsProviderApproved(false);
    } else {
      setIsProviderApproved(null);
    }
  }, [providerUser?.uid]);

  useEffect(() => {
    if (!providerUser?.uid) return;
    const userDocRef = doc(db, "users", providerUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWalletBalance(data?.providerWalletBalance || 0);
      }
    });
    return () => unsubscribe();
  }, [providerUser?.uid]);

  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);

  useEffect(() => {
    if (!providerUser?.uid || !isProviderApproved) return;
    const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, providerUser.uid);
    const unsub = onSnapshot(appDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as ProviderApplication;
        setIsOnline(data.isOnline !== false);
      }
    });
    return () => unsub();
  }, [providerUser?.uid, isProviderApproved]);

  const handleToggleOnlineStatus = async () => {
    if (!providerUser?.uid || isTogglingOnline) return;
    setIsTogglingOnline(true);
    const newStatus = !isOnline;
    try {
      await updateDoc(doc(db, PROVIDER_APPLICATION_COLLECTION, providerUser.uid), {
        isOnline: newStatus,
        updatedAt: Timestamp.now()
      });
      setIsOnline(newStatus);
      toast({
        title: newStatus ? "You are Online" : "You are Offline",
        description: newStatus 
          ? "You are now visible to customers and accepting new bookings." 
          : "Bookings paused. You will not receive new bookings or show on map until turned back online."
      });
    } catch (e: any) {
      console.error("Error toggling online status:", e);
      toast({
        title: "Error",
        description: e.message || "Failed to update online status.",
        variant: "destructive"
      });
    } finally {
      setIsTogglingOnline(false);
    }
  };

  useEffect(() => {
    if (!providerUser?.uid || authIsLoading || !isProviderApproved) return;

    const notificationsRef = collection(db, "userNotifications");
    const q = query(
      notificationsRef,
      where("userId", "==", providerUser.uid),
      where("read", "==", false), 
      orderBy("createdAt", "desc"),
      limit(10) 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setShowNewJobPopup(false);
        setNewJobPopupDetails(null);
        setHasNewJobInUnread(false);
        return;
      }
      
      // Check if ANY of the top unread notifications is a new job assignment
      const anyNewJob = snapshot.docs.some(docSnap => {
        const title = (docSnap.data().title || "").toLowerCase();
        return title.includes("new job") || title.includes("assigned") || title.includes("new booking");
      });
      setHasNewJobInUnread(anyNewJob);

      // Look for the most recent unread "new job" notification not dismissed in this session
      const relevantDoc = snapshot.docs.find(docSnap => {
        const data = docSnap.data();
        const title = (data.title || "").toLowerCase();
        const isJob = title.includes("new job") || title.includes("assigned") || title.includes("new booking");
        return isJob && !processedJobNotificationIdsRef.current.includes(docSnap.id);
      });

      if (relevantDoc) {
        const notification = { id: relevantDoc.id, ...relevantDoc.data() } as FirestoreNotification;
        const href = notification.href;
        let bookingDocId = "";
        if (href && href.startsWith('/provider/booking/')) {
          const parts = href.split('/');
          bookingDocId = parts[parts.length - 1];
        }
        let bookingHumanId = "";
        const messageMatch = notification.message?.match(/(?:ID:|booking)\s*([A-Z0-9-]+)/i);
        if (messageMatch && messageMatch[1]) {
          bookingHumanId = messageMatch[1].replace(/[.,!]/g, '');
        } else {
          const titleMatch = notification.title?.match(/(?:ID:|booking)\s*([A-Z0-9-]+)/i); 
          if (titleMatch && titleMatch[1]) {
            bookingHumanId = titleMatch[1].replace(/[.,!]/g, '');
          } else {
            bookingHumanId = bookingDocId || "New";
          }
        }

        if (bookingDocId) {
          setNewJobPopupDetails({ bookingDocId, bookingHumanId, notificationId: notification.id! });
          setShowNewJobPopup(true);
        }
      } else {
        setShowNewJobPopup(false);
        setNewJobPopupDetails(null);
      }
    }, (error) => {
      console.error("ProviderLayout: Error in notifications listener:", error);
    });
    return () => unsubscribe();
  }, [providerUser, authIsLoading, isProviderApproved]);

  const handleCloseNewJobPopup = useCallback(async (markNotificationAsRead?: boolean, notificationIdToMark?: string) => {
    setShowNewJobPopup(false);

    if (notificationIdToMark) {
      processedJobNotificationIdsRef.current.push(notificationIdToMark);
    }

    if (markNotificationAsRead && notificationIdToMark && providerUser?.uid) {
      try {
        await updateDoc(doc(db, "userNotifications", notificationIdToMark), { read: true });
        setNewJobPopupDetails(null);
      } catch (error) {
        console.error("ProviderLayout: Failed to mark notification as read:", error);
      }
    } else {
        setNewJobPopupDetails(null);
    }
  }, [providerUser?.uid]);

  const hasPlayedInitialSoundRef = useRef(false);

  useEffect(() => {
    const checkProviderStatus = async () => {
      if (!providerUser || authIsLoading) return;

      // If we already know the status, don't show loading or fetch again
      if (isProviderApproved !== null) {
        // Immediate redirection if not approved and on a protected page
        if (isProviderApproved === false && pathname !== '/provider-registration') {
            router.push('/');
        }
        return;
      }

      setIsCheckingApproval(true); 
      try {
        const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, providerUser.uid);
        const docSnap = await getDoc(appDocRef);
        if (docSnap.exists()) {
          const appData = docSnap.data() as ProviderApplication;
          if (appData.status === 'approved') {
            setIsProviderApproved(true);
            sessionStorage.setItem(`provider_approved_${providerUser.uid}`, 'true');
          } else {
            setIsProviderApproved(false);
            sessionStorage.setItem(`provider_approved_${providerUser.uid}`, 'false');
            if (pathname !== '/provider-registration') { 
              toast({ title: "Access Denied", description: "Your provider application is not yet approved or has been rejected.", variant: "destructive" });
              router.push('/');
            }
          }
        } else {
          setIsProviderApproved(false);
          sessionStorage.setItem(`provider_approved_${providerUser.uid}`, 'false');
           if (pathname !== '/provider-registration') {
              toast({ title: "Application Not Found", description: "Provider application not found. Please complete registration.", variant: "destructive" });
              router.push('/provider-registration');
           }
        }
      } catch (error) {
        console.error("Error checking provider status:", error);
        // On error, don't cache as false, just allow one retry if they navigate again
         if (pathname !== '/provider-registration') {
            toast({ title: "Error", description: "Could not verify provider status.", variant: "destructive" });
            router.push('/');
         }
      } finally {
        setIsCheckingApproval(false); 
      }
    };
    checkProviderStatus();
  }, [providerUser, authIsLoading, router, toast, pathname, isProviderApproved]);

  // Notification sound effect for provider
  useEffect(() => {
    // 1. Setup normal notification/chat sound
    if (globalSettings?.chatNotificationSoundUrl) {
      if (!providerNotificationAudioRef.current) {
        providerNotificationAudioRef.current = new Audio(globalSettings.chatNotificationSoundUrl);
        providerNotificationAudioRef.current.load();
      } else if (providerNotificationAudioRef.current.src !== globalSettings.chatNotificationSoundUrl) {
         providerNotificationAudioRef.current.src = globalSettings.chatNotificationSoundUrl;
         providerNotificationAudioRef.current.load();
      }
    } else {
      providerNotificationAudioRef.current = null;
    }

    // 2. Setup order specific sound
    const bookingSoundUrl = globalSettings?.bookingNotificationSoundUrl || '/sounds/order_sound.wav';
    if (!providerOrderAudioRef.current) {
      providerOrderAudioRef.current = new Audio(bookingSoundUrl);
      providerOrderAudioRef.current.load();
    } else if (providerOrderAudioRef.current.src !== bookingSoundUrl) {
      providerOrderAudioRef.current.src = bookingSoundUrl;
      providerOrderAudioRef.current.load();
    }
  }, [globalSettings?.chatNotificationSoundUrl, globalSettings?.bookingNotificationSoundUrl]);

  // Play booking notification sound once when the popup first opens
  useEffect(() => {
    const playSound = () => {
      if (showNewJobPopup && providerOrderAudioRef.current) {
        providerOrderAudioRef.current.play().catch(e => console.warn("ProviderLayout: Order audio play blocked/failed:", e));
      }
    };
    if (showNewJobPopup) {
      playSound();
      // Listen for click on document in case autoplay was blocked by the browser
      document.addEventListener('click', playSound, { once: true });
    }
    return () => document.removeEventListener('click', playSound);
  }, [showNewJobPopup]);

  useEffect(() => {
    if (!providerUser?.uid || authIsLoading || !isProviderApproved) return;

    const notificationsRef = collection(db, "userNotifications");
    const q = query(
      notificationsRef,
      where("userId", "==", providerUser.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const currentIds = snapshot.docs.map(d => d.id);
      
      if (isFirstLoadNotificationsRef.current) {
        // On first snapshot, just remember all currently unread notifications
        seenNotificationIdsRef.current = currentIds;
        isFirstLoadNotificationsRef.current = false;
        return;
      }

      // Find new notifications that we haven't seen in this session
      const newDocs = snapshot.docs.filter(d => !seenNotificationIdsRef.current.includes(d.id));

      if (newDocs.length > 0) {
        // Update seen IDs
        seenNotificationIdsRef.current = [...seenNotificationIdsRef.current, ...newDocs.map(d => d.id)];

        const normalAudio = providerNotificationAudioRef.current;

        // Exclude booking/job notifications from triggering normal notification sound
        const newDocsFiltered = newDocs.filter(d => {
          const title = (d.data().title || "").toLowerCase();
          return !(title.includes("new job") || title.includes("assigned") || title.includes("new booking"));
        });

        if (newDocsFiltered.length > 0 && normalAudio) {
          normalAudio.play().catch(e => console.warn("ProviderLayout: New normal notification audio play failed:", e));
        }
      }
    }, (error) => {
      console.error("ProviderLayout: Error in audio notification listener:", error);
    });

    return () => unsubscribe();
  }, [providerUser, authIsLoading, isProviderApproved]);


  const handleChangePassword = async () => {
    if (providerUser && providerUser.email) {
      try {
        await sendPasswordResetEmail(auth, providerUser.email);
        toast({ title: "Password Reset Email Sent", description: "Check your inbox for a password reset link." });
      } catch (error: any) {
        toast({ title: "Error", description: error.message || "Could not send password reset email.", variant: "destructive" });
      }
    } else {
      toast({ title: "Error", description: "Provider email not found.", variant: "destructive" });
    }
  };

  const navigateToProviderNotifications = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    showLoading();
    router.push('/provider/notifications'); 
  };


  useEffect(() => {
    return () => {
      hideLoading();
    };
  }, [pathname, providerUser, hideLoading]);

  if (authIsLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3 text-muted-foreground">Loading Provider Panel...</p>
      </div>
    );
  }

  if (providerUser && (isCheckingApproval || isProviderApproved === null)) {
     return (
        <div className="flex justify-center items-center min-h-screen bg-background">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-3 text-muted-foreground">Verifying provider status...</p>
        </div>
      );
  }
  
  return (
    <ProtectedRoute>
      <div className="flex flex-col min-h-screen">
        <SidebarProvider defaultOpen={true}>
          <Sidebar collapsible="icon" variant="sidebar" className="border-r bg-card text-card-foreground">
            <ProviderSidebarContent />
          </Sidebar>
          <SidebarInset className="bg-muted/30 overflow-x-hidden flex-grow">
            <header className="bg-background/95 backdrop-blur-xl sticky top-0 z-40 border-b border-border/40 transition-all duration-300 h-16 flex items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="hidden md:inline-flex text-muted-foreground hover:text-primary transition-colors" />
                <div className="md:hidden flex items-center">
                   <Logo logoUrl={globalSettings?.logoUrl} websiteName={globalSettings?.websiteName} size="normal" />
                </div>
                <h1 className="hidden sm:block text-lg font-bold tracking-tight">Provider Panel</h1>
              </div>

              <div className="flex items-center gap-2">
                {providerUser && isProviderApproved && (
                  <div
                    onClick={() => !isTogglingOnline && handleToggleOnlineStatus()}
                    className={cn(
                      "hidden md:flex items-center gap-2 px-3 py-1 rounded-full border transition-all duration-300 shadow-sm select-none cursor-pointer h-10",
                      isOnline 
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400" 
                        : "bg-muted/80 border-border text-muted-foreground hover:bg-muted"
                    )}
                    title={isOnline ? "You are Online (Accepting Bookings). Click to switch Offline." : "You are Offline (Bookings Paused). Click to switch Online."}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn("h-2 w-2 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-400")} />
                      <span className="text-xs font-bold leading-none">{isOnline ? "Online" : "Offline"}</span>
                    </div>
                    {isTogglingOnline ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-1" />
                    ) : (
                      <Switch
                        checked={isOnline}
                        onCheckedChange={handleToggleOnlineStatus}
                        className="scale-75 origin-center data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-700 pointer-events-none"
                      />
                    )}
                  </div>
                )}

                <ThemeToggle />
                
                {providerUser && isProviderApproved && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden md:inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-border/40 bg-card hover:bg-muted/50 hover:border-emerald-500/30 transition-all duration-300 shadow-sm"
                      asChild
                    >
                      <Link href="/provider/leaves" className="flex items-center gap-1.5" title="Manage your leaves and scheduled time off">
                        <CalendarOff className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span className="font-bold text-xs">Time Off</span>
                      </Link>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden md:inline-flex items-center gap-1.5 h-10 px-3 rounded-full border border-border/40 bg-card hover:bg-muted/50 hover:border-primary/20 transition-all duration-300 shadow-sm"
                      asChild
                    >
                      <Link href="/provider/wallet" className="flex items-center gap-1.5">
                        <Wallet className="h-4 w-4 text-primary" />
                        <span className="font-bold font-mono text-xs">{symbol}{walletBalance.toFixed(appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2)}</span>
                      </Link>
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative rounded-full bg-muted/50 hover:bg-primary hover:text-primary-foreground shadow-none h-10 w-10 transition-all duration-300"
                      aria-label="Provider Notifications"
                      onClick={navigateToProviderNotifications}
                    >
                      <Bell className="h-5 w-5" />
                      {!isLoadingProviderNotifications && unreadProviderNotificationsCount > 0 && (
                        <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border-2 border-background">
                          {unreadProviderNotificationsCount > 9 ? '9+' : unreadProviderNotificationsCount}
                        </span>
                      )}
                    </Button>
                  </>
                )}

                {providerUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative flex items-center gap-2.5 h-11 px-2 pr-3 rounded-full border border-border/40 bg-card hover:bg-muted/50 hover:border-primary/20 transition-all duration-300 shadow-sm group">
                        <Avatar className="h-8 w-8 border-2 border-primary/20 group-hover:border-primary transition-colors">
                          <AvatarImage src={providerUser.photoURL || undefined} alt={providerUser.displayName || providerUser.email || "Provider"} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {providerUser.email ? providerUser.email[0].toUpperCase() : <UserCircle size={20} />}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden lg:flex flex-col items-start leading-none gap-1">
                           <span className="text-xs font-bold truncate max-w-[100px]">{providerUser.displayName || "Provider"}</span>
                           <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-widest">Technician</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 mt-2 rounded-2xl p-2 shadow-2xl border-border/40" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal p-4">
                        <div className="flex flex-col space-y-2">
                          <p className="text-base font-bold leading-none">{providerUser.displayName || "Provider"}</p>
                          <p className="text-xs leading-none text-muted-foreground truncate">
                            {providerUser.email}
                          </p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="mx-2" />
                      <div className="py-2">
                        <DropdownMenuItem asChild className="rounded-xl px-4 py-3 cursor-pointer">
                          <Link href="/provider/profile" onClick={() => showLoading()}>
                            <div className="bg-primary/10 p-2 rounded-lg mr-3 text-primary">
                              <UserCircle className="h-4 w-4" />
                            </div>
                            <span className="font-medium">Profile & Settings</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleChangePassword} className="rounded-xl px-4 py-3 cursor-pointer">
                          <div className="bg-muted p-2 rounded-lg mr-3">
                            <KeyRound className="h-4 w-4" />
                          </div>
                          <span className="font-medium">Change Password</span>
                        </DropdownMenuItem>
                      </div>
                      <DropdownMenuSeparator className="mx-2" />
                      <DropdownMenuItem onClick={() => { showLoading(); handleLogoutAuth(); }} className="rounded-xl px-4 py-3 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                        <div className="bg-destructive/10 p-2 rounded-lg mr-3">
                          <LogOut className="h-4 w-4" />
                        </div>
                        <span className="font-medium">Sign out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </header>
            <main className="p-2 sm:p-4 md:p-3 pb-32 md:pb-6 relative">
              <Suspense fallback={<ProviderPageLoader />}>
                {children}
              </Suspense>
              {newJobPopupDetails && (
                <NewJobProviderPopup
                  isOpen={showNewJobPopup}
                  bookingDocId={newJobPopupDetails.bookingDocId}
                  bookingHumanId={newJobPopupDetails.bookingHumanId}
                  onClose={(markAsRead) => handleCloseNewJobPopup(markAsRead, newJobPopupDetails.notificationId)}
                />
              )}
            </main>
          </SidebarInset>
          {isMobile && isProviderApproved && <ProviderBottomNavigationBar />}
        </SidebarProvider>
      </div>
    </ProtectedRoute>
  );
}
