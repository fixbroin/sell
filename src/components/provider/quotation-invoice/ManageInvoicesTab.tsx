
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Edit, Trash2, PackageSearch, AlertTriangle, FileText, MoreHorizontal, Send, Download, Check, ChevronsUpDown } from "lucide-react";
import { db, storage } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, updateDoc, Timestamp, getDoc, where } from '@/lib/mysqlDb';
import type { FirestoreInvoice, InvoicePaymentStatus, CompanyDetailsForPdf } from '@/types/firestore';
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Badge } from '@/components/ui/badge';
import { generateInvoicePdf } from '@/lib/sriinvoiceGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { useAuth } from '@/hooks/useAuth';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import { deleteObject } from '@/lib/mysqlStorage';

interface ManageInvoicesTabProps {
  onEditInvoice: (invoice: FirestoreInvoice) => void;
}

const paymentStatusOptions: InvoicePaymentStatus[] = ['Pending', 'Paid', 'Partial', 'Overdue', 'Cancelled'];

export default function ManageInvoicesTab({ onEditInvoice }: ManageInvoicesTabProps) {
  const [invoices, setInvoices] = useState<FirestoreInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isSending, setIsSending] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [invoiceToChangeStatus, setInvoiceToChangeStatus] = useState<FirestoreInvoice | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user: providerUser } = useAuth();
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [allowDelete, setAllowDelete] = useState(true);

  useEffect(() => {
    const settingsRef = doc(db, "webSettings", "quotationInvoiceSettings");
    const unsubscribe = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setAllowDelete(data.allowProviderDelete !== false);
      } else {
        setAllowDelete(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!providerUser) {
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    const invoicesCollectionRef = collection(db, "invoices");
    const q = query(invoicesCollectionRef, where("providerId", "==", providerUser.uid));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedInvoices = querySnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        id: docSnap.id,
      } as FirestoreInvoice));
      // Sort on the client side since we can't combine orderBy with a different filter
      fetchedInvoices.sort((a, b) => getTimestampMillis(b.invoiceDate) - getTimestampMillis(a.invoiceDate));
      setInvoices(fetchedInvoices);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching invoices: ", error);
      toast({ title: "Error", description: "Could not fetch invoices.", variant: "destructive" });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [providerUser, toast]);

  const handleDeleteInvoice = async (invoiceId: string) => {
    if (!invoiceId) return;
    setIsUpdating(invoiceId);
    try {
      const invoice = invoices.find(i => i.id === invoiceId);
      if (invoice) {
        try {
          const deletePath = invoice.pdfUrl || `/uploads/pdf/${invoice.id}_${invoice.invoiceNumber}.pdf`;
          await deleteObject(deletePath);
        } catch (storageErr) {
          console.warn("Storage deletion warning for invoice PDF:", storageErr);
        }
      }
      await deleteDoc(doc(db, "invoices", invoiceId));
      toast({ title: "Success", description: "Invoice deleted successfully." });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not delete invoice.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleUpdatePaymentStatus = async (invoiceId: string, newStatus: InvoicePaymentStatus) => {
    if (!invoiceId) return;
    setIsUpdating(invoiceId);
    try {
      await updateDoc(doc(db, "invoices", invoiceId), {
        paymentStatus: newStatus,
        updatedAt: Timestamp.now(),
      });
      toast({ title: "Success", description: `Invoice status updated to ${newStatus}.` });
    } catch (error) {
      toast({ title: "Error", description: (error as Error).message || "Could not update invoice status.", variant: "destructive" });
    } finally {
      setIsUpdating(null);
    }
  };

  const handleSendInvoice = async (invoice: FirestoreInvoice) => {
    if (!invoice.id) return;
    setIsSending(invoice.id);
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
      const pdfDataUri = await generateInvoicePdf(invoice, companyInfo);
      const pdfBlob = dataUriToBlob(pdfDataUri);
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");

      const storagePath = `invoices_pdf/${invoice.id}_${invoice.invoiceNumber}.pdf`;
      const downloadUrl = await uploadPdfToStorage(pdfBlob, storagePath);
      await updateDoc(doc(db, "invoices", invoice.id), { pdfUrl: downloadUrl, updatedAt: Timestamp.now() });
      
      toast({
        duration: 10000,
        title: "Invoice Ready to Share",
        description: (
          <div>
            <p>Shareable URL: <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">{downloadUrl}</a></p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(downloadUrl).then(() => toast({description: "URL Copied!"}))}>Copy URL</Button>
          </div>
        ),
      });
    } catch (error) {
      console.error("Error sending invoice:", error);
      toast({ title: "Error Sending", description: (error as Error).message || "Could not send invoice.", variant: "destructive" });
    } finally {
      setIsSending(null);
    }
  };

  const handleDownloadPdf = async (invoice: FirestoreInvoice) => {
    if (!invoice.id) return;
    setIsDownloading(invoice.id);
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
      const pdfDataUri = await generateInvoicePdf(invoice, companyInfo);
      triggerPdfDownload(pdfDataUri, `Invoice-${invoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error("Error downloading invoice PDF:", error);
      toast({ title: "Error Downloading", description: (error as Error).message || "Could not download PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(null);
    }
  };

  const formatDate = (timestamp?: any) => {
    const millis = getTimestampMillis(timestamp);
    return millis ? formatDateInTimezone(new Date(millis), 'Asia/Kolkata') : 'N/A';
  };

  const getStatusBadgeVariant = (status: InvoicePaymentStatus) => {
    switch (status) {
      case 'Paid': return 'default'; // Primary
      case 'Pending': return 'secondary';
      case 'Partial': return 'outline';
      case 'Overdue': return 'destructive';
      case 'Cancelled': return 'destructive';
      default: return 'outline';
    }
  };

  const renderMobileCard = (invoice: FirestoreInvoice) => (
    <Card key={invoice.id} className="mb-4 shadow-sm">
        <CardContent className="p-4 space-y-3 text-sm">
            <div>
                <p className="text-xs text-muted-foreground">Invoice #</p>
                <p className="font-semibold">{invoice.invoiceNumber}</p>
            </div>
            <div>
                <p className="text-xs text-muted-foreground">Customer</p>
                <p>{invoice.customerName}</p>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p>{formatDate(invoice.invoiceDate)}</p>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground">Amount ({symbol})</p>
                    <p>{invoice.totalAmount.toFixed(2)}</p>
                </div>
            </div>
            <div>
                <p className="text-xs text-muted-foreground mb-1">Payment Status</p>
                <Button
                    variant="outline"
                    type="button"
                    className="h-9 w-full justify-between text-xs font-normal"
                    disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}
                    onClick={() => {
                        setInvoiceToChangeStatus(invoice);
                        setIsStatusDialogOpen(true);
                    }}
                >
                    <Badge variant={getStatusBadgeVariant(invoice.paymentStatus)} className="capitalize">{invoice.paymentStatus}</Badge>
                    <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2 border-t mt-2">
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => onEditInvoice(invoice)} disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}>
                  <Edit className="mr-1 h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleSendInvoice(invoice)} disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}>
                  {isSending === invoice.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Send className="mr-1 h-3.5 w-3.5"/>} Send
                </Button>
                <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => handleDownloadPdf(invoice)} disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}>
                  {isDownloading === invoice.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Download className="mr-1 h-3.5 w-3.5"/>} PDF
                </Button>
                {allowDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="text-xs h-8" disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                      <AlertDialogDescription>Delete invoice {invoice.invoiceNumber}?</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDeleteInvoice(invoice.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                )}
            </div>
        </CardContent>
    </Card>
  );

  if (isLoading || isLoadingCompanySettings) return <div className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><span className="ml-2">Loading invoices...</span></div>;
  if (!providerUser) return <div className="text-center py-10"><p className="text-muted-foreground">Please log in to view invoices.</p></div>;
  if (invoices.length === 0) return <div className="text-center py-10"><PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-3" /><p className="text-muted-foreground">No invoices found yet.</p></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Invoices</CardTitle>
        <CardDescription>View, edit, and manage existing customer invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Desktop View */}
        <div className="hidden md:block">
            <Table>
             <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Amount ({symbol})</TableHead><TableHead>Payment Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
                {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                    <TableCell className="font-medium text-xs">{invoice.invoiceNumber}</TableCell>
                    <TableCell>{invoice.customerName}</TableCell>
                    <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                    <TableCell className="text-right">{invoice.totalAmount.toFixed(2)}</TableCell>
                    <TableCell>
                    <Button
                        variant="outline"
                        type="button"
                        className="h-8 text-xs min-w-[100px] sm:min-w-[120px] justify-between font-normal"
                        disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id}
                        onClick={() => {
                            setInvoiceToChangeStatus(invoice);
                            setIsStatusDialogOpen(true);
                        }}
                    >
                        <Badge variant={getStatusBadgeVariant(invoice.paymentStatus)} className="capitalize">{invoice.paymentStatus}</Badge>
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end items-center gap-1.5">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEditInvoice(invoice)} disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id} title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleSendInvoice(invoice)} disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id} title="Send">
                          {isSending === invoice.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Send className="h-4 w-4"/>}
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleDownloadPdf(invoice)} disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id} title="Download PDF">
                          {isDownloading === invoice.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
                        </Button>
                        {allowDelete && (
                          <AlertDialog>
                              <AlertDialogTrigger asChild>
                              <Button variant="destructive" size="icon" className="h-8 w-8" disabled={isUpdating === invoice.id || isSending === invoice.id || isDownloading === invoice.id} title="Delete">
                                  <Trash2 className="h-4 w-4" />
                              </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                              <AlertDialogHeader>
                                  <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                  <AlertDialogDescription>Delete invoice {invoice.invoiceNumber} for {invoice.customerName}?</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteInvoice(invoice.id!)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                              </AlertDialogFooter>
                              </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                </TableRow>
                ))}
            </TableBody>
            </Table>
        </div>
        {/* Mobile View */}
        <div className="md:hidden">
            {invoices.map(renderMobileCard)}
        </div>
        {invoiceToChangeStatus && (
          <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
            <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Update Payment Status</DialogTitle>
                <DialogDescription>
                  Select payment status for Invoice {invoiceToChangeStatus.invoiceNumber}.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <ScrollArea className="h-[250px] rounded-md border p-2">
                  <div className="space-y-1">
                    {paymentStatusOptions.map((s) => (
                      <Button
                        key={s}
                        variant={invoiceToChangeStatus.paymentStatus === s ? "secondary" : "ghost"}
                        className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                        onClick={() => {
                          handleUpdatePaymentStatus(invoiceToChangeStatus.id!, s);
                          setIsStatusDialogOpen(false);
                          setInvoiceToChangeStatus(null);
                        }}
                        type="button"
                      >
                        <span className="text-sm font-medium">{s}</span>
                        {invoiceToChangeStatus.paymentStatus === s && (
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
