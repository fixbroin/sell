
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Edit, Trash2, Loader2, Percent, XCircle, EyeOff, Eye, History, Search, User, Mail, Tag, Coins } from "lucide-react";
import type { FirestorePromoCode, DiscountType } from '@/types/firestore';
import PromoCodeForm, { type PromoCodeFormData } from '@/components/admin/PromoCodeForm';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query, Timestamp, where } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { getTimestampMillis, formatCurrency, formatDateInTimezone } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getPromoCodeUsageHistory, migratePromoCodeUsage, type PromoCodeUsageRecord } from '@/lib/adminDashboardUtils';
import { getCache, setCache } from '@/lib/client-cache';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminStats } from "@/hooks/useAdminStats";
import { triggerRefresh } from '@/lib/revalidateUtils';

export default function AdminPromoCodesPage() {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const { stats } = useAdminStats();
  const [promoCodes, setPromoCodes] = useState<FirestorePromoCode[]>([]);
  const [usageHistory, setUsageHistory] = useState<PromoCodeUsageRecord[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPromoCode, setEditingPromoCode] = useState<FirestorePromoCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const { toast } = useToast();

  const handleSyncUsageHistory = async () => {
    setIsSubmitting(true);
    toast({ title: "Syncing...", description: "Recalculating promo code usage and stats from bookings." });
    try {
      const res = await migratePromoCodeUsage();
      if (res.success) {
        toast({ title: "Success", description: `Synced ${res.count} usage records successfully.` });
        await fetchPromoCodes();
        await fetchUsageHistory(true);
        // Reload stats doc via short delay or direct reload to ensure sync
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast({ title: "Error", description: res.error || "Failed to sync usage history.", variant: "destructive" });
      }
    } catch (err: any) {
      console.error("Error syncing usage history:", err);
      toast({ title: "Error", description: err.message || "Failed to sync usage history.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const promoCodesCollectionRef = collection(db, "adminPromoCodes");

  const fetchPromoCodes = async () => {
    setIsLoading(true);
    try {
      const q = query(promoCodesCollectionRef, orderBy("createdAt", "desc"));
      const data = await getDocs(q);
      const fetchedCodes = data.docs.map((doc) => ({ ...doc.data(), id: doc.id } as FirestorePromoCode));
      setPromoCodes(fetchedCodes);
    } catch (error) {
      console.error("Error fetching promo codes: ", error);
      toast({ title: "Error", description: "Could not fetch promo codes.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsageHistory = async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCache<PromoCodeUsageRecord[]>('promo-usage-history', true);
      if (cached) {
        setUsageHistory(cached);
        setIsHistoryLoading(false);
        // Still fetch in background to keep it "smart"
      }
    }

    try {
      const history = await getPromoCodeUsageHistory();
      setUsageHistory(history);
      setCache('promo-usage-history', history, true);
    } catch (error) {
      console.error("Error fetching usage history:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchPromoCodes();
    fetchUsageHistory();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddPromoCode = () => {
    setEditingPromoCode(null);
    setIsFormOpen(true);
  };

  const handleEditPromoCode = (code: FirestorePromoCode) => {
    setEditingPromoCode(code);
    setIsFormOpen(true);
  };

  const handleDeletePromoCode = async (codeId: string) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "adminPromoCodes", codeId));
      setPromoCodes(promoCodes.filter(pc => pc.id !== codeId));
      toast({ title: "Success", description: "Promo code deleted successfully." });
    } catch (error) {
      console.error("Error deleting promo code: ", error);
      toast({ title: "Error", description: "Could not delete promo code.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUsageRecord = async (record: PromoCodeUsageRecord) => {
    setIsSubmitting(true);
    try {
      await deleteDoc(doc(db, "promoCodeUsage", record.id));
      
      // Update local state
      setUsageHistory(prev => prev.filter(r => r.id !== record.id));
      
      // Update cache
      const updatedHistory = usageHistory.filter(r => r.id !== record.id);
      setCache('promo-usage-history', updatedHistory, true);
      
      // Invalidate server cache tag
      await triggerRefresh('promo-usage');
      
      // Decrement the promo code's usesCount if the promo code still exists
      if (record.discountCode) {
        const promoQuery = await getDocs(query(promoCodesCollectionRef, where("code", "==", record.discountCode)));
        if (!promoQuery.empty) {
          const promoDoc = promoQuery.docs[0];
          const currentUses = promoDoc.data().usesCount || 0;
          await updateDoc(doc(db, "adminPromoCodes", promoDoc.id), {
            usesCount: Math.max(0, currentUses - 1)
          });
          setPromoCodes(prev => prev.map(pc => pc.id === promoDoc.id ? { ...pc, usesCount: Math.max(0, currentUses - 1) } : pc));
        }
      }
      
      toast({ title: "Success", description: "Usage record deleted successfully." });
    } catch (error) {
      console.error("Error deleting usage record: ", error);
      toast({ title: "Error", description: "Could not delete usage record.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleToggleActive = async (code: FirestorePromoCode) => {
    setIsSubmitting(true);
    try {
      const codeDocRef = doc(db, "adminPromoCodes", code.id);
      await updateDoc(codeDocRef, { isActive: !code.isActive, updatedAt: Timestamp.now() });
      fetchPromoCodes(); 
      toast({ title: "Status Updated", description: `Promo code ${code.code} ${!code.isActive ? "activated" : "deactivated"}.`});
    } catch (error) {
        console.error("Error toggling promo code status:", error);
        toast({ title: "Error", description: "Could not update promo code status.", variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: PromoCodeFormData & { id?: string }) => {
    setIsSubmitting(true);
    
    const codeExistsQuery = query(promoCodesCollectionRef, where("code", "==", data.code.toUpperCase()));
    const existingCodesSnapshot = await getDocs(codeExistsQuery);
    const isCodeDuplicate = !existingCodesSnapshot.empty && (!data.id || existingCodesSnapshot.docs[0].id !== data.id);

    if (isCodeDuplicate) {
      toast({ title: "Duplicate Code", description: `Promo code "${data.code.toUpperCase()}" already exists. Please use a unique code.`, variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const payload: Omit<FirestorePromoCode, 'id' | 'createdAt' | 'updatedAt' | 'usesCount'> & { updatedAt?: Timestamp, createdAt?: Timestamp, usesCount?: number } = {
      code: data.code.toUpperCase(),
      description: data.description,
      discountType: data.discountType,
      discountValue: Number(data.discountValue),
      minBookingAmount: data.minBookingAmount ? Number(data.minBookingAmount) : undefined,
      maxUses: data.maxUses ? Number(data.maxUses) : undefined,
      maxUsesPerUser: data.maxUsesPerUser ? Number(data.maxUsesPerUser) : undefined,
      validFrom: data.validFrom ? Timestamp.fromDate(new Date(data.validFrom)) : undefined,
      validUntil: data.validUntil ? Timestamp.fromDate(new Date(data.validUntil)) : undefined,
      isActive: data.isActive === undefined ? true : data.isActive,
      isHidden: data.isHidden,
    };

    try {
      if (data.id) { 
        const promoCodeDoc = doc(db, "adminPromoCodes", data.id);
        payload.updatedAt = Timestamp.now();
        await updateDoc(promoCodeDoc, payload);
        toast({ title: "Success", description: "Promo code updated successfully." });
      } else { 
        payload.createdAt = Timestamp.now();
        payload.usesCount = 0; 
        await addDoc(promoCodesCollectionRef, payload);
        toast({ title: "Success", description: "Promo code added successfully." });
      }
      setIsFormOpen(false);
      setEditingPromoCode(null);
      await fetchPromoCodes(); 
    } catch (error) {
      console.error("Error saving promo code: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save promo code.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const formatDateForIndia = (timestamp?: any) => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return "N/A";
    return formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat);
  };

  const getDiscountDisplay = (type: DiscountType, value: number) => {
    if (type === 'percentage') return `${value}%`;
    if (type === 'fixed') return formatCurrency(value, symbol, decimals, code);
    return String(value);
  };

  const filteredHistory = useMemo(() => {
    if (!historySearchTerm.trim()) return usageHistory;
    const term = historySearchTerm.toLowerCase();
    return usageHistory.filter(record => 
      record.customerName.toLowerCase().includes(term) ||
      record.customerEmail.toLowerCase().includes(term) ||
      record.discountCode.toLowerCase().includes(term) ||
      record.bookingId.toLowerCase().includes(term)
    );
  }, [usageHistory, historySearchTerm]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="text-2xl flex items-center"><Percent className="mr-2 h-6 w-6 text-primary" />Manage Promo Codes</CardTitle>
            <CardDescription>Create, edit, and manage promotional discount codes for customers.</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button onClick={handleSyncUsageHistory} variant="outline" disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
              <History className="mr-2 h-4 w-4" /> Recalculate & Sync
            </Button>
            <Button onClick={handleAddPromoCode} disabled={isSubmitting || isLoading} className="w-full sm:w-auto">
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Promo Code
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading promo codes...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="text-center">Min. Booking ({symbol})</TableHead>
                  <TableHead className="text-center">Uses / Max</TableHead>
                  <TableHead className="text-center">Max/User</TableHead>
                  <TableHead className="text-center">Valid From</TableHead>
                  <TableHead className="text-center">Valid Until</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-center">Hidden</TableHead>
                  <TableHead className="text-right min-w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-10">
                      No promo codes found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  promoCodes.map((code) => (
                    <TableRow key={code.id}>
                      <TableCell className="font-medium text-primary">{code.code}</TableCell>
                      <TableCell>{getDiscountDisplay(code.discountType, code.discountValue)}</TableCell>
                      <TableCell className="text-center">{code.minBookingAmount?.toLocaleString() || "N/A"}</TableCell>
                      <TableCell className="text-center">{code.usesCount} / {code.maxUses || "∞"}</TableCell>
                      <TableCell className="text-center">{code.maxUsesPerUser || "∞"}</TableCell>
                      <TableCell className="text-center text-xs">
                        {code.validFrom ? formatDateForIndia(code.validFrom) : <span title="Not set"><XCircle className="h-4 w-4 text-muted-foreground/70 mx-auto" /></span>}
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {code.validUntil ? formatDateForIndia(code.validUntil) : <span title="Not set"><XCircle className="h-4 w-4 text-muted-foreground/70 mx-auto" /></span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={code.isActive}
                          onCheckedChange={() => handleToggleActive(code)}
                          disabled={isSubmitting}
                          aria-label={`Toggle active status for ${code.code}`}
                        />
                      </TableCell>
                       <TableCell className="text-center">
                        {code.isHidden ? <span title="Hidden"><EyeOff className="h-5 w-5 text-muted-foreground mx-auto" /></span> : <span title="Visible"><Eye className="h-5 w-5 text-green-500 mx-auto" /></span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-2 sm:justify-end">
                          <Button variant="outline" size="icon" onClick={() => handleEditPromoCode(code)} disabled={isSubmitting}>
                            <Edit className="h-4 w-4" /> <span className="sr-only">Edit</span>
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the promo code &quot;{code.code}&quot;.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeletePromoCode(code.id)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90">
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Savings Given</p>
              <h3 className="text-2xl font-black text-primary mt-1">{formatCurrency((stats as any).totalDiscountGiven || 0, symbol, decimals, code)}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-primary/10 text-primary">
              <Coins className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-emerald-50 border-emerald-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Total Redemptions</p>
              <h3 className="text-2xl font-black text-emerald-700 mt-1">{usageHistory.length >= 200 ? '200+' : usageHistory.length}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600">
              <User className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Active Codes</p>
              <h3 className="text-2xl font-black text-blue-700 mt-1">{promoCodes.filter(c => c.isActive).length}</h3>
            </div>
            <div className="p-3 rounded-2xl bg-blue-100 text-blue-600">
              <Tag className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-2xl flex items-center"><History className="mr-2 h-6 w-6 text-primary" />Promo Code Usage History</CardTitle>
            <CardDescription>Track who has redeemed promo codes across all bookings.</CardDescription>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer, email or code..."
                className="pl-9 h-9"
                value={historySearchTerm}
                onChange={(e) => setHistorySearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isHistoryLoading ? (
            <div className="flex justify-center items-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading usage history...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Promo Code</TableHead>
                    <TableHead className="text-center">Discount</TableHead>
                    <TableHead className="text-center">Booking ID</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Date</TableHead>
                    <TableHead className="text-right min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        {historySearchTerm ? "No matching usage records found." : "No promo code usage recorded yet."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistory.map((record, index) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-mono text-muted-foreground text-xs">
                          {filteredHistory.length - index}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium flex items-center"><User className="h-3.5 w-3.5 mr-1 text-muted-foreground" /> {record.customerName}</span>
                            <span className="text-xs text-muted-foreground flex items-center"><Mail className="h-3 w-3 mr-1" /> {record.customerEmail}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-bold flex w-fit items-center gap-1">
                            <Tag className="h-3 w-3" /> {record.discountCode}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center font-bold text-green-600">
                          {formatCurrency(record.discountAmount, symbol, decimals, code)}
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono">
                          {record.bookingId}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={record.status === 'Completed' ? 'default' : 'outline'} className={record.status === 'Completed' ? 'bg-green-500' : ''}>
                            {record.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs">
                           {record.createdAt ? formatDateForIndia(record.createdAt) : 'N/A'}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" disabled={isSubmitting}>
                                <Trash2 className="h-4 w-4" /> <span className="sr-only">Delete</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete this promo code usage record for booking &quot;{record.bookingId}&quot;.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteUsageRecord(record)}
                                  disabled={isSubmitting}
                                  className="bg-destructive hover:bg-destructive/90">
                                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!isSubmitting) { setIsFormOpen(open); if (!open) setEditingPromoCode(null); } }}>
        <DialogContent 
          onPointerDownOutside={(e) => {
             // Check if the click is inside a calendar popover
             const target = e.target as HTMLElement;
             if(target.closest('.rdp')) {
               e.preventDefault();
             }
          }}
          className="w-[90vw] max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl max-h-[90vh] p-0 flex flex-col"
        >
          <DialogHeader className="p-3 pb-4 border-b sticky top-0 bg-background z-10">
            <DialogTitle>{editingPromoCode ? 'Edit Promo Code' : 'Add New Promo Code'}</DialogTitle>
            <DialogDescription>
              {editingPromoCode ? 'Update details for this promo code.' : 'Fill in the details for a new promo code.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-grow overflow-y-auto">
            <PromoCodeForm
              onSubmit={handleFormSubmit}
              initialData={editingPromoCode}
              onCancel={() => { setIsFormOpen(false); setEditingPromoCode(null); }}
              isSubmitting={isSubmitting}
              allPromoCodes={promoCodes} 
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
