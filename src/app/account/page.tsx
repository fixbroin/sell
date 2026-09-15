"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User, Briefcase, MapPin, Bell, MessageSquare, LogOut, ChevronRight, Handshake,
  Loader2, Info, FileText, Construction, UserPlus, LayoutDashboard, ClipboardList
} from 'lucide-react';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useLoading } from '@/contexts/LoadingContext';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import type { ReferralSettings } from '@/types/firestore';
import { doc, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

interface AccountLinkProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badgeCount?: number;
  isLogout?: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const AccountLink = ({ href, icon: Icon, label, badgeCount, isLogout = false, onClick }: AccountLinkProps) => {
  const content = (
    <div
      className={cn(
        "flex items-center w-full p-4 rounded-xl border border-border/50 bg-background shadow-sm transition-all duration-300 mb-3 group",
        isLogout 
          ? "hover:bg-destructive hover:text-white hover:border-destructive" 
          : "hover:bg-primary hover:text-primary-foreground hover:border-primary hover:shadow-md"
      )}
    >
      <div className={cn(
        "p-2 rounded-lg mr-4 transition-colors duration-300",
        isLogout 
          ? "bg-destructive/10 text-destructive group-hover:bg-white/20 group-hover:text-white" 
          : "bg-primary/10 text-primary group-hover:bg-white/20 group-hover:text-white"
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <span className="flex-grow text-base font-semibold">{label}</span>
      {badgeCount !== undefined && badgeCount > 0 && (
        <span className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold mr-2",
          isLogout ? "bg-white text-destructive" : "bg-red-600 text-white shadow-sm"
        )}>
           {badgeCount > 9 ? '9+' : badgeCount}
        </span>
      )}
      <ChevronRight className="h-5 w-5 opacity-50 group-hover:opacity-100 transition-opacity" />
    </div>
  );

  if (isLogout) {
    return <button onClick={onClick} className="w-full text-left">{content}</button>;
  }

  return (
    <Link href={href} onClick={onClick} className="block">
      {content}
    </Link>
  );
};

function AccountPageContent() {
  const { user, firestoreUser, logOut, isLoading: authIsLoading, providerStatus } = useAuth();
  const { showLoading } = useLoading();
  const router = useRouter();
  
  const { count: unreadNotificationsCount } = useUnreadNotificationsCount(user?.uid);
  const [referralSettings, setReferralSettings] = useState<ReferralSettings | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('referral_settings');
        return cached ? JSON.parse(cached) : null;
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const { featuresConfig, isLoading: isLoadingFeaturesConfig } = useFeaturesConfig();
  const { settings: globalSettings, isLoading: isLoadingGlobalSettings } = useGlobalSettings();


  useEffect(() => {
    const settingsDocRef = doc(db, "appConfiguration", "referral");
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data() as ReferralSettings;
            setReferralSettings(data);
            try {
              localStorage.setItem('referral_settings', JSON.stringify(data));
            } catch (e) {}
        } else {
            setReferralSettings(null);
            try {
              localStorage.removeItem('referral_settings');
            } catch (e) {}
        }
    });
    return () => unsubscribe();
  }, []);

  const handleNav = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    showLoading();
    router.push(href);
  };
  
  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    showLoading();
    logOut();
  };

  const accountMenuItems = [
    { href: '/profile', label: 'My Profile', icon: User },
    { href: '/my-bookings', label: 'My Bookings', icon: Briefcase },
    { href: '/my-address', label: 'My Addresses', icon: MapPin },
    { href: '/referral', label: 'Refer & Earn', icon: Handshake, condition: () => !isLoadingAppConfig && !!referralSettings?.isReferralSystemEnabled },
    { href: '/notifications', label: 'Notifications', icon: Bell, badgeCount: unreadNotificationsCount },
    { href: '/chat', label: 'Chat with Support', icon: MessageSquare, isProtected: true, condition: () => !isLoadingGlobalSettings && !!globalSettings?.isChatEnabled },
  ];

  const getProviderMenuItemDetails = () => {
    if (providerStatus === 'approved') {
      return {
        href: '/provider',
        label: 'Go to Provider Panel',
        icon: LayoutDashboard,
      };
    } else if (providerStatus) {
      return {
        href: '/provider-registration',
        label: 'Provider Status',
        icon: ClipboardList,
      };
    } else {
      return {
        href: '/provider-registration',
        label: 'Join as a Provider',
        icon: UserPlus,
      };
    }
  };

  const providerMenuItem = getProviderMenuItemDetails();

  const extraPagesItems = [
    { href: '/custom-service', label: 'Custom Service', icon: Construction, condition: () => !isLoadingFeaturesConfig && !!featuresConfig.showCustomServiceButton},
    { href: providerMenuItem.href, label: providerMenuItem.label, icon: providerMenuItem.icon, condition: () => providerStatus === 'approved' || (!isLoadingAppConfig && !!appConfig.isProviderRegistrationEnabled)},
    { href: '/about-us', label: 'About Us', icon: Info },
    { href: '/contact-us', label: 'Contact Us', icon: MessageSquare },
  ];

  const policyItems = [
     { href: '/terms-and-conditions', label: 'Terms and Conditions', icon: FileText },
     { href: '/privacy-policy', label: 'Privacy Policy', icon: FileText },
     { href: '/cancellation-policy', label: 'Cancellation Policy', icon: FileText },
     { href: '/damage-and-claims-policy', label: 'Damage & Claims Policy', icon: FileText },
  ];

  if (authIsLoading || !user || !firestoreUser || isLoadingGlobalSettings) {
    return (
        <div className="flex justify-center items-center h-[calc(100vh-8rem)]">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
    )
  }

  return (
    <div className="container mx-auto px-2 py-4 sm:px-4 sm:py-6">
      <div className="flex items-center gap-4 p-4 mb-4">
        <Avatar className="h-16 w-16 border-2 border-primary">
          <AvatarImage src={user.photoURL || undefined} alt={firestoreUser.displayName || "User"} />
          <AvatarFallback className="text-2xl">
            {firestoreUser.displayName ? firestoreUser.displayName.charAt(0).toUpperCase() : user.email ? user.email.charAt(0).toUpperCase() : "U"}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">{firestoreUser.displayName || "Valued User"}</h1>
          <p className="text-sm text-muted-foreground">{firestoreUser.email}</p>
        </div>
      </div>
      
      <nav className="space-y-6">
        {/* Section 1: Theme Toggle */}
        <div className="bg-background border border-border/50 rounded-xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center">
              <div className="bg-muted p-2 rounded-lg mr-4">
                <Info className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-base font-semibold">Theme Appearance</span>
            </div>
            <ThemeToggle />
        </div>
        
        {/* Section 2: Account & Bookings */}
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-4 mb-2">My Account</h3>
          {accountMenuItems.filter(item => item.condition ? item.condition() : true).map(item => (
            <AccountLink key={item.href} {...item} onClick={(e) => handleNav(e, item.href)} />
          ))}
        </div>
        
        {/* Section 3: Extra Pages */}
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-4 mb-2">More</h3>
          {extraPagesItems.filter(item => item.condition ? item.condition() : true).map(item => (
            <AccountLink key={item.href} {...item} onClick={(e) => handleNav(e, item.href)} />
          ))}
        </div>
        
        {/* Section 4: Policies */}
        <div className="space-y-1">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider ml-4 mb-2">Legal</h3>
          {policyItems.map(item => (
            <AccountLink key={item.href} {...item} onClick={(e) => handleNav(e, item.href)} />
          ))}
        </div>
        
        {/* Section 5: Logout */}
        <div className="pt-2">
          <AccountLink href="#" label="Log Out" icon={LogOut} isLogout={true} onClick={handleLogout} />
        </div>
      </nav>
    </div>
  );
}


export default function AccountPage() {
    return (
        <ProtectedRoute>
            <AccountPageContent />
        </ProtectedRoute>
    );
}
