
"use client";

import React, { useState } from 'react';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, 
  DialogDescription, DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, IndianRupee, CheckCircle2, Loader2, CreditCard } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { formatCurrency } from '@/lib/utils';

interface AdditionalCharge {
  name: string;
  amount: number;
}

interface CompleteBookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (charges: AdditionalCharge[], paymentMethod: string) => void;
  originalAmount: number;
  currentPaymentMethod: string;
  isProcessing: boolean;
  isAdmin?: boolean;
}

export default function CompleteBookingDialog({ 
  isOpen, 
  onClose, 
  onConfirm, 
  originalAmount,
  currentPaymentMethod,
  isProcessing,
  isAdmin = false
}: CompleteBookingDialogProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const isPrepaidOnline = currentPaymentMethod?.toLowerCase() === 'online';
  const [paymentMethod, setPaymentMethod] = useState(isPrepaidOnline ? "Online" : "Cash");

  const addCharge = () => {
    setCharges([...charges, { name: "", amount: 0 }]);
  };

  const removeCharge = (index: number) => {
    setCharges(charges.filter((_, i) => i !== index));
  };

  const updateCharge = (index: number, field: keyof AdditionalCharge, value: string) => {
    const newCharges = [...charges];
    if (field === 'amount') {
      newCharges[index].amount = parseFloat(value) || 0;
    } else {
      newCharges[index].name = value;
    }
    setCharges(newCharges);
  };

  const additionalTotal = charges.reduce((sum, c) => sum + c.amount, 0);
  const finalTotal = originalAmount + additionalTotal;

  const handleConfirm = () => {
    const validCharges = charges.filter(c => c.name.trim() !== "" && c.amount > 0);
    onConfirm(validCharges, paymentMethod);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isProcessing && onClose()}>
      <DialogContent className="sm:max-w-[450px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Complete Booking
          </DialogTitle>
          <DialogDescription>
            Review the amount, add extra charges, and confirm the payment method.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Charges Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Additional Charges (Optional)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addCharge} className="h-7 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add Charge
              </Button>
            </div>

            <div className="space-y-2">
                {charges.map((charge, index) => (
                <div key={index} className="flex gap-2 items-center">
                    <Input 
                        placeholder="Item name" 
                        value={charge.name}
                        onChange={(e) => updateCharge(index, 'name', e.target.value)}
                        className="h-9 text-sm"
                    />
                    <div className="w-28 relative">
                        <span className="absolute left-2.5 top-2 text-sm text-muted-foreground">{symbol}</span>
                        <Input 
                            type="number" 
                            placeholder="0" 
                            value={charge.amount || ""}
                            onChange={(e) => updateCharge(index, 'amount', e.target.value)}
                            className="h-9 pl-7 text-sm"
                        />
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeCharge(index)} className="h-9 w-9 text-destructive">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                ))}
            </div>
          </div>

          {isAdmin && !isPrepaidOnline && (
            <>
              <Separator />
              {/* Payment Method Section */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-bold flex items-center gap-1">
                    <CreditCard className="h-3 w-3" /> Final Payment Method
                </Label>
                <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid grid-cols-1 gap-2">
                  <div className="flex items-center space-x-2 border p-3 rounded-xl cursor-pointer hover:bg-muted transition-colors">
                    <RadioGroupItem value="Cash" id="cash" />
                    <Label htmlFor="cash" className="flex-1 cursor-pointer font-medium">Cash / Pay after service</Label>
                  </div>
                  <div className="flex items-center space-x-2 border p-3 rounded-xl cursor-pointer hover:bg-muted transition-colors">
                    <RadioGroupItem value="Online" id="online" />
                    <Label htmlFor="online" className="flex-1 cursor-pointer font-medium">Online Payment (Admin Collected)</Label>
                  </div>
                </RadioGroup>
              </div>
            </>
          )}

          {/* Summary Box */}
          <div className="bg-primary/5 p-4 rounded-2xl space-y-2 border border-primary/10">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Original Booking:</span>
              <span className="font-semibold text-foreground">{formatCurrency(originalAmount, symbol, decimals, code)}</span>
            </div>
            {additionalTotal > 0 && (
                <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Extra Charges:</span>
                    <span className="font-semibold text-green-600">+ {formatCurrency(additionalTotal, symbol, decimals, code)}</span>
                </div>
            )}
            <Separator className="my-1 opacity-50" />
            <div className="flex justify-between text-xl font-black text-primary">
              <span>Final Total:</span>
              <span>{formatCurrency(finalTotal, symbol, decimals, code)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isProcessing} className="rounded-xl">Cancel</Button>
          <Button onClick={handleConfirm} disabled={isProcessing} className="bg-green-600 hover:bg-green-700 rounded-xl flex-1 h-11 font-bold">
            {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Confirm Completion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
