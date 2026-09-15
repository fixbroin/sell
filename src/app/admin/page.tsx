"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  BarChart, DollarSign, ShoppingBag, Users, Loader2, AlertTriangle, 
  UserPlus, TagIcon, History, HandCoins, Search, TrendingUp, Plus, Calendar, ChevronRight, ArrowUpRight, Trash2, RefreshCw
} from "lucide-react";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useToast } from '@/hooks/use-toast';
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from 'framer-motion';
import { cn, formatDateInTimezone, formatTimeInTimezone, formatCurrency } from '@/lib/utils';
import PwaInstallButton from '@/components/shared/PwaInstallButton';
import DashboardTrendingServiceCard from '@/components/admin/DashboardTrendingServiceCard';
import { getDashboardData, type DashboardData, clearSearchHotspots } from '@/lib/adminDashboardUtils';
import { useAuth } from '@/hooks/useAuth';
import { useAdminStats } from '@/hooks/useAdminStats';
import PermissionGuard from '@/components/admin/PermissionGuard';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

const StatCard = ({ title, value, icon: Icon, colorClass, subtitle }: { title: string, value: string | number, icon: any, colorClass: string, subtitle?: string }) => (
  <Card className="overflow-hidden border-none shadow-xl rounded-3xl group transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 bg-card">
    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-3">
      <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</CardTitle>
      <div className={cn("p-2.5 rounded-2xl transition-colors duration-300", colorClass)}>
        <Icon className="h-4 w-4" />
      </div>
    </CardHeader>
    <CardContent className="p-3 pt-0">
      <div className="text-3xl font-black tracking-tight">{value}</div>
      {subtitle && <p className="text-[10px] font-bold text-muted-foreground uppercase mt-2">{subtitle}</p>}
    </CardContent>
    <div className="h-1.5 w-full bg-muted/30">
      <div className={cn("h-full w-full", colorClass.replace('bg-', 'bg-').replace('/10', ''))} />
    </div>
  </Card>
);

export default function AdminDashboardPage() {
  const { user, firestoreUser } = useAuth();
  const { stats: realtimeStats } = useAdminStats();
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const { toast } = useToast();

  const handleSyncStats = async () => {
    setIsSyncing(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/admin/stats/sync', { 
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        toast({ title: "Stats Synced", description: "System totals have been updated based on current database records." });
        loadData();
      }
    } catch (err) {
      toast({ title: "Sync Failed", variant: "destructive" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearSearches = async () => {
    if (!confirm("Are you sure you want to delete all search hotspots? This cannot be undone.")) return;
    
    try {
      const result = await clearSearchHotspots();
      if (result.success) {
        toast({
          title: "Searches Cleared",
          description: "Search hotspots data has been deleted.",
        });
        loadData(); // Refresh the dashboard data
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to clear search hotspots.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Error in handleClearSearches:", err);
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getDashboardData(appConfig?.providerFeeType, appConfig?.providerFeeValue);
      setData(result);
    } catch (err) {
      console.error("Error loading dashboard data:", err);
      setError("Could not load dashboard data.");
    } finally {
      setIsLoading(false);
    }
  }, [appConfig?.providerFeeType, appConfig?.providerFeeValue]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">Initializing Control Center...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="p-4 bg-destructive/10 rounded-full">
          <AlertTriangle className="h-12 w-12 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">System Sync Failed</h2>
        <p className="text-muted-foreground">{error || "Data missing"}</p>
        <Button onClick={() => loadData()} variant="outline">Retry Synchronization</Button>
      </div>
    );
  }

  const { stats, analytics, recentActivities } = data;

  return (
    <motion.div 
      initial="hidden" 
      animate="visible" 
      variants={containerVariants}
      className="space-y-8 pb-10"
    >
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Real-time Insights</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight">{greeting}, {firestoreUser?.displayName || user?.displayName || user?.email?.split('@')[0] || "Admin"}</h1>
          <div className="flex items-center space-x-2 text-muted-foreground text-sm font-medium">
             <Calendar className="h-4 w-4" />
             <span>{format(new Date(), 'EEEE, MMMM do yyyy')}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PwaInstallButton />
          <Button 
            variant="outline" 
            className="rounded-2xl h-12 px-4 border-primary/20 text-primary font-bold hidden sm:flex items-center" 
            onClick={handleSyncStats}
            disabled={isSyncing}
          >
            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Sync Totals
          </Button>
          <Link href="/admin/bookings/create" passHref>
            <Button className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90">
              <Plus className="mr-2 h-4 w-4" /> Create Booking
            </Button>
          </Link>
          <Button variant="outline" className="rounded-2xl h-12 w-12 p-0 border-primary/20 text-primary" onClick={() => loadData()}>
            <ArrowUpRight className={cn("h-5 w-5", isLoading && "animate-spin")} />
          </Button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Revenue" 
            value={formatCurrency(realtimeStats?.completedRevenue ?? stats.completedRevenue, symbol, decimals, code)} 
            icon={DollarSign} 
            colorClass="bg-blue-500/10 text-blue-500" 
            subtitle="Total Completed Sales"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Earnings" 
            value={formatCurrency(realtimeStats?.earnedCommission ?? stats.earnedCommission, symbol, decimals, code)} 
            icon={HandCoins} 
            colorClass="bg-primary/10 text-primary" 
            subtitle="Net Platform Profit"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Bookings" 
            value={realtimeStats?.totalBookings ?? stats.totalBookings} 
            icon={ShoppingBag} 
            colorClass="bg-amber-500/10 text-amber-500" 
            subtitle="Total System Orders"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Users" 
            value={realtimeStats?.activeUsers ?? stats.activeUsers} 
            icon={Users} 
            colorClass="bg-emerald-500/10 text-emerald-500" 
            subtitle="Total Registered Users"
          />
        </motion.div>
        <motion.div variants={itemVariants}>
          <StatCard 
            title="Growth" 
            value={`+${realtimeStats?.newSignups30d ?? stats.newSignups}`} 
            icon={UserPlus} 
            colorClass="bg-indigo-500/10 text-indigo-500" 
            subtitle="New signups (This Month)"
          />
        </motion.div>
      </div>

      <div className="grid gap-8 grid-cols-1 lg:grid-cols-3">
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="h-full border-none shadow-xl rounded-3xl overflow-hidden bg-card">
            <CardHeader className="p-8 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black tracking-tight flex items-center">
                    <History className="mr-3 h-6 w-6 text-primary" /> Live Activity
                  </CardTitle>
                  <CardDescription className="font-medium">Real-time system events and interactions</CardDescription>
                </div>
                <Link href="/admin/activity-feed" className="text-xs font-black text-primary uppercase tracking-widest hover:underline">View All</Link>
              </div>
            </CardHeader>
            <CardContent className="p-8 pt-4">
              <div className="relative space-y-8">
                <div className="absolute left-6 top-2 bottom-2 w-0.5 bg-muted/50" />
                {recentActivities.map((activity: any) => (
                  <Link key={activity.id} href={activity.href || '#'} className="relative flex items-center group">
                    <div className="z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-card border-2 border-muted shadow-sm group-hover:border-primary/50 group-hover:scale-110 transition-all duration-300">
                      {activity.type === 'new_booking' ? <TagIcon className="h-4 w-4 text-primary" /> : <UserPlus className="h-4 w-4 text-emerald-500" />}
                    </div>
                    <div className="ml-6 flex-grow p-4 rounded-2xl bg-muted/30 border border-border/40 group-hover:bg-primary/[0.03] group-hover:border-primary/10 transition-all duration-300 shadow-sm">
                      <div className="flex justify-between items-center mb-1">
                        <p className="text-sm font-bold tracking-tight">{activity.title}</p>
                        <span className="text-[10px] font-black text-muted-foreground uppercase bg-background/80 px-2 py-0.5 rounded-full border shadow-sm">
                          {formatTimeInTimezone(activity.timestamp, appConfig?.timezone)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">{activity.description}</p>
                    </div>
                    <ChevronRight className="ml-4 h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-all" />
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
        
        <div className="space-y-8">
          <motion.div variants={itemVariants}>
            <Card className="border-none shadow-xl rounded-3xl bg-card">
              <CardHeader className="p-8 pb-4">
                <CardTitle className="text-xl font-black tracking-tight flex items-center">
                  <TrendingUp className="mr-3 h-5 w-5 text-primary"/> Trending Services
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-8 pt-0">
                <ScrollArea className="h-[400px]">
                  <div className="flex flex-col gap-3 pr-4 pb-4">
                    {analytics.topServices.map((service: any, idx: number) => (
                      <DashboardTrendingServiceCard 
                        key={service.id} 
                        service={service} 
                        rank={idx + 1} 
                        maxCount={analytics.topServices[0]?.count || 1} 
                      />
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="border-none shadow-xl rounded-3xl bg-card">
              <CardHeader className="p-8 pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-black tracking-tight flex items-center">
                    <Search className="mr-3 h-5 w-5 text-primary"/> Search Hotspots
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-all"
                    onClick={handleClearSearches}
                    title="Clear All Searches"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-8 pt-0">
                <ScrollArea className="h-[300px]">
                  <div className="flex flex-wrap gap-2 pr-4">
                    {analytics.topSearchTerms.map((s, idx) => (
                      <div 
                        key={s.term} 
                        className={cn(
                          "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-tight transition-all cursor-default",
                          idx === 0 ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 hover:bg-muted"
                        )}
                      >
                        {s.term} <span className="ml-1 opacity-50">• {s.count}</span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
