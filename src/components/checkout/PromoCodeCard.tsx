
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tag, CheckCircle, XCircle, ListFilter, Loader2, TicketPercent, ChevronRight, Gift, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs } from '@/lib/mysqlDb';
import type { FirestorePromoCode } from '@/types/firestore';
import { Badge } from '@/components/ui/badge';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getTimestampMillis } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogClose } from '@/components/ui/dialog';

interface AppliedPromoCodeInfo {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  calculatedDiscount: number;
}

interface PromoCodeCardProps {
  sumOfItemPrices: number;
  onApply: (promo: AppliedPromoCodeInfo | null) => void;
  appliedPromo: AppliedPromoCodeInfo | null;
}

export default function PromoCodeCard({ sumOfItemPrices, onApply, appliedPromo }: PromoCodeCardProps) {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  const [allFetchedPromoCodes, setAllFetchedPromoCodes] = useState<FirestorePromoCode[]>([]);
  const [availablePromoCodesToDisplay, setAvailablePromoCodesToDisplay] = useState<FirestorePromoCode[]>([]);
  const [isLoadingPromos, setIsLoadingPromos] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchPromos = useCallback(async () => {
    setIsLoadingPromos(true);
    try {
      const promoSnap = await getDocs(query(collection(db, "adminPromoCodes"), where("isActive", "==", true)));
      const fetchedPromos = promoSnap.docs.map(d => ({ id: d.id, ...d.data() } as FirestorePromoCode));
      setAllFetchedPromoCodes(fetchedPromos);
    } catch (e) {
      console.error("Error fetching promos", e);
    } finally {
      setIsLoadingPromos(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  useEffect(() => {
    const currentDate = new Date();
    const filteredPromos = allFetchedPromoCodes.filter(promo => {
      if (promo.isHidden) return false;
      let isValid = true;
      const validFrom = getTimestampMillis(promo.validFrom);
      if (validFrom && currentDate < new Date(validFrom)) isValid = false;
      const validUntil = getTimestampMillis(promo.validUntil);
      if (isValid && validUntil && currentDate > new Date(validUntil)) isValid = false;
      if (isValid && promo.minBookingAmount && sumOfItemPrices < promo.minBookingAmount) isValid = false;
      if (isValid && promo.maxUses && promo.usesCount >= promo.maxUses) isValid = false;
      return isValid;
    });
    setAvailablePromoCodesToDisplay(filteredPromos);
  }, [allFetchedPromoCodes, sumOfItemPrices]);

  const handleApplyPromo = async (codeOverride?: string) => {
    const code = (codeOverride || promoCodeInput).toUpperCase().trim();
    if (!code) return;
    setIsApplyingPromo(true);
    try {
      const q = query(collection(db, "adminPromoCodes"), where("code", "==", code));
      const snap = await getDocs(q);
      if (snap.empty) {
        toast({ title: "Invalid Code", description: "This promo code does not exist.", variant: "destructive" });
        setIsApplyingPromo(false);
        return;
      }
      const promoData = { id: snap.docs[0].id, ...snap.docs[0].data() } as FirestorePromoCode;
      if (!promoData.isActive) { toast({ title: "Inactive Code", variant: "destructive" }); setIsApplyingPromo(false); return; }
      
      const currentDate = new Date();
      const validFrom = getTimestampMillis(promoData.validFrom);
      if (validFrom && currentDate < new Date(validFrom)) { toast({ title: "Not Yet Valid", variant: "destructive" }); setIsApplyingPromo(false); return; }
      const validUntil = getTimestampMillis(promoData.validUntil);
      if (validUntil && currentDate > new Date(validUntil)) { toast({ title: "Expired Code", variant: "destructive" }); setIsApplyingPromo(false); return; }

      if (promoData.minBookingAmount && sumOfItemPrices < promoData.minBookingAmount) {
        toast({ title: "Min Amount Not Met", description: `Minimum ${symbol}${promoData.minBookingAmount} required.`, variant: "destructive" });
        setIsApplyingPromo(false);
        return;
      }
      
      if (promoData.maxUsesPerUser && promoData.maxUsesPerUser > 0 && auth.currentUser?.uid) {
        const bookingsRef = collection(db, "bookings");
        const userUsageQuery = query(bookingsRef, where("userId", "==", auth.currentUser.uid), where("discountCode", "==", promoData.code.toUpperCase()));
        const userUsageSnapshot = await getDocs(userUsageQuery);
        if (userUsageSnapshot.size >= promoData.maxUsesPerUser) {
          toast({ title: "Limit Reached", description: "You've already used this code.", variant: "destructive" });
          setIsApplyingPromo(false);
          return;
        }
      }

      let disc = promoData.discountType === 'percentage' ? (sumOfItemPrices * promoData.discountValue) / 100 : promoData.discountValue;
      disc = Math.min(disc, sumOfItemPrices);

      const applied = { id: promoData.id, code: promoData.code, discountType: promoData.discountType, discountValue: promoData.discountValue, calculatedDiscount: disc };
      onApply(applied);
      setPromoCodeInput("");
      localStorage.setItem('yourbrandAppliedPromoCode', JSON.stringify(applied));
      setIsModalOpen(false);
      toast({ title: "Promo Applied!" });
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to apply promo code.", variant: "destructive" });
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromo = (e: React.MouseEvent) => {
    e.stopPropagation();
    onApply(null);
    setPromoCodeInput("");
    localStorage.removeItem('yourbrandAppliedPromoCode');
    toast({ title: "Promo Removed" });
  };

  return (
    <div className="space-y-4">
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogTrigger asChild>
          <Card className="overflow-hidden border-none shadow-md cursor-pointer hover:bg-muted/50 transition-colors">
            <CardHeader className="bg-muted/30 py-4 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <TicketPercent className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Offers & Promo Code</CardTitle>
              </div>
              {appliedPromo ? (
                <Button variant="outline" size="sm" onClick={handleRemovePromo} className="text-destructive border-destructive/20 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive font-bold h-8 px-3 rounded-md">
                  Remove
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="text-primary border-primary/20 hover:border-primary/40 hover:bg-primary/5 hover:text-primary font-bold h-8 px-3 rounded-md">
                  Apply
                </Button>
              )}
            </CardHeader>
            <CardContent className="py-4">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-full">
                  <TicketPercent className="h-6 w-6 text-primary" />
                </div>
                <div>
                  {appliedPromo ? (
                    <>
                      <p className="font-bold text-green-600">Code "{appliedPromo.code}" Applied</p>
                      <p className="text-sm text-muted-foreground">
                        Saved {appliedPromo.discountType === 'percentage' ? `${appliedPromo.discountValue}%` : `${symbol}${appliedPromo.discountValue}`}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold">Apply coupon to save more</p>
                      <p className="text-sm text-muted-foreground">Select from available offers</p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </DialogTrigger>
        
        <DialogContent hideCloseButton={true} className="sm:max-w-md max-h-[90vh] overflow-y-auto p-0 flex flex-col">
          <DialogHeader className="p-3 border-b sticky top-0 bg-background z-10 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Gift className="h-5 w-5 text-primary" />
                Apply Coupon
              </DialogTitle>
              <DialogClose className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none">
                <X className="h-5 w-5 text-muted-foreground" />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
            <DialogDescription className="mt-1.5 text-left">
              Enter a promo code or select from available offers to get a discount.
            </DialogDescription>
          </DialogHeader>
          
          <div className="p-3 space-y-6 flex-grow overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-sm font-bold">Enter Promo Code</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="e.g. SAVE20" 
                  value={promoCodeInput} 
                  onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                  disabled={isApplyingPromo}
                  className="font-bold uppercase h-12"
                />
                <Button 
                   onClick={() => handleApplyPromo()} 
                   disabled={!promoCodeInput || isApplyingPromo}
                   className="h-12 px-6"
                >
                  {isApplyingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "APPLY"}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ListFilter className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Available Offers</span>
              </div>
              
              {isLoadingPromos ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : availablePromoCodesToDisplay.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {availablePromoCodesToDisplay.map(promo => (
                    <div 
                      key={promo.id} 
                      className="border-2 border-dashed rounded-xl p-4 flex items-center justify-between hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group"
                      onClick={() => handleApplyPromo(promo.code)}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary hover:bg-primary text-white font-bold px-3">
                            {promo.code}
                          </Badge>
                        </div>
                        <p className="text-sm font-bold">
                          {promo.discountType === 'percentage' ? `${promo.discountValue}% OFF` : `${symbol}${promo.discountValue} OFF`}
                        </p>
                        {promo.minBookingAmount && (
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                            On bookings above {symbol}{promo.minBookingAmount}
                          </p>
                        )}
                      </div>
                      <Button variant="ghost" className="text-primary font-bold text-xs group-hover:bg-primary group-hover:text-white">
                        APPLY
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed rounded-2xl bg-muted/20">
                  <p className="text-sm text-muted-foreground">No offers available at the moment.</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}