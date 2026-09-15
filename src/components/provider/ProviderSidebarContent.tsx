
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import Logo from '@/components/shared/Logo';
import { LayoutDashboard, UserCog, Briefcase, DollarSign, Star, Bell, ReceiptText, Banknote, ChevronRight, Wallet } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useLoading } from '@/contexts/LoadingContext';
import { cn } from '@/lib/utils';

const navItems = [
  { type: 'separator', label: 'Main Menu' },
  { href: '/provider', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/provider/profile', label: 'Profile & Settings', icon: UserCog },
  { type: 'separator', label: 'Work & Billing' },
  { href: '/provider/my-jobs', label: 'My Jobs', icon: Briefcase },
  { href: '/provider/quotation-invoice', label: 'Billing', icon: ReceiptText },
  { href: '/provider/earnings', label: 'Earnings', icon: DollarSign },
  { href: '/provider/wallet', label: 'Wallet', icon: Wallet },
  { href: '/provider/withdrawal', label: 'Withdrawal', icon: Banknote },
  { type: 'separator', label: 'Other' },
  { href: '/provider/reviews', label: 'My Reviews', icon: Star },
  { href: '/provider/notifications', label: 'Notifications', icon: Bell },
];

export default function ProviderSidebarContent() {
  const pathname = usePathname();
  const { settings: globalSettings } = useGlobalSettings();
  const { isMobile, setOpenMobile } = useSidebar();
  const { showLoading } = useLoading();

  const handleLinkClick = () => {
    showLoading();
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  return (
    <>
      <SidebarHeader className="p-3 border-b bg-card transition-all duration-300 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center">
        <Logo
          logoUrl={globalSettings?.logoUrl}
          websiteName={globalSettings?.websiteName}
          size="normal"
          href="/provider"
          className="group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:justify-center"
        />
      </SidebarHeader>
      <SidebarContent className="pb-8 overflow-x-hidden">
        <SidebarMenu className="gap-1 px-2 pt-4 group-data-[collapsible=icon]:px-1">
          {navItems.map((item, index) => {
            if (item.type === 'separator') {
              return (
                <div key={`sep-${index}`} className="px-4 py-4 mt-4 mb-1 group-data-[collapsible=icon]:hidden">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em] whitespace-nowrap">{item.label}</span>
                    <div className="h-px w-full bg-accent/20" />
                  </div>
                </div>
              );
            }

            const isActiveRoute = pathname === item.href;
            const IconComponent = item.icon;

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  tooltip={{ children: item.label, side: 'right', align: 'center' }}
                  className={cn(
                    "h-11 transition-all duration-300 rounded-xl px-4 group mb-1 border shadow-sm group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg",
                    isActiveRoute 
                      ? "bg-primary text-primary-foreground font-bold shadow-lg border-primary !opacity-100 hover:bg-primary hover:text-primary-foreground" 
                      : "bg-muted/30 text-slate-700 dark:text-slate-300 hover:bg-muted/60 hover:text-primary hover:translate-x-1 opacity-90 hover:opacity-100 border-border/40 hover:border-primary/20"
                  )}
                >
                  <Link href={item.href!} onClick={handleLinkClick} className="flex items-center w-full group-data-[collapsible=icon]:justify-center">
                    {IconComponent && <IconComponent className={cn("h-4 w-4 shrink-0 transition-transform duration-300", isActiveRoute ? "text-primary-foreground scale-110" : "text-slate-500 dark:text-slate-400 group-hover:text-primary group-hover:scale-110")} />} 
                    <span className="ml-3 truncate flex-grow group-data-[collapsible=icon]:hidden">{item.label}</span>
                    {isActiveRoute && <ChevronRight className="h-3 w-3 text-primary-foreground opacity-80 group-data-[collapsible=icon]:hidden" />}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
    </>
  );
}
