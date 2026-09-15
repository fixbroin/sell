"use client";

import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react'; 
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase'; 
import { doc, getDoc } from '@/lib/mysqlDb'; 
import { hasPathAccess, getFirstAccessiblePath } from '@/config/rbac';

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";

const ProtectedRoute: React.FC<PropsWithChildren> = ({ children }) => {
  const { user, adminPermissions, isLoading: authIsLoading, isAdminLoading, triggerAuthRedirect } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isProviderApproved, setIsProviderApproved] = useState<boolean | null>(null); 
  const [isCheckingProviderStatus, setIsCheckingProviderStatus] = useState(false);
  const [cachedRole, setCachedRole] = useState<string | null>(null);
  const [cachedName, setCachedName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setCachedRole(localStorage.getItem('yourbrand_user_role'));
      setCachedName(localStorage.getItem('yourbrand_user_name'));
    }
  }, []);

  useEffect(() => {
    if (authIsLoading || isAdminLoading) return;

    const isAdminRoute = pathname.startsWith('/admin');
    const isProviderRoute = pathname.startsWith('/provider');
    const isAdminLoginPage = pathname === '/admin/login';
    
    const protectedClientRoutes = [
      '/profile', '/my-bookings', '/checkout/schedule', '/checkout/address',
      '/checkout/payment', '/checkout/thank-you', '/notifications', '/chat', '/cart', '/my-address',
      '/custom-service'
    ];
    const isExplicitlyProtectedClientRoute = protectedClientRoutes.some(route => pathname.startsWith(route));

    const checkProviderApproval = async (userId: string) => {
      setIsCheckingProviderStatus(true);
      try {
        const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, userId);
        const docSnap = await getDoc(appDocRef);
        if (docSnap.exists() && docSnap.data()?.status === 'approved') {
          setIsProviderApproved(true);
        } else {
          setIsProviderApproved(false);
          if (isProviderRoute && pathname !== '/provider-registration') { 
             toast({ title: "Access Denied", description: "Your provider application is not approved or found.", variant: "destructive" });
             router.push('/');
          }
        }
      } catch (error) {
        console.error("Error checking provider status:", error);
        setIsProviderApproved(false);
        if (isProviderRoute && pathname !== '/provider-registration') {
            toast({ title: "Error", description: "Could not verify provider status.", variant: "destructive" });
            router.push('/');
        }
      } finally {
        setIsCheckingProviderStatus(false);
      }
    };

    if (!user) { 
      if (isAdminRoute && !isAdminLoginPage) {
        triggerAuthRedirect(pathname);
      } else if (isProviderRoute && pathname !== '/provider-registration') { 
        triggerAuthRedirect(pathname); 
      } else if (isExplicitlyProtectedClientRoute) {
        triggerAuthRedirect(pathname);
      }
    } else { 
      if (isAdminRoute) {
        if (authIsLoading || isAdminLoading) {
          return; 
        }
        if (!adminPermissions && !isAdminLoginPage) {
          toast({ title: "Access Denied", description: "You are not authorized for the admin panel.", variant: "destructive" });
          router.push('/');
        } else if (adminPermissions && !hasPathAccess(adminPermissions, pathname) && !isAdminLoginPage) {
          toast({ title: "Unauthorized", description: "You don't have permission to access this module.", variant: "destructive" });
          const safePath = getFirstAccessiblePath(adminPermissions);
          if (pathname !== safePath) {
             router.push(safePath);
          } else {
             router.push('/admin/profile'); 
          }
        }
      } else if (isAdminLoginPage && adminPermissions) {
        router.push('/admin');
      } else if (isProviderRoute) {
        if (isProviderApproved === null && !isCheckingProviderStatus) { 
            checkProviderApproval(user.uid);
        }
      }
    }
  }, [user, adminPermissions, authIsLoading, isAdminLoading, router, pathname, toast, triggerAuthRedirect, isProviderApproved, isCheckingProviderStatus]);

  const isAdminRoute = pathname.startsWith('/admin');
  const isAdminLoginPage = pathname === '/admin/login';
  const isProviderRoute = pathname.startsWith('/provider');

  // 1. INITIAL SYSTEM STATE LOADERS (Firebase initialization + Admin permission checks)
  if (authIsLoading || isAdminLoading || (isProviderRoute && isCheckingProviderStatus && isProviderApproved === null)) {
    let loadingText = "Loading Yourbrand...";
    if (isAdminRoute) {
      loadingText = cachedName ? `Welcome back, ${cachedName}. Loading Admin Panel...` : "Loading Admin Panel...";
    } else if (isProviderRoute) {
      loadingText = cachedName ? `Welcome back, ${cachedName}. Loading Provider Panel...` : "Loading Provider Panel...";
    }

    return (
      <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm font-semibold text-muted-foreground animate-pulse">{loadingText}</p>
      </div>
    );
  }

  // 2. IMMEDIATE REDIRECTS (To prevent flash of content while useEffect prepares route change)
  if (!user) {
    if (isAdminRoute && !isAdminLoginPage) {
      return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-semibold text-muted-foreground">Redirecting to login...</p>
        </div>
      );
    }
    if (isProviderRoute && pathname !== '/provider-registration') {
      return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-semibold text-muted-foreground">Redirecting to login...</p>
        </div>
      );
    }
    
    const protectedClientRoutes = [
      '/profile', '/my-bookings', '/checkout/schedule', '/checkout/address',
      '/checkout/payment', '/checkout/thank-you', '/notifications', '/chat', '/cart', '/my-address',
      '/custom-service'
    ];
    if (protectedClientRoutes.some(route => pathname.startsWith(route))) {
      return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-semibold text-muted-foreground">Redirecting to login...</p>
        </div>
      );
    }
  } else {
    if (isAdminRoute && !adminPermissions && !isAdminLoginPage) {
       return (
         <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
           <Loader2 className="h-12 w-12 animate-spin text-primary" />
           <p className="text-sm font-semibold text-muted-foreground animate-pulse">Verifying Admin Access...</p>
         </div>
       );
    }
    if (isAdminRoute && adminPermissions && !hasPathAccess(adminPermissions, pathname) && !isAdminLoginPage) {
       return (
         <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
           <Loader2 className="h-12 w-12 animate-spin text-destructive" />
           <p className="text-sm font-semibold text-destructive uppercase tracking-wider">Access Denied</p>
         </div>
       );
    }
  }

  // 3. FALLBACK REDIRECTS (After async loads settle and authorization yields negative results)
  if (!user) {
    // Guest accessing public pages
  } else if (!adminPermissions && pathname.startsWith('/admin') && pathname !== '/admin/login') {
      return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-semibold text-muted-foreground">Unauthorized. Redirecting...</p>
        </div>
      );
  } else if (adminPermissions && pathname.startsWith('/admin') && !hasPathAccess(adminPermissions, pathname) && pathname !== '/admin/login') {
      return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-semibold text-muted-foreground">Access Denied. Redirecting...</p>
        </div>
      );
  } else if (pathname.startsWith('/provider') && pathname !== '/provider-registration' && !isProviderApproved) {
      return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-destructive" />
          <p className="text-sm font-semibold text-destructive">Access Denied to Provider Panel</p>
        </div>
      );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
