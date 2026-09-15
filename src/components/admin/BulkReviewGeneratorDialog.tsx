
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Loader2, Sparkles, Wand2, Search, Check, ChevronsUpDown } from 'lucide-react';
import type { FirestoreService, FirestoreSubCategory, FirestoreCategory, FirestoreReview } from '@/types/firestore';
import { useToast } from '@/hooks/use-toast';
import { generateBulkReviews } from '@/ai/flows/generateBulkReviewsFlow';
import { db } from '@/lib/firebase';
import { collection, writeBatch, Timestamp, doc } from '@/lib/mysqlDb';

const formSchema = z.object({
  serviceId: z.string({ required_error: "Please select a service." }),
  numberOfReviews: z.coerce.number().int().min(1, "Must generate at least 1 review.").max(20, "Cannot generate more than 20 reviews at once."),
});

type BulkReviewFormData = z.infer<typeof formSchema>;

interface BulkReviewGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerationComplete: () => void;
  services: Pick<FirestoreService, 'id' | 'name' | 'subCategoryId'>[];
  subCategories: Pick<FirestoreSubCategory, 'id' | 'name' | 'parentId'>[];
  parentCategories: Pick<FirestoreCategory, 'id' | 'name'>[];
}

export default function BulkReviewGeneratorDialog({
  isOpen,
  onClose,
  onGenerationComplete,
  services,
  subCategories,
  parentCategories,
}: BulkReviewGeneratorDialogProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  const form = useForm<BulkReviewFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { serviceId: undefined, numberOfReviews: 5 },
  });

  const selectedService = services.find((s) => s.id === form.watch("serviceId"));
  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  useEffect(() => {
    if (!isServicePickerOpen) {
      setServiceSearch("");
    }
  }, [isServicePickerOpen]);

  const onSubmit = async (data: BulkReviewFormData) => {
    setIsGenerating(true);
    toast({ title: "Starting Review Generation...", description: "The AI is crafting reviews. This may take a moment." });

    const selectedService = services.find(s => s.id === data.serviceId);
    if (!selectedService) {
      toast({ title: "Error", description: "Selected service not found.", variant: "destructive" });
      setIsGenerating(false);
      return;
    }
    const subCategory = subCategories.find(sc => sc.id === selectedService.subCategoryId);
    const parentCategory = parentCategories.find(pc => pc.id === subCategory?.parentId);

    try {
      const aiResult = await generateBulkReviews({
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        subCategoryName: subCategory?.name || '',
        categoryName: parentCategory?.name || '',
        numberOfReviews: data.numberOfReviews,
      });

      if (!aiResult.reviews || aiResult.reviews.length === 0) {
        throw new Error("AI did not return any reviews.");
      }
      
      toast({ title: "AI Generation Complete", description: `Saving ${aiResult.reviews.length} new reviews to the database.` });

      // Save to Firestore
      const batch = writeBatch(db);
      const reviewsCollectionRef = collection(db, "adminReviews");

      aiResult.reviews.forEach(review => {
        const newReviewRef = doc(reviewsCollectionRef);
        const reviewData: Omit<FirestoreReview, 'id'> = {
          serviceId: selectedService.id,
          serviceName: selectedService.name,
          userName: review.userName,
          rating: review.rating,
          comment: review.comment,
          status: "Approved", // Auto-approve AI-generated reviews
          adminCreated: true,
          createdAt: Timestamp.now(),
        };
        batch.set(newReviewRef, reviewData);
      });

      await batch.commit();

      toast({ title: "Success!", description: `${aiResult.reviews.length} reviews have been successfully generated and saved.`, className: "bg-green-100 text-green-700 border-green-300" });
      onGenerationComplete(); // To trigger a refresh on the main page
      onClose(); // Close the dialog

    } catch (error) {
      console.error("Error generating or saving bulk reviews:", error);
      toast({ title: "Error", description: (error as Error).message || "An unexpected error occurred.", variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {if (!isGenerating) onClose()}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center"><Wand2 className="mr-2 h-5 w-5 text-primary"/> AI Bulk Review Generator</DialogTitle>
          <DialogDescription>
            Select a service and generate multiple realistic reviews automatically.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField
              control={form.control}
              name="serviceId"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel className="mb-2">Select Service</FormLabel>
                  <Dialog open={isServicePickerOpen} onOpenChange={setIsServicePickerOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between text-left font-normal h-10",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={isGenerating}
                        type="button"
                      >
                        {selectedService ? selectedService.name : "Choose a service..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Select Service</DialogTitle>
                        <DialogDescription>
                          Search and select a service to generate reviews for.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="relative my-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search services..."
                          className="pl-9 h-10"
                          value={serviceSearch}
                          onChange={(e) => setServiceSearch(e.target.value)}
                        />
                      </div>
                      <div className="py-2">
                        <ScrollArea className="h-[250px] rounded-md border p-2">
                          <div className="space-y-1">
                            {filteredServices.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">No services found.</p>
                            ) : (
                              filteredServices.map((service) => (
                                <Button
                                  key={service.id}
                                  variant={field.value === service.id ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                  onClick={() => {
                                    field.onChange(service.id);
                                    setIsServicePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="text-sm font-medium">{service.name}</span>
                                  {field.value === service.id && (
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
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="numberOfReviews"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Number of Reviews to Generate</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" max="20" placeholder="e.g., 10" {...field} disabled={isGenerating} />
                  </FormControl>
                  <FormDescription>Max 20 reviews per generation.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isGenerating}>Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate Reviews
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
