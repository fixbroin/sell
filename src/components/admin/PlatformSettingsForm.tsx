
"use client";

import { useState, useEffect } from 'react';
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Trash2, PlusCircle, Percent, Save, Loader2, Check, ChevronsUpDown } from "lucide-react";
import type { PlatformFeeSetting } from '@/types/firestore';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";
import { nanoid } from 'nanoid'; // For generating unique IDs for new fees

const platformFeeItemSchema = z.object({
  id: z.string(), // For React key and tracking
  name: z.string().min(2, "Fee name is required (e.g., Convenience Fee).").max(50, "Name too long."),
  type: z.enum(['percentage', 'fixed'], { required_error: "Fee type is required."}),
  value: z.coerce.number().positive("Fee value must be a positive number."),
  feeTaxRatePercent: z.coerce.number()
    .min(0, "Tax rate must be 0 or greater.")
    .max(100, "Tax rate cannot exceed 100.")
    .default(0),
  isActive: z.boolean().default(true),
  description: z.string().optional().default("Charged per booking to cover platform security and maintain verified pros."),
}).refine(data => {
    if (data.type === 'percentage' && (data.value < 0.01 || data.value > 100)) {
        return false;
    }
    return true;
}, {
    message: "Percentage value must be between 0.01 and 100.",
    path: ["value"],
});


const platformSettingsFormSchema = z.object({
  platformFees: z.array(platformFeeItemSchema).optional(),
});

type PlatformSettingsFormData = z.infer<typeof platformSettingsFormSchema>;

interface PlatformSettingsFormProps {
  initialFees: PlatformFeeSetting[];
  onSave: (fees: PlatformFeeSetting[]) => Promise<void>;
  isSaving: boolean;
}

export default function PlatformSettingsForm({ initialFees, onSave, isSaving }: PlatformSettingsFormProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const [openTypePickerIndex, setOpenTypePickerIndex] = useState<number | null>(null);
  const form = useForm<PlatformSettingsFormData>({
    resolver: zodResolver(platformSettingsFormSchema),
    defaultValues: {
      platformFees: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "platformFees",
  });

  useEffect(() => {
    // Ensure initialFees have client-side IDs if they don't already
    const feesWithIds = initialFees.map(fee => ({
        ...fee,
        id: fee.id || nanoid(), // Use existing ID or generate one
        feeTaxRatePercent: fee.feeTaxRatePercent ?? 0, // Ensure default for older data
        description: fee.description || "Charged per booking to cover platform security and maintain verified pros.",
    }));
    form.reset({ platformFees: feesWithIds });
  }, [initialFees, form]);

  const addNewFee = () => {
    append({
      id: nanoid(), // Generate a unique ID for the new fee item
      name: "",
      type: "fixed",
      value: 0,
      feeTaxRatePercent: 0,
      isActive: true,
      description: "Charged per booking to cover platform security and maintain verified pros.",
    });
  };

  const onSubmit = async (data: PlatformSettingsFormData) => {
    // The 'id' field in PlatformFeeSetting is client-side for React keys.
    // Firestore documents typically get their ID automatically or you set it as the doc name.
    // Here, 'id' is just part of the array element structure.
    await onSave(data.platformFees || []);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Manage Platform Fees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length === 0 && (
              <p className="text-muted-foreground text-center py-4">
                No platform fees configured yet. Click "Add New Fee" to start.
              </p>
            )}
            {fields.map((field, index) => (
              <Card key={field.id} className="p-4 shadow-sm border relative">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name={`platformFees.${index}.name`}
                    render={({ field: itemField }) => (
                      <FormItem>
                        <FormLabel>Fee Name</FormLabel>
                        <FormControl><Input placeholder="e.g., Platform Fees 1" {...itemField} disabled={isSaving} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`platformFees.${index}.description`}
                    render={({ field: itemField }) => (
                      <FormItem>
                        <FormLabel>Fee Description (displayed in info tooltip)</FormLabel>
                        <FormControl><Input placeholder="e.g., Charged per booking to cover platform security and maintain verified pros." {...itemField} disabled={isSaving} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`platformFees.${index}.type`}
                      render={({ field: itemField }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="mb-2">Fee Type</FormLabel>
                          <Dialog open={openTypePickerIndex === index} onOpenChange={(open) => setOpenTypePickerIndex(open ? index : null)}>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                className={cn(
                                  "w-full justify-between text-left font-normal h-10",
                                  !itemField.value && "text-muted-foreground"
                                )}
                                disabled={isSaving}
                                type="button"
                              >
                                {itemField.value === "fixed" ? `Fixed Amount (${symbol})` : itemField.value === "percentage" ? "Percentage (%)" : "Select type..."}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                              <DialogHeader>
                                <DialogTitle>Select Fee Type</DialogTitle>
                                <DialogDescription>
                                  Choose how this platform fee is calculated.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="py-4">
                                <div className="space-y-1">
                                  <Button
                                    variant={itemField.value === "fixed" ? "secondary" : "ghost"}
                                    className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                    onClick={() => {
                                      itemField.onChange("fixed");
                                      setOpenTypePickerIndex(null);
                                    }}
                                    type="button"
                                  >
                                    <span className="text-sm font-medium">Fixed Amount ({symbol})</span>
                                    {itemField.value === "fixed" && (
                                      <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                    )}
                                  </Button>
                                  <Button
                                    variant={itemField.value === "percentage" ? "secondary" : "ghost"}
                                    className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                    onClick={() => {
                                      itemField.onChange("percentage");
                                      setOpenTypePickerIndex(null);
                                    }}
                                    type="button"
                                  >
                                    <span className="text-sm font-medium">Percentage (%)</span>
                                    {itemField.value === "percentage" && (
                                      <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`platformFees.${index}.value`}
                      render={({ field: itemField }) => (
                        <FormItem>
                          <FormLabel>
                            Fee Value
                            {form.watch(`platformFees.${index}.type`) === 'percentage' ? ' (%)' : ` (${symbol})`}
                          </FormLabel>
                          <FormControl><Input type="number" step="0.01" placeholder="e.g., 50 or 2.5" {...itemField} disabled={isSaving}/></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                   <FormField
                    control={form.control}
                    name={`platformFees.${index}.feeTaxRatePercent`}
                    render={({ field: itemField }) => (
                      <FormItem>
                        <FormLabel className="flex items-center"><Percent className="mr-1 h-4 w-4 text-muted-foreground" />Tax Rate on this Fee (%)</FormLabel>
                        <FormControl><Input type="number" step="0.01" placeholder="e.g., 18 or 0" {...itemField} disabled={isSaving}/></FormControl>
                        <FormDescription>Tax applied directly to this fee's value. Enter 0 if no tax on fee.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`platformFees.${index}.isActive`}
                    render={({ field: itemField }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                        <div className="space-y-0.5">
                          <FormLabel>Fee Active</FormLabel>
                          <FormDescription>Enable or disable this fee.</FormDescription>
                        </div>
                        <FormControl><Switch checked={itemField.value} onCheckedChange={itemField.onChange} disabled={isSaving}/></FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  disabled={isSaving}
                  className="absolute top-2 right-2 text-destructive hover:text-destructive-foreground hover:bg-destructive/90"
                  aria-label="Remove fee"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </Card>
            ))}
            <Button type="button" variant="outline" onClick={addNewFee} disabled={isSaving}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add New Fee
            </Button>
          </CardContent>
        </Card>

        <CardFooter className="border-t pt-6 flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Platform Fee Settings
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}
