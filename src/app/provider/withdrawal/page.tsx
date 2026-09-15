
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Send, AlertTriangle, PackageSearch, History, Edit, Check, ChevronsUpDown } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, runTransaction, getDoc, addDoc, doc, Timestamp, getDocs, limit, updateDoc } from '@/lib/mysqlDb';
import type { WithdrawalSettings, WithdrawalRequest, WithdrawalMethodType, WithdrawalStatus, FirestoreNotification, FirestoreUser, FirestoreBooking, ProviderFeeType } from '@/types/firestore';
import { useAuth } from '@/hooks/useAuth';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import { nanoid } from 'nanoid';
import { triggerPushNotification } from '@/lib/fcmUtils';

const withdrawalFormSchema = z.object({
  amount: z.coerce.number().positive("Withdrawal amount must be positive.").nullable(),
  method: z.string({ required_error: "Please select a withdrawal method." }),
  details: z.object({
    accountHolderName: z.string().optional(),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    confirmAccountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    upiId: z.string().optional(),
    email: z.string().optional(), // For Amazon Gift Card
  }),
}).refine(data => {
    if (data.method === 'bank_transfer') {
        if (!data.details.accountHolderName || !data.details.bankName || !data.details.accountNumber || !data.details.ifscCode) {
            return false;
        }
        if (data.details.accountNumber !== data.details.confirmAccountNumber) {
            return false;
        }
    }
    return true;
}, { 
    message: "Account numbers do not match.",
    path: ["details", "confirmAccountNumber"],
}).refine(data => data.method !== 'bank_transfer' || !!data.details.accountHolderName, {
    message: "Account holder name is required for bank transfer.",
    path: ["details", "accountHolderName"],
}).refine(data => data.method !== 'bank_transfer' || !!data.details.bankName, {
    message: "Bank name is required for bank transfer.",
    path: ["details", "bankName"],
}).refine(data => data.method !== 'bank_transfer' || !!data.details.accountNumber, {
    message: "Account number is required for bank transfer.",
    path: ["details", "accountNumber"],
}).refine(data => data.method !== 'bank_transfer' || !!data.details.ifscCode, {
    message: "IFSC code is required for bank transfer.",
    path: ["details", "ifscCode"],
}).refine(data => data.method !== 'upi' || (data.details.upiId && data.details.upiId.includes('@')), {
    message: "Please enter a valid UPI ID.",
    path: ["details", "upiId"],
}).refine(data => data.method !== 'amazon_gift_card' || (data.details.email && z.string().email().safeParse(data.details.email).success), {
    message: "A valid email is required for Amazon Gift Card.",
    path: ["details", "email"],
});


type WithdrawalFormData = z.infer<typeof withdrawalFormSchema>;

const formatDate = (timestamp?: any) => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
};

const calculateProviderFee = (bookingAmount: number, feeType?: ProviderFeeType, feeValue?: number): number => {
    if (!feeType || !feeValue || feeValue <= 0) return 0;
    if (feeType === 'fixed') return feeValue;
    if (feeType === 'percentage') return (bookingAmount * feeValue) / 100;
    return 0;
};
const isCashPayment = (method: string) => {
    if (!method) return true;
    const lower = method.toLowerCase();
    return lower === 'cash' || 
           lower === 'pay after service' || 
           lower === 'cash on delivery' || 
           lower === 'cod' || 
           lower === 'offline';
};

function WithdrawalPageContent() {
  const { user: providerUser, firestoreUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const { toast } = useToast();
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRequest[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [completedBookings, setCompletedBookings] = useState<FirestoreBooking[]>([]);
  const [editingRequest, setEditingRequest] = useState<WithdrawalRequest | null>(null);

  const [withdrawalSettings, setWithdrawalSettings] = useState<WithdrawalSettings | null>(null);
  const [isMethodPickerOpen, setIsMethodPickerOpen] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);

  const withdrawableBalance = useMemo(() => {
    return firestoreUser?.withdrawableBalance || 0;
  }, [firestoreUser?.withdrawableBalance]);


  const form = useForm<WithdrawalFormData>({
    resolver: zodResolver(withdrawalFormSchema),
    defaultValues: {
      amount: 0,
      method: undefined,
      details: { accountHolderName: firestoreUser?.displayName || "", bankName: "", accountNumber: "", confirmAccountNumber: "", ifscCode: "", upiId: "", email: firestoreUser?.email || "" },
    },
  });
  
  useEffect(() => {
    if (firestoreUser && !editingRequest) {
        const bankDetails = (firestoreUser as any).bankDetails || {};
        form.reset({
            amount: 0,
            method: undefined,
            details: {
                email: firestoreUser.email || "",
                accountHolderName: bankDetails.accountHolderName || firestoreUser.displayName || "",
                bankName: bankDetails.bankName || "",
                accountNumber: bankDetails.accountNumber || "",
                confirmAccountNumber: bankDetails.accountNumber || "",
                ifscCode: bankDetails.ifscCode || (bankDetails.customFields && Object.values(bankDetails.customFields)[0]) || "",
                upiId: "",
            },
        });
    }
  }, [firestoreUser, editingRequest, form]);

   useEffect(() => {
    if (editingRequest) {
        form.reset({
            amount: editingRequest.amount,
            method: editingRequest.method,
            details: {
                accountHolderName: editingRequest.details.accountHolderName || firestoreUser?.displayName || "",
                bankName: editingRequest.details.bankName || "",
                accountNumber: editingRequest.details.accountNumber || "",
                confirmAccountNumber: editingRequest.details.accountNumber || "",
                ifscCode: editingRequest.details.ifscCode || "",
                upiId: editingRequest.details.upiId || "",
                email: editingRequest.details.email || firestoreUser?.email || "",
            },
        });
    }
  }, [editingRequest, form, firestoreUser]);
  
  useEffect(() => {
    const settingsDocRef = doc(db, "appConfiguration", "withdrawal_provider");
    const unsubscribeSettings = onSnapshot(settingsDocRef, (docSnap) => {
        if (docSnap.exists()) {
            setWithdrawalSettings(docSnap.data() as WithdrawalSettings);
        } else {
            setWithdrawalSettings(null); // Or some default settings
        }
        setIsLoadingSettings(false);
    }, (error) => {
        console.error("Error fetching withdrawal settings:", error);
        setIsLoadingSettings(false);
    });

    if (!providerUser?.uid) {
        setIsLoadingHistory(false);
        return () => unsubscribeSettings();
    }
    setIsLoadingHistory(true);
    
    const bookingsQuery = query(collection(db, "bookings"), where("providerId", "==", providerUser.uid), where("status", "==", "Completed"));
    const withdrawalsQuery = query(collection(db, "withdrawalRequests"), where("providerId", "==", providerUser.uid), orderBy("requestedAt", "desc"));
    
    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => setCompletedBookings(snapshot.docs.map(doc => ({...doc.data(), id: doc.id} as FirestoreBooking))));
    const unsubWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => { setWithdrawalHistory(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WithdrawalRequest))); setIsLoadingHistory(false); });

    return () => {
        unsubscribeSettings();
        unsubBookings();
        unsubWithdrawals();
    };
  }, [providerUser?.uid]);

  const watchedMethod = form.watch("method");

  const handleEditRequest = (request: WithdrawalRequest) => {
    setEditingRequest(request);
    const formElement = document.getElementById('withdrawal-form-card');
    if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const onSubmit = async (data: WithdrawalFormData) => {
    if (!providerUser || !firestoreUser) return;
    if (!data.amount || data.amount <= 0) {
        form.setError("amount", { message: "Please enter a valid amount." }); return;
    }
    
    if (!editingRequest && firestoreUser.withdrawalPending) {
        toast({ title: "Request Pending", description: "You already have a withdrawal request being processed.", variant: "destructive"}); return;
    }

    setIsSubmitting(true);
    
    if (!withdrawalSettings?.isWithdrawalEnabled) {
      toast({ title: "Withdrawals Disabled", variant: "destructive" });
      setIsSubmitting(false); return;
    }
    
    const effectiveBalance = editingRequest ? withdrawableBalance + editingRequest.amount : withdrawableBalance;
    if (data.amount > effectiveBalance) {
      form.setError("amount", { message: `Amount exceeds your balance of ${symbol}${effectiveBalance.toFixed(decimals)}` });
      setIsSubmitting(false); return;
    }

    if (data.amount < (withdrawalSettings.minWithdrawalAmount)) { 
      form.setError("amount", { message: `Minimum withdrawal is ${symbol}${withdrawalSettings.minWithdrawalAmount}` });
      setIsSubmitting(false); return;
    }

    try {
        const { confirmAccountNumber, ...detailsToSave } = data.details; 

        if (editingRequest) {
            await runTransaction(db, async (transaction) => {
                const userDocRef = doc(db, "users", providerUser.uid);
                const userDoc = await transaction.get(userDocRef);
                if (!userDoc.exists()) throw new Error("Provider user document not found.");
                
                const currentBalance = userDoc.data().withdrawableBalance || 0;
                // Add back the old amount, subtract the new amount
                const newBalance = currentBalance + editingRequest.amount - data.amount!;
                if (newBalance < 0) throw new Error("Insufficient balance for this update.");

                // Update monthly stats withdrawals
                const now = new Date();
                const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const stats = userDoc.data().monthlyStats || { monthKey, gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0 };
                if (stats.monthKey === monthKey) {
                    stats.withdrawals = (stats.withdrawals || 0) - editingRequest.amount + data.amount!;
                }

                const requestDocRef = doc(db, "withdrawalRequests", editingRequest.id!);
                transaction.update(requestDocRef, {
                    amount: data.amount,
                    method: data.method as WithdrawalMethodType,
                    details: detailsToSave,
                    status: 'pending',
                    requestedAt: Timestamp.now(), 
                    adminNotes: null, 
                });
                transaction.update(userDocRef, { 
                    withdrawableBalance: newBalance, 
                    withdrawalPending: true,
                    monthlyStats: stats
                });
            });
            toast({ title: "Request Re-submitted", description: "Your withdrawal request has been updated and sent for review."});
            setEditingRequest(null);
        } else {
            const newRequestData: Omit<WithdrawalRequest, 'id'> = {
                providerId: providerUser.uid, providerName: firestoreUser.displayName || "N/A", providerEmail: firestoreUser.email || "N/A",
                amount: data.amount, method: data.method as WithdrawalMethodType, details: detailsToSave, status: 'pending', requestedAt: Timestamp.now(),
            };
            await runTransaction(db, async (transaction) => {
                const userDocRef = doc(db, "users", providerUser.uid);
                const userDoc = await transaction.get(userDocRef);
                if (!userDoc.exists()) throw new Error("Provider user document not found.");
                
                const currentBalance = userDoc.data().withdrawableBalance || 0;
                if (currentBalance < data.amount!) throw new Error("Insufficient balance.");

                // Update monthly stats withdrawals
                const now = new Date();
                const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
                const stats = userDoc.data().monthlyStats || { monthKey, gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0 };
                if (stats.monthKey === monthKey) {
                    stats.withdrawals = (stats.withdrawals || 0) + data.amount!;
                }

                const newRequestRef = doc(collection(db, "withdrawalRequests"));
                transaction.set(newRequestRef, newRequestData);
                transaction.update(userDocRef, { 
                    withdrawableBalance: currentBalance - data.amount!,
                    withdrawalPending: true,
                    monthlyStats: stats
                });
            });
            toast({ title: "Request Submitted", description: "Your withdrawal request is being processed."});
        }
        
        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
            const adminUid = adminSnapshot.docs[0].id;
            const adminNotification: FirestoreNotification = {
                userId: adminUid,
                title: editingRequest ? "Withdrawal Request Re-submitted" : "New Withdrawal Request",
                message: `${firestoreUser.displayName || 'A provider'} requested ${symbol}${data.amount.toFixed(decimals)}.`,
                type: 'admin_alert', href: `/admin/provider-withdrawals`, read: false, createdAt: Timestamp.now(),
            };
            await addDoc(collection(db, "userNotifications"), adminNotification);
            
            triggerPushNotification({
                userId: adminUid,
                title: adminNotification.title,
                body: adminNotification.message,
                href: adminNotification.href,
                sound: 'default'
            }).catch(pushErr => console.error("Error sending admin withdrawal push:", pushErr));
        }
        form.reset();
    } catch (error) {
        toast({ title: "Error", description: (error as Error).message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const renderMethodFields = () => {
    switch (watchedMethod) {
      case 'bank_transfer': return (
        <>
          <FormField control={form.control} name="details.accountHolderName" render={({ field }) => (<FormItem><FormLabel>Account Holder Name</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.bankName" render={({ field }) => (<FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.accountNumber" render={({ field }) => (<FormItem><FormLabel>Account Number</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.confirmAccountNumber" render={({ field }) => (<FormItem><FormLabel>Confirm Account Number</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="details.ifscCode" render={({ field }) => {
            const firstCustomField = appConfig?.customBankFields?.[0];
            const bankCodeLabel = firstCustomField?.name || "IFSC Code";
            const bankPlaceholder = firstCustomField?.placeholder || "e.g., SBIN0001234";
            return (
              <FormItem>
                <FormLabel>{bankCodeLabel}</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={bankPlaceholder} 
                    {...field} 
                    value={field.value ?? ""} 
                    onChange={(e) => {
                      const type = firstCustomField?.type || 'alphanumeric';
                      const rawVal = e.target.value;
                      let formattedVal = rawVal;
                      if (type === 'alphanumeric' || type === 'text') {
                        formattedVal = rawVal.toUpperCase();
                      }
                      field.onChange(formattedVal);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            );
          }} />
        </>
      );
      case 'upi': return (<FormField control={form.control} name="details.upiId" render={({ field }) => (<FormItem><FormLabel>UPI ID</FormLabel><FormControl><Input placeholder="yourname@okhdfc" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />);
      case 'amazon_gift_card': return (<FormField control={form.control} name="details.email" render={({ field }) => (<FormItem><FormLabel>Email for Gift Card</FormLabel><FormControl><Input type="email" placeholder="your@email.com" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />);
      default: return null;
    }
  };
  
  if (authIsLoading || isLoadingAppConfig || isLoadingHistory || isLoadingSettings) {
      return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }
  
  const getStatusBadgeVariant = (status: WithdrawalStatus): any => ({'pending': 'secondary', 'approved': 'default', 'processing': 'default', 'completed': 'default', 'rejected': 'destructive', 're_submit': 'destructive'})[status] || 'outline';
  const getStatusBadgeClass = (status: WithdrawalStatus): string => {
    const classes: Record<string, string> = {'approved': 'bg-blue-500 hover:bg-blue-600', 'completed': 'bg-green-500 hover:bg-green-600'};
    return classes[status] || '';
  };

  return (
    <div className="space-y-3 container mx-auto py-2">
      <Card id="withdrawal-form-card">
        <CardHeader>
            <CardTitle>{editingRequest ? "Re-submit Withdrawal Request" : "Request a Withdrawal"}</CardTitle>             <CardDescription>{editingRequest ? "Please correct your details and re-submit the request." : `Transfer your available earnings. Minimum withdrawal is ${symbol}${withdrawalSettings?.minWithdrawalAmount || 0}.`}</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="p-4 bg-green-500/10 border-green-500/30 border rounded-lg text-center">
                <p className="text-sm text-green-700 font-medium">Available to Withdraw</p>
                <p className="text-3xl font-bold text-green-600">{symbol}{withdrawableBalance.toFixed(decimals)}</p>
            </div>
        </CardContent>
        {withdrawalSettings?.isWithdrawalEnabled ? (
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                <CardContent className="space-y-4">
                    {!editingRequest && firestoreUser?.withdrawalPending && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Request Already Pending</AlertTitle><AlertDescription>You have a withdrawal request being processed.</AlertDescription></Alert>}
                    <FormField control={form.control} name="amount" render={({ field }) => (<FormItem><FormLabel>Amount to Withdraw ({symbol})</FormLabel><FormControl><Input type="number" placeholder={`Available: ${symbol}${withdrawableBalance.toFixed(decimals)}`} {...field} value={field.value ?? ""} disabled={isSubmitting || (firestoreUser?.withdrawalPending && !editingRequest)} /></FormControl><FormMessage /></FormItem>)} />
                    <FormField control={form.control} name="method" render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="mb-2">Withdrawal Method</FormLabel>
                        <Dialog open={isMethodPickerOpen} onOpenChange={setIsMethodPickerOpen}>
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={cn(
                                "w-full justify-between text-left font-normal h-10",
                                !field.value && "text-muted-foreground"
                              )}
                              disabled={isSubmitting || (firestoreUser?.withdrawalPending && !editingRequest)}
                              type="button"
                            >
                              {field.value === "bank_transfer" && "Bank Transfer"}
                              {field.value === "upi" && "UPI"}
                              {field.value === "amazon_gift_card" && "Amazon Gift Card"}
                              {!field.value && "Select a method"}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                            <DialogHeader>
                              <DialogTitle>Select Withdrawal Method</DialogTitle>
                              <DialogDescription>
                                Choose one of the enabled withdrawal methods.
                              </DialogDescription>
                            </DialogHeader>
                            <div className="py-4">
                              <ScrollArea className="h-[200px] rounded-md border p-2">
                                <div className="space-y-1">
                                  {withdrawalSettings?.enabledMethods?.bank_transfer && (
                                    <Button
                                      variant={field.value === "bank_transfer" ? "secondary" : "ghost"}
                                      className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                      onClick={() => {
                                        field.onChange("bank_transfer");
                                        setIsMethodPickerOpen(false);
                                      }}
                                      type="button"
                                    >
                                      <span className="text-sm font-medium">Bank Transfer</span>
                                      {field.value === "bank_transfer" && (
                                        <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                      )}
                                    </Button>
                                  )}
                                  {withdrawalSettings?.enabledMethods?.upi && (
                                    <Button
                                      variant={field.value === "upi" ? "secondary" : "ghost"}
                                      className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                      onClick={() => {
                                        field.onChange("upi");
                                        setIsMethodPickerOpen(false);
                                      }}
                                      type="button"
                                    >
                                      <span className="text-sm font-medium">UPI</span>
                                      {field.value === "upi" && (
                                        <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                      )}
                                    </Button>
                                  )}
                                  {withdrawalSettings?.enabledMethods?.amazon_gift_card && (
                                    <Button
                                      variant={field.value === "amazon_gift_card" ? "secondary" : "ghost"}
                                      className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                      onClick={() => {
                                        field.onChange("amazon_gift_card");
                                        setIsMethodPickerOpen(false);
                                      }}
                                      type="button"
                                    >
                                      <span className="text-sm font-medium">Amazon Gift Card</span>
                                      {field.value === "amazon_gift_card" && (
                                        <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                      )}
                                    </Button>
                                  )}
                                  {Object.values(withdrawalSettings?.enabledMethods || {}).every(v => !v) && (
                                    <div className="p-4 text-center text-sm text-muted-foreground">
                                      No withdrawal methods enabled.
                                    </div>
                                  )}
                                </div>
                              </ScrollArea>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <FormMessage />
                      </FormItem>
                    )}/>
                    {watchedMethod && <div className="space-y-4 p-4 border rounded-md">{renderMethodFields()}</div>}
                </CardContent>
                <CardFooter className="flex-col items-start gap-4">
                    <div className="flex gap-2">
                        <Button type="submit" disabled={isSubmitting || (firestoreUser?.withdrawalPending && !editingRequest)}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} {editingRequest ? "Re-submit Request" : "Submit Request"}
                        </Button>
                        {editingRequest && (<Button type="button" variant="outline" onClick={() => { setEditingRequest(null); form.reset();}}>Cancel Edit</Button>)}
                    </div>
                </CardFooter>
                </form>
            </Form>
        ) : (
             <CardContent>
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Withdrawals Disabled</AlertTitle>
                    <AlertDescription>Withdrawals are currently disabled by the admin.</AlertDescription>
                </Alert>
            </CardContent>
        )}
      </Card>
      
      <Card>
          <CardHeader><CardTitle className="flex items-center"><History className="mr-2 h-5 w-5"/>Withdrawal History</CardTitle></CardHeader>
          <CardContent>{isLoadingHistory ? <div className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto"/></div> : withdrawalHistory.length === 0 ? <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No withdrawal requests made yet.</p></div> : <Table><TableHeader><TableRow><TableHead>Amount</TableHead><TableHead>Method</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{withdrawalHistory.map(req => (<TableRow key={req.id}>
            <TableCell className="font-semibold">{symbol}{req.amount.toFixed(decimals)}</TableCell>
            <TableCell className="capitalize">{req.method.replace('_', ' ')}</TableCell>
            <TableCell className="text-xs">{formatDate(req.requestedAt)}</TableCell>
            <TableCell>
                {req.status === 're_submit' ? (
                    <Button variant="destructive" size="sm" onClick={() => handleEditRequest(req)}>
                        <Edit className="mr-1 h-3 w-3" /> Re-submit
                    </Button>
                ) : (
                    <Badge variant={getStatusBadgeVariant(req.status)} className={`capitalize ${getStatusBadgeClass(req.status)}`}>{req.status}</Badge>
                )}
                {req.adminNotes && (req.status === 'rejected' || req.status === 're_submit') && <p className="text-xs text-destructive mt-1 max-w-xs">{req.adminNotes}</p>}
            </TableCell>
          </TableRow>))}</TableBody></Table>}</CardContent>
      </Card>
    </div>
  );
}

export default function ProviderWithdrawalPage() {
    return (
        <ProtectedRoute>
            <WithdrawalPageContent />
        </ProtectedRoute>
    );
}
