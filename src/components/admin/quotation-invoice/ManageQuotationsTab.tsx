
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Edit, Trash2, PackageSearch, AlertTriangle, FileText, MoreHorizontal, Send, Download, Check, ChevronsUpDown } from "lucide-react";
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, Timestamp, getDoc } from '@/lib/mysqlDb';
import type { FirestoreQuotation, QuotationStatus, CompanyDetailsForPdf } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Badge } from '@/components/ui/badge';
import { generateQuotationPdf } from '@/lib/quotationGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import { deleteObject } from '@/lib/mysqlStorage';
import { useApplicationConfig } from "@/hooks/useApplicationConfig";

interface ManageQuotationsTabProps {
  onEditQuotation: (quotation: FirestoreQuotation) => void;
}

const quotationStatusOptions: QuotationStatus[] = ['Draft', 'Sent', 'Accepted', 'Rejected', 'ConvertedToInvoice'];

export default function ManageQuotationsTab({ onEditQuotation }: ManageQuotationsTabProps) {
  const [quotations, setQuotations] = useState<FirestoreQuotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [quotationToChangeStatus, setQuotationToChangeStatus] = useState<FirestoreQuotation | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const { toast } = useToast();
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";

  useEffect(() => {
    setIsLoading(true);
    const quotationsCollectionRef = collection(db, "quotations");
    const q = query(quotationsCollectionRef, orderBy("quotationDate", "desc"));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedQuotations = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as FirestoreQuotation));
      setQuotations(fetchedQuotations);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching quotations: ", error);
      toast({ title: "Error", description: "Could not fetch quotations.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const handleDeleteQuotation = async (quotationId: string) => {
    if (!quotationId) return;
    setIsUpdating(quotationId);
    try {
      const quotation = quotations.find(q => q.id === quotationId);
      if (quotation) {
        try {
          const deletePath = quotation.pdfUrl || `/uploads/pdf/${quotation.id}_${quotation.quotationNumber}.pdf`;
          await deleteObject(deletePath);
        } catch (storageErr) {
          console.warn("Storage deletion warning for quotation PDF:", storageErr);
        }
      }
      await deleteDoc(doc(db, "quotations", quotationId));
      toast({ title: "Success", description: "Quotation deleted successfully." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not delete quotation.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdateStatus = async (quotationId: string, newStatus: QuotationStatus) => {
    if (!quotationId) return;
    setIsUpdating(quotationId);
    try {
      await updateDoc(doc(db, "quotations", quotationId), {
        status: newStatus,
        updatedAt: Timestamp.now(),
      });
      toast({ title: "Success", description: `Quotation status updated to ${newStatus}.` });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update quotation status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };
  
  const handleSendQuotation = async (quotation: FirestoreQuotation) => {
    if (!quotation.id) return;
    setIsSending(quotation.id);
    try {
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "Yourbrand",
        address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "",
        contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
        currencySymbol: appConfig?.currencySymbol || "₹",
        dateFormat: appConfig?.dateFormat,
      };

      const pdfDataUri = await generateQuotationPdf(quotation, companyInfo);
      const pdfBlob = dataUriToBlob(pdfDataUri);
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");
      
      const storagePath = `quotations_pdf/${quotation.id}_${quotation.quotationNumber}.pdf`;
      const downloadUrl = await uploadPdfToStorage(pdfBlob, storagePath);
      
      await updateDoc(doc(db, "quotations", quotation.id), { status: 'Sent', pdfUrl: downloadUrl, updatedAt: Timestamp.now() });

      toast({
        duration: 10000,
        title: "Quotation Ready to Share",
        description: (
          <div>
            <p>Status updated to 'Sent'.</p>
            <p>Shareable URL: <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{downloadUrl}</a></p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(downloadUrl).then(() => toast({description: "URL Copied!"}))}>Copy URL</Button>
          </div>
        ),
      });
    } catch (error) {
      console.error("Error sending quotation:", error);
      toast({ title: "Error Sending", description: (error as Error).message || "Could not send quotation.", variant: "destructive" });
    } finally {
      setIsSending(null);
    }
  };

  const handleDownloadPdf = async (quotation: FirestoreQuotation) => {
    if (!quotation.id) return;
    setIsDownloading(quotation.id);
    try {
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "Yourbrand",
        address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "",
        contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
        currencySymbol: appConfig?.currencySymbol || "₹",
        dateFormat: appConfig?.dateFormat,
      };
      const pdfDataUri = await generateQuotationPdf(quotation, companyInfo);
      triggerPdfDownload(pdfDataUri, `Quotation-${quotation.quotationNumber}.pdf`);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast({ title: "Error Downloading", description: (error as Error).message || "Could not download PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(null);
    }
  };

  const formatDate = (timestamp?: any) => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return formatDateInTimezone(new Date(millis), 'Asia/Kolkata');
  };
  
  const getStatusBadgeVariant = (status: QuotationStatus) => {
    switch (status) {
      case 'Draft': return 'secondary';
      case 'Sent': return 'outline';
      case 'Accepted': return 'default';
      case 'Rejected': return 'destructive';
      case 'ConvertedToInvoice': return 'default';
      default: return 'outline';
    }
  };

  const renderMobileCard = (quotation: FirestoreQuotation) => (
    <Card key={quotation.id} className="mb-4 shadow-sm">
      <CardContent className="p-4 space-y-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Quotation #</p>
          <p className="font-semibold">{quotation.quotationNumber}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Customer</p>
          <p>{quotation.customerName}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Date</p>
            <p>{formatDate(quotation.quotationDate)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Amount ({symbol})</p>
            <p>{quotation.totalAmount.toFixed(2)}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Status</p>
          <Button
              variant="outline"
              type="button"
              className="h-9 w-full justify-between text-xs font-normal"
              disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}
              onClick={() => {
                  setQuotationToChangeStatus(quotation);
                  setIsStatusDialogOpen(true);
              }}
          >
              <Badge variant={getStatusBadgeVariant(quotation.status)} className="capitalize">{quotation.status}</Badge>
              <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t mt-2">
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onEditQuotation(quotation)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}>
              <Edit className="mr-1 h-3.5 w-3.5" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleSendQuotation(quotation)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}>
              {isSending === quotation.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Send className="mr-1 h-3.5 w-3.5"/>} Send
            </Button>
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleDownloadPdf(quotation)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}>
              {isDownloading === quotation.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Download className="mr-1 h-3.5 w-3.5"/>} PDF
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="text-xs h-8" disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                  <AlertDialogDescription>Delete quotation {quotation.quotationNumber}?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleDeleteQuotation(quotation.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );

  if (isLoading || isLoadingCompanySettings) {
    return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2">Loading quotations...</span></div>;
  }

  if (quotations.length === 0) {
    return (
      <div className="text-center py-10">
        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No quotations found yet.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Quotations</CardTitle>
        <CardDescription>View, edit, and manage existing customer quotations.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Desktop View */}
        <div className="hidden md:block">
            <Table>
             <TableHeader><TableRow><TableHead>Quotation #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount ({symbol})</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
                {quotations.map((quotation) => (
                <TableRow key={quotation.id}>
                    <TableCell className="font-medium text-xs">{quotation.quotationNumber}</TableCell>
                    <TableCell>{quotation.customerName}</TableCell>
                    <TableCell>{formatDate(quotation.quotationDate)}</TableCell>
                    <TableCell className="text-right">{quotation.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>
                    <Button
                        variant="outline"
                        type="button"
                        className="h-8 text-xs min-w-[100px] sm:min-w-[120px] justify-between font-normal"
                        disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id}
                        onClick={() => {
                            setQuotationToChangeStatus(quotation);
                            setIsStatusDialogOpen(true);
                        }}
                    >
                        <Badge variant={getStatusBadgeVariant(quotation.status)} className={`capitalize ${quotation.status === 'Accepted' ? 'bg-green-500' : ''}`}>{quotation.status}</Badge>
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEditQuotation(quotation)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleSendQuotation(quotation)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id} title="Send">
                          {isSending === quotation.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleDownloadPdf(quotation)} disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id} title="Download PDF">
                          {isDownloading === quotation.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="icon" className="h-8 w-8" disabled={isUpdating === quotation.id || isSending === quotation.id || isDownloading === quotation.id} title="Delete">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                              <AlertDialogDescription>Delete quotation {quotation.quotationNumber} for {quotation.customerName}?</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteQuotation(quotation.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden">
            {quotations.map(renderMobileCard)}
        </div>
        {quotationToChangeStatus && (
          <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
            <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Update Status</DialogTitle>
                <DialogDescription>
                  Select status for Quotation {quotationToChangeStatus.quotationNumber}.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <ScrollArea className="h-[250px] rounded-md border p-2">
                  <div className="space-y-1">
                    {quotationStatusOptions.map((s) => (
                      <Button
                        key={s}
                        variant={quotationToChangeStatus.status === s ? "secondary" : "ghost"}
                        className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                        onClick={() => {
                          handleUpdateStatus(quotationToChangeStatus.id!, s);
                          setIsStatusDialogOpen(false);
                          setQuotationToChangeStatus(null);
                        }}
                        type="button"
                      >
                        <span className="text-sm font-medium">{s}</span>
                        {quotationToChangeStatus.status === s && (
                          <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                        )}
                      </Button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}
