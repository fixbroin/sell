
"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, PackageSearch, Check, X, MoreHorizontal, Eye, Trash2, AlertTriangle } from "lucide-react";
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, runTransaction, getDoc, addDoc, where, deleteDoc } from '@/lib/mysqlDb';
import type { WithdrawalRequest, WithdrawalStatus, FirestoreNotification } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Separator } from '@/components/ui/separator';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";

const formatDate = (timestamp?: any) => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
};

const DetailItem = ({ label, value }: { label: string, value?: string | null }) => (
    <div className="grid grid-cols-3 gap-2">
        <p className="text-sm text-muted-foreground col-span-1">{label}</p>
        <p className="text-sm font-semibold col-span-2">{value || 'N/A'}</p>
    </div>
);

export default function WithdrawalRequestsTab() {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const { toast } = useToast();
  
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedRequestForDetails, setSelectedRequestForDetails] = useState<WithdrawalRequest | null>(null);

  useEffect(() => {
    setIsLoading(true);
    const requestsRef = collection(db, "withdrawalRequests");
    const q = query(
        requestsRef, 
        where("providerId", "==", "referral_system"),
        orderBy("requestedAt", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WithdrawalRequest)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching withdrawal requests:", error);
      toast({ title: "Error", description: "Could not load requests.", variant: "destructive" });
      setIsLoading(false);
    });
    
    return () => unsubscribe();
  }, [toast]);

  const handleViewDetails = (request: WithdrawalRequest) => {
    setSelectedRequestForDetails(request);
    setDetailsModalOpen(true);
  };

  const handleUpdateStatus = async (request: WithdrawalRequest, newStatus: WithdrawalStatus) => {
    if (!request.id) return;
    setIsUpdating(request.id);
    const userDocRef = doc(db, "users", request.userId || "unknown");
    const requestDocRef = doc(db, "withdrawalRequests", request.id);

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) throw new Error("User not found.");

        const updatePayload: Partial<WithdrawalRequest> = { status: newStatus, processedAt: Timestamp.now() };
        let userUpdatePayload: Partial<{[key: string]: any}> = {};
        let notificationMessage = `Your withdrawal request of ${symbol}${request.amount.toFixed(2)} has been updated to ${newStatus}.`;
        let notificationType: FirestoreNotification['type'] = 'info';

        switch (newStatus) {
          case 'rejected':
            const newWalletBalance = (userDoc.data().walletBalance || 0) + request.amount;
            userUpdatePayload = { walletBalance: newWalletBalance, withdrawalPending: false };
            notificationMessage = `Your withdrawal request of ${symbol}${request.amount.toFixed(2)} was rejected. The amount has been refunded to your wallet.`;
            notificationType = 'error';
            break;
          case 'completed':
            const currentTotalPaidOut = userDoc.data().totalReferralPaidOut || 0;
            userUpdatePayload = { 
              withdrawalPending: false,
              totalReferralPaidOut: currentTotalPaidOut + request.amount 
            }; 
            notificationMessage = `Your withdrawal of ${symbol}${request.amount.toFixed(2)} has been successfully completed.`;
            notificationType = 'success';
            break;
          case 'approved':
          case 'processing':
            // No change to user doc for these intermediate states
            break;
        }

        // Update the request document
        transaction.update(requestDocRef, updatePayload);
        
        // Update the user document if there are changes
        if (Object.keys(userUpdatePayload).length > 0) {
            transaction.update(userDocRef, userUpdatePayload);
        }
        
        // Create notification for user
        const notification: Omit<FirestoreNotification, 'id'> = {
            userId: request.userId || "unknown",
            title: `Withdrawal Request ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`,
            message: notificationMessage,
            type: notificationType,
            href: '/referral?tab=withdraw',
            read: false,
            createdAt: Timestamp.now(),
        };
        transaction.set(doc(collection(db, "userNotifications")), notification);
      });
      
      toast({ title: "Success", description: `Request status updated to ${newStatus}.` });

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
            const userDocRef = doc(db, "users", request.userId || "unknown");
            
            const reqSnap = await transaction.get(requestDocRef);
            if (!reqSnap.exists()) return;

            const status = reqSnap.data().status;
            // Refund only if money was deducted (request stage) but not paid out or already rejected (refunded)
            if (['pending', 'approved', 'processing'].includes(status)) {
                const userSnap = await transaction.get(userDocRef);
                if (userSnap.exists()) {
                    const currentBalance = userSnap.data().walletBalance || 0;
                    transaction.update(userDocRef, { 
                        walletBalance: currentBalance + request.amount,
                        withdrawalPending: false 
                    });
                }
            }
            transaction.delete(requestDocRef);
        });
        toast({title: "Success", description: "Request deleted and balance adjusted."});
    } catch (error) {
        toast({title: "Error", description: "Could not delete request.", variant: "destructive"});
    } finally {
        setIsUpdating(null);
    }
  };


  const getStatusBadgeVariant = (status: WithdrawalStatus) => {
    switch(status) {
      case 'pending': return 'secondary';
      case 'approved': return 'default';
      case 'processing': return 'default';
      case 'completed': return 'default';
      case 'rejected': return 'destructive';
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
      default: return '';
    }
  }

  if (isLoading) {
    return <Card><CardContent className="flex justify-center items-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>;
  }

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle>Withdrawal Requests</CardTitle>
        <CardDescription>Manage user requests to withdraw their referral earnings.</CardDescription>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center py-10">
            <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No withdrawal requests received yet.</p>
          </div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>User</TableHead><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Details</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {requests.map(req => (
                 <TableRow key={req.id}>
                    <TableCell><div className="font-medium">{req.userName}</div><div className="text-xs text-muted-foreground">{req.userEmail}</div></TableCell>
                    <TableCell>{symbol}{req.amount.toFixed(2)}</TableCell>
                    <TableCell className="capitalize">{req.method.replace('_', ' ')}</TableCell>
                    <TableCell>
                        <Button variant="outline" size="sm" onClick={() => handleViewDetails(req)}>
                            <Eye className="mr-1 h-4 w-4" /> View
                        </Button>
                    </TableCell>
                    <TableCell className="text-xs">{formatDate(req.requestedAt)}</TableCell>
                    <TableCell><Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>{req.status}</Badge></TableCell>
                    <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                            {req.status === 'pending' && (
                                <>
                                    <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleUpdateStatus(req, 'approved')} disabled={isUpdating === req.id}>
                                        <Check className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" disabled={isUpdating === req.id}>
                                                <X className="h-4 w-4" />
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader><AlertDialogTitle>Confirm Rejection</AlertDialogTitle><AlertDialogDescription>This will reject the request and refund {symbol}{req.amount.toFixed(2)} to the user's wallet. Are you sure?</AlertDialogDescription></AlertDialogHeader>
                                            <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => handleUpdateStatus(req, 'rejected')} className="bg-destructive hover:bg-destructive/90">Yes, Reject & Refund</AlertDialogAction></AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </>
                            )}
                            {req.status === 'approved' && (
                                <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(req, 'processing')} disabled={isUpdating === req.id}>
                                    Process
                                </Button>
                            )}
                            {req.status === 'processing' && (
                                <Button variant="outline" size="sm" className="text-green-600" onClick={() => handleUpdateStatus(req, 'completed')} disabled={isUpdating === req.id}>
                                    Complete
                                </Button>
                            )}

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" disabled={isUpdating === req.id}>
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Delete Request?</AlertDialogTitle>
                                        <AlertDialogDescription>Permanently remove this request record. This will NOT refund money if it was pending.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => handleDeleteRequest(req)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        </div>
                    </TableCell>
                 </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Withdrawal Request Details</DialogTitle>
                <DialogDescription>
                    User: <span className="font-semibold">{selectedRequestForDetails?.userName}</span>
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
                <DetailItem label="Amount" value={`${symbol}${selectedRequestForDetails?.amount.toFixed(2)}`} />
                <DetailItem label="Method" value={selectedRequestForDetails?.method.replace('_', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} />
                <Separator />
                <h4 className="font-semibold text-sm">Transfer Details</h4>
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
                    <>
                        <DetailItem label="Email" value={selectedRequestForDetails?.details.email} />
                        <DetailItem label="Mobile" value={selectedRequestForDetails?.details.mobileNumber} />
                    </>
                )}
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="secondary">Close</Button>
                </DialogClose>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
