
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { FirestoreTax } from '@/types/firestore';
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const taxFormSchema = z.object({
  taxName: z.string().min(2, { message: "Tax name must be at least 2 characters (e.g., GST, VAT)." }).max(50, { message: "Tax name too long." }),
  taxPercent: z.coerce
    .number()
    .min(0, { message: "Tax percentage must be 0 or greater." })
    .max(100, { message: "Tax percentage cannot exceed 100." }),
  isActive: z.boolean().default(true),
});

export type TaxFormData = z.infer<typeof taxFormSchema>;

interface TaxFormProps {
  onSubmit: (data: Omit<FirestoreTax, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreTax | null;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function TaxForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting = false }: TaxFormProps) {
  const form = useForm<TaxFormData>({
    resolver: zodResolver(taxFormSchema),
    defaultValues: {
      taxName: "",
      taxPercent: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        taxName: initialData.taxName,
        taxPercent: initialData.taxPercent,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
    } else {
      form.reset({
        taxName: "",
        taxPercent: 0,
        isActive: true,
      });
    }
  }, [initialData, form]);

  const handleSubmit = async (formData: TaxFormData) => {
    await onSubmitProp({
      ...formData,
      id: initialData?.id,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-4">
        <FormField
          control={form.control}
          name="taxName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tax Name</FormLabel>
              <FormControl>
                <Input placeholder="e.g., GST, VAT, Service Tax" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="taxPercent"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tax Percentage (%)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" placeholder="e.g., 5 or 18.5" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormDescription>Enter the percentage value (e.g., 5 for 5%).</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-background/50">
              <div className="space-y-0.5">
                <FormLabel>Tax Active</FormLabel>
                <FormDescription>
                  Inactive taxes cannot be applied to new services.
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={isSubmitting}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="flex justify-end space-x-3 pt-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Save Changes' : 'Create Tax'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

    