"use client";

import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Wallet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { adjustProviderWalletAction } from "@/app/actions/providerWalletActions";

interface ProviderWalletAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  providerId: string;
  providerName: string;
  bookingId?: string;
  onSuccess?: () => void;
}

export default function ProviderWalletAdjustmentModal({
  isOpen,
  onClose,
  providerId,
  providerName,
  bookingId,
  onSuccess
}: ProviderWalletAdjustmentModalProps) {
  const { toast } = useToast();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [actionType, setActionType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState(bookingId ? `Refund for booking #${bookingId}` : '');
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Amount",
        description: "Please enter a valid numeric amount greater than 0."
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        variant: "destructive",
        title: "Reason Required",
        description: "Please explain the purpose of this manual wallet adjustment."
      });
      return;
    }

    setIsPending(true);
    try {
      const adjustmentValue = actionType === 'credit' ? parsedAmount : -parsedAmount;
      const type = actionType === 'credit' 
        ? (bookingId ? 'commission_refund' : 'deposit') 
        : 'commission_deduction';

      const result = await adjustProviderWalletAction(
        providerId,
        adjustmentValue,
        type,
        reason.trim(),
        bookingId
      );

      if (result.success) {
        toast({
          title: "Wallet Updated",
          description: `Successfully adjusted balance by ${actionType === 'credit' ? '+' : '-'}${symbol}${parsedAmount.toFixed(2)}.`
        });
        setAmount('');
        setReason('');
        onClose();
        if (onSuccess) onSuccess();
      } else {
        toast({
          variant: "destructive",
          title: "Adjustment Failed",
          description: result.message
        });
      }
    } catch (error) {
      console.error("Adjustment modal error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred during wallet adjustment."
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isPending && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            Adjust Provider Wallet
          </DialogTitle>
          <DialogDescription>
            Directly modify prepaid wallet balance for <strong>{providerName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 py-3">
          <div className="space-y-2">
            <Label>Adjustment Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={actionType === 'credit' ? 'default' : 'outline'}
                onClick={() => setActionType('credit')}
                className="h-10 font-bold"
                disabled={isPending}
              >
                Credit / Refund (+)
              </Button>
              <Button
                type="button"
                variant={actionType === 'debit' ? 'default' : 'outline'}
                onClick={() => setActionType('debit')}
                className="h-10 font-bold"
                disabled={isPending}
              >
                Debit / Deduct (-)
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjust-amount">Amount ({symbol})</Label>
            <Input
              id="adjust-amount"
              type="number"
              step="0.01"
              placeholder="e.g. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isPending}
              required
            />
          </div>

          {bookingId && (
            <div className="space-y-2">
              <Label>Associated Booking ID</Label>
              <Input value={bookingId} disabled className="bg-muted font-mono" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="adjust-reason">Message / Explanation</Label>
            <Textarea
              id="adjust-reason"
              placeholder="Enter details for provider's ledger & notification..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={3}
              required
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
