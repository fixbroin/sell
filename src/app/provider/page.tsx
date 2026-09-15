
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, CheckCircle, Clock, Loader2, PackageSearch, ExternalLink, ShoppingBag, XCircle, PlayCircle, Tag, MapPin, User, Calendar, Phone, ArrowRight, TrendingUp, Wallet } from "lucide-react";
import type { FirestoreBooking, BookingStatus } from '@/types/firestore';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp, collectionGroup, getDoc, addDoc, getDocs, limit } from '@/lib/mysqlDb';
import { getProviderBookingCountsAction } from '@/app/actions/dbActions';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useLoading } from '@/contexts/LoadingContext';
import AppImage from '@/components/ui/AppImage';
import { Separator } from '@/components/ui/separator';
import { cn, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import type { FirestoreNotification, UserActivityEventType } from '@/types/firestore';
import CompleteBookingDialog from '@/components/shared/CompleteBookingDialog';
import { logUserActivity } from '@/lib/activityLogger';
import { updateBookingStatusByProviderAction, getProviderWalletSettingsAction } from '@/app/actions/providerWalletActions';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import ProviderJobCard from '@/components/provider/ProviderJobCard';

const formatDateForDisplay = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString.replace(/-/g, '/'));
        return formatDateInTimezone(date, 'Asia/Kolkata');
    } catch (e) { return dateString; }
};

const StatCard = ({ title, value, icon: Icon, colorClass, delay }: { title: string, value: number, icon: any, colorClass: string, delay: string }) => (
  <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm overflow-hidden group hover:shadow-md transition-all duration-300">
    <div className={cn("h-1 w-full", colorClass)} />
    <CardContent className="p-4 flex items-center justify-between">
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{title}</p>
        <h3 className="text-2xl font-black mt-1">{value}</h3>
      </div>
      <div className={cn("p-2.5 rounded-xl bg-muted group-hover:scale-110 transition-transform duration-300", colorClass.replace('bg-', 'text-'))}>
        <Icon className="h-5 w-5" />
      </div>
    </CardContent>
  </Card>
);

export default function ProviderDashboardPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig } = useApplicationConfig();
  const { toast } = useToast();
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;
  const [bookings, setBookings] = useState<FirestoreBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [processingBookingAction, setProcessingBookingAction] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [bookingCounts, setBookingCounts] = useState({ completed: 0, newRequests: 0, ongoing: 0 });
  const [providerWalletBalance, setProviderWalletBalance] = useState<number>(0);
  const [minBalanceForJobs, setMinBalanceForJobs] = useState<number>(50);

  // Completion Dialog State
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [bookingToComplete, setBookingToComplete] = useState<FirestoreBooking | null>(null);

  useEffect(() => {
    if (!providerUser || authIsLoading) return;
    
    // Fetch provider wallet balance
    const userDocRef = doc(db, 'users', providerUser.uid);
    getDoc(userDocRef).then(snap => {
      if (snap.exists()) {
        setProviderWalletBalance(snap.data()?.providerWalletBalance || 0);
      }
    }).catch(err => console.error("Error loading wallet balance:", err));

    // Fetch minimum balance setting
    getProviderWalletSettingsAction().then(settings => {
      setMinBalanceForJobs(settings.minBalanceForJobs);
    }).catch(err => console.error("Error loading wallet settings:", err));
  }, [providerUser, authIsLoading]);

  useEffect(() => {
    if (!providerUser || authIsLoading) {
      if (!authIsLoading && !providerUser) setIsLoadingBookings(false);
      return;
    }
    setIsLoadingBookings(true);
    const bookingsColGroupRef = collectionGroup(db, "bookings");
    const q = query(
      bookingsColGroupRef, 
      where("providerId", "==", providerUser.uid), 
      orderBy("scheduledDate", "desc"),
      orderBy("createdAt", "desc"),
      limit(displayLimit)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreBooking)));
      setIsLoadingBookings(false);
      // Fetch true counts from DB
      getProviderBookingCountsAction(providerUser.uid)
        .then(setBookingCounts)
        .catch(err => console.error("Error fetching booking counts:", err));
    }, (error) => {
      console.error("Error fetching provider bookings:", error);
      toast({ title: "Error", description: "Could not fetch your assigned jobs.", variant: "destructive" });
      setIsLoadingBookings(false);
    });
    return () => unsubscribe();
  }, [providerUser, authIsLoading, toast, displayLimit]);

  const updateBookingStatus = async (bookingId: string, newStatus: BookingStatus, additionalCharges?: {name: string, amount: number}[], finalizedPaymentMethod?: string) => {
    // SINGLE COMPLETION POPUP (Charges + Payment Method)
    if (newStatus === 'Completed' && !finalizedPaymentMethod) {
        const job = bookings.find(b => b.id === bookingId);
        if (job) {
            setBookingToComplete(job);
            setIsCompleteDialogOpen(true);
        }
        return;
    }

    setProcessingBookingAction(bookingId);
    try {
      const bookingDocRef = doc(db, "bookings", bookingId); 
      const updateData: any = { status: newStatus, updatedAt: Timestamp.now() };
      
      if (newStatus === "Completed") {
        const job = bookings.find(b => b.id === bookingId);
        if (job && job.status !== "Completed") {
          updateData.isReviewedByCustomer = false;
        }
        if (additionalCharges && additionalCharges.length > 0) {
            updateData.additionalCharges = additionalCharges;
            updateData.totalAmount = ((job?.totalAmount || 0) + additionalCharges.reduce((sum, c) => sum + c.amount, 0));
        }
        if (finalizedPaymentMethod) updateData.paymentMethod = finalizedPaymentMethod;
      }

      if (!providerUser?.uid) {
        throw new Error("No authenticated provider session found.");
      }

      const result = await updateBookingStatusByProviderAction(
        bookingId,
        providerUser.uid,
        newStatus,
        additionalCharges,
        finalizedPaymentMethod
      );

      if (!result.success) {
        throw new Error(result.message);
      }

      // Log provider activity
      if (providerUser) {
        let eventType: UserActivityEventType = 'providerAcceptJob';
        if (newStatus === 'ProviderRejected') {
          eventType = 'providerRejectJob';
        } else if (newStatus === 'InProgressByProvider') {
          eventType = 'providerStartWork';
        } else if (newStatus === 'Completed') {
          eventType = 'providerCompleteWork';
        }

        const targetJob = bookings.find(b => b.id === bookingId);
        const bookingHumanId = targetJob?.bookingId || bookingId;

        logUserActivity(
          eventType,
          { 
            bookingId: bookingHumanId, 
            bookingDocId: bookingId,
            status: newStatus,
            additionalCharges: additionalCharges || [],
            paymentMethod: finalizedPaymentMethod || targetJob?.paymentMethod || 'N/A'
          },
          providerUser.uid,
          null,
          providerUser.displayName
        ).catch(err => console.error("Error logging provider activity:", err));
      }
      
      // TRIGGER POST-PROCESS (Invoice + Emails)
      fetch('/api/bookings/post-process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingDocId: bookingId }),
      }).catch(err => console.error("Notification trigger error:", err));

      toast({ title: "Success", description: `Job status updated to ${newStatus.replace(/([A-Z])/g, ' $1')}.` });
      setIsCompleteDialogOpen(false);
      setBookingToComplete(null);
    } catch (error) {
      console.error("Error updating job status:", error);
      toast({ title: "Error", description: "Could not update job status.", variant: "destructive" });
    } finally {
      setProcessingBookingAction(null);
    }
  };

  const newJobRequests = useMemo(() => bookings.filter(b => b.status === 'AssignedToProvider' || b.status === 'Rescheduled'), [bookings]);
  const ongoingJobs = useMemo(() => bookings.filter(b => b.status === 'ProviderAccepted' || b.status === 'InProgressByProvider'), [bookings]);
  const completedJobs = useMemo(() => bookings.filter(b => b.status === 'Completed'), [bookings]);

  if (authIsLoading || isLoadingBookings) {
    return (
      <div className="flex flex-col justify-center items-center h-[60vh] space-y-4">
        <div className="relative h-16 w-16">
          <Loader2 className="h-16 w-16 animate-spin text-primary" />
          <Briefcase className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        </div>
        <p className="text-muted-foreground font-medium animate-pulse">Syncing your dashboard...</p>
      </div>
    );
  }

  const providerFirstName = providerUser?.displayName?.split(' ')[0] || "Provider";

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2 px-3 py-1 border-primary/20 text-primary bg-primary/5 rounded-full font-bold">
            <TrendingUp className="h-3 w-3 mr-1.5" /> PRO DASHBOARD
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
            Welcome back, <span className="text-primary">{providerFirstName}!</span>
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">You have {newJobRequests.length} new service requests to review.</p>
        </div>
        <Button variant="outline" size="sm" asChild className="rounded-full font-bold border-muted-foreground/20">
          <Link href="/provider/my-jobs"><Briefcase className="mr-2 h-4 w-4" /> View Full History</Link>
        </Button>
      </header>

      {providerWalletBalance < minBalanceForJobs && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-2xl font-bold flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-destructive/10 text-destructive">⚠️</span>
            <div>
              <p className="font-extrabold text-base">You don't have enough balance to accept jobs!</p>
              <p className="text-xs font-semibold opacity-90 mt-0.5">Please add money to your wallet to unlock assigned bookings. Minimum required: {appConfig?.currencySymbol || "₹"}{minBalanceForJobs.toFixed(decimals)}</p>
            </div>
          </div>
          <Button size="sm" variant="destructive" className="font-bold shrink-0 w-full sm:w-auto" asChild>
            <Link href="/provider/wallet">
              <Wallet className="mr-1.5 h-4 w-4" /> Top Up Wallet
            </Link>
          </Button>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="New Requests" value={bookingCounts.newRequests} icon={Tag} colorClass="bg-primary" delay="0" />
        <StatCard title="Ongoing Jobs" value={bookingCounts.ongoing} icon={Clock} colorClass="bg-blue-500" delay="100ms" />
        <StatCard title="Completed" value={bookingCounts.completed} icon={CheckCircle} colorClass="bg-green-500" delay="200ms" />
      </div>

      <Separator className="bg-muted/50" />

      {/* New Requests Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-2">
            <div className="h-8 w-1.5 rounded-full bg-primary" />
            New Job Requests
            <Badge className="ml-2 bg-primary/10 text-primary border-none font-bold">{newJobRequests.length}</Badge>
          </h2>
        </div>
        {newJobRequests.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {newJobRequests.map((job) => (
              <ProviderJobCard key={job.id} job={job} type="new"
                onAccept={(id) => updateBookingStatus(id, 'ProviderAccepted')}
                onReject={(id) => updateBookingStatus(id, 'ProviderRejected')}
                isProcessingAction={processingBookingAction === job.id}
                providerWalletBalance={providerWalletBalance}
                minBalanceForJobs={minBalanceForJobs}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-muted/5">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <PackageSearch className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold">All caught up!</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">No new job requests assigned to you at the moment.</p>
          </div>
        )}
      </section>

      {/* Ongoing Jobs Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-2">
            <div className="h-8 w-1.5 rounded-full bg-blue-500" />
            Ongoing Jobs
            <Badge className="ml-2 bg-blue-500/10 text-blue-500 border-none font-bold">{ongoingJobs.length}</Badge>
          </h2>
        </div>
         {ongoingJobs.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {ongoingJobs.map((job) => (
              <ProviderJobCard key={job.id} job={job} type="ongoing"
                onStartWork={(id) => updateBookingStatus(id, 'InProgressByProvider')}
                onCompleteWork={(id) => updateBookingStatus(id, 'Completed')}
                isProcessingAction={processingBookingAction === job.id}
                providerWalletBalance={providerWalletBalance}
                minBalanceForJobs={minBalanceForJobs}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-muted/5">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <PlayCircle className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-bold">No active jobs</h3>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">You don't have any jobs currently in progress.</p>
          </div>
        )}
      </section>

      {/* Recent Completed Jobs Section */}
      <section className="space-y-4 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black flex items-center gap-2">
            <div className="h-8 w-1.5 rounded-full bg-green-500" />
            Recently Completed
          </h2>
        </div>
        {completedJobs.length > 0 ? (
          <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {completedJobs.slice(0, 3).map((job) => (
              <ProviderJobCard key={job.id} job={job} type="completed"
                providerWalletBalance={providerWalletBalance}
                minBalanceForJobs={minBalanceForJobs}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm font-medium italic">No completed jobs yet.</p>
        )}
      </section>

      {bookingToComplete && (
        <CompleteBookingDialog 
          isOpen={isCompleteDialogOpen}
          onClose={() => { setIsCompleteDialogOpen(false); setBookingToComplete(null); }}
          onConfirm={(charges, pMethod) => updateBookingStatus(bookingToComplete.id!, 'Completed', charges, pMethod)}
          originalAmount={bookingToComplete.totalAmount}
          currentPaymentMethod={bookingToComplete.paymentMethod || "Cash"}
          isProcessing={processingBookingAction === bookingToComplete.id}
        />
      )}
    </div>
  );
}
