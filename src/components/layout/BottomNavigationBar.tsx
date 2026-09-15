
"use client";

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Home, Layers, Briefcase, UserCircle as UserIcon, Construction, Handshake } from 'lucide-react'; // Added Construction & Handshake
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLoading } from '@/contexts/LoadingContext';
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig';
import { useState, useEffect } from 'react'; // Added useState & useEffect
import type { ReferralSettings } from '@/types/firestore'; // Added ReferralSettings
import { getRemoteCacheVersions } from '@/lib/client-cache';
import type { ElementType } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
  isProtected: boolean;
  condition?: () => boolean; // Add optional condition
}

const BottomNavigationBar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading();
  const { featuresConfig, isLoading: isLoadingFeatures } = useFeaturesConfig();
  
  // New state for referral settings with client-side cache
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
  const [isLoadingReferral, setIsLoadingReferral] = useState(() => {
    if (typeof window !== 'undefined') {
      return !localStorage.getItem('referral_settings');
    }
    return true;
  });

  // Fetch referral settings - Only for logged in users to save reads
  useEffect(() => {
      if (!user) {
          setIsLoadingReferral(false);
          return;
      }
      
      const fetchReferralSettings = async () => {
          try {
              // Smart Cache check
              const remoteVersions = await getRemoteCacheVersions();
              const remoteVersion = remoteVersions['withdrawal-referral-config'] || 0;
              
              const localVersion = parseInt(localStorage.getItem('referral_settings_version') || "0");
              const cached = localStorage.getItem('referral_settings');
              
              if (cached && remoteVersion <= localVersion) {
                  setIsLoadingReferral(false);
                  return;
              }

              const res = await fetch('/api/referral-settings');
              if (res.ok) {
                  const data = await res.json() as ReferralSettings;
                  setReferralSettings(data);
                  localStorage.setItem('referral_settings', JSON.stringify(data));
                  localStorage.setItem('referral_settings_version', remoteVersion.toString());
              } else {
                  setReferralSettings(null);
                  localStorage.removeItem('referral_settings');
              }
          } catch (error) {
              console.error("Error fetching referral settings:", error);
          } finally {
              setIsLoadingReferral(false);
          }
      };

      fetchReferralSettings();
  }, [user]);

  const navItems: NavItem[] = [
    { href: '/', label: 'Home', icon: Home, isProtected: false },
    { href: '/categories', label: 'Categories', icon: Layers, isProtected: true },
    
    { href: '/referral', label: 'Refer', icon: Handshake, isProtected: true, condition: () => !isLoadingReferral && !!referralSettings?.isReferralSystemEnabled },
    { href: '/my-bookings', label: 'Bookings', icon: Briefcase, isProtected: true },
    { href: '/account', label: 'Profile', icon: UserIcon, isProtected: true },
  ];

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement>, item: NavItem) => {
    e.preventDefault();
    if (pathname !== item.href) {
      showLoading();
    }
    if (item.isProtected && !user) {
      triggerAuthRedirect(item.href);
    } else {
      router.push(item.href);
    }
  };

  const filteredNavItems = navItems.filter(item => item.condition ? item.condition() : true);
  const itemWidthClass = `w-1/${filteredNavItems.length}`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-background/95 backdrop-blur-lg border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40 pb-safe">
      <div className="container mx-auto flex justify-around items-center h-16 px-2">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href;
          const IconComponent = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={(e) => handleNav(e, item)}
              className={cn(
                "flex flex-col items-center justify-center min-w-[64px] h-14 rounded-2xl transition-all duration-300",
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground active:bg-muted active:scale-95"
              )}
            >
              <div className={cn(
                "p-1.5 rounded-xl transition-transform duration-300",
                isActive ? "scale-110" : ""
              )}>
                <IconComponent className="h-5 w-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-tighter mt-0.5",
                isActive ? "opacity-100" : "opacity-80"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigationBar;
