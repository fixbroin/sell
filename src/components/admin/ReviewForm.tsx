
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { FirestoreReview, FirestoreService, ReviewStatus } from "@/types/firestore";
import { useEffect, useState } from "react";
import { Loader2, Star, Check, ChevronsUpDown, Search } from "lucide-react";

const reviewStatusOptions: [string, ...string[]] = ["Pending", "Approved", "Rejected", "Flagged"];

const reviewFormSchema = z.object({
  serviceId: z.string({ required_error: "Please select a service." }),
  userName: z.string().min(2, "Reviewer name must be at least 2 characters.").default("Admin"),
  rating: z.coerce.number().min(1, "Rating must be at least 1.").max(5, "Rating cannot exceed 5."),
  comment: z.string().min(10, "Comment must be at least 10 characters.").max(1000, "Comment too long."),
  status: z.enum(reviewStatusOptions),
});

export type ReviewFormData = z.infer<typeof reviewFormSchema>;

interface ReviewFormProps {
  onSubmit: (data: ReviewFormData & { serviceName: string, adminCreated: boolean, id?: string }) => Promise<void>;
  initialData?: FirestoreReview | null;
  services: Pick<FirestoreService, 'id' | 'name'>[]; 
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ReviewForm({ onSubmit: onSubmitProp, initialData, services, onCancel, isSubmitting = false }: ReviewFormProps) {
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");
  const [isServicePickerOpen, setIsServicePickerOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  useEffect(() => {
    if (!isServicePickerOpen) {
      setServiceSearch("");
    }
  }, [isServicePickerOpen]);

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      serviceId: initialData?.serviceId || undefined,
      userName: initialData?.userName || "Admin",
      rating: initialData?.rating || 3,
      comment: initialData?.comment || "",
      status: initialData?.status || "Pending",
    },
  });
  
  const watchedServiceId = form.watch("serviceId");

  useEffect(() => {
    if (initialData) {
      form.reset({
        serviceId: initialData.serviceId,
        userName: initialData.userName,
        rating: initialData.rating,
        comment: initialData.comment,
        status: initialData.status,
      });
      const service = services.find(s => s.id === initialData.serviceId);
      setSelectedServiceName(service?.name || "Unknown Service");
    } else {
      form.reset({
        serviceId: undefined,
        userName: "Admin",
        rating: 3,
        comment: "",
        status: "Pending",
      });
      setSelectedServiceName("");
    }
  }, [initialData, form, services]);

  useEffect(() => {
    if (watchedServiceId) {
      const service = services.find(s => s.id === watchedServiceId);
      setSelectedServiceName(service?.name || "Unknown Service");
    } else {
      setSelectedServiceName("");
    }
  }, [watchedServiceId, services]);


  const handleSubmit = async (formData: ReviewFormData) => {
    const serviceName = services.find(s => s.id === formData.serviceId)?.name || "Unknown Service";
    await onSubmitProp({ 
      ...formData, 
      serviceName,
      adminCreated: true, 
      id: initialData?.id 
    });
  };

  return (
    <Form {...form}>
      {/* Form takes full height of its container from reviews/page.tsx */}
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col h-full"> 
        {/* This div contains the actual form fields and will scroll if needed */}
        <div className="p-3 space-y-6 flex-grow"> {/* Removed overflow-y-auto, parent handles scroll */}
            <FormField
            control={form.control}
            name="serviceId"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel className="mb-2">Service</FormLabel>
                <Dialog open={isServicePickerOpen} onOpenChange={setIsServicePickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between text-left font-normal h-10",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={isSubmitting || !!initialData}
                      type="button"
                    >
                      {selectedServiceName ? selectedServiceName : "Select a service for the review"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Select Service</DialogTitle>
                      <DialogDescription>
                        Search and select a service.
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
                                  setSelectedServiceName(service.name);
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
                {initialData && <FormDescription>Service cannot be changed for an existing review.</FormDescription>}
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField
            control={form.control}
            name="userName"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Reviewer Name</FormLabel>
                <FormControl>
                    <Input placeholder="e.g., Admin or John Doe" {...field} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />
            
            <FormField
            control={form.control}
            name="rating"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Rating (1-5 stars)</FormLabel>
                <FormControl>
                    <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                        key={star}
                        className={`h-6 w-6 cursor-pointer transition-colors
                            ${star <= field.value ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground hover:text-yellow-300'}`}
                        onClick={() => field.onChange(star)}
                        />
                    ))}
                    <Input type="hidden" {...field} />
                    </div>
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
                <FormItem>
                <FormLabel>Review Comment</FormLabel>
                <FormControl>
                    <Textarea placeholder="Write the review content here..." {...field} rows={5} disabled={isSubmitting} />
                </FormControl>
                <FormMessage />
                </FormItem>
            )}
            />

            <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
                <FormItem className="flex flex-col">
                <FormLabel className="mb-2">Status</FormLabel>
                <Dialog open={isStatusPickerOpen} onOpenChange={setIsStatusPickerOpen}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        "w-full justify-between text-left font-normal h-10",
                        !field.value && "text-muted-foreground"
                      )}
                      disabled={isSubmitting}
                      type="button"
                    >
                      {field.value || "Select review status"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Select Status</DialogTitle>
                      <DialogDescription>
                        Choose the publication status for this review.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <ScrollArea className="h-[200px] rounded-md border p-2">
                        <div className="space-y-1">
                          {reviewStatusOptions.map((status) => (
                            <Button
                              key={status}
                              variant={field.value === status ? "secondary" : "ghost"}
                              className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                              onClick={() => {
                                field.onChange(status);
                                setIsStatusPickerOpen(false);
                              }}
                              type="button"
                            >
                              <span className="text-sm font-medium">{status}</span>
                              {field.value === status && (
                                <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                              )}
                            </Button>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </DialogContent>
                </Dialog>
                <FormMessage />
                </FormItem>
            )}
            />
        </div>
        
        {/* Button footer - mt-auto pushes it down if form content is short. */}
        <div className="p-3 border-t bg-background flex flex-col sm:flex-row sm:justify-end gap-3 mt-auto">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData ? 'Save Changes' : 'Create Review'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
