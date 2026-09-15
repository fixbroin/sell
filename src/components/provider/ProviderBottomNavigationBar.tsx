
"use client";

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LayoutDashboard, Briefcase, ReceiptText, Menu, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useLoading } from '@/contexts/LoadingContext';
import { useSidebar } from '@/components/ui/sidebar';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from '@/lib/mysqlDb';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import type { ElementType } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: ElementType;
  isProtected: boolean;
  isButton?: boolean;
}

const ProviderBottomNavigationBar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading();
  const { setOpenMobile } = useSidebar(); // Get the function to open the mobile sidebar

  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [walletBalance, setWalletBalance] = useState<number>(0);

  useEffect(() => {
    if (!user?.uid) return;
    const userDocRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setWalletBalance(data?.providerWalletBalance || 0);
      }
    });
    return () => unsubscribe();
  }, [user?.uid]);

  const navItems: NavItem[] = [
    { href: '/provider', label: 'Dashboard', icon: LayoutDashboard, isProtected: true },
    { href: '/provider/my-jobs', label: 'My Jobs', icon: Briefcase, isProtected: true },
    { href: '/provider/quotation-invoice', label: 'Billing', icon: ReceiptText, isProtected: true },
    { href: '/provider/wallet', label: `${symbol}${walletBalance.toFixed(appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2)}`, icon: Wallet, isProtected: true },
    { href: '#', label: 'More', icon: Menu, isProtected: false, isButton: true },
  ];

  const handleNav = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>, item: NavItem) => {
    e.preventDefault();

    if (item.isButton) {
      setOpenMobile(true); // Open the sidebar sheet
      return;
    }
    
    if (pathname !== item.href) {
      showLoading();
    }
    if (item.isProtected && !user) {
      triggerAuthRedirect(item.href);
    } else {
      router.push(item.href);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 md:hidden bg-background/95 backdrop-blur-lg border-t border-border/50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40 pb-safe">
      <div className="container mx-auto flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const isActive = !item.isButton && pathname === item.href;
          const IconComponent = item.icon;
          
          if (item.isButton) {
              return (
                 <button
                    key={item.label}
                    onClick={(e) => handleNav(e, item)}
                    className={cn(
                        "flex flex-col items-center justify-center text-xs py-2 transition-colors duration-150 ease-in-out w-1/5",
                        "text-muted-foreground hover:text-primary"
                    )}
                    >
                    <IconComponent className="h-5 w-5 mb-0.5" strokeWidth={2} />
                    {item.label}
                </button>
              )
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              onClick={(e) => handleNav(e, item)}
              className={cn(
                "flex flex-col items-center justify-center text-xs py-2 transition-colors duration-150 ease-in-out w-1/5",
                isActive ? "text-primary font-medium" : "text-muted-foreground hover:text-primary"
              )}
            >
              <IconComponent className={cn("h-5 w-5 mb-0.5", isActive ? "text-primary" : "")} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

export default ProviderBottomNavigationBar;
