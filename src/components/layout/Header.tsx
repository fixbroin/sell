
"use client";

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Bell, Menu, X, ShoppingCart, LogOut, UserCircle, Briefcase, Settings2, Moon, Sun, MessageSquare, UserPlus, MapPin as AddressIcon, Construction, Handshake, ChevronDown, LayoutDashboard, ClipboardList } from 'lucide-react'; // Added Handshake
import Logo from '@/components/shared/Logo';
import { Button } from '@/components/ui/button';
import { cn, formatCurrency } from '@/lib/utils';
import SearchPopup from '@/components/shared/SearchPopup';
import { Sheet, SheetContent, SheetTrigger, SheetClose, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { getCartEntries, type CartEntry } from '@/lib/cartManager';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLoading } from '@/contexts/LoadingContext';
import { useUnreadNotificationsCount } from '@/hooks/useUnreadNotificationsCount';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { useApplicationConfig } from '@/hooks/useApplicationConfig'; 
import { useFeaturesConfig } from '@/hooks/useFeaturesConfig'; // Import new hook
import type { ReferralSettings } from '@/types/firestore';
import { doc, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase'; // Added missing import

const NavLink = ({ href, children, onClick, isButton = false }: { href?: string; children: React.ReactNode; onClick?: (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void; isButton?: boolean }) => {
  const pathname = usePathname();
  const isActive = href ? pathname === href : false;

  const commonClasses = `block w-full text-left px-4 py-2 text-sm rounded-md hover:bg-accent/10 ${isActive ? 'font-semibold text-primary' : 'text-foreground/80'}`;

  if (isButton || !href) {
    return (
      <SheetClose asChild>
        <button onClick={onClick} className={commonClasses}>
          {children}
        </button>
      </SheetClose>
    );
  }

  return (
    <SheetClose asChild>
      <Link href={href} onClick={onClick} className={commonClasses}>
        {children}
      </Link>
    </SheetClose>
  );
};


const Header = ({ initialWebSettings }: { initialWebSettings?: any }) => {
  const [isSearchPopupOpen, setIsSearchPopupOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { user, firestoreUser, logOut, isLoading: authIsLoading, triggerAuthRedirect, providerStatus } = useAuth();
  const { settings: globalSettings, isLoading: settingsAreLoading } = useGlobalSettings(initialWebSettings);
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig(); 
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const { featuresConfig, isLoading: isLoadingFeaturesConfig } = useFeaturesConfig(); 
  const [cartItemCount, setCartItemCount] = useState(0);
  const router = useRouter();
  const currentPathnameFromHook = usePathname();
  const { showLoading } = useLoading();

  const { count: unreadCountFromHook, isLoading: isLoadingCount } = useUnreadNotificationsCount(user?.uid);
  const [headerUnreadCount, setHeaderUnreadCount] = useState(0);
  const [currentThemeForIcon, setCurrentThemeForIcon] = useState<'light' | 'dark'>('light');

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
          setIsLoadingReferral(false);
      }, (error) => {
          console.error("Error fetching referral settings:", error);
          setIsLoadingReferral(false);
      });
      return () => unsubscribe();
  }, [user]);


  useEffect(() => {
    setHeaderUnreadCount(unreadCountFromHook);
  }, [unreadCountFromHook]);

  useEffect(() => {
    const getInitialTheme = () => {
        const storedTheme = localStorage.getItem('yourbrand-theme') as 'light' | 'dark' | null;
        if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
        if (typeof window.matchMedia !== 'function') return 'light';
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };
    if (typeof window !== 'undefined') {
      setCurrentThemeForIcon(getInitialTheme());
    }


    const handleThemeChange = (event?: Event) => {
        const newTheme = (event as CustomEvent)?.detail?.theme || getInitialTheme();
        setCurrentThemeForIcon(newTheme);
    };

    window.addEventListener('themeChanged', handleThemeChange);
    window.addEventListener('storage', (event) => {
        if (event.key === 'yourbrand-theme') {
            handleThemeChange();
        }
    });

    return () => {
        window.removeEventListener('themeChanged', handleThemeChange);
        window.removeEventListener('storage', (event) => {
            if (event.key === 'yourbrand-theme') handleThemeChange();
        });
    };
  }, []);


  const updateCartCount = () => {
    const entries = getCartEntries();
    const totalQuantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    setCartItemCount(totalQuantity);
  };

  useEffect(() => {
    setIsMounted(true);
    updateCartCount();

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'yourbrandUserCart' || event.key === null) {
        updateCartCount();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const handleAuthRequiredNav = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>, intendedHref: string) => {
    e.preventDefault();
    const currentClientPath = window.location.pathname + window.location.search + window.location.hash;
    if (intendedHref !== currentClientPath && !intendedHref.startsWith('#')) showLoading();
    if (!user) triggerAuthRedirect(intendedHref);
    else router.push(intendedHref);
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
  };

  const handleSimpleNav = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>, intendedHref: string) => {
    e.preventDefault();
    const currentClientPath = window.location.pathname + window.location.search + window.location.hash;
    if (intendedHref !== currentClientPath && !intendedHref.startsWith('#')) showLoading();
    router.push(intendedHref);
    if (isMobileMenuOpen) setIsMobileMenuOpen(false);
  };

  const chatIsEnabled = isMounted && !settingsAreLoading && globalSettings?.isChatEnabled;

  const baseNavItems = [
    { href: '/', label: 'Home', isProtected: false },
    { href: '/categories', label: 'Categories', isProtected: true },
  ];

  const userSpecificNavItems = [
    { href: '/profile', label: 'Profile', icon: UserCircle, isProtected: true },
    { href: '/my-bookings', label: 'My Bookings', icon: Briefcase, isProtected: true },
    { href: '/my-address', label: 'My Addresses', icon: AddressIcon, isProtected: true },
    { href: '/referral', label: 'Refer & Earn', icon: Handshake, isProtected: true, condition: () => !isLoadingReferral && !!referralSettings?.isReferralSystemEnabled },
    { href: '/notifications', label: 'Notifications', icon: Bell, isProtected: true },
    { href: '/chat', label: 'Chat with Support', icon: MessageSquare, condition: () => chatIsEnabled, isProtected: true },
  ];
  
  const guestNavItems = [
      { href: '/auth/login', label: 'Login / Sign Up', isProtected: false }
  ];

  return (
    <>
      <header className="bg-background/95 backdrop-blur-xl shadow-sm sticky top-0 z-50 border-b border-border/40 transition-all duration-300">
        <div data-hydration-state="hydrated" className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Left: Desktop Nav / Mobile Logo */}
          <div className="flex items-center gap-8">
             <div className="md:hidden">
                <Logo logoUrl={globalSettings?.logoUrl} websiteName={globalSettings?.websiteName} />
             </div>
            <nav className="hidden md:flex items-center gap-2">
              {baseNavItems.map((item) => (
                 <Link
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      if (item.isProtected && !user) {
                        e.preventDefault();
                        showLoading();
                        triggerAuthRedirect(item.href);
                      } else {
                        showLoading();
                      }
                    }}
                    className={cn(
                      "px-4 py-2 text-sm font-semibold rounded-full transition-all duration-300",
                      currentPathnameFromHook === item.href 
                        ? "bg-primary text-primary-foreground shadow-md" 
                        : "bg-muted/50 text-foreground/70 hover:bg-primary hover:text-primary-foreground hover:shadow-md"
                    )}
                  >
                  {item.label}
                 </Link>
              ))}
             
              { featuresConfig.showCustomServiceButton && (
                 <Link
                    href="/custom-service"
                    onClick={(e) => {
                      if (!user) {
                        e.preventDefault();
                        showLoading();
                        triggerAuthRedirect('/custom-service');
                      } else {
                        showLoading();
                      }
                    }}
                    className={cn(
                      "px-4 py-2 text-sm font-semibold rounded-full transition-all duration-300 flex items-center",
                      currentPathnameFromHook === '/custom-service'
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted/50 text-foreground/70 hover:bg-primary hover:text-primary-foreground hover:shadow-md"
                    )}
                  >
                    <Construction className="mr-2 h-4 w-4" /> Custom Service
                 </Link>
              )}
              { (appConfig.isProviderRegistrationEnabled || (user && user.email === ADMIN_EMAIL) || providerStatus === 'approved') && (() => {
                const getProviderButtonDetails = () => {
                  if (providerStatus === 'approved') {
                    return {
                      label: 'Go to Provider Panel',
                      path: '/provider',
                      icon: <LayoutDashboard className="mr-2 h-4 w-4" />,
                    };
                  } else if (providerStatus) {
                    return {
                      label: 'Provider Status',
                      path: '/provider-registration',
                      icon: <ClipboardList className="mr-2 h-4 w-4" />,
                    };
                  } else {
                    return {
                      label: 'Join as Provider',
                      path: '/provider-registration',
                      icon: <UserPlus className="mr-2 h-4 w-4" />,
                    };
                  }
                };
                const providerBtn = getProviderButtonDetails();
                return (
                  <Link
                    href={providerBtn.path}
                    onClick={() => showLoading()}
                    className={cn(
                      "px-4 py-2 text-sm font-semibold rounded-full transition-all duration-300 flex items-center",
                      currentPathnameFromHook === providerBtn.path
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-muted/50 text-foreground/70 hover:bg-primary hover:text-primary-foreground hover:shadow-md"
                    )}
                  >
                    {providerBtn.icon} {providerBtn.label}
                  </Link>
                );
              })()}
            </nav>
          </div>

          {/* Center: Logo (Desktop Only) */}
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 transform">
             <Logo logoUrl={globalSettings?.logoUrl} websiteName={globalSettings?.websiteName} />
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
             {user && !isLoadingReferral && referralSettings?.isReferralSystemEnabled && (
                <button
                  onClick={(e) => handleAuthRequiredNav(e, '/referral')}
                  className="hidden lg:flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider bg-primary/5 text-primary border border-primary/20 rounded-full hover:bg-primary hover:text-primary-foreground transition-all duration-300 mr-2"
                >
                  <Handshake className="h-4 w-4" /> 
                  <span>Refer & Earn {formatCurrency(referralSettings?.maxEarningsPerReferrer || referralSettings?.referrerBonus || 100, symbol, decimals, code)}</span>
                </button>
              )}
            
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsSearchPopupOpen(true)} 
                className="rounded-full bg-muted/50 hover:bg-primary hover:text-primary-foreground shadow-none h-10 w-10 transition-all duration-300"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </Button>
              
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>

              {chatIsEnabled && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  aria-label="Chat" 
                  onClick={(e) => handleAuthRequiredNav(e, '/chat')}
                  className="relative hidden md:inline-flex rounded-full bg-muted/50 hover:bg-primary hover:text-primary-foreground shadow-none h-10 w-10 transition-all duration-300" 
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
              )}

              <Button 
                variant="ghost" 
                size="icon" 
                aria-label="Notifications" 
                onClick={(e) => handleAuthRequiredNav(e, '/notifications')} 
                className="relative rounded-full bg-muted/50 hover:bg-primary hover:text-primary-foreground shadow-none h-10 w-10 transition-all duration-300"
              >
                <Bell className="h-5 w-5" />
                {isMounted && !isLoadingCount && headerUnreadCount > 0 && (
                    <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border-2 border-background group-hover:border-primary transition-colors">
                      {headerUnreadCount > 9 ? '9+' : headerUnreadCount}
                    </span>
                )}
              </Button>

              <Button 
                variant="ghost" 
                size="icon" 
                aria-label="Cart" 
                className="relative rounded-full bg-muted/50 hover:bg-primary hover:text-primary-foreground shadow-none h-10 w-10 transition-all duration-300" 
                onClick={(e) => handleAuthRequiredNav(e, '/cart')}
              >
                <ShoppingCart className="h-5 w-5" />
                {isMounted && cartItemCount > 0 && (
                  <span className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white border-2 border-background group-hover:border-primary transition-colors">
                    {cartItemCount > 9 ? '9+' : cartItemCount}
                  </span>
                )}
              </Button>
            </div>

            <div className="hidden md:block ml-2">
               {!user && !authIsLoading && (
                 <Link href="/auth/login" onClick={() => showLoading()} className="inline-flex items-center justify-center rounded-full px-6 py-2 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all duration-300">
                   Login
                 </Link>
               )}
               {user && (
                 <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="relative flex items-center gap-1.5 h-10 px-2 rounded-full bg-muted/50 hover:bg-primary/5 border border-transparent hover:border-primary/20 transition-all duration-300 shadow-none group">
                        <div className="h-7 w-7 rounded-full border border-primary/20 p-0 group-hover:border-primary transition-colors overflow-hidden">
                          <Avatar className="h-full w-full">
                            <AvatarImage src={user.photoURL || undefined} alt={firestoreUser?.displayName || user.displayName || user.email || "User"} />
                            <AvatarFallback className="bg-primary/10 text-primary font-bold text-[10px]">{firestoreUser?.displayName?.charAt(0).toUpperCase() || user.displayName?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                          </Avatar>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 mt-2 rounded-2xl p-2 shadow-2xl border-border/40" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal p-4">
                        <div className="flex flex-col space-y-2">
                          <p className="text-base font-bold leading-none">{firestoreUser?.displayName || user.displayName || "User"}</p>
                          <p className="text-xs leading-none text-muted-foreground truncate">
                            {user.email}
                          </p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator className="mx-2" />
                      <div className="py-2">
                        {userSpecificNavItems.filter(item => item.condition ? item.condition() : true).map(item => (
                          <DropdownMenuItem
  key={item.href}
  asChild
  className={cn(
  "rounded-xl px-4 py-3 cursor-pointer transition-all duration-300 border mb-1 group",
  "focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white",
  currentPathnameFromHook === item.href
    ? "bg-primary text-white font-bold shadow-lg border-primary"
    : "bg-muted/30 text-slate-700 dark:text-slate-300 border-border/40 hover:bg-primary hover:text-white hover:border-primary hover:translate-x-1"
)}
>
  <Link
    href={item.href}
    onClick={(e) => handleAuthRequiredNav(e, item.href)}
    className="flex items-center w-full"
  >
    <div
  className={cn(
    "p-2 rounded-lg mr-3 transition-all duration-300",
    currentPathnameFromHook === item.href
      ? "bg-white/20 text-white scale-110"
      : "bg-primary/10 text-primary group-hover:bg-white/20 group-hover:text-white group-hover:scale-110"
  )}
>
      <item.icon className="h-4 w-4" />
    </div>

    <span className="ml-3 truncate flex-grow">{item.label}</span>
  </Link>
</DropdownMenuItem>
                        ))}
                      </div>
                      {user.email === ADMIN_EMAIL && (
                        <>
                          <DropdownMenuSeparator className="mx-2" />
                          <DropdownMenuItem
  asChild
  className={cn(
    "rounded-xl px-4 py-3 cursor-pointer transition-all duration-300 border mb-1 group",
    "focus:bg-primary focus:text-white data-[highlighted]:bg-primary data-[highlighted]:text-white",
    currentPathnameFromHook === "/admin"
      ? "bg-primary text-white font-bold shadow-lg border-primary"
      : "bg-muted/30 text-slate-700 dark:text-slate-300 border-border/40 hover:bg-primary hover:text-white hover:border-primary hover:translate-x-1"
  )}
>
  <Link
    href="/admin"
    onClick={(e) => handleAuthRequiredNav(e, "/admin")}
    className="flex items-center w-full"
  >
   <div
  className={cn(
    "p-2 rounded-lg mr-3 transition-all duration-300",
    currentPathnameFromHook === "/admin"
      ? "bg-white/20 text-white scale-110"
      : "bg-primary/10 text-primary group-hover:bg-white/20 group-hover:text-white group-hover:scale-110"
  )}
>
      <Settings2 className="h-4 w-4" />
    </div>

    <span className="ml-3 truncate flex-grow">Admin Control</span>
  </Link>
</DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator className="mx-2" />
                      <DropdownMenuItem onClick={(e) => {e.stopPropagation(); showLoading(); logOut();}} className="rounded-xl px-4 py-3 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                        <div className="bg-destructive/10 p-2 rounded-lg mr-3">
                          <LogOut className="h-4 w-4" />
                        </div>
                        <span className="font-medium">Sign Out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
               )}
            </div>
          </div>
        </div>
      </header>
      <SearchPopup isOpen={isSearchPopupOpen} onClose={() => setIsSearchPopupOpen(false)} />
    </>
  );
};

export default Header;
