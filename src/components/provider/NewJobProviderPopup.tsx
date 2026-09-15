"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRouter } from 'next/navigation';
import { useLoading } from '@/contexts/LoadingContext';
import { Bell } from "lucide-react";

interface NewJobProviderPopupProps {
  isOpen: boolean;
  bookingDocId: string;
  bookingHumanId: string;
  onClose: (markNotificationAsRead?: boolean) => void;
}

export default function NewJobProviderPopup({
  isOpen,
  bookingDocId,
  bookingHumanId,
  onClose,
}: NewJobProviderPopupProps) {
  const router = useRouter();
  const { showLoading } = useLoading();

  const handleViewJob = () => {
    showLoading();
    router.push(`/provider/booking/${bookingDocId}`);
    onClose(true); // Mark as read and close
  };

  const handleClosePopup = () => {
    onClose(false); // Just close, do not mark as read
  };

  if (!isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(false); }}>
      <DialogContent 
        className="max-w-[90%] sm:max-w-md rounded-2xl p-6"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pt-4">
          <div className="flex items-center justify-center mx-auto mb-4 h-16 w-16 rounded-full bg-rose-50 border border-rose-100">
            <Bell className="h-8 w-8 text-rose-500 animate-bounce" />
          </div>
          <DialogTitle className="text-center text-xl font-bold font-headline text-slate-900">
            New Booking Received
          </DialogTitle>
          <DialogDescription className="text-center text-sm sm:text-base text-slate-500 pt-2 px-2 leading-relaxed">
            You have received a new booking. Check your bookings page for details.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-center gap-3 mt-6">
          <Button 
            variant="outline" 
            onClick={handleClosePopup} 
            className="px-6 py-2 border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl"
          >
            Close
          </Button>
          <Button 
            onClick={handleViewJob} 
            className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-xl"
          >
            View
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
