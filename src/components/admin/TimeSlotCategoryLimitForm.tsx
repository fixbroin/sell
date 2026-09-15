
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FirestoreCategory, TimeSlotCategoryLimit } from '@/types/firestore';
import { useEffect, useState } from "react";
import { Loader2, Check, ChevronsUpDown, Search } from "lucide-react";
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";

const timeSlotLimitFormSchema = z.object({
  categoryId: z.string({ required_error: "Please select a category." }),
  maxConcurrentBookings: z.coerce
    .number()
    .min(0, { message: "Limit must be at least 0." })
    .max(100, { message: "Limit cannot exceed 100." }), // Sensible upper bound
});

type TimeSlotLimitFormData = z.infer<typeof timeSlotLimitFormSchema>;

interface TimeSlotCategoryLimitFormProps {
  onSuccess: () => void; // Callback on successful save
  initialData?: TimeSlotCategoryLimit | null;
  categories: FirestoreCategory[];
  existingLimitCategoryIds: string[]; // To filter categories in dropdown for "add" mode
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function TimeSlotCategoryLimitForm({
  onSuccess,
  initialData,
  categories,
  existingLimitCategoryIds,
  onCancel,
  isSubmitting: isParentSubmitting = false,
}: TimeSlotCategoryLimitFormProps) {
  const { toast } = useToast();
  const [isFormBusy, setIsFormBusy] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | undefined>(undefined);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  useEffect(() => {
    if (!isCategoryPickerOpen) {
      setCategorySearch("");
    }
  }, [isCategoryPickerOpen]);

  const form = useForm<TimeSlotLimitFormData>({
    resolver: zodResolver(timeSlotLimitFormSchema),
    defaultValues: {
      categoryId: initialData?.categoryId || undefined,
      maxConcurrentBookings: initialData?.maxConcurrentBookings || 1,
    },
  });
  
  const watchedCategoryId = form.watch("categoryId");

  useEffect(() => {
    if (initialData) {
      form.reset({
        categoryId: initialData.categoryId,
        maxConcurrentBookings: initialData.maxConcurrentBookings,
      });
      setSelectedCategoryName(categories.find(c => c.id === initialData.categoryId)?.name);
    } else {
      form.reset({ categoryId: undefined, maxConcurrentBookings: 1 });
      setSelectedCategoryName(undefined);
    }
  }, [initialData, form, categories]);

  useEffect(() => {
    if (watchedCategoryId) {
      setSelectedCategoryName(categories.find(c => c.id === watchedCategoryId)?.name);
    } else {
      setSelectedCategoryName(undefined);
    }
  }, [watchedCategoryId, categories]);

  const handleSubmit = async (formData: TimeSlotLimitFormData) => {
    setIsFormBusy(true);
    if (!selectedCategoryName) {
        toast({ title: "Error", description: "Category name not found.", variant: "destructive" });
        setIsFormBusy(false);
        return;
    }
    try {
      const limitDocRef = doc(db, "timeSlotCategoryLimits", formData.categoryId);
      const payload: TimeSlotCategoryLimit = {
        id: formData.categoryId, // Use categoryId as document ID
        categoryId: formData.categoryId,
        categoryName: selectedCategoryName, 
        maxConcurrentBookings: formData.maxConcurrentBookings,
        maxBookings: formData.maxConcurrentBookings, // For consistency with UI usage
        updatedAt: Timestamp.now(),
      };
      await setDoc(limitDocRef, payload, { merge: true }); // Use setDoc with merge to create or update
      
      toast({ title: "Success", description: `Limit for ${selectedCategoryName} ${initialData ? 'updated' : 'added'} successfully.` });
      onSuccess(); // Call parent's success handler (e.g., close dialog)
    } catch (error) {
      console.error("Error saving time slot limit: ", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save limit.", variant: "destructive" });
    } finally {
      setIsFormBusy(false);
    }
  };
  
  // Filter categories for "Add New Limit" mode: show only those without an existing limit
  const availableCategoriesForNewLimit = initialData 
    ? categories // If editing, show all categories (dropdown will be disabled for categoryId)
    : categories.filter(cat => !existingLimitCategoryIds.includes(cat.id));

  const filteredCategories = availableCategoriesForNewLimit.filter(cat =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  const effectiveIsSubmitting = isParentSubmitting || isFormBusy;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 py-2">
        <FormField
          control={form.control}
          name="categoryId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <Dialog open={isCategoryPickerOpen} onOpenChange={setIsCategoryPickerOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      "w-full justify-between text-left font-normal h-10",
                      !field.value && "text-muted-foreground"
                    )}
                    disabled={effectiveIsSubmitting || !!initialData}
                    type="button"
                  >
                    {selectedCategoryName ? selectedCategoryName : "Select a category"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Select Category</DialogTitle>
                    <DialogDescription>
                      Search and select a category.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="relative my-2">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search categories..."
                      className="pl-9 h-10"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                    />
                  </div>
                  <div className="py-2">
                    <ScrollArea className="h-[250px] rounded-md border p-2">
                      <div className="space-y-1">
                        {filteredCategories.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            {availableCategoriesForNewLimit.length === 0 && !initialData ? "All categories have limits." : "No categories found."}
                          </p>
                        ) : (
                          filteredCategories.map((cat) => (
                            <Button
                              key={cat.id}
                              variant={field.value === cat.id ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                              onClick={() => {
                                field.onChange(cat.id);
                                setIsCategoryPickerOpen(false);
                              }}
                              type="button"
                            >
                              <span className="text-sm font-medium">{cat.name}</span>
                              {field.value === cat.id && (
                                <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </DialogContent>
              </Dialog>
              {!!initialData && <FormDescription>Category cannot be changed for an existing limit.</FormDescription>}
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="maxConcurrentBookings"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Max Concurrent Bookings Per Slot</FormLabel>
              <FormControl>
                <Input type="number" placeholder="e.g., 2" {...field} disabled={effectiveIsSubmitting} />
              </FormControl>
              <FormDescription>
                How many bookings for this category can exist in the same time slot. Set to 0 to only allow bookings based on active providers' locations/capacity.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onCancel} disabled={effectiveIsSubmitting}>
                Cancel
            </Button>
            <Button type="submit" disabled={effectiveIsSubmitting || (availableCategoriesForNewLimit.length === 0 && !initialData)}>
                {effectiveIsSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {initialData ? 'Save Changes' : 'Add Limit'}
            </Button>
        </div>
      </form>
    </Form>
  );
}
