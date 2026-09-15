"use client";

import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { AppliedPlatformFeeItem } from "@/types/firestore"; // Import AppliedPlatformFeeItem
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { formatCurrency } from "@/lib/utils";

interface BreakdownItem {
  name: string;
  quantity: number;
  pricePerUnit: number;
  itemSubtotal: number;
  taxPercent: number;
  taxAmount: number;
  isTaxInclusive?: boolean;
  isDefaultRate?: boolean;
}

interface VisitingChargeBreakdown {
  amount: number;
  baseAmount: number;
  taxPercent: number;
  taxAmount: number;
  isTaxInclusive?: boolean;
  isDefaultRate?: boolean;
}

interface TaxBreakdownDisplayProps {
  items: BreakdownItem[];
  visitingCharge?: VisitingChargeBreakdown | null;
  platformFees?: AppliedPlatformFeeItem[]; // Added platformFees prop
  subTotalBeforeDiscount: number;
  totalDiscount: number;
  totalTax: number;
  grandTotal: number;
  defaultTaxRatePercent: number;
}


const getBasePriceForDisplay = (displayedPrice: number, isTaxInclusive?: boolean, taxPercent?: number): number => {
    if (isTaxInclusive && taxPercent && taxPercent > 0) {
      return displayedPrice / (1 + taxPercent / 100);
    }
    return displayedPrice;
  };

export default function TaxBreakdownDisplay({
  items,
  visitingCharge,
  platformFees, // Destructure platformFees
  subTotalBeforeDiscount,
  totalDiscount,
  totalTax,
  grandTotal,
  defaultTaxRatePercent,
}: TaxBreakdownDisplayProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';

  const sumOfDisplayedItemSubtotals = items.reduce((sum, item) => sum + (item.pricePerUnit * item.quantity), 0);
  const totalPlatformFeeBaseAmount = platformFees?.reduce((sum, fee) => sum + fee.calculatedFeeAmount, 0) || 0;
  const totalTaxOnPlatformFees = platformFees?.reduce((sum, fee) => sum + fee.taxAmountOnFee, 0) || 0;

  const taxableAmountLabel = useMemo(() => {
    const getAbbreviatedName = (name: string): string => {
      const parts = name.trim().split(/\s+/);
      const letters: string[] = [];
      let numberSuffix = "";
      parts.forEach(part => {
        if (/^\d+$/.test(part)) {
          numberSuffix = " " + part;
        } else if (part.length > 0) {
          letters.push(part[0].toUpperCase());
        }
      });
      return letters.join(".") + "." + numberSuffix;
    };

    const additions: string[] = ["Items"];
    if (visitingCharge && visitingCharge.amount > 0) {
      additions.push("VC");
    }
    if (platformFees && platformFees.length > 0) {
      platformFees.forEach(fee => {
        if (fee.calculatedFeeAmount > 0) {
          additions.push(getAbbreviatedName(fee.name));
        }
      });
    }
    const additionsText = additions.join(" + ");
    const discountText = totalDiscount > 0 ? " - Discount" : "";
    return `Taxable Amount (${additionsText}${discountText})`;
  }, [visitingCharge, platformFees, totalDiscount]);

  return (
    <div className="text-sm">
      <h4 className="text-md font-semibold mb-3">Tax Calculation Breakdown</h4>
      
      {/* Desktop view table */}
      <ScrollArea className="hidden md:block pr-3 mb-4 border rounded-xl overflow-hidden bg-background shadow-sm">
        <Table className="text-xs">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="w-[35%] font-bold text-foreground py-3">Item / Fee</TableHead>
              <TableHead className="text-right font-bold text-foreground py-3 whitespace-nowrap">Price ({symbol})</TableHead>
              <TableHead className="text-right font-bold text-foreground py-3 whitespace-nowrap">Base ({symbol})</TableHead>
              <TableHead className="text-center font-bold text-foreground py-3 whitespace-nowrap">Tax (%)</TableHead>
              <TableHead className="text-right font-bold text-foreground py-3 whitespace-nowrap">Tax ({symbol})</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, index) => {
              const baseItemAmountForLine = item.itemSubtotal;
              return (
                <TableRow key={`item-${index}`} className="hover:bg-muted/5 transition-colors">
                  <TableCell className="py-3 font-medium">
                    {item.name} <span className="text-muted-foreground text-[10px] block font-normal">Qty: {item.quantity}</span>
                    {item.isTaxInclusive && <span className="text-primary text-[10px] block font-normal mt-0.5">(Display price incl. tax)</span>}
                  </TableCell>
                  <TableCell className="text-right py-3">{formatCurrency(item.pricePerUnit * item.quantity, symbol, decimals, code)}</TableCell>
                  <TableCell className="text-right py-3">{formatCurrency(baseItemAmountForLine, symbol, decimals, code)}</TableCell>
                  <TableCell className="text-center py-3">{item.taxPercent.toFixed(1)}%</TableCell>
                  <TableCell className="text-right py-3 font-medium text-foreground">{formatCurrency(item.taxAmount, symbol, decimals, code)}</TableCell>
                </TableRow>
              );
            })}
            {visitingCharge && visitingCharge.amount > 0 && (
              <TableRow key="visiting-charge" className="hover:bg-muted/5 transition-colors">
                <TableCell className="py-3 font-medium">
                  Visiting Charge
                  {visitingCharge.isTaxInclusive && <span className="text-primary text-[10px] block font-normal mt-0.5">(Display amount incl. tax)</span>}
                </TableCell>
                <TableCell className="text-right py-3">{formatCurrency(visitingCharge.amount, symbol, decimals, code)}</TableCell>
                <TableCell className="text-right py-3">{formatCurrency(visitingCharge.baseAmount, symbol, decimals, code)}</TableCell>
                <TableCell className="text-center py-3">{visitingCharge.taxPercent.toFixed(1)}%</TableCell>
                <TableCell className="text-right py-3 font-medium text-foreground">{formatCurrency(visitingCharge.taxAmount, symbol, decimals, code)}</TableCell>
              </TableRow>
            )}
            {platformFees && platformFees.length > 0 && platformFees.map((fee, index) => (
                 <TableRow key={`platform-fee-${index}`} className="hover:bg-muted/5 transition-colors">
                    <TableCell className="py-3 font-medium">
                        {fee.name}
                        {fee.taxRatePercentOnFee > 0 && <span className="text-primary text-[10px] block font-normal mt-0.5">(Fee includes tax)</span>}
                    </TableCell>
                    <TableCell className="text-right py-3">{formatCurrency(fee.calculatedFeeAmount + fee.taxAmountOnFee, symbol, decimals, code)}</TableCell>
                    <TableCell className="text-right py-3">{formatCurrency(fee.calculatedFeeAmount, symbol, decimals, code)}</TableCell>
                    <TableCell className="text-center py-3">{fee.taxRatePercentOnFee.toFixed(1)}%</TableCell>
                    <TableCell className="text-right py-3 font-medium text-foreground">{formatCurrency(fee.taxAmountOnFee, symbol, decimals, code)}</TableCell>
                 </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Mobile view list */}
      <div className="md:hidden space-y-3 mb-4 max-h-[50vh] overflow-y-auto pr-1">
        {items.map((item, index) => (
          <div key={`item-mob-${index}`} className="p-3 bg-muted/20 border border-muted/50 rounded-xl space-y-2">
            <div className="font-bold text-foreground text-xs sm:text-sm">
              {item.name} <span className="text-muted-foreground text-[10px] sm:text-xs">(x{item.quantity})</span>
            </div>
            {item.isTaxInclusive && (
              <div className="text-[10px] text-muted-foreground italic">(Display price incl. tax)</div>
            )}
            <div className="grid grid-cols-2 gap-y-1.5 text-[11px] sm:text-xs">
              <div className="text-muted-foreground">Disp. Price:</div>
              <div className="text-right font-semibold">{formatCurrency(item.pricePerUnit * item.quantity, symbol, decimals, code)}</div>
              
              <div className="text-muted-foreground">Base Amount:</div>
              <div className="text-right font-semibold">{formatCurrency(item.itemSubtotal, symbol, decimals, code)}</div>
              
              <div className="text-muted-foreground">Tax Rate / Amt:</div>
              <div className="text-right font-semibold">{item.taxPercent.toFixed(1)}% / {formatCurrency(item.taxAmount, symbol, decimals, code)}</div>
            </div>
          </div>
        ))}
        {visitingCharge && visitingCharge.amount > 0 && (
          <div className="p-3 bg-muted/20 border border-muted/50 rounded-xl space-y-2">
            <div className="font-bold text-foreground text-xs sm:text-sm">Visiting Charge</div>
            {visitingCharge.isTaxInclusive && (
              <div className="text-[10px] text-muted-foreground italic">(Display amount incl. tax)</div>
            )}
            <div className="grid grid-cols-2 gap-y-1.5 text-[11px] sm:text-xs">
              <div className="text-muted-foreground">Disp. Amount:</div>
              <div className="text-right font-semibold">{formatCurrency(visitingCharge.amount, symbol, decimals, code)}</div>
              
              <div className="text-muted-foreground">Base Amount:</div>
              <div className="text-right font-semibold">{formatCurrency(visitingCharge.baseAmount, symbol, decimals, code)}</div>
              
              <div className="text-muted-foreground">Tax Rate / Amt:</div>
              <div className="text-right font-semibold">{visitingCharge.taxPercent.toFixed(1)}% / {formatCurrency(visitingCharge.taxAmount, symbol, decimals, code)}</div>
            </div>
          </div>
        )}
        {platformFees && platformFees.length > 0 && platformFees.map((fee, index) => (
          <div key={`platform-fee-mob-${index}`} className="p-3 bg-muted/20 border border-muted/50 rounded-xl space-y-2">
            <div className="font-bold text-foreground text-xs sm:text-sm">{fee.name}</div>
            {fee.taxRatePercentOnFee > 0 && (
              <div className="text-[10px] text-muted-foreground italic">(Fee includes tax)</div>
            )}
            <div className="grid grid-cols-2 gap-y-1.5 text-[11px] sm:text-xs">
              <div className="text-muted-foreground">Disp. Amount:</div>
              <div className="text-right font-semibold">{formatCurrency(fee.calculatedFeeAmount + fee.taxAmountOnFee, symbol, decimals, code)}</div>
              
              <div className="text-muted-foreground">Base Amount:</div>
              <div className="text-right font-semibold">{formatCurrency(fee.calculatedFeeAmount, symbol, decimals, code)}</div>
              
              <div className="text-muted-foreground">Tax Rate / Amt:</div>
              <div className="text-right font-semibold">{fee.taxRatePercentOnFee.toFixed(1)}% / {formatCurrency(fee.taxAmountOnFee, symbol, decimals, code)}</div>
            </div>
          </div>
        ))}
      </div>

      <Separator className="my-2" />

      <div className="space-y-2 text-xs">
        <div className="space-y-1.5">
          <div className="flex justify-between items-start w-full gap-2">
            <span className="text-muted-foreground text-left">Items Total (Displayed Prices):</span>
            <span className="font-medium shrink-0 text-right">{formatCurrency(sumOfDisplayedItemSubtotals, symbol, decimals, code)}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between items-start w-full gap-2 text-green-600 font-medium">
              <span className="text-left">Discount Applied:</span>
              <span className="shrink-0 text-right">- {formatCurrency(totalDiscount, symbol, decimals, code)}</span>
            </div>
          )}
          <div className="flex justify-between items-start w-full gap-2">
            <span className="text-muted-foreground text-left">Subtotal (After Discount):</span>
            <span className="font-medium shrink-0 text-right">{formatCurrency(sumOfDisplayedItemSubtotals - totalDiscount, symbol, decimals, code)}</span>
          </div>

          {visitingCharge && visitingCharge.amount > 0 && (
            <div className="flex justify-between items-start w-full gap-2">
              <span className="text-muted-foreground text-left">Visiting Charge (Displayed):</span>
              <span className="font-medium shrink-0 text-right">{formatCurrency(visitingCharge.amount, symbol, decimals, code)}</span>
            </div>
          )}
          
          {platformFees && platformFees.length > 0 && platformFees.map((fee, index) => {
            if (fee.calculatedFeeAmount > 0) {
              return (
                <div className="flex justify-between items-start w-full gap-2" key={`summary-fee-${index}`}>
                  <span className="text-muted-foreground text-left">{fee.name} (Base):</span>
                  <span className="font-medium shrink-0 text-right">{formatCurrency(fee.calculatedFeeAmount, symbol, decimals, code)}</span>
                </div>
              );
            }
            return null;
          })}
        </div>

        <Separator className="my-2" />

        {/* Highlighted Totals Card */}
        <div className="bg-primary/[0.02] border border-primary/10 rounded-2xl p-3 space-y-2.5">
          <div className="flex justify-between items-start w-full gap-2">
            <span className="text-muted-foreground font-semibold text-[11px] sm:text-xs text-left leading-normal">{taxableAmountLabel}:</span>
            <span className="font-bold text-foreground text-sm shrink-0 text-right">{formatCurrency(subTotalBeforeDiscount + (visitingCharge?.baseAmount || 0) + totalPlatformFeeBaseAmount - totalDiscount, symbol, decimals, code)}</span>
          </div>
          
          <div className="flex justify-between items-start w-full gap-2">
            <span className="font-semibold text-[11px] sm:text-xs text-left leading-normal">Total Tax Payable:</span>
            <span className="font-bold text-foreground text-sm shrink-0 text-right">{formatCurrency(totalTax, symbol, decimals, code)}</span>
          </div>

          <Separator className="my-0.5" />
          
          <div className="flex justify-between items-center w-full gap-2">
            <span className="font-bold text-primary text-sm text-left">Grand Total:</span>
            <span className="font-black text-primary text-lg shrink-0 text-right">{formatCurrency(grandTotal, symbol, decimals, code)}</span>
          </div>
        </div>
      </div>
       {items.some(item => item.isDefaultRate && item.taxPercent > 0) && (
        <p className="text-[10px] text-muted-foreground mt-3">
          *Default tax rate of {defaultTaxRatePercent}% may have been applied to items without a specific tax rate.
        </p>
      )}
    </div>
  );
}
