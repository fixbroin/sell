"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Wallet, ArrowUpRight, ArrowDownLeft, Plus, CheckCircle2, History, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatDateInTimezone } from '@/lib/utils';
import { 
  getProviderWalletDetailsAction, 
  getProviderWalletSettingsAction,
  depositProviderWalletAction,
  submitWalletComplaintAction,
  getProviderWalletComplaintsAction,
  WalletTransaction,
  WalletProviderSettings,
  WalletComplaint
} from '@/app/actions/providerWalletActions';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function ProviderWalletPage() {
  const { user: providerUser, isLoading: authIsLoading } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const symbol = appConfig?.currencySymbol || "₹";
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;
  const [isGatewayDialogOpen, setIsGatewayDialogOpen] = useState(false);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [complaints, setComplaints] = useState<WalletComplaint[]>([]);
  const [walletSettings, setWalletSettings] = useState<WalletProviderSettings | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);

  // Deposit Form State
  const [depositAmount, setDepositAmount] = useState('');
  const [isProcessingDeposit, setIsProcessingDeposit] = useState(false);

  // Dispute / Complaint State
  const [selectedTxForComplaint, setSelectedTxForComplaint] = useState<WalletTransaction | null>(null);
  const [complaintMessage, setComplaintMessage] = useState('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);

  const loadWalletDetails = useCallback(async () => {
    if (!providerUser?.uid) return;
    setIsLoadingDetails(true);
    try {
      const details = await getProviderWalletDetailsAction(providerUser.uid);
      setWalletBalance(details.balance);
      setTransactions(details.transactions);

      const complaintList = await getProviderWalletComplaintsAction(providerUser.uid);
      setComplaints(complaintList);

      const settings = await getProviderWalletSettingsAction();
      setWalletSettings(settings);
    } catch (error) {
      console.error("Error loading wallet details:", error);
      toast({ title: "Error", description: "Failed to load wallet data.", variant: "destructive" });
    } finally {
      setIsLoadingDetails(false);
    }
  }, [providerUser?.uid, toast]);

  useEffect(() => {
    const depositParam = searchParams.get('deposit');
    const sessionId = searchParams.get('session_id');
    const depositAmountParam = searchParams.get('amount');

    if (depositParam === 'success') {
      const verifyAndCreditStripeDeposit = async () => {
        if (sessionId && providerUser?.uid && depositAmountParam) {
          setIsProcessingDeposit(true);
          try {
            const res = await fetch(`/api/stripe/verify-session?session_id=${sessionId}`);
            const data = await res.json();
            if (res.ok && data.success && (data.status === 'paid' || data.status === 'complete')) {
              const amount = parseFloat(depositAmountParam);
              const creditRes = await depositProviderWalletAction(providerUser.uid, amount, {
                stripe_session_id: sessionId,
                stripe_payment_intent: data.payment_intent || undefined,
                payment_method: 'Stripe'
              });
              if (creditRes.success) {
                toast({ title: "Deposit Confirmed", description: creditRes.message });
              } else {
                toast({ title: "Deposit Credit Error", description: creditRes.message, variant: "destructive" });
              }
            } else {
              toast({ title: "Verification Failed", description: data.error || "Could not verify Stripe transaction.", variant: "destructive" });
            }
          } catch (err: any) {
            toast({ title: "Verification Error", description: err.message || "Failed to verify transaction.", variant: "destructive" });
          } finally {
            setIsProcessingDeposit(false);
            router.replace('/provider/wallet');
            loadWalletDetails();
          }
        } else {
          toast({ title: "Deposit Successful", description: "Your wallet balance has been updated." });
          router.replace('/provider/wallet');
          loadWalletDetails();
        }
      };
      
      verifyAndCreditStripeDeposit();
    } else if (depositParam === 'cancelled') {
      toast({ title: "Deposit Cancelled", description: "Prepaid wallet deposit was cancelled.", variant: "destructive" });
      router.replace('/provider/wallet');
      loadWalletDetails();
    }
  }, [searchParams, router, loadWalletDetails, toast, providerUser?.uid]);

  useEffect(() => {
    if (providerUser?.uid) {
      loadWalletDetails();
    }
  }, [providerUser?.uid, loadWalletDetails]);

  const loadRazorpayScript = () => new Promise((resolve) => { 
    if (window.Razorpay) { resolve(true); return; } 
    const script = document.createElement('script'); 
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'; 
    script.onload = () => resolve(true); 
    script.onerror = () => resolve(false); 
    document.body.appendChild(script); 
  });

  const handleRazorpayDeposit = async () => {
    if (!providerUser?.uid) return;
    const userUid = providerUser.uid;
    const userDisplayName = providerUser.displayName || '';
    const userEmail = providerUser.email || '';

    setIsProcessingDeposit(true);
    const amount = parseFloat(depositAmount);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        toast({ title: "Error", description: "Failed to load payment gateway checkout.", variant: "destructive" });
        setIsProcessingDeposit(false);
        return;
      }

      const currencyCode = appConfig?.currencyCode || 'INR';
      const getCurrencySubunitDecimals = (cc: string): number => {
        const c = cc.toUpperCase();
        if (['JPY', 'KRW', 'CLP', 'VND', 'UGX'].includes(c)) return 0;
        if (['BHD', 'JOD', 'KWD', 'OMR', 'TND'].includes(c)) return 3;
        return 2;
      };
      const currencyDecimals = getCurrencySubunitDecimals(currencyCode);
      const amountInSubunit = Math.round(amount * Math.pow(10, currencyDecimals));

      const res = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: amountInSubunit, 
          currency: currencyCode,
          notes: {
            type: 'wallet_topup',
            providerId: userUid,
            amount: amount.toString()
          }
        }),
      });

      const orderData = await res.json();
      if (!res.ok || !orderData.success) {
        throw new Error(orderData.error || 'Failed to initialize payment order.');
      }

      const options = {
        key: appConfig.razorpayKeyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Yourbrand",
        description: "Provider Prepaid Wallet Top-up",
        order_id: orderData.id,
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch('/api/razorpay/verify-payment', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (verifyRes.ok && verifyData.success) {
              const depositResult = await depositProviderWalletAction(
                userUid,
                amount,
                {
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                }
              );

              if (depositResult.success) {
                toast({ title: "Deposit Successful", description: depositResult.message });
                setDepositAmount('');
                loadWalletDetails();
              } else {
                toast({ title: "Credit Error", description: depositResult.message, variant: "destructive" });
              }
            } else {
              toast({ title: "Payment Verification Failed", description: verifyData.error || "Payment signature invalid.", variant: "destructive" });
            }
          } catch (verifyError: any) {
            toast({ title: "Verification Error", description: verifyError.message || "Failed to verify transaction.", variant: "destructive" });
          } finally {
            setIsProcessingDeposit(false);
          }
        },
        prefill: {
          name: userDisplayName,
          email: userEmail,
        },
        theme: {
          color: "#0d9488",
        },
        modal: {
          ondismiss: function () {
            setIsProcessingDeposit(false);
          }
        }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (err: any) {
      console.error("Razorpay workflow failed:", err);
      toast({ title: "Checkout Error", description: err.message || "Could not launch Razorpay gateway.", variant: "destructive" });
      setIsProcessingDeposit(false);
    }
  };

  const handleStripeDeposit = async () => {
    if (!providerUser?.uid) return;
    setIsProcessingDeposit(true);
    const amount = parseFloat(depositAmount);
    try {
      const currencyCode = appConfig?.currencyCode || 'INR';
      const origin = typeof window !== 'undefined' ? window.location.origin : '';

      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'wallet_topup',
          providerId: providerUser?.uid,
          amount: amount,
          currency: currencyCode,
          successUrl: `${origin}/provider/wallet?deposit=success&session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
          cancelUrl: `${origin}/provider/wallet?deposit=cancelled`,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to initiate Stripe session.');
      }

      const data = await res.json();
      router.push(data.url);
    } catch (err: any) {
      toast({ title: "Checkout Error", description: err.message || "Could not launch Stripe gateway.", variant: "destructive" });
      setIsProcessingDeposit(false);
    }
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerUser?.uid || !walletSettings) return;

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid deposit amount.", variant: "destructive" });
      return;
    }

    if (amount < walletSettings.minDepositAmount) {
      toast({ title: "Amount Below Minimum", description: `Minimum deposit allowed is ${symbol}${walletSettings.minDepositAmount}.`, variant: "destructive" });
      return;
    }

    if (amount > walletSettings.maxDepositAmount) {
      toast({ title: "Amount Exceeds Maximum", description: `Maximum deposit allowed is ${symbol}${walletSettings.maxDepositAmount}.`, variant: "destructive" });
      return;
    }

    const razorpayEnabled = appConfig.enableRazorpay !== false && !!appConfig.razorpayKeyId;
    const stripeEnabled = appConfig.enableStripe === true && !!appConfig.stripePublishableKey;

    if (!razorpayEnabled && !stripeEnabled) {
      toast({ title: "Gateways Disabled", description: "Online payments are currently not available.", variant: "destructive" });
      return;
    }

    if (razorpayEnabled && stripeEnabled) {
      setIsGatewayDialogOpen(true);
      return;
    }

    if (stripeEnabled) {
      await handleStripeDeposit();
    } else {
      await handleRazorpayDeposit();
    }
  };

  const handleQuickAdd = (value: number) => {
    setDepositAmount(String(value));
  };

  const formatDate = (timestamp: number): string => {
    return formatDateInTimezone(new Date(timestamp), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
  };

  const getTransactionBadge = (type: WalletTransaction['type']) => {
    const configs: Record<WalletTransaction['type'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      deposit: { label: 'Deposit', variant: 'default' },
      commission_deduction: { label: 'Fee Deducted', variant: 'destructive' },
      commission_refund: { label: 'Fee Refund', variant: 'outline' },
      manual_adjustment: { label: 'Adjustment', variant: 'secondary' },
    };
    const c = configs[type] || { label: type, variant: 'outline' };
    return <Badge variant={c.variant} className="capitalize">{c.label}</Badge>;
  };

  const handleComplaintSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerUser?.uid || !selectedTxForComplaint) return;

    if (!complaintMessage.trim()) {
      toast({ title: "Message Required", description: "Please enter a message for the admin.", variant: "destructive" });
      return;
    }

    setIsSubmittingComplaint(true);
    try {
      const result = await submitWalletComplaintAction(
        providerUser.uid,
        complaintMessage.trim(),
        Math.abs(selectedTxForComplaint.amount),
        selectedTxForComplaint.id,
        selectedTxForComplaint.bookingId || null
      );

      if (result.success) {
        toast({ title: "Dispute Filed", description: result.message });
        setComplaintMessage('');
        setSelectedTxForComplaint(null);
        loadWalletDetails();
      } else {
        toast({ title: "Submission Failed", description: result.message, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to submit dispute.", variant: "destructive" });
    } finally {
      setIsSubmittingComplaint(false);
    }
  };

  if (authIsLoading || isLoadingAppConfig || isLoadingDetails) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading Wallet details...</span>
      </div>
    );
  }

  const isLowBalance = walletSettings ? (walletBalance < walletSettings.minBalanceForJobs) : false;

  return (
    <div className="space-y-6 pb-44">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Provider Wallet
          </CardTitle>
          <CardDescription>
            Manage your prepaid funds for booking service commission fees.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Left Column: Wallet Balance Card & Deposit Form */}
        <div className="md:col-span-1 space-y-6">
          <Card className={cn(
            "text-white shadow-lg overflow-hidden relative",
            isLowBalance 
              ? "bg-gradient-to-br from-rose-500 to-red-600" 
              : "bg-gradient-to-br from-teal-500 to-emerald-600"
          )}>
            <CardHeader className="pb-2">
              <CardDescription className="text-white/80 font-bold uppercase tracking-wider text-[10px]">Prepaid Balance</CardDescription>
              <CardTitle className="text-4xl font-extrabold font-mono pt-1">
                {symbol}{walletBalance.toFixed(decimals)}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2 pb-6">
              {isLowBalance ? (
                <div className="flex items-start gap-2 bg-black/15 p-3 rounded-xl border border-white/10 text-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block">Balance Low!</span>
                    Wallet is below the {symbol}{walletSettings?.minBalanceForJobs} threshold. Deposit funds to continue receiving cash jobs.
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-black/15 px-3 py-2 rounded-xl text-xs font-semibold w-fit border border-white/10">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  Account Active & Booking Ready
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Money to Wallet</CardTitle>
              <CardDescription>
                Top up your wallet to ensure you have enough balance to receive new service requests.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {walletSettings && (
                <form onSubmit={handleDepositSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-600">Enter Amount ({symbol})</span>
                      <span className="text-muted-foreground font-mono">Min: {walletSettings.minDepositAmount} | Max: {walletSettings.maxDepositAmount}</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-2.5 text-muted-foreground font-mono">{symbol}</span>
                      <Input
                        type="number"
                        placeholder="Enter amount"
                        className="pl-8"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        disabled={isProcessingDeposit}
                        required
                      />
                    </div>
                    {walletSettings.depositBonusPercentage > 0 && (
                      <p className="text-[11px] text-emerald-600 font-bold">
                        🎁 Special Offer: Get a {walletSettings.depositBonusPercentage}% bonus credited automatically!
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[500, 1000, 2000, 5000].map(val => (
                      <Button
                        key={val}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickAdd(val)}
                        disabled={isProcessingDeposit}
                        className="text-xs h-8"
                      >
                        +{symbol}{val}
                      </Button>
                    ))}
                  </div>

                  <Button
                    type="submit"
                    className="w-full mt-2 h-11"
                    disabled={isProcessingDeposit}
                  >
                    {isProcessingDeposit ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    Continue to Payment
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Transaction History */}
        <div className="md:col-span-2">
          <Card className="h-full">
            <CardHeader className="border-b pb-4 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  Wallet History & Transactions
                </CardTitle>
                <CardDescription>
                  Chronological ledger of wallet deposits, commissions, and adjustments.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <Wallet className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p>No wallet transactions found.</p>
                  <p className="text-xs">Once you top up or accept bookings, they will reflect here.</p>
                </div>
              ) : (
                <>
                  <div className="hidden lg:block overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead className="pl-6">Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right pr-6">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactions.map(tx => {
                          const isCredit = tx.amount >= 0;
                          return (
                            <TableRow key={tx.id}>
                              <TableCell className="pl-6 text-xs font-mono whitespace-nowrap">
                                {formatDate(tx.timestamp)}
                              </TableCell>
                              <TableCell>{getTransactionBadge(tx.type)}</TableCell>
                              <TableCell className="max-w-xs text-xs font-medium" title={tx.description}>
                                <div className="truncate">{tx.description}</div>
                                {tx.bookingId && (
                                  <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                                    Ref: #{tx.bookingId}
                                  </span>
                                )}
                                {tx.stripePaymentIntent && (
                                  <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 select-all">
                                    Stripe ID: {tx.stripePaymentIntent}
                                  </span>
                                )}
                                {!tx.stripePaymentIntent && tx.stripeSessionId && (
                                  <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 select-all">
                                    Stripe Session ID: {tx.stripeSessionId}
                                  </span>
                                )}
                                {tx.razorpayPaymentId && (
                                  <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 select-all">
                                    Razorpay ID: {tx.razorpayPaymentId}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className={cn(
                                "text-right font-bold whitespace-nowrap font-mono",
                                isCredit ? "text-emerald-600" : "text-rose-600"
                              )}>
                                {isCredit ? '+' : ''}{symbol}{tx.amount.toFixed(decimals)}
                              </TableCell>
                              <TableCell className="text-right pr-6">
                                {!isCredit && (
                                  complaints.some(c => c.transactionId === tx.id) ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disabled
                                      className="h-7 text-[10px] text-muted-foreground bg-slate-100 dark:bg-slate-800 font-bold border border-slate-200/50 rounded-lg px-2 cursor-not-allowed"
                                    >
                                      Dispute Filed
                                    </Button>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-bold border border-amber-200/50 rounded-lg px-2"
                                      onClick={() => { setSelectedTxForComplaint(tx); setComplaintMessage(''); }}
                                    >
                                      Raise Complaint
                                    </Button>
                                  )
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="lg:hidden space-y-3 p-4">
                    {transactions.map(tx => {
                      const isCredit = tx.amount >= 0;
                      return (
                        <Card key={tx.id} className="p-4 space-y-2 border border-border shadow-sm">
                          <div className="flex justify-between items-start gap-2">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatDate(tx.timestamp)}
                            </span>
                            {getTransactionBadge(tx.type)}
                          </div>
                          
                          <div className="text-xs font-semibold text-foreground text-left">
                            {tx.description}
                            {tx.bookingId && (
                              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                                Ref: #{tx.bookingId}
                              </span>
                            )}
                            {tx.stripePaymentIntent && (
                              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 select-all">
                                Stripe ID: {tx.stripePaymentIntent}
                              </span>
                            )}
                            {!tx.stripePaymentIntent && tx.stripeSessionId && (
                              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 select-all">
                                Stripe Session ID: {tx.stripeSessionId}
                              </span>
                            )}
                            {tx.razorpayPaymentId && (
                              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5 select-all">
                                Razorpay ID: {tx.razorpayPaymentId}
                              </span>
                            )}
                          </div>

                          <div className="flex justify-between items-center border-t pt-2 mt-2">
                            <span className={cn(
                              "font-bold font-mono text-sm",
                              isCredit ? "text-emerald-600" : "text-rose-600"
                            )}>
                              {isCredit ? '+' : ''}{symbol}{tx.amount.toFixed(decimals)}
                            </span>

                            {!isCredit && (
                              complaints.some(c => c.transactionId === tx.id) ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled
                                  className="h-7 text-[10px] text-muted-foreground bg-slate-100 dark:bg-slate-800 font-bold border border-slate-200/50 rounded-lg px-2 cursor-not-allowed"
                                >
                                  Dispute Filed
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-[10px] text-amber-600 hover:text-amber-700 hover:bg-amber-50 font-bold border border-amber-200/50 rounded-lg px-2"
                                  onClick={() => { setSelectedTxForComplaint(tx); setComplaintMessage(''); }}
                                >
                                  Raise Complaint
                                </Button>
                              )
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Raised Complaints & Disputes */}
          {complaints.length > 0 && (
            <Card className="mt-6 border border-slate-100 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
                <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">⚠️</span>
                  Raised Disputes & Complaints
                </CardTitle>
                <CardDescription className="text-xs">
                  Track the status and resolution details of your filed transaction disputes.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {/* Desktop view */}
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent bg-slate-50/20">
                        <TableHead className="pl-6 text-xs font-bold text-slate-500">Complaint ID</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500">Date Filed</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500">Transaction ID</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500">Dispute Message</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500">Disputed Amount</TableHead>
                        <TableHead className="text-xs font-bold text-slate-500">Status</TableHead>
                        <TableHead className="pr-6 text-xs font-bold text-slate-500">Resolution Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {complaints.map((comp) => {
                        const formattedDate = formatDateInTimezone(new Date(comp.createdAt), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
                        return (
                          <TableRow key={comp.id} className="hover:bg-slate-50/30 transition-colors">
                            <TableCell className="pl-6 font-bold text-xs text-slate-700 font-mono select-all">
                              {comp.complaintId || comp.id.substring(0, 8)}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 font-mono">
                              {formattedDate}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 font-mono select-all">
                              {comp.transactionId || "N/A"}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 max-w-xs truncate" title={comp.message}>
                              {comp.message}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-rose-600 font-mono">
                              {symbol}{Number(comp.amount).toFixed(decimals)}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                className={cn(
                                  "capitalize font-bold text-[10px] px-2 py-0.5",
                                  comp.status === 'pending' && "bg-amber-500 hover:bg-amber-600 text-white",
                                  comp.status === 'accepted' && "bg-emerald-600 hover:bg-emerald-700 text-white",
                                  comp.status === 'solved' && "bg-green-500 hover:bg-green-600 text-white",
                                  comp.status === 'rejected' && "bg-rose-600 hover:bg-rose-700 text-white",
                                  comp.status === 'processed' && "bg-blue-600 hover:bg-blue-700 text-white"
                                )}
                                variant="default"
                              >
                                {comp.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="pr-6 text-xs text-slate-500 italic max-w-xs whitespace-pre-wrap">
                              {comp.resolutionNotes || "Awaiting admin review..."}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile view */}
                <div className="md:hidden divide-y divide-slate-100 pb-36">
                  {complaints.map((comp) => {
                    const formattedDate = formatDateInTimezone(new Date(comp.createdAt), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
                    return (
                      <div key={comp.id} className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] text-muted-foreground font-mono block">COMPLAINT ID</span>
                            <span className="text-xs font-bold font-mono text-slate-800 select-all">{comp.complaintId || comp.id.substring(0, 8)}</span>
                          </div>
                          <Badge 
                            className={cn(
                              "capitalize font-bold text-[10px] px-2 py-0.5",
                              comp.status === 'pending' && "bg-amber-500 hover:bg-amber-600 text-white",
                              comp.status === 'accepted' && "bg-emerald-600 hover:bg-emerald-700 text-white",
                              comp.status === 'solved' && "bg-green-500 hover:bg-green-600 text-white",
                              comp.status === 'rejected' && "bg-rose-600 hover:bg-rose-700 text-white",
                              comp.status === 'processed' && "bg-blue-600 hover:bg-blue-700 text-white"
                            )}
                            variant="default"
                          >
                            {comp.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">DATE FILED</span>
                            <span className="font-mono">{formattedDate}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">DISPUTED AMOUNT</span>
                            <span className="font-bold text-rose-600 font-mono">{symbol}{Number(comp.amount).toFixed(decimals)}</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-muted-foreground block">TRANSACTION ID</span>
                          <span className="font-mono text-xs text-slate-700 select-all block break-all">{comp.transactionId || "N/A"}</span>
                        </div>

                        <div className="bg-slate-50 p-2.5 rounded-xl text-xs space-y-2">
                          <div>
                            <span className="text-[10px] text-muted-foreground block font-semibold">YOUR MESSAGE</span>
                            <p className="text-slate-700 text-[11px] leading-relaxed whitespace-pre-wrap">{comp.message}</p>
                          </div>
                          <div className="border-t pt-2 mt-1">
                            <span className="text-[10px] text-muted-foreground block font-semibold">ADMIN RESOLUTION</span>
                            <p className="text-slate-600 text-[11px] leading-relaxed italic">{comp.resolutionNotes || "Awaiting admin review..."}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Wallet Dispute Complaint Modal */}
      {selectedTxForComplaint && (
        <Dialog open={!!selectedTxForComplaint} onOpenChange={(open) => !open && setSelectedTxForComplaint(null)}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Raise Wallet Complaint
              </DialogTitle>
              <DialogDescription>
                File a complaint to request a review or manual refund from the admin for this transaction.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleComplaintSubmit} className="space-y-4 py-2">
              <div className="space-y-1.5 text-xs bg-muted/50 p-3 rounded-lg border">
                <p><strong>Transaction ID:</strong> <span className="font-mono text-muted-foreground select-all">{selectedTxForComplaint.id}</span></p>
                <p><strong>Booking ID:</strong> {selectedTxForComplaint.bookingId ? `#${selectedTxForComplaint.bookingId}` : <span className="text-muted-foreground italic">None</span>}</p>
                <p><strong>Description:</strong> {selectedTxForComplaint.description}</p>
                <p><strong>Transaction Amount:</strong> {selectedTxForComplaint.amount >= 0 ? '+' : '-'}{symbol}{Math.abs(selectedTxForComplaint.amount).toFixed(decimals)}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="complaint-msg">Enter your complaint message / reason</Label>
                <Textarea
                  id="complaint-msg"
                  placeholder="Explain what went wrong or why you are disputing this transaction..."
                  value={complaintMessage}
                  onChange={(e) => setComplaintMessage(e.target.value)}
                  disabled={isSubmittingComplaint}
                  rows={4}
                  required
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setSelectedTxForComplaint(null)} disabled={isSubmittingComplaint}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingComplaint}>
                  {isSubmittingComplaint && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit Dispute
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {/* Gateway Selection Dialog */}
      <Dialog open={isGatewayDialogOpen} onOpenChange={setIsGatewayDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-center text-teal-800">Select Top-Up Method</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button 
              className="py-6 flex items-center justify-between text-left font-semibold text-md border-2 border-teal-600/20 hover:border-teal-600 hover:bg-teal-50 rounded-xl h-auto w-full"
              variant="outline"
              onClick={async () => {
                setIsGatewayDialogOpen(false);
                await handleRazorpayDeposit();
              }}
            >
              <span className="flex flex-col">
                <span className="font-bold text-slate-800">Cards, UPI, NetBanking</span>
                <span className="text-xs text-muted-foreground font-normal mt-0.5">Instant deposit via Razorpay</span>
              </span>
              <Plus className="h-5 w-5 text-teal-600 ml-4 shrink-0" />
            </Button>

            <Button 
              className="py-6 flex items-center justify-between text-left font-semibold text-md border-2 border-teal-600/20 hover:border-teal-600 hover:bg-teal-50 rounded-xl h-auto w-full"
              variant="outline"
              onClick={async () => {
                setIsGatewayDialogOpen(false);
                await handleStripeDeposit();
              }}
            >
              <span className="flex flex-col">
                <span className="font-bold text-slate-800">Stripe Checkout</span>
                <span className="text-xs text-muted-foreground font-normal mt-0.5">International cards, Link & Google Pay</span>
              </span>
              <Plus className="h-5 w-5 text-teal-600 ml-4 shrink-0" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="h-32 w-full" />
    </div>
  );
}
