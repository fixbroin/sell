
"use client";

import type { PropsWithChildren } from 'react';
import React, { Suspense, useEffect, useState, useRef, useCallback, useMemo } from 'react'; 
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import AdminSidebarContent from '@/components/admin/AdminSidebarContent';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { cn } from '@/lib/utils';
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
import { UserCircle, KeyRound, LogOut, Loader2, Bell, ShieldCheck, ChevronDown, LayoutDashboard, Calendar, Activity, Eye, Users } from 'lucide-react';
import { auth, db } from '@/lib/firebase'; 
import { sendPasswordResetEmail } from 'firebase/auth';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import { useLoading } from '@/contexts/LoadingContext';
import ThemeToggle from '@/components/shared/ThemeToggle';
import AdminFloatingChatButton from '@/components/admin/AdminFloatingChatButton';
import FloatingAdminChatWindow from '@/components/admin/FloatingAdminChatWindow';
import { useTotalAdminUnreadChatCount } from '@/hooks/useTotalAdminUnreadChatCount';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { collection, query, where, onSnapshot, orderBy, limit, doc, updateDoc } from '@/lib/mysqlDb'; 
import type { FirestoreNotification } from '@/types/firestore'; 
import NewBookingAdminPopup from '@/components/admin/NewBookingAdminPopup'; 

const AdminPageLoader = () => (
  <div className="flex justify-center items-center min-h-[calc(100vh-120px)]">
    <Loader2 className="h-10 w-10 animate-spin text-primary" />
    <p className="ml-2 text-muted-foreground font-bold text-xs uppercase">Loading interface...</p>
  </div>
);

export default function AdminLayout({ children }: PropsWithChildren) {
  const { user: adminUser, adminRole, isLoading: authIsLoading, isAdminLoading, logOut: handleLogoutAuth } = useAuth();
  const { toast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const { showLoading, hideLoading } = useLoading();
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);

  // isAdmin is now defined as having any valid adminRole
  const isAdmin = !!adminRole;
  
  // Format role name for display (e.g. "super_admin" -> "Master")
  const roleDisplayLabel = useMemo(() => {
    if (adminRole === 'super_admin') return "Master";
    if (adminRole === 'booking_admin') return "Operations";
    if (adminRole === 'finance_admin') return "Finance";
    if (adminRole === 'content_admin') return "Content";
    return "Staff";
  }, [adminRole]);

  const { count: unreadAdminNotificationsCount, isLoading: isLoadingAdminNotifications } = useUnreadNotificationsCount();

  const { isLoading: isLoadingTotalUnread } = useTotalAdminUnreadChatCount(adminUser?.uid);
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();
  const adminChatAudioRef = useRef<HTMLAudioElement | null>(null);
  const adminOrderAudioRef = useRef<HTMLAudioElement | null>(null); // Added for order sound
  const seenAdminNotificationIdsRef = useRef<string[]>([]);
  const isFirstLoadAdminNotificationsRef = useRef(true);

  const [showNewBookingPopup, setShowNewBookingPopup] = useState(false);
  const [newBookingPopupDetails, setNewBookingPopupDetails] = useState<{ bookingDocId: string; bookingHumanId: string; notificationId: string; } | null>(null);
  // Use a ref for tracking processed/dismissed IDs within the current instance to avoid effect re-runs
  const processedBookingNotificationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.href = '/manifest-admin.json';
    } else {
      const newManifestLink = document.createElement('link');
      newManifestLink.rel = 'manifest';
      newManifestLink.href = '/manifest-admin.json';
      document.head.appendChild(newManifestLink);
    }
  }, []);

  useEffect(() => {
    if (!adminUser?.uid || authIsLoading || !isAdmin) return;

    const notificationsRef = collection(db, "userNotifications");
    const q = query(
      notificationsRef,
      where("userId", "==", adminUser.uid),
      where("read", "==", false), 
      orderBy("createdAt", "desc"),
      limit(10) 
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setShowNewBookingPopup(false);
        setNewBookingPopupDetails(null);
        return;
      }
      
      // Look for the most recent unread "new booking" notification not dismissed in this session
      const relevantDoc = snapshot.docs.find(docSnap => {
        const data = docSnap.data();
        const title = (data.title || "").toLowerCase();
        const isBooking = title.includes("new booking") || title.includes("booking received");
        return isBooking && !processedBookingNotificationIdsRef.current.includes(docSnap.id);
      });

      if (relevantDoc) {
        const notification = { id: relevantDoc.id, ...relevantDoc.data() } as FirestoreNotification;
        const href = notification.href;
        let bookingDocId = "";
        if (href) {
          if (href.startsWith('/admin/bookings/edit/')) {
            const parts = href.split('/');
            bookingDocId = parts[parts.length - 1];
          } else if (href.startsWith('/admin/bookings')) {
            bookingDocId = "list";
          }
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
            bookingHumanId = (bookingDocId && bookingDocId !== "list") ? bookingDocId : "New";
          }
        }

        // Show popup if a booking notification was found, regardless of specific doc ID availability
        setNewBookingPopupDetails({ bookingDocId, bookingHumanId, notificationId: notification.id! });
        setShowNewBookingPopup(true);
      } else {
        setShowNewBookingPopup(false);
        setNewBookingPopupDetails(null);
      }
    }, (error) => {
      console.error("AdminLayout: Error in notifications listener:", error);
    });
    return () => unsubscribe();
  }, [adminUser, authIsLoading, isAdmin]);

  const handleCloseNewBookingPopup = useCallback(async (markNotificationAsRead?: boolean, notificationIdToMark?: string) => {
    setShowNewBookingPopup(false);
    
    if (notificationIdToMark) {
      processedBookingNotificationIdsRef.current.push(notificationIdToMark);
    }

    if (markNotificationAsRead && notificationIdToMark && adminUser?.uid) {
      try {
        await updateDoc(doc(db, "userNotifications", notificationIdToMark), { read: true });
        setNewBookingPopupDetails(null);
      } catch (error) {
        console.error("AdminLayout: Failed to mark notification as read:", error);
      }
    } else {
        setNewBookingPopupDetails(null);
    }
  }, [adminUser?.uid]);


  useEffect(() => {
    if (globalSettings?.chatNotificationSoundUrl) {
      if (!adminChatAudioRef.current) {
        adminChatAudioRef.current = new Audio(globalSettings.chatNotificationSoundUrl);
        adminChatAudioRef.current.load();
      } else if (adminChatAudioRef.current.src !== globalSettings.chatNotificationSoundUrl) {
        adminChatAudioRef.current.src = globalSettings.chatNotificationSoundUrl;
        adminChatAudioRef.current.load();
      }
    } else {
      adminChatAudioRef.current = null;
    }

    // 2. Setup order specific sound
    const bookingSoundUrl = globalSettings?.bookingNotificationSoundUrl || '/sounds/order_sound.wav';
    if (!adminOrderAudioRef.current) {
      adminOrderAudioRef.current = new Audio(bookingSoundUrl);
      adminOrderAudioRef.current.load();
    } else if (adminOrderAudioRef.current.src !== bookingSoundUrl) {
      adminOrderAudioRef.current.src = bookingSoundUrl;
      adminOrderAudioRef.current.load();
    }
  }, [globalSettings?.chatNotificationSoundUrl, globalSettings?.bookingNotificationSoundUrl]);

  // Play booking notification sound once when the popup first opens
  useEffect(() => {
    const playSound = () => {
      if (showNewBookingPopup && adminOrderAudioRef.current) {
        adminOrderAudioRef.current.play().catch(e => console.warn("AdminLayout: Order audio play blocked/failed:", e));
      }
    };
    if (showNewBookingPopup) {
      playSound();
      // Listen for click on document in case autoplay was blocked by the browser
      document.addEventListener('click', playSound, { once: true });
    }
    return () => document.removeEventListener('click', playSound);
  }, [showNewBookingPopup]);

  useEffect(() => {
    if (!adminUser?.uid || authIsLoading || !isAdmin) return;

    const notificationsRef = collection(db, "userNotifications");
    const q = query(
      notificationsRef,
      where("userId", "==", adminUser.uid),
      where("read", "==", false),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const currentIds = snapshot.docs.map(d => d.id);
      
      if (isFirstLoadAdminNotificationsRef.current) {
        // On first snapshot, just remember all currently unread notifications
        seenAdminNotificationIdsRef.current = currentIds;
        isFirstLoadAdminNotificationsRef.current = false;
        return;
      }

      // Find new notifications that we haven't seen in this session
      const newDocs = snapshot.docs.filter(d => !seenAdminNotificationIdsRef.current.includes(d.id));

      if (newDocs.length > 0) {
        // Update seen IDs
        seenAdminNotificationIdsRef.current = [...seenAdminNotificationIdsRef.current, ...newDocs.map(d => d.id)];

        const normalAudio = adminChatAudioRef.current;

        // Exclude booking notifications from triggering normal notification sound
        const newDocsFiltered = newDocs.filter(d => {
          const title = (d.data().title || "").toLowerCase();
          return !(title.includes("new booking") || title.includes("booking received"));
        });

        if (newDocsFiltered.length > 0 && normalAudio) {
          normalAudio.play().catch(e => console.warn("AdminLayout: New normal notification audio play failed:", e));
        }
      }
    }, (error) => {
      console.error("AdminLayout: Error in audio notification listener:", error);
    });

    return () => unsubscribe();
  }, [adminUser, authIsLoading, isAdmin]);


  const handleChangePassword = async () => {
    if (adminUser && adminUser.email) {
      try {
        await sendPasswordResetEmail(auth, adminUser.email);
        toast({ title: "Reset Link Sent", description: "Please check your admin email." });
      } catch (error: any) {
        toast({ title: "Action Failed", description: error.message, variant: "destructive" });
      }
    }
  };

  const navigateToAdminNotifications = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    showLoading();
    router.push('/admin/notifications');
  };

  useEffect(() => {
    return () => {
      hideLoading();
    };
  }, [pathname, adminUser, hideLoading]);

  const mobileTabs = useMemo(() => [
    { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { label: 'Bookings', href: '/admin/bookings', icon: Calendar },
    { label: 'Activity', href: '/admin/activity-feed', icon: Activity },
    { label: 'Visitors', href: '/admin/visitor-info', icon: Eye },
    { label: 'Users', href: '/admin/users', icon: Users },
  ], []);

  const isTabActive = useCallback((href: string) => {
    if (href === '/admin') {
      return pathname === '/admin';
    }
    return pathname.startsWith(href);
  }, [pathname]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // 1. While we are still verifying the user (Auth or Database check in progress)
  // we show the full-screen secure loader.
  if (authIsLoading || isAdminLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-background text-center flex-col">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-black text-[10px] uppercase tracking-[0.3em] animate-pulse">Yourbrand Admin Secure Load...</p>
      </div>
    );
  }

  // 2. If the check is DONE and the user is NOT an admin:
  // We return ONLY the ProtectedRoute without the Sidebar/Header shell.
  // This lets ProtectedRoute handle the redirect to login without any "Flash of Dashboard".
  if (!isAdmin) {
    return <ProtectedRoute>{children}</ProtectedRoute>;
  }

  // 3. Normal Admin Shell (Only for verified admins)
  return (
    <ProtectedRoute>
      <SidebarProvider defaultOpen={true}>
        <Sidebar collapsible="icon" variant="sidebar" className="border-r bg-card text-card-foreground">
          <AdminSidebarContent />
        </Sidebar>
        <SidebarInset className="bg-muted/30 overflow-x-hidden flex flex-col min-h-screen transition-all duration-200">
          <header className="bg-background/95 backdrop-blur-xl sticky top-0 z-[30] border-b border-border/40 transition-all duration-200 shrink-0">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-4">
                <div className="bg-muted/50 p-1.5 rounded-xl border border-border/40 shadow-sm hover:bg-muted transition-colors cursor-pointer group md:hidden" onClick={() => router.push('/admin')}>
                   <ShieldCheck className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                </div>
                <div className="flex items-center gap-3">
                  <SidebarTrigger className="hidden md:inline-flex rounded-full h-10 w-10 bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-all duration-200" />
                  <div className="flex items-center gap-2">
                    <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-800 dark:text-slate-100">Admin Panel</h1>
                    <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                       <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                       <span className="text-[10px] font-black text-primary uppercase tracking-widest length-none">Verified</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
                
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full h-10 w-10 bg-muted/50 hover:bg-primary hover:text-primary-foreground transition-all duration-300 shadow-none"
                    aria-label="Admin Notifications"
                    onClick={navigateToAdminNotifications}
                  >
                    <Bell className="h-5 w-5" />
                    {!isLoadingAdminNotifications && unreadAdminNotificationsCount > 0 && (
                      <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white border-2 border-background animate-in zoom-in duration-300">
                        {unreadAdminNotificationsCount > 9 ? '9+' : unreadAdminNotificationsCount}
                      </span>
                    )}
                  </Button>
                )}

                {adminUser && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative flex items-center gap-2.5 h-11 px-2 pr-3 rounded-full border border-border/40 bg-card hover:bg-muted/50 hover:border-primary/20 transition-all duration-300 shadow-sm group">
                        <Avatar className="h-8 w-8 border-2 border-primary/20 group-hover:border-primary transition-colors">
                          <AvatarImage src={adminUser.photoURL || undefined} alt={adminUser.displayName || adminUser.email || "Admin"} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs uppercase">
                            {adminUser.email ? adminUser.email[0] : 'A'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden lg:flex flex-col items-start leading-none gap-1">
                           <span className="text-xs font-black truncate max-w-[100px]">{adminUser.displayName || "Admin"}</span>
                           <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{roleDisplayLabel}</span>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 mt-2 rounded-2xl p-2 shadow-2xl border-border/40 animate-in slide-in-from-top-2 duration-300" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal p-4">
                        <div className="flex items-center gap-3">
                           <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black uppercase shadow-inner border border-primary/10">
                              {adminUser.email ? adminUser.email[0] : 'A'}
                           </div>
                           <div className="flex flex-col space-y-0.5">
                              <p className="text-sm font-black leading-none text-slate-900 dark:text-slate-100">
                                {adminUser.displayName || "Administrator"}
                              </p>
                              <p className="text-[10px] font-medium text-muted-foreground leading-none">
                                {adminUser.email}
                              </p>
                           </div>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="mx-2" />
                      <div className="py-1">
                        <DropdownMenuItem asChild className="rounded-xl px-4 py-2.5 cursor-pointer focus:bg-primary/5 focus:text-primary">
                          <Link href="/admin/profile" onClick={() => showLoading()} className="flex items-center w-full">
                            <div className="p-1.5 bg-primary/10 rounded-lg mr-3 text-primary">
                               <UserCircle className="h-4 w-4" />
                            </div>
                            <span className="font-bold text-xs uppercase tracking-tight">Admin Profile</span>
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleChangePassword} className="rounded-xl px-4 py-2.5 cursor-pointer focus:bg-primary/5 focus:text-primary">
                          <div className="p-1.5 bg-primary/10 rounded-lg mr-3 text-primary">
                             <KeyRound className="h-4 w-4" />
                          </div>
                          <span className="font-bold text-xs uppercase tracking-tight">Change Password</span>
                        </DropdownMenuItem>
                      </div>
                      <DropdownMenuSeparator className="mx-2" />
                      <DropdownMenuItem onClick={() => { showLoading(); handleLogoutAuth(); }} className="rounded-xl px-4 py-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                        <div className="p-1.5 bg-destructive/10 rounded-lg mr-3">
                           <LogOut className="h-4 w-4" />
                        </div>
                        <span className="font-bold text-xs uppercase tracking-tight">System Logout</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <div className="md:hidden">
                  <SidebarTrigger className="rounded-full h-10 w-10 bg-muted/50" />
                </div>
              </div>
            </div>
          </header>
          <main className="p-4 sm:p-3 lg:p-8 pb-20 md:pb-8 relative flex-grow">
            <Suspense fallback={<AdminPageLoader />}>
              {children}
            </Suspense>
            {isAdmin && (
              <>
                <AdminFloatingChatButton onClick={() => setIsFloatingChatOpen(prev => !prev)} />
                <FloatingAdminChatWindow
                  isOpen={isFloatingChatOpen}
                  onClose={() => setIsFloatingChatOpen(false)}
                />
                {newBookingPopupDetails && (
                  <NewBookingAdminPopup
                    isOpen={showNewBookingPopup}
                    bookingDocId={newBookingPopupDetails.bookingDocId}
                    bookingHumanId={newBookingPopupDetails.bookingHumanId}
                    onClose={(markAsRead) => handleCloseNewBookingPopup(markAsRead, newBookingPopupDetails.notificationId)}
                  />
                )}
              </>
            )}
          </main>

          {/* Mobile Bottom Navigation Bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-xl border-t border-border/40 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] px-4 py-2 flex items-center justify-around pb-safe">
            {mobileTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = isTabActive(tab.href);
              return (
                <Link
                  key={tab.label}
                  href={tab.href}
                  onClick={() => showLoading()}
                  className={cn(
                    "flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all duration-300",
                    isActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5 transition-transform duration-300", isActive && "scale-110")} />
                  <span className="text-[9px] font-black uppercase tracking-wider">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ProtectedRoute>
  );
}

