
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CustomServiceRequest } from '@/types/firestore';
import AppImage from '@/components/ui/AppImage';
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";

interface CustomRequestDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: CustomServiceRequest | null;
}

const formatDate = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  const d = new Date(millis);
  return `${formatDateInTimezone(d, 'Asia/Kolkata')} ${formatTimeInTimezone(d, 'Asia/Kolkata')}`;
};

const DetailItem = ({ label, value }: { label: string; value?: string | number | null }) => (
  <div>
    <p className="text-sm font-medium text-muted-foreground">{label}</p>
    <p className="text-base text-foreground">{value || "N/A"}</p>
  </div>
);

export default function CustomRequestDetailsModal({ isOpen, onClose, request }: CustomRequestDetailsModalProps) {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  if (!request) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-4 sm:p-3 border-b">
          <DialogTitle className="text-xl sm:text-2xl">{request.serviceTitle}</DialogTitle>
          <DialogDescription>Submitted by {request.userName || "Guest"} on {formatDate(request.submittedAt)}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-grow">
          <div className="p-4 sm:p-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailItem label="Customer Name" value={request.userName} />
                <DetailItem label="Category" value={request.categoryName || request.customCategory} />
                <DetailItem label="Customer Email" value={request.userEmail} />
                <DetailItem label="Customer Mobile" value={request.userMobile} />
                <DetailItem label="Preferred Start Date" value={formatDate(request.preferredStartDate)} />
                <DetailItem label="Budget" value={request.minBudget && request.maxBudget ? `${symbol}${request.minBudget} - ${symbol}${request.maxBudget}` : 'Not specified'} />
            </div>
            
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-base text-foreground whitespace-pre-wrap mt-1">{request.description}</p>
            </div>
            
            {request.imageUrls && request.imageUrls.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Uploaded Images</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {request.imageUrls.map((url, index) => (
                    <a key={index} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-md overflow-hidden border">
                      <AppImage src={url} alt={`Request image ${index + 1}`} fill sizes="150px" className="object-cover hover:scale-105 transition-transform" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <DialogFooter className="p-4 sm:p-3 border-t bg-muted/50">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
        </DialogContent>
        </Dialog>
        );
        }