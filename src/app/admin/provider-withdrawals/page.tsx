"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageSearch, Check, X, MoreHorizontal, AlertTriangle, Eye, Trash2 } from "lucide-react";
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, runTransaction, getDoc, addDoc, deleteDoc, where, getDocs } from '@/lib/mysqlDb';
import type { WithdrawalRequest, WithdrawalStatus, FirestoreNotification, FirestoreUser, ProviderApplication } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Banknote, RefreshCw, Wallet, History, Settings } from "lucide-react";
import { cn, formatCurrency } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getProviderWalletDetailsAction } from '@/app/actions/providerWalletActions';
import WalletComplaintsTab from '@/components/admin/provider-controls/WalletComplaintsTab';
import WalletSettingsTab from '@/components/admin/provider-controls/WalletSettingsTab';
import ProviderWalletAdjustmentModal from '@/components/admin/provider/ProviderWalletAdjustmentModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDescriptionComponent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription as DialogDescriptionComponent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from "@/components/ui/input";
import { Separator } from '@/components/ui/separator';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';

const formatDate = (timestamp?: any, appConfig?: any) => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
};

const getStatusBadgeVariant = (status: WithdrawalStatus) => {
    switch(status) {
      case 'pending': return 'secondary';
      case 'approved': return 'default';
      case 'processing': return 'default';
      case 'completed': return 'default';
      case 'rejected': return 'destructive';
      case 're_submit': return 'destructive';
      default: return 'outline';
    }
};

const getStatusBadgeClass = (status: WithdrawalStatus) => {
     switch(status) {
      case 'approved':
      case 'completed':
        return 'bg-green-500 hover:bg-green-600';
      case 'processing':
         return 'bg-blue-500 hover:bg-blue-600';
      case 're_submit':
         return 'bg-yellow-500 hover:bg-yellow-600';
      default: return '';
    }
};

const DetailItem = ({ label, value }: { label: string, value?: string | null }) => (
    <div className="grid grid-cols-3 gap-2">
        <p className="text-sm text-muted-foreground col-span-1">{label}</p>
        <p className="text-sm font-semibold col-span-2">{value || 'N/A'}</p>
    </div>
);

export default function ProviderWithdrawalsPage() {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [providers, setProviders] = useState<FirestoreUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isClearingWallet, setIsClearingWallet] = useState<string | null>(null);
  const { toast } = useToast();

  const [rejectionReason, setRejectionReason] = useState("");
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [requestToActOn, setRequestToActOn] = useState<WithdrawalRequest | null>(null);
  const [actionType, setActionType] = useState<'rejected' | 're_submit' | null>(null);

  const [showClearWalletDialog, setShowClearWalletDialog] = useState(false);
  const [providerToClear, setProviderToClear] = useState<FirestoreUser | null>(null);
  const [clearMode, setClearMode] = useState<'balance' | 'all'>('balance');

  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState<WithdrawalRequest | null>(null);

  // Provider Wallet Details Tab States
  const [providerSearch, setProviderSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<FirestoreUser | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [walletHistory, setWalletHistory] = useState<any[]>([]);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  const filteredProvidersForSelect = providers.filter(p => 
    (p.displayName || '').toLowerCase().includes(providerSearch.toLowerCase()) || 
    (p.email || '').toLowerCase().includes(providerSearch.toLowerCase())
  );

  const loadProviders = async () => {
    setIsLoadingProviders(true);
    try {
        // 1. Fetch only approved provider applications (Very efficient)
        const appsQuery = query(collection(db, "providerApplications"), where("status", "==", "approved"));
        const appsSnapshot = await getDocs(appsQuery);
        const approvedApps = appsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProviderApplication));
        
        if (approvedApps.length === 0) {
            setProviders([]);
            return;
        }

        // 2. Fetch only the specific users who are providers (Targeted reads)
        // Firestore 'in' query supports max 30 items at a time
        const userIds = [...new Set(approvedApps.map(app => app.userId))];
        const providerList: FirestoreUser[] = [];
        const usersRef = collection(db, "users");

        // Split userIds into chunks of 30
        for (let i = 0; i < userIds.length; i += 30) {
            const chunk = userIds.slice(i, i + 30);
            const q = query(usersRef, where("__name__", "in", chunk));
            const userSnap = await getDocs(q);
            
            userSnap.docs.forEach(docSnap => {
                const userData = docSnap.data() as FirestoreUser;
                const appData = approvedApps.find(a => a.userId === docSnap.id);
                providerList.push({
                    ...userData,
                    uid: docSnap.id,
                    displayName: appData?.fullName || userData.displayName || "Unknown",
                    email: appData?.email || userData.email || "N/A"
                });
            });
        }

        // Sort by balance (highest first)
        setProviders(providerList.sort((a, b) => (b.withdrawableBalance || 0) - (a.withdrawableBalance || 0)));
    } catch (error) {
        console.error("Error loading providers:", error);
        toast({ title: "Error", description: "Could not load provider balances.", variant: "destructive" });
    } finally {
        setIsLoadingProviders(false);
    }
  };

  const fetchSelectedProviderWallet = async (provider: FirestoreUser) => {
    setSelectedProvider(provider);
    setIsLoadingWallet(true);
    try {
      const details = await getProviderWalletDetailsAction(provider.uid || provider.id!);
      setWalletBalance(details.balance);
      setWalletHistory(details.transactions);
    } catch (error) {
      console.error("Error loading wallet details:", error);
      toast({ title: "Error", description: "Failed to load wallet details.", variant: "destructive" });
    } finally {
      setIsLoadingWallet(false);
    }
  };

  const handleClearWalletExecute = async (uid: string, displayName: string) => {
    setIsClearingWallet(uid);
    try {
      if (clearMode === 'all') {
        const userDocRef = doc(db, "users", uid);
        await updateDoc(userDocRef, {
          withdrawableBalance: 0,
          providerWalletBalance: 0,
          totalPaidOut: 0,
          monthlyStats: {
            monthKey: "",
            gross: 0,
            commission: 0,
            cashCollected: 0,
            withdrawals: 0,
            onlineNet: 0,
            cashCommission: 0
          }
        });

        const txsQuery = query(collection(db, "providerWalletTransactions"), where("providerId", "==", uid));
        const txsSnap = await getDocs(txsQuery);
        for (const d of txsSnap.docs) {
          await deleteDoc(doc(db, "providerWalletTransactions", d.id));
        }

        const reqsQuery = query(collection(db, "withdrawalRequests"), where("providerId", "==", uid));
        const reqsSnap = await getDocs(reqsQuery);
        for (const d of reqsSnap.docs) {
          await deleteDoc(doc(db, "withdrawalRequests", d.id));
        }

        toast({
          title: "Wallet & History Cleared",
          description: `Successfully cleared all wallet, transactions, and withdrawal records for ${displayName}.`,
          className: "bg-green-100 border-green-300 text-green-700 font-medium"
        });
      } else {
        const userDocRef = doc(db, "users", uid);
        await updateDoc(userDocRef, {
          withdrawableBalance: 0
        });

        toast({
          title: "Wallet Cleared",
          description: `Successfully reset wallet balance to 0 for ${displayName}.`,
          className: "bg-green-100 border-green-300 text-green-700 font-medium"
        });
      }

      await loadProviders();
    } catch (err) {
      console.error("Error clearing wallet:", err);
      toast({
        title: "Clear Wallet Failed",
        description: (err as Error).message || "An error occurred.",
        variant: "destructive"
      });
    } finally {
      setIsClearingWallet(null);
      setShowClearWalletDialog(false);
      setProviderToClear(null);
    }
  };


  useEffect(() => {
    setIsLoading(true);
    const requestsRef = collection(db, "withdrawalRequests");
    const q = query(requestsRef, orderBy("requestedAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allRequests = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WithdrawalRequest));
      setRequests(allRequests.filter(req => req.providerId !== 'referral_system'));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching withdrawal requests:", error);
      toast({ title: "Error", description: "Could not load requests.", variant: "destructive" });
      setIsLoading(false);
    });
    
    loadProviders();
    return () => unsubscribe();
  }, [toast]);
  
  const handleViewDetails = (request: WithdrawalRequest) => {
    setSelectedRequestForDetails(request);
    setDetailsModalOpen(true);
  };

  const openRejectionDialog = (request: WithdrawalRequest, action: 'rejected' | 're_submit') => {
    setRequestToActOn(request);
    setActionType(action);
    setRejectionReason(action === 're_submit' ? request.adminNotes || '' : '');
    setShowRejectionDialog(true);
  };

  const handleUpdateStatus = async (request: WithdrawalRequest, newStatus: WithdrawalStatus, reason?: string) => {
    if (!request.id) return;
    setIsUpdating(request.id);
    const userDocRef = doc(db, "users", request.providerId);
    const requestDocRef = doc(db, "withdrawalRequests", request.id);

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) throw new Error("Provider user not found.");

        const updatePayload: Partial<WithdrawalRequest> = { status: newStatus, processedAt: Timestamp.now() };
        let userUpdatePayload: Partial<{[key: string]: any}> = {};
        let notificationMessage = `Your withdrawal request of ${formatCurrency(request.amount, symbol, decimals, code)} has been updated to ${newStatus}.`;
        let notificationType: FirestoreNotification['type'] = 'info';

        if (newStatus === 'rejected' || newStatus === 're_submit') {
          updatePayload.adminNotes = reason;
          // Only refund if the amount was previously deducted (which we will now do on request creation or keep it consistent)
          // Actually, let's look at how we want to handle the provider's balance.
          // If we deduct on REQUEST, then we refund on REJECT.
          // If we deduct on COMPLETE, then we don't refund on REJECT.
          
          // Decision: To be consistent with the Referral system (which is safer), 
          // we should deduct from the User doc the moment they REQUEST.
          
          const newWalletBalance = (userDoc.data().withdrawableBalance || 0) + request.amount;
          userUpdatePayload = { withdrawableBalance: newWalletBalance, withdrawalPending: false }; // Refund and unlock
          notificationMessage = `Your withdrawal of ${formatCurrency(request.amount, symbol, decimals, code)} was ${newStatus === 'rejected' ? 'rejected' : 'sent back for re-submission'}. Reason: ${reason}. The amount has been refunded to your wallet.`;
          notificationType = newStatus === 'rejected' ? 'error' : 'warning';
        } else if (newStatus === 'completed') {
            // Money already deducted on request.
            // ADDED: Track permanent total payouts to make it deletion-safe.
            const currentTotalPaidOut = userDoc.data().totalPaidOut || 0;
            
            // Update monthly stats withdrawals
            const now = new Date();
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const stats = userDoc.data().monthlyStats || { monthKey, gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0 };
            
            // Note: Withdrawals are already added to stats when REQUESTED by provider.
            // If we are completing an OLD request from a previous month, 
            // we don't want to double-count or mess up current month stats.
            // So we only update totalPaidOut here.

            userUpdatePayload = { 
              withdrawalPending: false,
              totalPaidOut: currentTotalPaidOut + request.amount 
            }; 
            notificationMessage = `Your withdrawal of ${formatCurrency(request.amount, symbol, decimals, code)} has been successfully completed.`;
            notificationType = 'success';
        }
        
        transaction.update(requestDocRef, updatePayload);
        if (Object.keys(userUpdatePayload).length > 0) {
            transaction.update(userDocRef, userUpdatePayload);
        }
        
        const notification: Omit<FirestoreNotification, 'id'> = {
            userId: request.providerId,
            title: `Withdrawal Request ${newStatus.replace(/_/g, ' ')}`,
            message: notificationMessage,
            type: notificationType,
            href: '/provider/withdrawal',
            read: false,
            createdAt: Timestamp.now(),
        };
        transaction.set(doc(collection(db, "userNotifications")), notification);
      });
      
      // Trigger actual Push Notification for the provider
      triggerPushNotification({
        userId: request.providerId,
        title: `Withdrawal Request ${newStatus.replace(/_/g, ' ')}`,
        body: `Your withdrawal of ${formatCurrency(request.amount, symbol, decimals, code)} has been ${newStatus.replace(/_/g, ' ')}.`,
        href: '/provider/withdrawal'
      });

      toast({ title: "Success", description: `Request status updated to ${newStatus}.` });
      if (newStatus === 'rejected' || newStatus === 're_submit') {
        setShowRejectionDialog(false);
        setRequestToActOn(null);
      }

    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update request.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteRequest = async (request: WithdrawalRequest) => {
    if (!request.id) return;
    setIsUpdating(request.id);
    try {
        await runTransaction(db, async (transaction) => {
            const requestDocRef = doc(db, "withdrawalRequests", request.id!);
            const userDocRef = doc(db, "users", request.providerId);
            
            const reqSnap = await transaction.get(requestDocRef);
            if (!reqSnap.exists()) return;

            // Logic: If the request was 'pending', 'approved', or 'processing', 
            // the money was deducted but NOT yet finalized. Deleting it should REFUND the provider.
            // If it was 'completed', the money is GONE. Deleting the record should NOT refund.
            const status = reqSnap.data().status;
            if (['pending', 'approved', 'processing'].includes(status)) {
                const userSnap = await transaction.get(userDocRef);
                if (userSnap.exists()) {
                    const currentBalance = userSnap.data().withdrawableBalance || 0;
                    transaction.update(userDocRef, { 
                        withdrawableBalance: currentBalance + request.amount,
                        withdrawalPending: false 
                    });
                }
            }

            transaction.delete(requestDocRef);
        });
        toast({title: "Success", description: "Withdrawal request deleted and balance adjusted if necessary."});
    } catch (error) {
        console.error("Delete error:", error);
        toast({title: "Error", description: "Could not delete request.", variant: "destructive"});
    } finally {
        setIsUpdating(null);
    }
  };

  if (isLoading) {
    return <Card><CardContent className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Wallet Withdrawal Complaint</h1>
            <p className="text-muted-foreground text-sm mt-1">Manage payouts, provider wallet disputes, and view detailed balance ledgers.</p>
        </div>
      </div>

      <Tabs defaultValue="requests" className="w-full">
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
            <TabsTrigger 
              value="requests" 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Banknote className="mr-2 h-4 w-4"/> Payout Requests
            </TabsTrigger>
            <TabsTrigger 
              value="balances" 
              onClick={loadProviders} 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Users className="mr-2 h-4 w-4"/> Provider Balances
            </TabsTrigger>
            <TabsTrigger 
              value="wallet_complaints" 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <AlertTriangle className="mr-2 h-4 w-4"/> Wallet Complaints
            </TabsTrigger>
            <TabsTrigger 
              value="wallet_details" 
              onClick={loadProviders} 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Wallet className="mr-2 h-4 w-4"/> Provider Wallet Details
            </TabsTrigger>
            <TabsTrigger 
              value="wallet_settings" 
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Settings className="mr-2 h-4 w-4"/> Wallet Settings
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <CardTitle>Withdrawal Requests</CardTitle>
              <CardDescription>Process pending payout requests from service providers.</CardDescription>
            </CardHeader>
            <CardContent>
              {requests.length === 0 ? (
                <div className="text-center py-10">
                  <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">No withdrawal requests received yet.</p>
                </div>
              ) : (
                <>
                  <div className="hidden lg:block overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Details</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {requests.map(req => {
                           const providerProfile = providers.find(p => p.uid === req.providerId);
                           const currentBalance = providerProfile?.withdrawableBalance ?? null;

                           return (
                           <TableRow key={req.id}>
                              <TableCell>
                                <div className="font-medium">{req.providerName}</div>
                                <div className="text-xs text-muted-foreground">{req.providerEmail}</div>
                                {currentBalance !== null && (
                                    <div className={cn("text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded w-fit", currentBalance < 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                                        Current Wallet: {formatCurrency(currentBalance, symbol, decimals, code)}
                                    </div>
                                )}
                              </TableCell>
                              <TableCell className="font-bold">{formatCurrency(req.amount, symbol, decimals, code)}</TableCell>
                              <TableCell className="capitalize">{req.method.replace('_', ' ')}</TableCell>
                              <TableCell>
                                <Button variant="outline" size="sm" onClick={() => handleViewDetails(req)}>
                                  <Eye className="mr-1 h-4 w-4" /> View
                                </Button>
                              </TableCell>
                              <TableCell className="text-xs">{formatDate(req.requestedAt, appConfig)}</TableCell>
                              <TableCell><Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>{req.status.replace(/_/g, ' ')}</Badge></TableCell>
                              <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                      {req.status === 'pending' && (
                                          <>
                                              <PermissionGuard moduleId="provider_withdrawals" action="write">
                                                  <Button variant="outline" size="sm" className="text-green-600 font-bold hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                                      Complete
                                                  </Button>
                                              </PermissionGuard>
                                              <PermissionGuard moduleId="provider_withdrawals" action="write">
                                                  <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'approved')} disabled={isUpdating === req.id}>
                                                      <Check className="h-4 w-4" />
                                                  </Button>
                                              </PermissionGuard>
                                              <PermissionGuard moduleId="provider_withdrawals" action="write">
                                                  <Button variant="outline" size="sm" className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50" onClick={() => openRejectionDialog(req, 're_submit')} disabled={isUpdating === req.id}>
                                                      <AlertTriangle className="h-4 w-4" />
                                                  </Button>
                                              </PermissionGuard>
                                              <PermissionGuard moduleId="provider_withdrawals" action="write">
                                                  <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={() => openRejectionDialog(req, 'rejected')} disabled={isUpdating === req.id}>
                                                      <X className="h-4 w-4" />
                                                  </Button>
                                              </PermissionGuard>
                                          </>
                                      )}
                                      {req.status === 'approved' && (
                                          <div className="flex gap-2">
                                              <PermissionGuard moduleId="provider_withdrawals" action="write">
                                                  <Button variant="outline" size="sm" className="text-green-600 font-bold hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                                      Complete
                                                  </Button>
                                              </PermissionGuard>
                                              <PermissionGuard moduleId="provider_withdrawals" action="write">
                                                  <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req, 'processing')} disabled={isUpdating === req.id}>
                                                      Process
                                                  </Button>
                                              </PermissionGuard>
                                          </div>
                                      )}
                                      {req.status === 'processing' && (
                                          <PermissionGuard moduleId="provider_withdrawals" action="write">
                                              <Button variant="outline" size="sm" className="text-green-600 font-bold hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                                  Complete
                                              </Button>
                                          </PermissionGuard>
                                      )}

                                      <PermissionGuard moduleId="provider_withdrawals" action="delete">
                                          <AlertDialog>
                                              <AlertDialogTrigger asChild>
                                                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={isUpdating === req.id}>
                                                      <Trash2 className="h-4 w-4" />
                                                  </Button>
                                              </AlertDialogTrigger>
                                              <AlertDialogContent>
                                                  <AlertDialogHeader>
                                                      <AlertDialogTitle>Delete Request?</AlertDialogTitle>
                                                      <AlertDialogDescriptionComponent>Permanently remove this request record. This action will adjust the provider's balance if the request was not yet completed.</AlertDialogDescriptionComponent>
                                                  </AlertDialogHeader>
                                                  <AlertDialogFooter>
                                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                      <AlertDialogAction onClick={() => handleDeleteRequest(req)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                                  </AlertDialogFooter>
                                              </AlertDialogContent>
                                          </AlertDialog>
                                      </PermissionGuard>
                                  </div>
                              </TableCell>
                           </TableRow>
                        ); })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="lg:hidden space-y-4">
                    {requests.map(req => {
                      const providerProfile = providers.find(p => p.uid === req.providerId);
                      const currentBalance = providerProfile?.withdrawableBalance ?? null;

                      return (
                        <Card key={req.id} className="p-4 space-y-3 border border-border shadow-sm">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <div className="font-bold text-sm text-left">{req.providerName}</div>
                              <div className="text-xs text-muted-foreground text-left">{req.providerEmail}</div>
                              {currentBalance !== null && (
                                <div className={cn("text-[10px] font-bold mt-1 px-1.5 py-0.5 rounded w-fit", currentBalance < 0 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700")}>
                                  Wallet: {formatCurrency(currentBalance, symbol, decimals, code)}
                                </div>
                              )}
                            </div>
                            <Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>
                              {req.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
                            <div className="text-left">
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Amount</span>
                              <span className="font-bold text-sm">{formatCurrency(req.amount, symbol, decimals, code)}</span>
                            </div>
                            <div className="text-left">
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Method</span>
                              <span className="capitalize font-semibold">{req.method.replace('_', ' ')}</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center text-xs border-t pt-2">
                            <span className="text-muted-foreground">Requested:</span>
                            <span className="font-medium">{formatDate(req.requestedAt, appConfig)}</span>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                            <Button variant="outline" size="sm" onClick={() => handleViewDetails(req)} className="h-8">
                              <Eye className="mr-1 h-3.5 w-3.5" /> Details
                            </Button>
                            
                            <div className="flex items-center gap-1.5">
                              {req.status === 'pending' && (
                                <>
                                  <PermissionGuard moduleId="provider_withdrawals" action="write">
                                    <Button variant="outline" size="sm" className="h-8 text-green-600 font-bold hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                      Complete
                                    </Button>
                                  </PermissionGuard>
                                  <PermissionGuard moduleId="provider_withdrawals" action="write">
                                    <Button variant="outline" size="sm" className="h-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'approved')} disabled={isUpdating === req.id}>
                                      Approve
                                    </Button>
                                  </PermissionGuard>
                                  <PermissionGuard moduleId="provider_withdrawals" action="write">
                                    <Button variant="outline" size="sm" className="h-8 text-yellow-600" onClick={() => openRejectionDialog(req, 're_submit')} disabled={isUpdating === req.id}>
                                      Re-submit
                                    </Button>
                                  </PermissionGuard>
                                  <PermissionGuard moduleId="provider_withdrawals" action="write">
                                    <Button variant="outline" size="sm" className="h-8 text-destructive" onClick={() => openRejectionDialog(req, 'rejected')} disabled={isUpdating === req.id}>
                                      Reject
                                    </Button>
                                  </PermissionGuard>
                                </>
                              )}
                              {req.status === 'approved' && (
                                <div className="flex gap-1.5">
                                  <PermissionGuard moduleId="provider_withdrawals" action="write">
                                    <Button variant="outline" size="sm" className="h-8 text-green-600 font-bold hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                      Complete
                                    </Button>
                                  </PermissionGuard>
                                  <PermissionGuard moduleId="provider_withdrawals" action="write">
                                    <Button variant="outline" size="sm" className="h-8" onClick={() => handleUpdateStatus(req, 'processing')} disabled={isUpdating === req.id}>
                                      Process
                                    </Button>
                                  </PermissionGuard>
                                </div>
                              )}
                              {req.status === 'processing' && (
                                <PermissionGuard moduleId="provider_withdrawals" action="write">
                                  <Button variant="outline" size="sm" className="h-8 text-green-600 font-bold" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                    Complete
                                  </Button>
                                </PermissionGuard>
                              )}

                              <PermissionGuard moduleId="provider_withdrawals" action="delete">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 text-muted-foreground hover:text-destructive" disabled={isUpdating === req.id}>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Request?</AlertDialogTitle>
                                      <AlertDialogDescriptionComponent>Permanently remove this request record.</AlertDialogDescriptionComponent>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleDeleteRequest(req)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </PermissionGuard>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                    <CardTitle>Provider Earnings Overview</CardTitle>
                    <CardDescription>Current withdrawable balances and lifetime payouts for all providers.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadProviders} disabled={isLoadingProviders}>
                    {isLoadingProviders ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <RefreshCw className="h-4 w-4 mr-2"/>} Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingProviders ? (
                <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : providers.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground">No providers found.</p>
              ) : (                <>
                  <div className="hidden lg:block overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>Month Gross</TableHead><TableHead>Month Net</TableHead><TableHead>Wallet Balance</TableHead><TableHead>Lifetime Paid</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {providers.map(p => {
                           const now = new Date();
                           const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                           const stats = p.monthlyStats?.monthKey === monthKey ? p.monthlyStats : { gross: 0, commission: 0 };
                           const monthNet = stats.gross - stats.commission;

                           return (
                           <TableRow key={p.uid}>
                              <TableCell><div className="font-medium">{p.displayName}</div><div className="text-xs text-muted-foreground">{p.email}</div></TableCell>
                              <TableCell className="text-xs font-semibold">{formatCurrency(stats.gross, symbol, decimals, code)}</TableCell>
                              <TableCell className="text-xs font-bold text-green-600">{formatCurrency(monthNet, symbol, decimals, code)}</TableCell>
                              <TableCell>
                                <div className={cn("text-lg font-bold", (p.withdrawableBalance || 0) < 0 ? "text-destructive" : "text-blue-600")}>
                                    {formatCurrency(p.withdrawableBalance || 0, symbol, decimals, code)}
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold text-muted-foreground">{formatCurrency(p.totalPaidOut || 0, symbol, decimals, code)}</TableCell>
                              <TableCell>
                                {(p.withdrawableBalance || 0) < 0 ? (
                                    <Badge variant="destructive">Settlement Due</Badge>
                                ) : (p.withdrawableBalance || 0) > 0 ? (
                                    <Badge variant="default" className="bg-green-500">Owed</Badge>
                                ) : (
                                    <Badge variant="outline">Cleared</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <PermissionGuard moduleId="provider_withdrawals" action="write">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setProviderToClear(p);
                                        setClearMode('balance');
                                        setShowClearWalletDialog(true);
                                      }}
                                      disabled={(p.withdrawableBalance || 0) === 0 || isClearingWallet === p.uid}
                                      className="h-8 px-2 text-xs border-destructive/30 hover:border-destructive hover:bg-destructive/10 text-destructive rounded-lg font-medium"
                                    >
                                      {isClearingWallet === p.uid && clearMode === 'balance' ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      ) : (
                                        <Trash2 className="h-3 w-3 mr-1" />
                                      )}
                                      Clear Wallet
                                    </Button>

                                    <Button
                                      variant="destructive"
                                      size="sm"
                                      onClick={() => {
                                        setProviderToClear(p);
                                        setClearMode('all');
                                        setShowClearWalletDialog(true);
                                      }}
                                      disabled={isClearingWallet === p.uid}
                                      className="h-8 px-2 text-xs rounded-lg font-medium bg-destructive hover:bg-destructive/90"
                                    >
                                      {isClearingWallet === p.uid && clearMode === 'all' ? (
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                      ) : (
                                        <Trash2 className="h-3 w-3 mr-1" />
                                      )}
                                      Clear All
                                    </Button>
                                  </div>
                                </PermissionGuard>
                              </TableCell>
                           </TableRow>
                        ); })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="lg:hidden space-y-4">
                    {providers.map(p => {
                      const now = new Date();
                      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                      const stats = p.monthlyStats?.monthKey === monthKey ? p.monthlyStats : { gross: 0, commission: 0 };
                      const monthNet = stats.gross - stats.commission;
                      const balance = p.withdrawableBalance || 0;

                      return (
                        <Card key={p.uid} className="p-4 space-y-3 border border-border shadow-sm">
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <div className="font-bold text-sm text-left">{p.displayName}</div>
                              <div className="text-xs text-muted-foreground text-left">{p.email}</div>
                            </div>
                            {balance < 0 ? (
                              <Badge variant="destructive">Settlement Due</Badge>
                            ) : balance > 0 ? (
                              <Badge variant="default" className="bg-green-500">Owed</Badge>
                            ) : (
                              <Badge variant="outline">Cleared</Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs border-t pt-2">
                            <div className="text-left">
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Month Gross</span>
                              <span className="font-semibold">{formatCurrency(stats.gross, symbol, decimals, code)}</span>
                            </div>
                            <div className="text-left">
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Month Net</span>
                              <span className="font-bold text-green-600">{formatCurrency(monthNet, symbol, decimals, code)}</span>
                            </div>
                            <div className="text-left">
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Wallet Balance</span>
                              <span className={cn("font-extrabold text-sm", balance < 0 ? "text-destructive" : "text-blue-600")}>
                                {formatCurrency(balance, symbol, decimals, code)}
                              </span>
                            </div>
                            <div className="text-left">
                              <span className="text-muted-foreground block text-[10px] uppercase font-bold tracking-wider">Lifetime Paid</span>
                              <span className="font-semibold text-muted-foreground">{formatCurrency(p.totalPaidOut || 0, symbol, decimals, code)}</span>
                            </div>
                          </div>

                           <div className="flex gap-2 border-t pt-2 w-full">
                             <PermissionGuard moduleId="provider_withdrawals" action="write">
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   setProviderToClear(p);
                                   setClearMode('balance');
                                   setShowClearWalletDialog(true);
                                 }}
                                 disabled={balance === 0 || isClearingWallet === p.uid}
                                 className="w-1/2 h-8 text-xs border-destructive/30 hover:border-destructive hover:bg-destructive/10 text-destructive rounded-lg font-medium"
                               >
                                 {isClearingWallet === p.uid && clearMode === 'balance' ? (
                                   <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                 ) : (
                                   <Trash2 className="h-3.5 w-3.5 mr-1" />
                                 )}
                                 Clear Wallet
                               </Button>

                               <Button
                                 variant="destructive"
                                 size="sm"
                                 onClick={() => {
                                   setProviderToClear(p);
                                   setClearMode('all');
                                   setShowClearWalletDialog(true);
                                 }}
                                 disabled={isClearingWallet === p.uid}
                                 className="w-1/2 h-8 text-xs rounded-lg font-medium bg-destructive hover:bg-destructive/90 text-white"
                               >
                                 {isClearingWallet === p.uid && clearMode === 'all' ? (
                                   <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                 ) : (
                                   <Trash2 className="h-3.5 w-3.5 mr-1" />
                                 )}
                                 Clear All
                               </Button>
                             </PermissionGuard>
                           </div>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet_complaints">
          <WalletComplaintsTab />
        </TabsContent>

        <TabsContent value="wallet_details">
          <Card>
            <CardHeader>
              <CardTitle>Provider Wallet Details & Ledger</CardTitle>
              <CardDescription>Select a service provider to inspect their prepaid wallet balance and transaction ledger.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left panel: List of Providers */}
                <div className="lg:col-span-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="provider-wallet-search" className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Search Provider</Label>
                    <Input 
                      id="provider-wallet-search"
                      placeholder="Type name or email..."
                      value={providerSearch}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProviderSearch(e.target.value)}
                    />
                  </div>
                  <div className="border rounded-xl max-h-[500px] overflow-y-auto divide-y bg-background">
                    {filteredProvidersForSelect.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground text-center">No matching providers found.</div>
                    ) : (
                      filteredProvidersForSelect.map(p => {
                        const isSelected = selectedProvider?.uid === p.uid;
                        return (
                          <div 
                            key={p.uid}
                            className={cn(
                              "p-3 text-sm cursor-pointer transition-colors border-b last:border-b-0 text-left",
                              isSelected ? "bg-primary/10 border-l-4 border-l-primary font-semibold" : "hover:bg-accent hover:text-accent-foreground"
                            )}
                            onClick={() => fetchSelectedProviderWallet(p)}
                          >
                            <div className="font-bold truncate">{p.displayName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate">{p.email}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right panel: Details */}
                <div className="lg:col-span-8">
                  {selectedProvider ? (
                    <div className="space-y-6">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-muted/30 p-4 rounded-xl border">
                        <div className="text-left">
                          <h3 className="font-bold text-lg">{selectedProvider.displayName}</h3>
                          <p className="text-sm text-muted-foreground font-mono">{selectedProvider.email}</p>
                        </div>
                        
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto md:justify-end">
                          <div className="text-left sm:text-right">
                            <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider block">Prepaid Balance</span>
                            <span className="font-mono text-3xl font-extrabold text-primary">{symbol}{walletBalance.toFixed(decimals)}</span>
                          </div>
                          <Button 
                            onClick={() => setIsWalletModalOpen(true)}
                            className="w-full sm:w-auto h-10 px-4 font-bold flex items-center justify-center gap-1.5"
                          >
                            <Wallet className="h-4 w-4" /> Adjust Wallet / Refund
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-bold text-base flex items-center gap-1.5 text-left">
                          <History className="h-4 w-4 text-primary" />
                          Transaction Ledger History
                        </h4>

                        {isLoadingWallet ? (
                          <div className="flex items-center justify-center py-10">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        ) : walletHistory.length === 0 ? (
                          <div className="text-center py-10 text-xs text-muted-foreground border border-dashed rounded-xl">
                            No prepaid transactions found for this provider.
                          </div>
                        ) : (
                          <div className="border rounded-xl overflow-hidden">
                            <Table>
                              <TableHeader className="bg-muted/40">
                                <TableRow>
                                  <TableHead className="pl-6">Date</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right pr-6">Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {walletHistory.map(tx => {
                                  const isCredit = tx.amount >= 0;
                                  return (
                                    <TableRow key={tx.id}>
                                      <TableCell className="pl-6 text-xs font-mono whitespace-nowrap text-left">
                                        {new Date(tx.timestamp).toLocaleString('en-IN')}
                                      </TableCell>
                                      <TableCell className="text-left">
                                        <Badge variant={tx.type === 'deposit' ? 'default' : tx.type === 'commission_deduction' ? 'destructive' : 'outline'} className="capitalize">
                                          {tx.type.replace('_', ' ')}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-xs font-medium max-w-xs text-left">
                                        <div className="truncate" title={tx.description}>{tx.description}</div>
                                        {tx.bookingId && <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">Ref: #{tx.bookingId}</span>}
                                        {tx.razorpayPaymentId && (
                                          <span className="block text-[10px] text-muted-foreground font-mono select-all mt-0.5" title={tx.razorpayPaymentId}>
                                            Razorpay ID: {tx.razorpayPaymentId}
                                          </span>
                                        )}
                                      </TableCell>
                                      <TableCell className={cn(
                                        "text-right pr-6 font-bold whitespace-nowrap font-mono",
                                        isCredit ? "text-emerald-600" : "text-rose-600"
                                      )}>
                                        {isCredit ? '+' : ''}{symbol}{tx.amount.toFixed(decimals)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-20 text-muted-foreground border border-dashed rounded-xl h-full flex flex-col justify-center items-center">
                      <Wallet className="h-12 w-12 text-muted-foreground/30 mb-3" />
                      <p className="font-bold text-sm">No Provider Selected</p>
                      <p className="text-xs max-w-xs mx-auto mt-1">Select a service provider from the list on the left to load their prepaid balance details.</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet_settings">
          <WalletSettingsTab />
        </TabsContent>
      </Tabs>
      
      <AlertDialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{actionType === 'rejected' ? 'Reject' : 'Request Re-submission'}</AlertDialogTitle>
            <AlertDialogDescriptionComponent>Please provide a reason. This will be sent to the provider and the amount will be refunded to their wallet.</AlertDialogDescriptionComponent>
          </AlertDialogHeader>
          <div className="py-2 space-y-2">
            <Label htmlFor="rejection-reason">Reason for {actionType === 'rejected' ? 'Rejection' : 'Re-submission'}</Label>
            <Textarea id="rejection-reason" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="e.g., Bank details incorrect. Please verify and submit again."/>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if(requestToActOn) handleUpdateStatus(requestToActOn, actionType!, rejectionReason)}} disabled={!rejectionReason.trim()} className="bg-destructive hover:bg-destructive/90">Confirm Action</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearWalletDialog} onOpenChange={setShowClearWalletDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clearMode === 'all' ? 'Clear All Wallet & History Logs' : 'Clear Wallet Balance'}
            </AlertDialogTitle>
            <AlertDialogDescriptionComponent>
              {clearMode === 'all' ? (
                <span>
                  Are you sure you want to delete all transaction ledgers, withdrawal requests, and reset wallet balances to 0 for <span className="font-semibold text-foreground">{providerToClear?.displayName}</span>? This action is permanent and cannot be undone.
                </span>
              ) : (
                <span>
                  Are you sure you want to clear/reset the withdrawable balance for <span className="font-semibold text-foreground">{providerToClear?.displayName}</span>? This will set their withdrawable balance to {formatCurrency(0, symbol, decimals, code)} permanently.
                </span>
              )}
            </AlertDialogDescriptionComponent>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowClearWalletDialog(false);
              setProviderToClear(null);
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (providerToClear) {
                  handleClearWalletExecute(providerToClear.uid, providerToClear.displayName || "Unknown");
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Confirm Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Withdrawal Request Details</DialogTitle>
                <DialogDescriptionComponent>
                    Request from: <span className="font-semibold">{selectedRequestForDetails?.providerName}</span>
                </DialogDescriptionComponent>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <DetailItem label="Amount" value={selectedRequestForDetails ? formatCurrency(selectedRequestForDetails.amount, symbol, decimals, code) : ''} />
                <DetailItem label="Method" value={selectedRequestForDetails?.method.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} />
                <Separator />
                <h4 className="font-semibold text-sm">Account Details</h4>
                {selectedRequestForDetails?.method === 'bank_transfer' ? (
                    <>
                        <DetailItem label="Account Holder" value={selectedRequestForDetails.details.accountHolderName} />
                        <DetailItem label="Bank Name" value={selectedRequestForDetails.details.bankName} />
                        <DetailItem label="Account Number" value={selectedRequestForDetails.details.accountNumber} />
                        <DetailItem label="IFSC Code" value={selectedRequestForDetails.details.ifscCode} />
                    </>
                ) : selectedRequestForDetails?.method === 'upi' ? (
                    <DetailItem label="UPI ID" value={selectedRequestForDetails.details.upiId} />
                ) : (
                    <DetailItem label="Email" value={selectedRequestForDetails?.details.email} />
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="secondary">Close</Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedProvider && (
        <ProviderWalletAdjustmentModal 
          isOpen={isWalletModalOpen}
          onClose={() => setIsWalletModalOpen(false)}
          providerId={selectedProvider.uid || selectedProvider.id!}
          providerName={selectedProvider.displayName || 'Provider'}
          onSuccess={() => fetchSelectedProviderWallet(selectedProvider)}
        />
      )}
    </div>
  );
}