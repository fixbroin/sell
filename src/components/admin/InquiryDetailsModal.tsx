
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FirestoreContactUsInquiry, FirestorePopupInquiry } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { Copy } from 'lucide-react';
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';

type Inquiry = FirestoreContactUsInquiry | FirestorePopupInquiry;
type InquiryType = 'contact' | 'popup';

interface InquiryDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  inquiry: Inquiry | null;
  inquiryType: InquiryType | null;
}

const formatDate = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  const d = new Date(millis);
  return `${formatDateInTimezone(d, 'Asia/Kolkata')} ${formatTimeInTimezone(d, 'Asia/Kolkata')}`;
};

const DetailItem = ({ label, value, isPre = false, copyable = false }: { label: string; value?: string | number | null; isPre?: boolean; copyable?: boolean }) => {
  const { toast } = useToast();

  const handleCopy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (value) {
      navigator.clipboard.writeText(String(value));
      toast({
        description: `${label} copied to clipboard.`,
      });
    }
  };
    
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-start justify-between gap-2 mt-1">
        {isPre ? (
            <pre className="text-sm text-foreground bg-muted p-2 rounded-md whitespace-pre-wrap flex-grow">{value || "N/A"}</pre>
        ) : (
            <p className="text-base text-foreground break-words">{value || "N/A"}</p>
        )}
        {copyable && value && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
            <span className="sr-only">Copy {label}</span>
          </Button>
        )}
      </div>
    </div>
  );
};


export default function InquiryDetailsModal({ isOpen, onClose, inquiry, inquiryType }: InquiryDetailsModalProps) {
  if (!inquiry) return null;

  const isContactForm = inquiryType === 'contact';
  const popupInquiry = isContactForm ? null : inquiry as FirestorePopupInquiry;
  const contactInquiry = isContactForm ? inquiry as FirestoreContactUsInquiry : null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[90vw] max-h-[90vh] grid grid-rows-[auto_1fr_auto] p-0">
        <DialogHeader className="p-4 sm:p-3 border-b">
          <DialogTitle className="text-xl sm:text-2xl">{isContactForm ? "Contact Inquiry" : "Popup Submission"}</DialogTitle>
          <DialogDescription>
            Submitted by {inquiry.name || "Guest"} on {formatDate(inquiry.submittedAt)}
          </DialogDescription>
        </DialogHeader>
        
        <div className="overflow-y-auto">
          <div className="p-4 sm:p-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DetailItem label="Submitter Name" value={inquiry.name} copyable />
                <DetailItem label="Submitter Email" value={inquiry.email} copyable />
                <DetailItem label="Submitter Phone" value={inquiry.phone} copyable />
                <DetailItem label="Status" value={inquiry.status} />
            </div>
            
            {popupInquiry && (
                <>
                    <DetailItem label="Source" value={`Popup: ${popupInquiry.popupName} (${popupInquiry.popupType})`} />
                    <DetailItem label="Form Data" value={JSON.stringify(popupInquiry.formData || {}, null, 2)} isPre={true} copyable />
                </>
            )}

            {contactInquiry && (
                <DetailItem label="Message" value={contactInquiry.message} isPre={true} copyable />
            )}

            {inquiry.replyMessage && (
                <div className="pt-4 border-t">
                    <DetailItem label="Admin Reply" value={inquiry.replyMessage} isPre={true} copyable />
                    <DetailItem label="Replied At" value={formatDate(inquiry.repliedAt)} />
                </div>
            )}
            
          </div>
        </div>

        <DialogFooter className="p-4 sm:p-3 border-t bg-muted/50">
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
