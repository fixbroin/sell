
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, PackageSearch, Briefcase } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { FirestoreBooking, BookingStatus, FirestoreNotification } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collectionGroup, query, where, onSnapshot, orderBy, doc, updateDoc, Timestamp, getDoc, getDocs, limit, addDoc, collection } from '@/lib/mysqlDb';
import { getProviderBookingCountsAction } from '@/app/actions/dbActions';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import ProviderJobCard from '@/components/provider/ProviderJobCard'; 
import { triggerPushNotification } from '@/lib/fcmUtils';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import CompleteBookingDialog from '@/components/shared/CompleteBookingDialog';
import { updateBookingStatusByProviderAction, getProviderWalletSettingsAction } from '@/app/actions/providerWalletActions';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

export default function ProviderMyJobsPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<FirestoreBooking[]>([]);
  const [isLoadingBookings, setIsLoadingBookings] = useState(true);
  const [processingBookingAction, setProcessingBookingAction] = useState<string | null>(null);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [bookingCounts, setBookingCounts] = useState({ completed: 0, newRequests: 0, ongoing: 0, other: 0, total: 0 });
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
      console.error("Error fetching provider jobs:", error);
      toast({ title: "Error", description: "Could not fetch your jobs.", variant: "destructive" });
      setIsLoadingBookings(false);
    });
    return () => unsubscribe();
  }, [providerUser, authIsLoading, toast, displayLimit]);

  const updateBookingStatus = async (bookingId: string, newStatus: BookingStatus, additionalCharges?: {name: string, amount: number}[], finalizedPaymentMethod?: string) => {
    // SINGLE COMPLETION POPUP
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
      
      // TRIGGER POST-PROCESS
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
  const otherJobs = useMemo(() => bookings.filter(b => b.status === 'ProviderRejected' || b.status === 'Cancelled' || b.status === 'Pending Payment' || b.status === 'Processing'), [bookings]);


  if (authIsLoading || isLoadingBookings) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
            <CardTitle className="text-2xl flex items-center"><Briefcase className="mr-2 h-6 w-6 text-primary"/>My Jobs</CardTitle>
            <CardDescription>View and manage all jobs assigned to you.</CardDescription>
        </CardHeader>
      </Card>
      
      <Tabs defaultValue="new" className="w-full">
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
             <TabsTrigger 
              value="new" 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              New Requests <Badge className="ml-2 bg-primary/10 text-primary border-none hover:bg-primary/10">{bookingCounts.newRequests}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="ongoing" 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              Ongoing <Badge className="ml-2 bg-blue-500/10 text-blue-500 border-none hover:bg-blue-500/10">{bookingCounts.ongoing}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="completed" 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              Completed <Badge className="ml-2 bg-green-500/10 text-green-500 border-none hover:bg-green-500/10">{bookingCounts.completed}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="other" 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              Other Statuses <Badge className="ml-2 bg-muted text-muted-foreground border-none hover:bg-muted">{bookingCounts.other}</Badge>
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="new" className="mt-0 focus-visible:outline-none">
          {newJobRequests.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {newJobRequests.map(job => (
                <ProviderJobCard key={job.id} job={job} type="new"
                  onAccept={(id) => updateBookingStatus(id, 'ProviderAccepted')}
                  onReject={(id) => updateBookingStatus(id, 'ProviderRejected')}
                  isProcessingAction={processingBookingAction === job.id}
                  providerWalletBalance={providerWalletBalance}
                  minBalanceForJobs={minBalanceForJobs}
                />
              ))}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No new job requests.</p>}
        </TabsContent>

        <TabsContent value="ongoing">
           {ongoingJobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {ongoingJobs.map(job => (
                <ProviderJobCard key={job.id} job={job} type="ongoing"
                  onStartWork={(id) => updateBookingStatus(id, 'InProgressByProvider')}
                  onCompleteWork={(id) => updateBookingStatus(id, 'Completed')}
                  isProcessingAction={processingBookingAction === job.id}
                  providerWalletBalance={providerWalletBalance}
                  minBalanceForJobs={minBalanceForJobs}
                />
              ))}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No ongoing jobs.</p>}
        </TabsContent>

        <TabsContent value="completed">
          {completedJobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {completedJobs.map(job => (
                <ProviderJobCard key={job.id} job={job} type="completed"
                  providerWalletBalance={providerWalletBalance}
                  minBalanceForJobs={minBalanceForJobs}
                />
              ))}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No completed jobs yet.</p>}
        </TabsContent>
        
        <TabsContent value="other">
          {otherJobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-4">
              {otherJobs.map(job => (
                <ProviderJobCard key={job.id} job={job} type="completed"
                  providerWalletBalance={providerWalletBalance}
                  minBalanceForJobs={minBalanceForJobs}
                />
              ))}
            </div>
          ) : <p className="text-muted-foreground text-center py-6">No jobs with other statuses.</p>}
        </TabsContent>
      </Tabs>

      {bookingCounts.total > bookings.length && (
        <div className="flex justify-center pt-4 pb-8">
          <Button 
            variant="outline" 
            onClick={() => setDisplayLimit(prev => prev + 50)}
            className="rounded-full px-8 font-bold border-muted-foreground/20 hover:bg-muted"
          >
            Load More Jobs
          </Button>
        </div>
      )}

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
