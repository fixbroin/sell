
"use client"

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
import { LayoutGrid, List, Layers, Settings, Users, ShoppingBag, Tag, BarChart3, PlaySquare, Settings2, HelpCircle, MessageSquare, ListChecks, Percent, UserCircle as UserProfileIcon, Target, Map, HandCoins, Megaphone, Bell, Activity, Palette, MessageCircle as ChatIcon, Mail, Zap, Receipt, Tv, Users2, MapPin, Cookie, Globe2, KeyRound, Database, FileText, Construction, Handshake, Banknote, ChevronRight, RefreshCw, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useLoading } from '@/contexts/LoadingContext';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { hasPathAccess } from '@/config/rbac';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: LayoutGrid },
  { href: '/admin/profile', label: 'Admin Profile', icon: UserProfileIcon },
  { href: '/admin/notifications', label: 'Admin Notifications', icon: Bell },
  { href: '/admin/activity-feed', label: 'Activity Feed', icon: Activity },
  { href: '/admin/visitor-info', label: 'Visitor Info', icon: Globe2 },
  { href: '/admin/manage-admins', label: 'Staff Management', icon: ShieldCheck },
  { type: 'separator', label: 'Core Management' },
  { href: '/admin/bookings', label: 'Bookings', icon: Tag },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/inquiries', label: 'Inquiries', icon: Mail },
  { href: '/admin/chat', label: 'Chat Management', icon: ChatIcon },
  { href: '/admin/custom-service', label: 'Custom Requests', icon: Construction },
  { type: 'separator', label: 'Provider Management' },
  { href: '/admin/provider-applications', label: 'Provider Applications', icon: Users2 },
  { href: '/admin/provider-withdrawals', label: 'Wallet & Withdrawal Complaint', icon: Banknote },
  { href: '/admin/provider-controls', label: 'Provider Controls', icon: Settings },
  { type: 'separator', label: 'Content Management' },
  { href: '/admin/categories', label: 'Categories', icon: List },
  { href: '/admin/sub-categories', label: 'Sub-Categories', icon: Layers },
  { href: '/admin/services', label: 'Services', icon: ShoppingBag },
  { href: '/admin/slideshows', label: 'Slideshows', icon: PlaySquare },
  { href: '/admin/blog', label: 'Blog', icon: FileText },
  { href: '/admin/reviews', label: 'Reviews', icon: MessageSquare },
  { href: '/admin/faq', label: 'FAQ', icon: HelpCircle },
  { type: 'separator', label: 'Location & SEO' },
  { href: '/admin/cities', label: 'Cities', icon: Map },
  { href: '/admin/areas', label: 'Areas', icon: MapPin },
  { href: '/admin/service-zones', label: 'Service Zones', icon: Globe2 },
  { href: '/admin/seo-settings', label: 'Global SEO Patterns', icon: Target },
  { href: '/admin/seo-overrides', label: 'Advanced SEO', icon: Zap },
  { href: '/admin/service-seo', label: 'Service-wise SEO', icon: Layers },
  { href: '/admin/google-indexing', label: 'Google Indexing', icon: Globe2 },
  { type: 'separator', label: 'Operations & Finance' },
  { href: '/admin/referral-settings', label: 'Referral System', icon: Handshake },
  { href: '/admin/quotation-invoice', label: 'Quotation & Invoice', icon: Receipt },
  { href: '/admin/taxes', label: 'Tax Configurations', icon: Percent },
  { href: '/admin/platform-settings', label: 'Platform Fees', icon: HandCoins },
  { href: '/admin/time-slots', label: 'Time Slot Limits', icon: ListChecks },
  { href: '/admin/reports', label: 'Booking Reports', icon: BarChart3 },
  { type: 'separator', label: 'Homepage & Marketing' },
  { href: '/admin/features', label: 'Homepage Features', icon: Tv },
  { href: '/admin/marketing-settings', label: 'Marketing IDs', icon: Megaphone },
  { href: '/admin/marketing-automation', label: 'Marketing Automation', icon: Megaphone },
  { href: '/admin/whatsapp-settings', label: 'WhatsApp Settings', icon: MessageSquare },
  { href: '/admin/newsletter-popups', label: 'Newsletter Popups', icon: Megaphone },
  { href: '/admin/promo-codes', label: 'Promo Codes', icon: Percent },
  { type: 'separator', label: 'System Settings' },
  { href: '/admin/theme-settings', label: 'Theme Settings', icon: Palette },
  { href: '/admin/image-gallery', label: 'Image Gallery', icon: ImageIcon },
  { href: '/admin/settings', label: 'App Settings', icon: Settings },
  { href: '/admin/email-settings', label: 'Email Settings', icon: Mail },
  { href: '/admin/push-settings', label: 'Push Settings', icon: Bell },
  { href: '/admin/login-settings', label: 'Login Settings', icon: KeyRound },
  { href: '/admin/web-settings', label: 'Web Settings', icon: Settings2 },
  { href: '/admin/cookie-settings', label: 'Cookie Settings', icon: Cookie },
  { href: '/admin/database-tools', label: 'Database Tools', icon: Database },
  { href: '/admin/system-logs', label: 'System Logs', icon: FileText },
  { href: '/admin/api-docs', label: 'API Reference', icon: Globe2 },
];

export default function AdminSidebarContent() {
  const pathname = usePathname();
  const { settings: globalSettings } = useGlobalSettings();
  const { isMobile, setOpenMobile } = useSidebar();
  const { showLoading } = useLoading();
  const { user, adminPermissions, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Restore scroll position from sessionStorage
    const savedScroll = sessionStorage.getItem('admin-sidebar-scroll');
    if (savedScroll) {
      container.scrollTop = parseInt(savedScroll, 10);
    }

    // Save scroll position on scroll (debounced by 150ms)
    let timeoutId: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (scrollContainerRef.current) {
          sessionStorage.setItem('admin-sidebar-scroll', scrollContainerRef.current.scrollTop.toString());
        }
      }, 150);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(timeoutId);
    };
  }, []);

  // Filter navItems based on granular permissions
  const filteredNavItems = navItems.filter(item => {
    if (item.type === 'separator') return true;
    return hasPathAccess(adminPermissions, item.href!);
  });

  // Remove trailing separators or double separators
  const cleanedNavItems = filteredNavItems.filter((item, index, self) => {
    if (item.type === 'separator') {
      const nextItem = self[index + 1];
      if (!nextItem || nextItem.type === 'separator') return false;
    }
    return true;
  });

  const handleLinkClick = () => {
    showLoading();
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const handleRefreshCache = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/admin/clear-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ tag: 'all' }),
      });

      const result = await response.json();
      if (result.success) {
        toast({
          title: "Cache Cleared",
          description: "Website cache has been completely refreshed.",
        });
      } else {
        throw new Error(result.error);
      }
    } catch (error: any) {
      toast({
        title: "Refresh Failed",
        description: error.message || "Could not clear cache.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const uniqueTopLevelAdminPages = [
    '/admin', '/admin/profile', '/admin/notifications', '/admin/activity-feed',
    '/admin/theme-settings', '/admin/newsletter-popups', '/admin/chat', '/admin/inquiries',
    '/admin/seo-overrides', '/admin/quotation-invoice', '/admin/features',
    '/admin/provider-controls', 
    '/admin/provider-applications', 
    '/admin/cookie-settings', 
    '/admin/visitor-info',
    '/admin/login-settings',
    '/admin/database-tools',
    '/admin/service-zones',
    '/admin/blog',
    '/admin/custom-service',
    '/admin/marketing-automation',
    '/admin/marketing-settings', 
    '/admin/whatsapp-settings',
    '/admin/referral-settings',
    '/admin/provider-withdrawals',
    '/admin/reviews',
  ];


  return (
    <>
      <SidebarHeader className="p-4 md:p-3 border-b bg-card transition-all duration-300 group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:items-center">
        <Logo
          logoUrl={globalSettings?.logoUrl}
          websiteName={globalSettings?.websiteName}
          href="/admin"
          className="group-data-[collapsible=icon]:mr-0 group-data-[collapsible=icon]:justify-center"
        />
      </SidebarHeader>
      <SidebarContent ref={scrollContainerRef} className="pb-8 overflow-x-hidden">
        <SidebarMenu className="gap-1 px-2 pt-4 group-data-[collapsible=icon]:px-1">
          {cleanedNavItems.map((item, index) => {
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
            let isActiveRoute = pathname === item.href;
            if (uniqueTopLevelAdminPages.includes(item.href!)) {
                isActiveRoute = pathname === item.href;
            } else if (item.href !== '/admin') {
                isActiveRoute = pathname.startsWith(item.href!);
            }

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

        {isSuperAdmin && (
          <div className="px-4 mt-8 mb-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
              <div className="flex items-center gap-3 mb-4 group-data-[collapsible=icon]:hidden">
                  <span className="text-[10px] font-black text-accent uppercase tracking-[0.2em] whitespace-nowrap">Cache Control</span>
                  <div className="h-px w-full bg-accent/20" />
              </div>
              <button
                  onClick={handleRefreshCache}
                  disabled={isRefreshing}
                  title="Clear System Cache"
                  className="w-full flex items-center h-11 transition-all duration-300 rounded-xl px-4 group bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive hover:text-white shadow-sm disabled:opacity-50 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:h-10"
              >
                  <RefreshCw className={cn("h-4 w-4 shrink-0 transition-transform duration-700", isRefreshing && "animate-spin")} />
                  <span className="ml-3 truncate font-bold text-sm group-data-[collapsible=icon]:hidden">Clear System Cache</span>
              </button>
          </div>
        )}
      </SidebarContent>
    </>
  );
}
