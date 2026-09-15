
"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star, Loader2 } from 'lucide-react';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { FirestoreBooking, FirestoreReview, FirestoreService } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, updateDoc, Timestamp, getDoc, query, where, getDocs, limit } from '@/lib/mysqlDb';
import { useAuth } from '@/hooks/useAuth';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getBaseUrl } from '@/lib/config';
import { sendNewReviewAdminNotificationEmail } from '@/ai/flows/sendNewReviewAdminNotificationFlow';
import type { FirestoreNotification } from '@/types/firestore';

const reviewSchema = z.object({
  rating: z.number().min(1, "Rating is required.").max(5, "Rating cannot exceed 5."),
  comment: z.string().min(10, "Comment must be at least 10 characters.").max(1000, "Comment cannot exceed 1000 characters."),
});

type ReviewFormData = z.infer<typeof reviewSchema>;

interface ReviewSubmissionModalProps {
  booking: FirestoreBooking; // The booking that needs a review
  isOpen: boolean;
  onReviewSubmitted: () => void; // Callback to close modal and update parent state
}

export default function ReviewSubmissionModal({ booking, isOpen, onReviewSubmitted }: ReviewSubmissionModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { config } = useApplicationConfig();
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [serviceToReview, setServiceToReview] = useState<FirestoreService | null>(null);
  const [isLoadingService, setIsLoadingService] = useState(true);

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: 0,
      comment: "",
    },
  });

  useEffect(() => {
    const fetchServiceDetails = async () => {
      if (isOpen && booking.services.length > 0) {
        setIsLoadingService(true);
        const firstServiceId = booking.services[0].serviceId;
        try {
          const serviceDocRef = doc(db, "adminServices", firstServiceId);
          const serviceSnap = await getDoc(serviceDocRef);
          if (serviceSnap.exists()) {
            setServiceToReview({ id: serviceSnap.id, ...serviceSnap.data() } as FirestoreService);
          } else {
            console.warn(`Service with ID ${firstServiceId} not found for review.`);
            toast({ title: "Service Not Found", description: "The service for this booking could not be found. Please contact support.", variant: "destructive" });
            onReviewSubmitted(); // Close if service is missing
          }
        } catch (error) {
          console.error("Error fetching service for review:", error);
          toast({ title: "Error", description: "Could not load service details for review.", variant: "destructive" });
          onReviewSubmitted(); // Close on error
        } finally {
          setIsLoadingService(false);
        }
      } else if (!isOpen) {
        setServiceToReview(null); // Clear when modal is not open
        setIsLoadingService(false);
      }
    };

    fetchServiceDetails();
    if (isOpen) {
      form.reset({ rating: 0, comment: "" }); // Reset form each time modal opens for a new review
    }
  }, [booking, isOpen, form, onReviewSubmitted, toast]);

  const onSubmit = async (data: ReviewFormData) => {
    if (!user || !serviceToReview || !booking.id) {
      toast({ title: "Error", description: "User, service, or booking information missing.", variant: "destructive" });
      return;
    }
    setIsSubmittingReview(true);
    try {
      const reviewData: Omit<FirestoreReview, 'id' | 'updatedAt'> & {userAvatarUrl?: string} = { // Include createdAt
        serviceId: serviceToReview.id,
        serviceName: serviceToReview.name,
        bookingId: booking.bookingId, // Use the human-readable bookingId
        userId: user.uid,
        userName: user.displayName || "Anonymous User",
        // Conditionally add userAvatarUrl
        rating: data.rating,
        comment: data.comment,
        status: "Approved", // Auto-approve for now
        adminCreated: false,
        createdAt: Timestamp.now(),
      };

      if (user.photoURL) {
        reviewData.userAvatarUrl = user.photoURL;
      }

      const reviewDocRef = await addDoc(collection(db, "adminReviews"), reviewData as Omit<FirestoreReview, 'id'>); // Cast back to expected type for addDoc
      
      const bookingDocRef = doc(db, "bookings", booking.id); // Use Firestore document ID of booking
      await updateDoc(bookingDocRef, { isReviewedByCustomer: true, updatedAt: Timestamp.now() });

      // --- Admin Notification & Email ---
      try {
        const usersRef = collection(db, "users");
        const adminQuery = query(usersRef, where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);

        if (!adminSnapshot.empty) {
            const adminUid = adminSnapshot.docs[0].id;
            const adminNotification: FirestoreNotification = {
                userId: adminUid,
                title: "New Service Review",
                message: `${user.displayName || 'A user'} rated ${serviceToReview.name} with ${data.rating} stars.`,
                type: "admin_alert",
                href: `/admin/reviews`, // Link to reviews management
                read: false,
                createdAt: Timestamp.now(),
            };
            await addDoc(collection(db, "userNotifications"), adminNotification);

            // Trigger Push Notification for admin
            triggerPushNotification({
                userId: adminUid,
                title: adminNotification.title,
                body: adminNotification.message,
                href: adminNotification.href,
                variables: {
                    customerName: user.displayName || 'Customer',
                    serviceName: serviceToReview.name,
                    rating: data.rating,
                    comment: data.comment || '',
                    siteName: 'Yourbrand'
                }
            });

            // Send Email Notification
            if (config.smtpHost && config.senderEmail) {
                await sendNewReviewAdminNotificationEmail({
                    reviewId: reviewDocRef.id,
                    bookingId: booking.bookingId,
                    serviceName: serviceToReview.name,
                    userName: user.displayName || "Anonymous User",
                    rating: data.rating,
                    comment: data.comment,
                    adminUrl: `${getBaseUrl()}/admin/reviews`,
                    smtpHost: config.smtpHost,
                    smtpPort: config.smtpPort,
                    smtpUser: config.smtpUser,
                    smtpPass: config.smtpPass,
                    senderEmail: config.senderEmail,
                    siteName: "Yourbrand", // Or from webSettings if available
                });
            }
        }
      } catch (adminNotifyError) {
        console.error("Error sending admin notification for review:", adminNotifyError);
        // Don't fail the user's review submission if admin notification fails
      }

      toast({ title: "Review Submitted", description: "Thank you for your feedback!" });
      onReviewSubmitted(); 
    } catch (error) {
      console.error("Error submitting review:", error);
      toast({ title: "Error", description: "Failed to submit review. Please try again.", variant: "destructive" });
    } finally {
      setIsSubmittingReview(false);
    }
  };
  
  // Prevent closing by clicking outside or escape key
  const handleOpenChange = (open: boolean) => {
    if (!open && isOpen && !isSubmittingReview) {
      // Modal is trying to close, but it's mandatory.
      // We could show a toast or just do nothing.
      // For now, we just prevent it by not calling onReviewSubmitted unless it's a successful submit.
      // The Dialog's onInteractOutside and onEscapeKeyDown will also be set to preventDefault.
    }
  };


  if (!isOpen) return null;

  if (isLoadingService) {
      return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                <DialogHeader><DialogTitle>Review Service</DialogTitle></DialogHeader>
                <div className="py-4 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2"/>
                    <p>Loading service details...</p>
                </div>
            </DialogContent>
        </Dialog>
      );
  }

  if (!serviceToReview) {
    // This case should ideally be handled by the error toasts in useEffect, and onReviewSubmitted() would close it.
    // But as a fallback:
    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
                <DialogHeader><DialogTitle>Error</DialogTitle></DialogHeader>
                <div className="py-4 text-center">
                    <p>Could not load service details for review. Please try again later or contact support.</p>
                </div>
                <DialogFooter>
                    <Button onClick={onReviewSubmitted} variant="outline">Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Leave a Review for {serviceToReview.name}</DialogTitle>
          <DialogDescription>
            Your feedback helps us improve. Please rate your experience for Booking ID: {booking.bookingId}.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="rating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Your Rating</FormLabel>
                  <FormControl>
                    <div className="flex items-center space-x-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-7 w-7 cursor-pointer transition-colors ${
                            star <= field.value ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground hover:text-yellow-300'
                          }`}
                          onClick={() => field.onChange(star)}
                        />
                      ))}
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
                  <FormLabel>Your Comments</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us about your experience..."
                      rows={5}
                      {...field}
                      disabled={isSubmittingReview}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" disabled={isSubmittingReview} className="w-full">
                {isSubmittingReview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Review
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
