
"use client";

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from '@/components/ui/badge';
import { Mail, MessageCircle, Phone, User, Edit, Trash2, CheckCircle, PackageSearch, Loader2, Send, AlertTriangle, Eye, MoreHorizontal, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, Timestamp, addDoc, limit } from '@/lib/mysqlDb';
import type { FirestoreContactUsInquiry, FirestorePopupInquiry, InquiryStatus, AppSettings, FirestoreNotification } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription as AlertDialogDescriptionComponent, AlertDialogFooter as AlertDialogFooterComponent, AlertDialogHeader, AlertDialogTitle as AlertDialogTitleComponent, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { sendInquiryReplyEmail, type InquiryReplyEmailInput } from '@/ai/flows/sendInquiryReplyEmailFlow';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import InquiryDetailsModal from '@/components/admin/InquiryDetailsModal';
import { Separator } from "@/components/ui/separator";
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';

type Inquiry = FirestoreContactUsInquiry | FirestorePopupInquiry;
type InquiryType = 'contact' | 'popup';

const formatTimestamp = (timestamp?: any, appConfig?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return `${formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)} ${formatTimeInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata')}`;
};

export default function AdminInquiriesPage() {
  const [contactInquiries, setContactInquiries] = useState<FirestoreContactUsInquiry[]>([]);
  const [popupInquiries, setPopupInquiries] = useState<FirestorePopupInquiry[]>([]);
  const [isLoadingContact, setIsLoadingContact] = useState(true);
  const [isLoadingPopup, setIsLoadingPopup] = useState(true);

  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);
  const [selectedInquiryForReply, setSelectedInquiryForReply] = useState<Inquiry | null>(null);
  const [selectedInquiryType, setSelectedInquiryType] = useState<InquiryType | null>(null);
  const [replyMessage, setReplyMessage] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedInquiryForDetails, setSelectedInquiryForDetails] = useState<Inquiry | null>(null);


  const { toast } = useToast();
  const { user: adminUser, adminPermissions } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();

  useEffect(() => {
    const contactRef = collection(db, "contactUsSubmissions");
    const qContact = query(contactRef, orderBy("submittedAt", "desc"), limit(50));
    const unsubContact = onSnapshot(qContact, (snapshot) => {
      setContactInquiries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreContactUsInquiry)));
      setIsLoadingContact(false);
    }, (error) => { console.error("Error fetching contact inquiries:", error); setIsLoadingContact(false); });

    const popupRef = collection(db, "popupSubmissions");
    const qPopup = query(popupRef, orderBy("submittedAt", "desc"), limit(50));
    const unsubPopup = onSnapshot(qPopup, (snapshot) => {
      setPopupInquiries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestorePopupInquiry)));
      setIsLoadingPopup(false);
    }, (error) => { console.error("Error fetching popup inquiries:", error); setIsLoadingPopup(false); });

    return () => { unsubContact(); unsubPopup(); };
  }, []);
  
  const handleViewDetails = (inquiry: Inquiry, type: InquiryType) => {
    setSelectedInquiryForDetails(inquiry);
    setSelectedInquiryType(type);
    setIsDetailsModalOpen(true);
  };


  const handleOpenReplyDialog = (inquiry: Inquiry, type: InquiryType) => {
    setSelectedInquiryForReply(inquiry);
    setSelectedInquiryType(type);
    setReplyMessage(inquiry.replyMessage || "");
    setIsReplyDialogOpen(true);
  };

  const handleSendReply = async () => {
    if (!selectedInquiryForReply || !selectedInquiryType || !adminUser?.uid || !selectedInquiryForReply.id || !selectedInquiryForReply.email) {
      toast({ title: "Error", description: "Missing inquiry data or user email for reply.", variant: "destructive" });
      return;
    }
    setIsSubmittingReply(true);
    const collectionName = selectedInquiryType === 'contact' ? "contactUsSubmissions" : "popupSubmissions";
    const inquiryDocRef = doc(db, collectionName, selectedInquiryForReply.id);
    
    try {
      await updateDoc(inquiryDocRef, {
        replyMessage: replyMessage,
        repliedAt: Timestamp.now(),
        repliedByAdminUid: adminUser.uid,
        status: 'replied' as InquiryStatus,
      });
      toast({ title: "Reply Saved", description: "Your reply has been saved to Firestore." });

      const originalMessageSummary = selectedInquiryType === 'contact' 
        ? (selectedInquiryForReply as FirestoreContactUsInquiry).message 
        : `Popup: ${(selectedInquiryForReply as FirestorePopupInquiry).popupName} - Data: ${JSON.stringify((selectedInquiryForReply as FirestorePopupInquiry).formData || {})}`;

      const emailInput: InquiryReplyEmailInput = {
        inquiryId: selectedInquiryForReply.id,
        inquiryType: selectedInquiryType,
        userName: selectedInquiryForReply.name || "Valued User",
        userEmail: selectedInquiryForReply.email,
        originalMessage: originalMessageSummary,
        replyMessage: replyMessage,
        adminName: adminUser.displayName || "Yourbrand Support",
        smtpHost: appConfig.smtpHost,
        smtpPort: appConfig.smtpPort,
        smtpUser: appConfig.smtpUser,
        smtpPass: appConfig.smtpPass,
        senderEmail: appConfig.senderEmail,
      };

      const emailResult = await sendInquiryReplyEmail(emailInput);
      if (emailResult.success) {
        toast({ title: "Email Sent", description: "Reply email sent to the user." });
      } else {
        toast({ title: "Email Failed", description: emailResult.message || "Could not send reply email. Check logs.", variant: "destructive", duration: 7000 });
      }

      // --- USER NOTIFICATION FOR INQUIRY REPLY ---
      const inquiryWithUserId = selectedInquiryForReply as any;
      if (inquiryWithUserId.userId) {
          const userNotification: Omit<FirestoreNotification, 'id'> = {
            userId: inquiryWithUserId.userId,
            title: "Reply to Your Inquiry",
            message: `Yourbrand Support replied to your inquiry: "${replyMessage.substring(0, 50)}${replyMessage.length > 50 ? '...' : ''}"`,
            type: 'info',
            href: '/', // Or a specific inquiries page if it exists for users
            read: false,
            createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), userNotification);
          triggerPushNotification({
            userId: inquiryWithUserId.userId,
            title: userNotification.title,
            body: userNotification.message,
            href: userNotification.href
          }).catch(err => console.error("Error sending inquiry reply push:", err));
      }
      // --- END USER NOTIFICATION ---

      setIsReplyDialogOpen(false);
      setReplyMessage("");
      setSelectedInquiryForReply(null);
    } catch (error) {
      console.error("Error sending reply:", error);
      toast({ title: "Error", description: "Could not save reply or send email.", variant: "destructive" });
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleMarkAsResolved = async (inquiryId: string, type: InquiryType) => {
    const collectionName = type === 'contact' ? "contactUsSubmissions" : "popupSubmissions";
    const inquiryDocRef = doc(db, collectionName, inquiryId);
    try {
      await updateDoc(inquiryDocRef, { status: 'resolved' as InquiryStatus, updatedAt: Timestamp.now() });
      toast({ title: "Inquiry Resolved", description: "Marked as resolved." });
    } catch (error) {
      toast({ title: "Error", description: "Could not update status.", variant: "destructive" });
    }
  };
  
  const handleDeleteInquiry = async (inquiryId: string, type: InquiryType) => {
    const collectionName = type === 'contact' ? "contactUsSubmissions" : "popupSubmissions";
    const inquiryDocRef = doc(db, collectionName, inquiryId);
    try {
      await deleteDoc(inquiryDocRef);
      toast({ title: "Inquiry Deleted", description: "The inquiry has been removed." });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete inquiry.", variant: "destructive" });
    }
  };

  const getStatusBadgeVariant = (status: InquiryStatus) => {
    switch (status) {
      case 'new': return 'destructive';
      case 'replied': return 'secondary';
      case 'resolved': return 'default';
      default: return 'outline';
    }
  };

  const renderInquiriesTable = (inquiries: Inquiry[], type: InquiryType, isLoadingTable: boolean) => {
    if (isLoadingTable || isLoadingAppSettings) {
      return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading inquiries...</span></div>;
    }
    if (inquiries.length === 0) {
      return <div className="text-center py-10"><PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No inquiries found in this category.</p></div>;
    }
    return (
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Submitter Info</TableHead>
            <TableHead>Content Preview</TableHead>
            <TableHead>Submitted At</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inquiries.map((inquiry) => (
            <React.Fragment key={inquiry.id}>
              {/* Info Row */}
              <TableRow className="hover:bg-transparent border-b-0">
                <TableCell className="text-xs">
                  <div className="font-medium flex items-center"><User size={14} className="mr-1 text-muted-foreground"/>{inquiry.name || "N/A"}</div>
                  {inquiry.email && <div className="text-muted-foreground flex items-center mt-0.5"><Mail size={14} className="mr-1"/>{inquiry.email}</div>}
                  {inquiry.phone && <div className="text-muted-foreground flex items-center mt-0.5"><Phone size={14} className="mr-1"/>{inquiry.phone}</div>}
                </TableCell>
                <TableCell className="text-xs max-w-sm">
                  <div className="truncate" title={(inquiry as any).message || JSON.stringify((inquiry as FirestorePopupInquiry).formData)}>
                    {(inquiry as any).message || (type === 'popup' ? `Form Data: ${Object.entries((inquiry as FirestorePopupInquiry).formData || {}).map(([k,v]) => `${k}: ${v}`).join(', ')}` : 'N/A')}
                  </div>
                  {type === 'popup' && (inquiry as FirestorePopupInquiry).popupName && (
                      <div className="text-muted-foreground text-[10px] mt-0.5">
                          Source: {(inquiry as FirestorePopupInquiry).popupName}
                      </div>
                  )}
                </TableCell>
                <TableCell className="text-xs">{formatTimestamp(inquiry.submittedAt, appConfig)}</TableCell>
                <TableCell>
                  <Badge variant={getStatusBadgeVariant(inquiry.status)} className="text-[10px] capitalize">
                    {inquiry.status}
                  </Badge>
                </TableCell>
              </TableRow>
              {/* Actions Row */}
              <TableRow className="bg-muted/5 border-b-2">
                <TableCell colSpan={4} className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleViewDetails(inquiry, type)} className="h-8 text-xs">
                      <Eye className="h-3.5 w-3.5 mr-1.5" /> View Details
                    </Button>
                    
                    <Separator orientation="vertical" className="h-6 mx-1" />

                    <PermissionGuard moduleId="inquiries" action="write">
                      <Button variant="outline" size="sm" onClick={() => handleOpenReplyDialog(inquiry, type)} disabled={isSubmittingReply || isLoadingAppSettings} className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50">
                        <Edit className="h-3.5 w-3.5 mr-1.5" /> Reply to User
                      </Button>
                    </PermissionGuard>

                    {inquiry.status !== 'resolved' && (
                      <PermissionGuard moduleId="inquiries" action="write">
                        <Button variant="outline" size="sm" onClick={() => handleMarkAsResolved(inquiry.id!, type)} className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50">
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark Resolved
                        </Button>
                      </PermissionGuard>
                    )}

                    <Separator orientation="vertical" className="h-6 mx-1" />

                    <PermissionGuard moduleId="inquiries" action="delete">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="h-8 text-xs">
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitleComponent>Confirm Deletion</AlertDialogTitleComponent>
                            <AlertDialogDescriptionComponent>
                              Are you sure you want to delete this inquiry from {inquiry.name || inquiry.email}? This action cannot be undone.
                            </AlertDialogDescriptionComponent>
                          </AlertDialogHeader>
                          <AlertDialogFooterComponent>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteInquiry(inquiry.id!, type)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooterComponent>
                        </AlertDialogContent>
                      </AlertDialog>
                    </PermissionGuard>
                  </div>
                </TableCell>
              </TableRow>
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    );
  };

  const renderMobileCard = (inquiry: Inquiry, type: InquiryType) => (
    <Card key={inquiry.id} className="mb-4 shadow-sm border overflow-hidden">
      <CardHeader className="p-4 bg-muted/20">
          <div className="flex justify-between items-start">
              <div>
                  <CardTitle className="text-base font-bold">{inquiry.name || "N/A"}</CardTitle>
                  <CardDescription className="text-xs">{inquiry.email || inquiry.phone}</CardDescription>
              </div>
               <Badge variant={getStatusBadgeVariant(inquiry.status)} className="text-xs capitalize">
                  {inquiry.status}
                </Badge>
          </div>
      </CardHeader>
      <CardContent className="p-4 text-sm space-y-2">
          {(inquiry as any).message && <p className="text-muted-foreground line-clamp-3 italic">"{(inquiry as any).message}"</p>}
          {type === 'popup' && (inquiry as FirestorePopupInquiry).popupName && (
              <p className="text-[10px] text-muted-foreground">Source: {(inquiry as FirestorePopupInquiry).popupName}</p>
          )}
          <p className="text-[10px] text-muted-foreground pt-1">Submitted: {formatTimestamp(inquiry.submittedAt, appConfig)}</p>
      </CardContent>
      <CardFooter className="p-4 pt-0 flex flex-wrap gap-2 justify-end border-t mt-2 pt-4">
        <Button variant="outline" size="sm" onClick={() => handleViewDetails(inquiry, type)} className="h-8 text-xs">
          <Eye className="h-3.5 w-3.5 mr-1" /> Details
        </Button>
        {hasActionPermission(adminPermissions, 'inquiries', 'write') && (
          <Button variant="outline" size="sm" onClick={() => handleOpenReplyDialog(inquiry, type)} disabled={isSubmittingReply || isLoadingAppSettings} className="h-8 text-xs text-blue-600 border-blue-200">
            <Edit className="h-3.5 w-3.5 mr-1" /> Reply
          </Button>
        )}
        {inquiry.status !== 'resolved' && hasActionPermission(adminPermissions, 'inquiries', 'write') && (
          <Button variant="outline" size="sm" onClick={() => handleMarkAsResolved(inquiry.id!, type)} className="h-8 text-xs text-green-600 border-green-200">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
          </Button>
        )}
        {hasActionPermission(adminPermissions, 'inquiries', 'delete') && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon" className="h-8 w-8">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitleComponent>Confirm Deletion</AlertDialogTitleComponent>
              <AlertDialogDescriptionComponent>Delete inquiry from {inquiry.name || inquiry.email}?</AlertDialogDescriptionComponent>
            </AlertDialogHeader>
            <AlertDialogFooterComponent>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteInquiry(inquiry.id!, type)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooterComponent>
          </AlertDialogContent>
        </AlertDialog>
        )}
      </CardFooter>
    </Card>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center"><Mail className="mr-2 h-6 w-6 text-primary"/>User Inquiries</CardTitle>
          <CardDescription>Manage inquiries submitted through contact forms and popups.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="contact_us">
        <div className="overflow-x-auto pb-2">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="contact_us">Contact Us ({contactInquiries.filter(i => i.status === 'new').length} new)</TabsTrigger>
                <TabsTrigger value="popup_submissions">Popups ({popupInquiries.filter(i => i.status === 'new').length} new)</TabsTrigger>
            </TabsList>
        </div>
        <TabsContent value="contact_us">
          <Card>
            <CardHeader><CardTitle>Contact Form Submissions</CardTitle></CardHeader>
            <CardContent>
                {/* Desktop View */}
                <div className="hidden lg:block">
                    {renderInquiriesTable(contactInquiries, 'contact', isLoadingContact)}
                </div>
                {/* Mobile View */}
                <div className="lg:hidden">
                    {isLoadingContact ? (
                        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : contactInquiries.length === 0 ? (
                        <div className="text-center py-10"><PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No contact inquiries found.</p></div>
                    ) : (
                        contactInquiries.map(inquiry => renderMobileCard(inquiry, 'contact'))
                    )}
                </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="popup_submissions">
          <Card>
            <CardHeader><CardTitle>Newsletter & Popup Submissions</CardTitle></CardHeader>
            <CardContent>
                 {/* Desktop View */}
                <div className="hidden lg:block">
                    {renderInquiriesTable(popupInquiries, 'popup', isLoadingPopup)}
                </div>
                {/* Mobile View */}
                <div className="lg:hidden">
                    {isLoadingPopup ? (
                        <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                    ) : popupInquiries.length === 0 ? (
                        <div className="text-center py-10"><PackageSearch className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">No popup submissions found.</p></div>
                    ) : (
                        popupInquiries.map(inquiry => renderMobileCard(inquiry, 'popup'))
                    )}
                </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isReplyDialogOpen} onOpenChange={setIsReplyDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reply to Inquiry</DialogTitle>
            <DialogDescription>
              Replying to: {selectedInquiryForReply?.name || selectedInquiryForReply?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            <div className="text-sm p-3 border rounded-md bg-muted/50 max-h-32 overflow-y-auto">
                <p className="font-semibold">Original Message/Data:</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {selectedInquiryType === 'contact' 
                    ? (selectedInquiryForReply as FirestoreContactUsInquiry)?.message 
                    : JSON.stringify((selectedInquiryForReply as FirestorePopupInquiry)?.formData || {}, null, 2)}
                </p>
            </div>
            <Textarea
              placeholder="Type your reply here..."
              value={replyMessage}
              onChange={(e) => setReplyMessage(e.target.value)}
              rows={5}
              disabled={isSubmittingReply}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" disabled={isSubmittingReply}>Cancel</Button></DialogClose>
            <Button onClick={handleSendReply} disabled={isSubmittingReply || !replyMessage.trim() || isLoadingAppSettings}>
              {isSubmittingReply ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Send className="mr-2 h-4 w-4"/>}
              Save & Send Reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedInquiryForDetails && (
        <InquiryDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => setIsDetailsModalOpen(false)}
          inquiry={selectedInquiryForDetails}
          inquiryType={selectedInquiryType}
        />
      )}
    </div>
  );
}
