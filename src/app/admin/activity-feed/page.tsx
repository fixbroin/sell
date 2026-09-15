"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Loader2, Activity, UserCircle, Home, ShoppingCart, FileText, UserPlus, 
  Tag, Zap, CalendarCheck2, LogOut, Trash2 as TrashIcon, AlertTriangle, 
  Clock, RefreshCcw, ChevronRight, ExternalLink, ShieldCheck, User, Map as MapIcon, PackageSearch,
  CheckCircle, XCircle, PlayCircle
} from "lucide-react";
import type { UserActivity, FirestoreUser } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, Timestamp, limit, getDocs, writeBatch, where, documentId, startAfter, getDoc, doc, type DocumentSnapshot, deleteDoc, onSnapshot } from '@/lib/mysqlDb';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn, formatDateInTimezone, formatTimeInTimezone, formatCurrency } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { motion, AnimatePresence } from 'framer-motion';
import { getArchivedActivities } from '@/lib/adminDashboardUtils';
import { triggerRefresh } from '@/lib/revalidateUtils';


import { getTimestampMillis } from '@/lib/utils';

interface GroupedUserActivity extends UserActivity {
  _isGrouped?: boolean;
  _totalQuantity?: number;
  _groupCount?: number;
  userDisplayName?: string; // Denormalized name
}

const EventBadge = ({ eventType }: { eventType: UserActivity['eventType'] }) => {
  const configs: Record<string, { icon: any, color: string, bg: string, label: string }> = {
    newUser: { icon: UserPlus, color: 'text-green-600', bg: 'bg-green-500/10', label: 'New User' },
    userLogin: { icon: UserCircle, color: 'text-blue-600', bg: 'bg-blue-500/10', label: 'Login' },
    userLogout: { icon: LogOut, color: 'text-red-600', bg: 'bg-red-500/10', label: 'Logout' },
    pageView: { icon: Home, color: 'text-indigo-600', bg: 'bg-indigo-500/10', label: 'Page View' },
    addToCart: { icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-500/10', label: 'Cart Add' },
    removeFromCart: { icon: TrashIcon, color: 'text-pink-600', bg: 'bg-pink-500/10', label: 'Cart Remove' },
    newBooking: { icon: Tag, color: 'text-teal-600', bg: 'bg-teal-500/10', label: 'Booking' },
    checkoutStep: { icon: Zap, color: 'text-purple-600', bg: 'bg-purple-500/10', label: 'Checkout' },
    adminAction: { icon: CalendarCheck2, color: 'text-slate-600', bg: 'bg-slate-500/10', label: 'Admin' },
    timeOnPage: { icon: Clock, color: 'text-slate-500', bg: 'bg-slate-500/5', label: 'Time Spent' },
    providerAcceptJob: { icon: ShieldCheck, color: 'text-blue-600', bg: 'bg-blue-500/10', label: 'Provider Accept' },
    providerRejectJob: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-500/10', label: 'Provider Reject' },
    providerStartWork: { icon: PlayCircle, color: 'text-amber-600', bg: 'bg-amber-500/10', label: 'Work Started' },
    providerCompleteWork: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-500/10', label: 'Work Completed' },
  };

  const config = configs[eventType] || { icon: Activity, color: 'text-gray-500', bg: 'bg-gray-500/10', label: eventType };
  const Icon = config.icon;

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-transparent font-bold text-[10px] uppercase tracking-wider shadow-sm", config.bg, config.color)}>
      <Icon className="h-3 w-3" />
      <span>{config.label}</span>
    </div>
  );
};

const formatTimestamp = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return formatDistanceToNow(new Date(millis), { addSuffix: true });
};

export default function AdminActivityFeedPage() {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [cachedActivities, setCachedActivities] = useState<UserActivity[]>([]);
  const [liveActivities, setLiveActivities] = useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const [outOfZoneRequests, setOutOfZoneRequests] = useState<UserActivity[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [isDeletingRequest, setIsDeletingRequest] = useState<string | null>(null);

  useEffect(() => {
    setIsLoadingRequests(true);
    const q = query(
      collection(db, "outOfZoneRequests"),
      orderBy("timestamp", "desc"),
      limit(150)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as UserActivity));
      setOutOfZoneRequests(items);
      setIsLoadingRequests(false);
    }, (error) => {
      console.error("Error loading out-of-coverage requests:", error);
      setIsLoadingRequests(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteRequest = async (id: string) => {
    setIsDeletingRequest(id);
    try {
      await deleteDoc(doc(db, "outOfZoneRequests", id));
      toast({ title: "Success", description: "Request record deleted successfully." });
    } catch (error) {
      console.error("Error deleting request:", error);
      toast({ title: "Error", description: "Could not delete request record.", variant: "destructive" });
    } finally {
      setIsDeletingRequest(null);
    }
  };

  const formatActivityTimestamp = useCallback((timestamp?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return `${formatDateInTimezone(millis, appConfig?.timezone, { day: '2-digit', month: 'short' })} ${formatTimeInTimezone(millis, appConfig?.timezone)}`;
  }, [appConfig?.timezone]);
  const loadCachedData = useCallback(async () => {
    try {
      const result = await getArchivedActivities();
      setCachedActivities(result);
    } catch (err) {
      console.error("Error loading activity feed cache:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 2. Setup Live Listener (Real-time for ONLY the latest 20 items)
  useEffect(() => {
    loadCachedData();

    const q = query(collection(db, "userActivities"), orderBy("timestamp", "desc"), limit(20));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLive = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as UserActivity));
      setLiveActivities(newLive);
    }, (error) => {
      console.error("Live listener error:", error);
    });

    return () => unsubscribe();
  }, [loadCachedData]);

  // 3. Merge Live and Cached data (Deduplicated)
  const activities = useMemo(() => {
    const combined = [...liveActivities, ...cachedActivities];
    // Use a Map to ensure unique IDs (live data takes priority)
    const uniqueMap = new Map(combined.map(a => [a.id, a]));
    return Array.from(uniqueMap.values()).sort((a, b) => {
        return getTimestampMillis(b.timestamp) - getTimestampMillis(a.timestamp);
    });
  }, [liveActivities, cachedActivities]);

  // Fetch missing user names
  useEffect(() => {
    const uidsToFetch = Array.from(new Set(
      activities
        .filter(a => a.userId && (!a.userDisplayName || a.userDisplayName === 'Registered User'))
        .map(a => a.userId)
    )).filter(uid => uid && !userNames[uid]) as string[];

    if (uidsToFetch.length === 0) return;

    const fetchNames = async () => {
      const newUserNames = { ...userNames };
      // Process in small chunks to avoid massive concurrent requests or complex queries
      for (const uid of uidsToFetch) {
        try {
          const userDoc = await getDoc(doc(db, "users", uid));
          if (userDoc.exists()) {
            const userData = userDoc.data() as FirestoreUser;
            newUserNames[uid] = userData.displayName || userData.email || 'Registered User';
          } else {
            newUserNames[uid] = 'Registered User';
          }
        } catch (err) {
          console.error(`Error fetching user ${uid}:`, err);
          newUserNames[uid] = 'Registered User';
        }
      }
      setUserNames(newUserNames);
    };

    fetchNames();
  }, [activities, userNames]);


  const displayActivities = useMemo(() => {
    const result: GroupedUserActivity[] = [];
    activities.forEach((activity) => {
      // Add the real name if we have it in our map
      const enhancedActivity = { ...activity } as GroupedUserActivity;
      if (enhancedActivity.userId && userNames[enhancedActivity.userId]) {
        enhancedActivity.userDisplayName = userNames[enhancedActivity.userId];
      }

      const prev = result[result.length - 1];
      const isSameUser = prev && (
        (enhancedActivity.userId && enhancedActivity.userId === prev.userId) || 
        (enhancedActivity.guestId && enhancedActivity.guestId === prev.guestId)
      );
      
      const isGroupableType = enhancedActivity.eventType === 'addToCart' || enhancedActivity.eventType === 'removeFromCart';
      
      if (isSameUser && prev.eventType === enhancedActivity.eventType && isGroupableType && prev.eventData.serviceId === enhancedActivity.eventData.serviceId) {
        prev._isGrouped = true;
        prev._groupCount = (prev._groupCount || 1) + 1;
        if (enhancedActivity.eventData.quantity) {
          prev._totalQuantity = (prev._totalQuantity || prev.eventData.quantity || 0) + enhancedActivity.eventData.quantity;
        }
      } else {
        const newActivity = { ...enhancedActivity } as GroupedUserActivity;
        if (isGroupableType) {
          newActivity._totalQuantity = enhancedActivity.eventData.quantity;
          newActivity._groupCount = 1;
        }
        result.push(newActivity);
      }
    });
    return result;
  }, [activities, userNames]);

  // Separate activities into Customer and Provider activities
  const customerActivities = useMemo(() => {
    return displayActivities.filter(a => {
      const isProvider = a.eventType.startsWith('provider') || 
                         a.eventData?.pageUrl?.startsWith('/provider') || 
                         a.eventData?.pageUrl?.includes('/provider');
      return !isProvider;
    });
  }, [displayActivities]);

  const providerActivities = useMemo(() => {
    return displayActivities.filter(a => {
      const isProvider = a.eventType.startsWith('provider') || 
                         a.eventData?.pageUrl?.startsWith('/provider') || 
                         a.eventData?.pageUrl?.includes('/provider');
      return isProvider;
    });
  }, [displayActivities]);

  const handleClearAllActivities = async () => {
    setIsClearing(true);
    try {
      const activitiesCollectionRef = collection(db, "userActivities");
      const querySnapshot = await getDocs(activitiesCollectionRef);
      
      if (querySnapshot.empty) {
        toast({ title: "No Activities", description: "There are no activities to clear.", variant: "default" });
        setIsClearing(false);
        return;
      }

      const batchArray = [];
      let currentBatch = writeBatch(db);
      let currentBatchSize = 0;

      querySnapshot.docs.forEach((doc) => {
        currentBatch.delete(doc.ref);
        currentBatchSize++;
        if (currentBatchSize === 500) { 
          batchArray.push(currentBatch);
          currentBatch = writeBatch(db);
          currentBatchSize = 0;
        }
      });

      if (currentBatchSize > 0) {
        batchArray.push(currentBatch);
      }

      for (const batch of batchArray) {
        await batch.commit();
      }
      
      // SmartSync: Clear the server-side cache
      await triggerRefresh('activities');
      await triggerRefresh('global-cache');
      
      // Clear local state immediately
      
      setLiveActivities([]);
      setCachedActivities([]);
      toast({ title: "Activities Cleared", description: "All user activities have been cleared." });
    } catch (error) {
      console.error("Error clearing activities: ", error);
      toast({ title: "Error Clearing Activities", description: (error as Error).message || "Could not clear all activities.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const renderEventData = (activity: GroupedUserActivity) => {
    const data = activity.eventData;
    const isGrouped = activity._isGrouped;
    const totalQty = activity._totalQuantity;

    switch (activity.eventType) {
      case 'pageView':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">{data.pageUrl || 'N/A'}</span>
            <Link href={data.pageUrl || '#'} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-primary/10 rounded-md transition-colors">
              <ExternalLink className="h-3 w-3 text-primary" />
            </Link>
          </div>
        );
      case 'timeOnPage':
        return <span className="text-xs font-medium">Spent <span className="text-primary">{data.durationSeconds}s</span> on {data.pageUrl || 'a page'}</span>;
      case 'addToCart':
        return (
          <span className="text-xs font-medium">
            Added <span className="text-orange-600">{data.serviceName}</span> 
            {isGrouped ? (
              <span className="ml-2 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-[10px] font-black uppercase tracking-tighter">
                Total: {totalQty}
              </span>
            ) : (
              ` (Qty: ${data.quantity})`
            )}
          </span>
        );
      case 'removeFromCart':
        return (
          <span className="text-xs font-medium text-pink-600">
            Removed {data.serviceName}
            {isGrouped && (
              <span className="ml-2 px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-[10px] font-black uppercase tracking-tighter">
                Total: {totalQty}
              </span>
            )}
          </span>
        );
      case 'newBooking':
        return (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-teal-600">{formatCurrency(data.totalAmount || 0, symbol, decimals, code)}</span>
            <Link href={`/admin/bookings/edit/${data.bookingDocId || '#'}`} className="text-xs font-bold text-blue-600 hover:underline flex items-center">
              {data.bookingId} <ChevronRight className="h-3 w-3 ml-0.5" />
            </Link>
          </div>
        );
      case 'newUser':
        return <span className="text-xs font-bold text-green-600">{data.email || data.mobileNumber}</span>;
      case 'userLogin':
        return (
          <span className="text-xs font-medium">
            via {data.email || data.mobileNumber || data.loginMethod || 'Auth'}
            {data.loginMethod && (data.email || data.mobileNumber) && (
              <span className="ml-1 text-[10px] text-muted-foreground uppercase opacity-70">({data.loginMethod})</span>
            )}
          </span>
        );
      case 'userLogout':
        return <span className="text-xs text-muted-foreground italic">Logout ({data.logoutMethod})</span>;
      case 'checkoutStep':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-purple-600 uppercase tracking-tighter">{data.checkoutStepName || 'Checkout'}</span>
            {data.checkoutStepName === 'time_slot_selected' && (data.scheduledDate || data.scheduledSlot) && (
              <span className="text-[11px] text-muted-foreground font-medium">
                Date: <strong className="text-foreground">{data.scheduledDate}</strong> | Slot: <strong className="text-foreground">{data.scheduledSlot}</strong>
              </span>
            )}
            {data.checkoutStepName === 'address_selected' && data.fullName && (
              <span className="text-[11px] text-muted-foreground font-medium">
                Name: <strong className="text-foreground">{data.fullName}</strong> ({data.city || 'N/A'})
              </span>
            )}
            {data.checkoutStepName === 'payment_method_selected' && data.paymentMethod && (
              <span className="text-[11px] text-muted-foreground font-medium">
                Method: <strong className="text-foreground">{data.paymentMethod}</strong>
              </span>
            )}
          </div>
        );
      case 'providerAcceptJob':
        return (
          <span className="text-xs font-medium">
            Accepted job{' '}
            <Link href={`/admin/bookings/edit/${data.bookingId || '#'}`} className="text-xs font-bold text-blue-600 hover:underline">
              {data.bookingId}
            </Link>
          </span>
        );
      case 'providerRejectJob':
        return (
          <span className="text-xs font-medium text-destructive">
            Rejected job{' '}
            <Link href={`/admin/bookings/edit/${data.bookingId || '#'}`} className="text-xs font-bold text-blue-600 hover:underline">
              {data.bookingId}
            </Link>
          </span>
        );
      case 'providerStartWork':
        return (
          <span className="text-xs font-medium text-amber-600">
            Started work on{' '}
            <Link href={`/admin/bookings/edit/${data.bookingId || '#'}`} className="text-xs font-bold text-blue-600 hover:underline">
              {data.bookingId}
            </Link>
          </span>
        );
      case 'providerCompleteWork':
        return (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold text-green-600">
              Completed work on{' '}
              <Link href={`/admin/bookings/edit/${data.bookingId || '#'}`} className="text-xs font-bold text-blue-600 hover:underline">
                {data.bookingId}
              </Link>
            </span>
            {data.paymentMethod && (
              <span className="text-[11px] text-muted-foreground font-medium">
                Payment: <strong className="text-foreground">{data.paymentMethod}</strong>
              </span>
            )}
            {data.additionalCharges && data.additionalCharges.length > 0 && (
              <span className="text-[11px] text-muted-foreground font-medium">
                Extra: <strong className="text-foreground">+{data.additionalCharges.reduce((sum: number, c: any) => sum + c.amount, 0)}</strong>
              </span>
            )}
          </div>
        );
      default:
        return <code className="text-[10px] bg-muted/50 p-1 px-2 rounded font-mono text-muted-foreground break-all">{JSON.stringify(data)}</code>;
    }
  };

  const renderActivityList = (activitiesList: GroupedUserActivity[], typeLabel: string) => {
    if (isLoading && activities.length === 0) {
      return (
        <div className="flex flex-col justify-center items-center h-[400px] space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Syncing Cache...</p>
        </div>
      );
    }

    if (activitiesList.length === 0) {
      return (
        <div className="text-center py-32 bg-muted/5">
          <Activity className="h-16 w-16 mx-auto text-muted-foreground/20 mb-6" />
          <p className="text-xl font-bold tracking-tight">No {typeLabel} Captured</p>
          <p className="text-muted-foreground text-sm mt-1">Activities will appear here after the next sync.</p>
        </div>
      );
    }

    return (
      <>
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent border-none">
                <TableHead className="w-[180px] pl-8 py-5 text-[10px] font-black uppercase tracking-widest">Type</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest">Interaction</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest">User Identity</TableHead>
                <TableHead className="text-right pr-8 text-[10px] font-black uppercase tracking-widest">Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {activitiesList.map((activity, idx) => (
                  <motion.tr
                    key={activity.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3, delay: idx < 10 ? idx * 0.05 : 0 }}
                    className="group border-b border-muted/40 transition-all hover:bg-primary/[0.02]"
                  >
                    <TableCell className="pl-8 py-4">
                      <EventBadge eventType={activity.eventType} />
                    </TableCell>
                    <TableCell className="font-medium text-slate-700 dark:text-slate-300">
                      {renderEventData(activity)}
                    </TableCell>
                    <TableCell>
                      {renderUserCell(activity)}
                    </TableCell>
                    <TableCell className="text-right pr-8">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
                          {formatActivityTimestamp(activity.timestamp)}
                        </span>
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>

        {/* Mobile View: Cards */}
        <div className="md:hidden">
          <AnimatePresence initial={false}>
            {activitiesList.map((activity, idx) => renderMobileCard(activity, idx))}
          </AnimatePresence>
        </div>
      </>
    );
  };

  const renderUserCell = (activity: GroupedUserActivity) => {
    const isGuest = !activity.userId;
    const name = activity.userDisplayName || (isGuest ? 'Guest User' : 'Registered User');
    
    return (
      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8 border shadow-sm shrink-0">
          <AvatarFallback className={cn("text-[10px] font-black uppercase", isGuest ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary")}>
            {isGuest ? <User className="h-4 w-4" /> : name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-bold truncate tracking-tight">{name}</p>
            {!isGuest && <ShieldCheck className="h-3 w-3 text-blue-500" />}
          </div>
          <p className="text-[9px] text-muted-foreground font-mono truncate max-w-[120px]" title={activity.userId || activity.guestId || ""}>
            {activity.userId || activity.guestId}
          </p>
        </div>
      </div>
    );
  };

  const renderMobileCard = (activity: GroupedUserActivity, idx: number) => (
    <motion.div
      key={activity.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: idx < 10 ? idx * 0.05 : 0 }}
      className="p-5 border-b last:border-none bg-card hover:bg-muted/30 transition-colors"
    >
      <div className="flex justify-between items-start mb-4">
        <EventBadge eventType={activity.eventType} />
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter">
            {formatActivityTimestamp(activity.timestamp)}
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-muted/20 p-3 rounded-2xl border border-dashed border-muted-foreground/20">
          <Avatar className="h-10 w-10 border shadow-sm shrink-0">
            <AvatarFallback className={cn("text-xs font-black uppercase", !activity.userId ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary")}>
              {!activity.userId ? <User className="h-4 w-4" /> : (activity.userDisplayName || 'U').charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold truncate tracking-tight">
                {activity.userDisplayName || (activity.userId ? 'Registered User' : 'Guest User')}
              </p>
              {activity.userId && <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />}
            </div>
            <p className="text-[10px] text-muted-foreground font-mono truncate break-all" title={activity.userId || activity.guestId || ""}>
              {activity.userId || activity.guestId}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-primary/[0.03] border border-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">Interaction Details</span>
          </div>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {renderEventData(activity)}
          </div>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="space-y-8 pb-10">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2 border-b">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">Platform History</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight flex items-center">
            Activity Feed
          </h1>
          <p className="text-muted-foreground text-sm font-medium">Archived stream of all platform events. (Refreshed hourly)</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-card border shadow-sm p-2 rounded-2xl">
          <Button variant="outline" size="sm" className="h-10 rounded-xl font-bold text-xs" onClick={() => loadCachedData()} disabled={isLoading}>
            <RefreshCcw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
            Sync Now
          </Button>

          <PermissionGuard moduleId="activity_feed" action="delete">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-10 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive font-bold text-xs" disabled={isLoading || isClearing || activities.length === 0}>
                  {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TrashIcon className="mr-2 h-4 w-4" />}
                  Delete All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-3xl p-8">
                <AlertDialogHeader>
                  <div className="bg-destructive/10 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <AlertDialogTitle className="text-2xl font-bold tracking-tight text-destructive uppercase">Confirm Full Purge</AlertDialogTitle>
                  <AlertDialogDescription className="text-base font-medium">
                    This will permanently wipe ALL recorded user activities from the system. This operation cannot be reversed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="mt-8 gap-3">
                  <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80">Keep Data</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearAllActivities} className="rounded-xl bg-destructive hover:bg-destructive/90 px-8">
                    Erase Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </PermissionGuard>
        </div>
      </header>

      <Tabs defaultValue="customer-feed" className="w-full">
        <div className="w-full overflow-x-auto pb-1 mb-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <TabsList className="bg-muted p-1 rounded-xl flex w-max gap-1">
            <TabsTrigger value="customer-feed" className="font-bold text-xs uppercase px-5 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Customer Feed ({customerActivities.length})
            </TabsTrigger>
            <TabsTrigger value="provider-feed" className="font-bold text-xs uppercase px-5 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
              Provider Feed ({providerActivities.length})
            </TabsTrigger>
            <TabsTrigger value="out-of-coverage" className="font-bold text-xs uppercase px-5 py-2 rounded-lg flex items-center gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Out-of-Coverage Requests ({outOfZoneRequests.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="customer-feed">
          <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card">
            <CardContent className="p-0">
              {renderActivityList(customerActivities, 'Customer Events')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="provider-feed">
          <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card">
            <CardContent className="p-0">
              {renderActivityList(providerActivities, 'Provider Events')}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="out-of-coverage">
          <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-card">
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-2xl flex items-center"><AlertTriangle className="mr-2 h-6 w-6 text-amber-500" />Out-of-Coverage Requests</CardTitle>
              <CardDescription>Locations outside active service zones where users tried to request bookings.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingRequests ? (
                <div className="flex flex-col justify-center items-center h-[300px] space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary/40" />
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Loading Requests...</p>
                </div>
              ) : outOfZoneRequests.length === 0 ? (
                <div className="text-center py-20 bg-muted/5">
                  <PackageSearch className="mx-auto h-12 w-12 mb-3 text-muted-foreground/30" />
                  <p className="font-bold text-lg">No requests captured</p>
                  <p className="text-muted-foreground text-sm">No out-of-coverage requests recorded yet.</p>
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/30">
                        <TableRow className="hover:bg-transparent border-none">
                          <TableHead className="pl-8 py-5 text-[10px] font-black uppercase tracking-widest">User Name</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest">Address Details</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest">Coordinates</TableHead>
                          <TableHead className="text-[10px] font-black uppercase tracking-widest">Timestamp</TableHead>
                          <TableHead className="text-right pr-8 text-[10px] font-black uppercase tracking-widest">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <AnimatePresence initial={false}>
                          {outOfZoneRequests.map((request) => (
                            <TableRow key={request.id} className="group border-b border-muted/40 transition-all hover:bg-primary/[0.02]">
                              <TableCell className="pl-8 py-4 font-bold text-foreground">{request.userDisplayName || 'Guest User'}</TableCell>
                              <TableCell className="text-xs font-medium">
                                {request.eventData?.addressLine1 || request.eventData?.city || 'N/A'}
                                {request.eventData?.pincode ? ` - ${request.eventData.pincode}` : ''}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {request.eventData?.latitude?.toFixed(5) || 'N/A'}, {request.eventData?.longitude?.toFixed(5) || 'N/A'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-semibold">
                                {formatActivityTimestamp(request.timestamp)}
                              </TableCell>
                              <TableCell className="pr-8 text-right">
                                <div className="flex justify-end gap-2">
                                  {request.eventData?.latitude && request.eventData?.longitude ? (
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-9 w-9 rounded-xl hover:bg-primary hover:text-primary-foreground transition-all duration-300 shadow-sm border border-primary/10"
                                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${request.eventData.latitude},${request.eventData.longitude}`, '_blank')}
                                      title="Open Map"
                                    >
                                      <MapIcon className="h-4 w-4" />
                                    </Button>
                                  ) : null}
                                  <PermissionGuard moduleId="activity_feed" action="delete">
                                    <Button 
                                      variant="ghost" 
                                      size="icon"
                                      className="h-9 w-9 rounded-xl hover:bg-destructive hover:text-destructive-foreground transition-all duration-300 shadow-sm border border-destructive/10"
                                      disabled={!request.id || isDeletingRequest === request.id} 
                                      onClick={() => request.id && handleDeleteRequest(request.id)}
                                      title="Delete"
                                    >
                                      {isDeletingRequest === request.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <TrashIcon className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </PermissionGuard>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </AnimatePresence>
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="block md:hidden">
                    <AnimatePresence initial={false}>
                      {outOfZoneRequests.map((request) => (
                        <div key={request.id} className="p-5 border-b last:border-none bg-card hover:bg-muted/30 transition-colors">
                          <div className="flex justify-between items-start mb-4">
                            <div className="space-y-1">
                              <p className="font-bold text-base text-foreground leading-none">
                                {request.userDisplayName || 'Guest User'}
                              </p>
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-tighter mt-1">
                                {formatActivityTimestamp(request.timestamp)}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              {request.eventData?.latitude && request.eventData?.longitude ? (
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${request.eventData.latitude},${request.eventData.longitude}`, '_blank')}
                                >
                                  <MapIcon className="h-4 w-4 text-primary" />
                                </Button>
                              ) : null}
                              <PermissionGuard moduleId="activity_feed" action="delete">
                                <Button 
                                  variant="destructive" 
                                  size="icon" 
                                  className="h-8 w-8"
                                  disabled={!request.id || isDeletingRequest === request.id} 
                                  onClick={() => request.id && handleDeleteRequest(request.id)}
                                >
                                  {isDeletingRequest === request.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <TrashIcon className="h-4 w-4" />
                                  )}
                                </Button>
                              </PermissionGuard>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="p-3 rounded-2xl bg-primary/[0.03] border border-primary/5 text-xs">
                              <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Address Details</p>
                              <p className="font-bold text-foreground">
                                {request.eventData?.addressLine1 || request.eventData?.city || 'N/A'}
                                {request.eventData?.pincode ? ` - ${request.eventData.pincode}` : ''}
                              </p>
                            </div>
                            <div className="p-3 rounded-2xl bg-muted/20 border border-dashed border-muted-foreground/20 text-xs">
                              <p className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider mb-1">Coordinates</p>
                              <p className="font-mono text-foreground">
                                {request.eventData?.latitude?.toFixed(5) || 'N/A'}, {request.eventData?.longitude?.toFixed(5) || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
