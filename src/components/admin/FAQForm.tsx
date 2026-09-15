
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FirestoreFAQ } from "@/types/firestore";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const faqFormSchema = z.object({
  question: z.string().min(5, { message: "Question must be at least 5 characters." }).max(250, { message: "Question must be 250 characters or less." }),
  answer: z.string().min(10, { message: "Answer must be at least 10 characters." }),
  order: z.coerce.number().min(0, { message: "Order must be a non-negative number." }),
  isActive: z.boolean().default(true),
});

type FAQFormData = z.infer<typeof faqFormSchema>;

interface FAQFormProps {
  onSubmit: (data: Omit<FirestoreFAQ, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => Promise<void>;
  initialData?: FirestoreFAQ | null;
  onCancel: () => void;
  isSubmitting?: boolean; 
}

export default function FAQForm({ onSubmit: onSubmitProp, initialData, onCancel, isSubmitting = false }: FAQFormProps) {
  const form = useForm<FAQFormData>({
    resolver: zodResolver(faqFormSchema),
    defaultValues: {
      question: "",
      answer: "",
      order: 0,
      isActive: true,
    },
  });

  useEffect(() => {
    if (initialData) {
      form.reset({
        question: initialData.question,
        answer: initialData.answer,
        order: initialData.order,
        isActive: initialData.isActive === undefined ? true : initialData.isActive,
      });
    } else {
      form.reset({ question: "", answer: "", order: 0, isActive: true });
    }
  }, [initialData, form]);

  const handleSubmit = async (formData: FAQFormData) => {
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
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Question</FormLabel>
              <FormControl>
                <Input placeholder="e.g., What payment methods do you accept?" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="answer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Answer</FormLabel>
              <FormControl>
                <Textarea placeholder="Provide a clear and concise answer." {...field} rows={5} disabled={isSubmitting} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="order"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display Order</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} disabled={isSubmitting} />
              </FormControl>
              <FormDescription>Lower numbers appear first.</FormDescription>
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
                <FormLabel>FAQ Active</FormLabel>
                <FormDescription>If unchecked, this FAQ will not be shown publicly.</FormDescription>
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
                {initialData ? 'Save Changes' : 'Create FAQ'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
