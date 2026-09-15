
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Loader2, ReceiptText, UserPlus, PlusCircle, Trash2, CalendarIcon, Save, Send, Download, Search, UserCircle as UserIcon, XCircle, Check, ChevronsUpDown } from "lucide-react";
import type { FirestoreUser, InvoiceItem, FirestoreInvoice, InvoicePaymentStatus, InvoicePaymentMode, CompanyDetailsForPdf } from '@/types/firestore';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, addDoc, Timestamp, query, orderBy, doc, setDoc, updateDoc, getDoc } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { generateInvoicePdf } from '@/lib/sriinvoiceGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';

const invoiceItemSchema = z.object({
  id: z.string().optional(),
  itemName: z.string().min(1, "Item name is required."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  ratePerUnit: z.coerce.number().min(0, "Rate must be non-negative."),
  total: z.number().optional(),
});

const paymentStatusOptions: [string, ...string[]] = ['Pending', 'Paid', 'Partial', 'Overdue', 'Cancelled'];
const paymentModeOptions: [string, ...string[]] = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Online Gateway', 'Other'];

const createInvoiceFormSchema = z.object({
  userId: z.string().optional().or(z.literal('')),
  customerName: z.string().min(2, "Customer name is required if not selecting user."),
  customerEmail: z.string().email("Invalid email format.").optional().or(z.literal('')),
  customerMobile: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format (e.g., +919876543210 or 9876543210).")
    .optional().or(z.literal('')),
  invoiceNumber: z.string().min(1, "Invoice number is required."),
  invoiceDate: z.date({ required_error: "Invoice date is required."}),
  dueDate: z.date().optional().nullable(),
  serviceDescription: z.string().optional().or(z.literal('')),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required."),
  taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
  discountPercent: z.coerce.number().min(0).max(100).optional().default(0),
  paymentStatus: z.enum(paymentStatusOptions).default('Pending'),
  paymentMode: z.enum(paymentModeOptions).optional().nullable(),
  paymentNotes: z.string().optional().or(z.literal('')),
  additionalNotes: z.string().optional().or(z.literal('')),
  amountPaid: z.coerce.number().min(0).optional().nullable(),
});

type CreateInvoiceFormData = z.infer<typeof createInvoiceFormSchema>;

const generateInvoiceNumber = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${timestamp}-${randomSuffix}`;
};

interface CreateInvoiceFormProps {
  initialData?: FirestoreInvoice | null;
  onSaveSuccess?: (savedItem: FirestoreInvoice) => void;
}

export default function CreateInvoiceForm({ initialData, onSaveSuccess }: CreateInvoiceFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);
  const [selectedUserForDisplay, setSelectedUserForDisplay] = useState<{name: string, email: string} | null>(null);
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);
  const [isModePickerOpen, setIsModePickerOpen] = useState(false);

  const isEditing = !!initialData?.id;

  const form = useForm<CreateInvoiceFormData>({
    resolver: zodResolver(createInvoiceFormSchema),
    defaultValues: {
      userId: "", customerName: "", customerEmail: "", customerMobile: "",
      invoiceNumber: generateInvoiceNumber(),
      invoiceDate: new Date(),
      dueDate: null,
      serviceDescription: "", items: [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
      taxPercent: 0, discountPercent: 0, paymentStatus: 'Pending', paymentMode: null, paymentNotes: "", additionalNotes: "",
      amountPaid: null,
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  
  // Watch values for reactive calculation
  const watchedItems = useWatch({ control: form.control, name: "items" }) || [];
  const watchedDiscountPercent = useWatch({ control: form.control, name: "discountPercent" }) || 0;
  const watchedTaxPercent = useWatch({ control: form.control, name: "taxPercent" }) || 0;
  const watchedAmountPaid = useWatch({ control: form.control, name: "amountPaid" }) || 0;

  const { subtotal, discountAmount, amountAfterDiscount, taxAmount, grandTotal, amountDue } = useMemo(() => {
    let currentSubtotal = 0;
    watchedItems.forEach((item) => {
      currentSubtotal += (item.quantity || 0) * (item.ratePerUnit || 0);
    });

    const currentDiscountAmount = (currentSubtotal * (watchedDiscountPercent || 0)) / 100;
    const currentAmountAfterDiscount = currentSubtotal - currentDiscountAmount;
    const currentTaxAmount = (currentAmountAfterDiscount * (watchedTaxPercent || 0)) / 100;
    const currentGrandTotal = currentAmountAfterDiscount + currentTaxAmount;
    const currentAmountDue = currentGrandTotal - (watchedAmountPaid || 0);

    return {
      subtotal: currentSubtotal,
      discountAmount: currentDiscountAmount,
      amountAfterDiscount: currentAmountAfterDiscount,
      taxAmount: currentTaxAmount,
      grandTotal: currentGrandTotal,
      amountDue: currentAmountDue
    };
  }, [watchedItems, watchedDiscountPercent, watchedTaxPercent, watchedAmountPaid]);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsLoadingUsers(true);
      try {
        const usersQuery = query(collection(db, "users"), orderBy("displayName", "asc"));
        const snapshot = await getDocs(usersQuery);
        setUsers(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser)));
      } catch (error) {
        toast({ title: "Error", description: "Could not load users.", variant: "destructive" });
      } finally {
        setIsLoadingUsers(false);
      }
    };
    fetchUsers();
  }, [toast]);
  
  const filteredUsers = userSearchTerm
    ? users.filter(user =>
        (user.displayName && user.displayName.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
        (user.mobileNumber && user.mobileNumber.includes(userSearchTerm))
      ).slice(0, 10) 
    : users;

  const handleSelectUser = (user: FirestoreUser) => {
    form.setValue("userId", user.id);
    form.setValue("customerName", user.displayName || "");
    form.setValue("customerEmail", user.email || "");
    form.setValue("customerMobile", user.mobileNumber || "");
    setSelectedUserForDisplay({name: user.displayName || user.email || 'Selected User', email: user.email || ''});
    setIsUserSearchOpen(false);
    setUserSearchTerm("");
  };

  const clearSelectedUser = () => {
    form.setValue("userId", "");
    setSelectedUserForDisplay(null);
  };

  useEffect(() => {
    if (initialData) {
      form.reset({
        userId: initialData.userId || "",
        customerName: initialData.customerName || "",
        customerEmail: initialData.customerEmail || "",
        customerMobile: initialData.customerMobile || "",
        invoiceNumber: initialData.invoiceNumber,
        invoiceDate: new Date(getTimestampMillis(initialData.invoiceDate)),
        dueDate: initialData.dueDate ? new Date(getTimestampMillis(initialData.dueDate)) : null,
        serviceDescription: initialData.serviceDescription || "",
        items: initialData.items.map(item => ({ ...item, id: item.id || nanoid() })) || [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
        taxPercent: initialData.taxPercent || 0,
        discountPercent: initialData.discountPercent || 0,
        paymentStatus: initialData.paymentStatus || 'Pending',
        paymentMode: initialData.paymentMode || null,
        paymentNotes: initialData.paymentNotes || "",
        additionalNotes: initialData.additionalNotes || "",
        amountPaid: initialData.amountPaid === undefined ? null : initialData.amountPaid,
      });
       if(initialData.userId && users.length > 0){
          const user = users.find(u => u.id === initialData.userId);
          setSelectedUserForDisplay(user ? {name: user.displayName || user.email || 'Selected User', email: user.email || ''} : null);
      }
    } else {
      form.reset({
        userId: "", customerName: "", customerEmail: "", customerMobile: "", invoiceNumber: generateInvoiceNumber(), invoiceDate: new Date(),
        dueDate: null, serviceDescription: "", items: [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
        taxPercent: 0, discountPercent: 0, paymentStatus: 'Pending', paymentMode: null, paymentNotes: "", additionalNotes: "",
        amountPaid: null,
      });
      setSelectedUserForDisplay(null);
    }
  }, [initialData, form, users]);

  const onSubmit = async (data: CreateInvoiceFormData) => {
    setIsSaving(true);
    try {
      const invoiceDataForFirestore: Partial<Omit<FirestoreInvoice, 'id' | 'createdAt' | 'updatedAt'>> & { createdAt?: Timestamp, updatedAt: Timestamp } = {
        invoiceNumber: data.invoiceNumber,
        invoiceDate: Timestamp.fromDate(data.invoiceDate),
        customerName: data.customerName,
        items: data.items.map(item => ({
          itemName: item.itemName,
          quantity: item.quantity,
          ratePerUnit: item.ratePerUnit,
          total: (item.quantity || 0) * (item.ratePerUnit || 0),
        })),
        subtotal: subtotal,
        discountPercent: data.discountPercent || 0,
        discountAmount: discountAmount,
        taxPercent: data.taxPercent || 0,
        taxAmount: taxAmount,
        totalAmount: grandTotal,
        paymentStatus: data.paymentStatus as InvoicePaymentStatus,
        updatedAt: Timestamp.now(),
        amountPaid: data.amountPaid || 0,
        amountDue: grandTotal - (data.amountPaid || 0),
      };
      
      if (data.userId && data.userId.trim() !== "") invoiceDataForFirestore.userId = data.userId;
      if (data.customerEmail && data.customerEmail.trim() !== "") invoiceDataForFirestore.customerEmail = data.customerEmail;
      if (data.customerMobile && data.customerMobile.trim() !== "") invoiceDataForFirestore.customerMobile = data.customerMobile;
      if (data.dueDate) invoiceDataForFirestore.dueDate = Timestamp.fromDate(data.dueDate);
      if (data.serviceDescription && data.serviceDescription.trim() !== "") invoiceDataForFirestore.serviceDescription = data.serviceDescription;
      if (data.paymentMode) invoiceDataForFirestore.paymentMode = data.paymentMode as InvoicePaymentMode;
      if (data.paymentNotes && data.paymentNotes.trim() !== "") invoiceDataForFirestore.paymentNotes = data.paymentNotes;
      if (data.additionalNotes && data.additionalNotes.trim() !== "") invoiceDataForFirestore.additionalNotes = data.additionalNotes;

      let savedItem: FirestoreInvoice;

      if (isEditing && initialData?.id) {
        await updateDoc(doc(db, "invoices", initialData.id), invoiceDataForFirestore);
        savedItem = { ...initialData, ...invoiceDataForFirestore, id: initialData.id } as FirestoreInvoice;
        toast({ title: "Success", description: "Invoice updated successfully." });
      } else {
        invoiceDataForFirestore.createdAt = Timestamp.now();
        const docRef = await addDoc(collection(db, "invoices"), invoiceDataForFirestore as Omit<FirestoreInvoice, 'id'>);
        savedItem = { ...invoiceDataForFirestore, id: docRef.id } as FirestoreInvoice;
        toast({ title: "Success", description: "Invoice created successfully." });
      }
      
      if (onSaveSuccess) onSaveSuccess(savedItem);

    } catch (error) {
      console.error("Error saving invoice:", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save invoice.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvoice = async () => {
    const currentInitialData = initialData;
    if (!currentInitialData?.id) {
      toast({ title: "Save First", description: "Please save the invoice before sending.", variant: "default" });
      return;
    }
    setIsSending(true);
    try {
      const invoiceSnap = await getDoc(doc(db, "invoices", currentInitialData.id));
      if (!invoiceSnap.exists()) throw new Error("Invoice not found for sending.");
      const savedInvoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as FirestoreInvoice;
      
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "Yourbrand", address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "", contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
        currencySymbol: appConfig?.currencySymbol || "₹",
        dateFormat: appConfig?.dateFormat,
      };

      const pdfDataUri = await generateInvoicePdf(savedInvoice, companyInfo);
      const pdfBlob = dataUriToBlob(pdfDataUri);
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");

      const storagePath = `invoices_pdf/${currentInitialData.id}_${savedInvoice.invoiceNumber}.pdf`;
      const downloadUrl = await uploadPdfToStorage(pdfBlob, storagePath);
      await updateDoc(doc(db, "invoices", currentInitialData.id), { pdfUrl: downloadUrl, updatedAt: Timestamp.now() });
      
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
      setIsSending(false);
    }
  };

  const handleDownloadPdf = async () => {
    const currentInitialData = initialData;
     if (!currentInitialData?.id) {
      toast({ title: "Save First", description: "Please save the invoice before downloading.", variant: "default" });
      return;
    }
    setIsDownloading(true);
    try {
      const invoiceSnap = await getDoc(doc(db, "invoices", currentInitialData.id));
      if (!invoiceSnap.exists()) throw new Error("Invoice not found for download.");
      const savedInvoice = { id: invoiceSnap.id, ...invoiceSnap.data() } as FirestoreInvoice;

      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "Yourbrand", address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "", contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
        currencySymbol: appConfig?.currencySymbol || "₹",
        dateFormat: appConfig?.dateFormat,
      };

      const pdfDataUri = await generateInvoicePdf(savedInvoice, companyInfo);
      triggerPdfDownload(pdfDataUri, `Invoice-${savedInvoice.invoiceNumber}.pdf`);
    } catch (error) {
      console.error("Error downloading invoice PDF:", error);
      toast({ title: "Error Downloading", description: (error as Error).message || "Could not download PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Invoice" : "Create New Invoice"}</CardTitle>
        <CardDescription>
          {isEditing ? `Editing Invoice #: ${initialData?.invoiceNumber}` : "Generate a new invoice for a customer or service."}
        </CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* Customer Info */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Customer Information</h3>
               <FormItem>
                <FormLabel>Select Existing User (Optional)</FormLabel>
                 <Popover open={isUserSearchOpen} onOpenChange={setIsUserSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={isUserSearchOpen} className="w-full justify-between h-10" disabled={isSaving || isLoadingUsers}>
                        {selectedUserForDisplay ? (<span className="truncate">{selectedUserForDisplay.name}</span>) : "Select user..."}
                        {selectedUserForDisplay ? <XCircle className="ml-2 h-4 w-4 shrink-0 opacity-50 hover:opacity-80" onClick={(e) => {e.stopPropagation(); clearSelectedUser();}}/> : <UserIcon className="ml-2 h-4 w-4 shrink-0 opacity-50"/>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                     <div className="p-2 border-b"><Input placeholder="Search name/email/mobile..." value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} className="h-9" /></div>
                     <ScrollArea className="h-48">
                        {isLoadingUsers ? <div className="p-2 text-center text-sm">Loading...</div> :
                         filteredUsers.length > 0 ? (
                           filteredUsers.map(user => (<Button key={user.id} variant="ghost" className="w-full justify-start font-normal h-auto py-2 px-3" onClick={() => handleSelectUser(user)}><div className="flex flex-col items-start"><p>{user.displayName || user.email}</p><p className="text-xs text-muted-foreground">{user.mobileNumber}</p></div></Button>))
                         ) : <div className="p-2 text-center text-sm">No users found.</div>
                        }
                     </ScrollArea>
                  </PopoverContent>
                </Popover>
               </FormItem>
              <Button type="button" variant="outline" size="sm" onClick={() => router.push('/admin/users')} disabled={isSaving}><UserPlus className="mr-2 h-4 w-4" /> Create New User</Button>
              <FormField control={form.control} name="customerName" render={({ field }) => (<FormItem><FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Customer's full name" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="customerEmail" render={({ field }) => (<FormItem><FormLabel>Customer Email (Optional)</FormLabel><FormControl><Input type="email" placeholder="customer@example.com" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="customerMobile" render={({ field }) => (<FormItem><FormLabel>Customer Mobile (Optional)</FormLabel><FormControl><Input type="tel" placeholder="+919876543210" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </div>

            {/* Invoice Details */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Invoice Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="invoiceNumber" render={({ field }) => (<FormItem><FormLabel>Invoice Number <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="e.g., INV-2023-001" {...field} disabled={isSaving || isEditing} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="invoiceDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Invoice Date <span className="text-destructive">*</span></FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSaving}>
                      {field.value ? formatDateInTimezone(new Date(field.value), 'Asia/Kolkata') : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={isSaving}/></PopoverContent></Popover><FormMessage /></FormItem>
                )}/>
                <FormField control={form.control} name="dueDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Due Date (Optional)</FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSaving}>
                      {field.value ? formatDateInTimezone(new Date(field.value), 'Asia/Kolkata') : <span>Pick a due date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} disabled={(date) => form.getValues("invoiceDate") ? date < form.getValues("invoiceDate") : false} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>
                )}/>
              </div>
              <FormField control={form.control} name="serviceDescription" render={({ field }) => (<FormItem><FormLabel>Overall Service Description (Optional)</FormLabel><FormControl><Textarea placeholder="Brief description of services rendered..." {...field} rows={3} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </div>

            {/* Itemized List */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Items / Services</h3>
              {fields.map((item, index) => (
                <div key={item.id} className="p-3 border rounded-md space-y-3 relative">
                  <div className="grid grid-cols-1 sm:grid-cols-itemized-quotation gap-3 items-end">
                    <FormField control={form.control} name={`items.${index}.itemName`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Item Name <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Service or Product" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Qty <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" placeholder="1" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`items.${index}.ratePerUnit`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Rate/Unit ({appConfig?.currencySymbol || "₹"}) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" step="0.01" placeholder="100.00" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormItem><FormLabel className="text-xs">Total ({appConfig?.currencySymbol || "₹"})</FormLabel><Input type="text" value={((form.watch(`items.${index}.quantity`) || 0) * (form.watch(`items.${index}.ratePerUnit`) || 0)).toFixed(2)} disabled readOnly className="bg-muted/50"/></FormItem>
                  </div>
                  {fields.length > 1 && (<Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-destructive" onClick={() => remove(index)} disabled={isSaving}><Trash2 className="h-4 w-4" /></Button>)}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 })} disabled={isSaving}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
            </div>

            {/* Totals, Payment & Notes */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Summary & Payment</h3>
              <div className="space-y-1 text-right text-sm">
                <div>Subtotal: <span className="font-semibold">{appConfig?.currencySymbol || "₹"}{subtotal.toFixed(2)}</span></div>
                <div className="flex items-center justify-end gap-2">
                  <FormLabel htmlFor="discountPercentInput" className="text-sm whitespace-nowrap">Discount (%):</FormLabel>
                  <FormField control={form.control} name="discountPercent" render={({ field }) => (<FormItem className="inline-block w-20"><FormControl><Input type="number" id="discountPercentInput" step="0.01" placeholder="0" {...field} disabled={isSaving} className="h-8 text-right" /></FormControl><FormMessage className="text-left text-xs" /></FormItem>)}/>
                </div>
                <div>Discount Amount: <span className="font-semibold text-green-600">- {appConfig?.currencySymbol || "₹"}{discountAmount.toFixed(2)}</span></div>
                <div>Amount After Discount: <span className="font-semibold">{appConfig?.currencySymbol || "₹"}{amountAfterDiscount.toFixed(2)}</span></div>
                <div className="flex items-center justify-end gap-2">
                  <FormLabel htmlFor="taxPercentInvoiceInput" className="text-sm whitespace-nowrap">Tax (%):</FormLabel>
                  <FormField control={form.control} name="taxPercent" render={({ field }) => (<FormItem className="inline-block w-20"><FormControl><Input type="number" id="taxPercentInvoiceInput" step="0.01" placeholder="0" {...field} disabled={isSaving} className="h-8 text-right" /></FormControl><FormMessage className="text-left text-xs" /></FormItem>)}/>
                </div>
                <div>Tax Amount: <span className="font-semibold">{appConfig?.currencySymbol || "₹"}{taxAmount.toFixed(2)}</span></div>
                <div className="text-lg font-bold text-primary">Grand Total: {appConfig?.currencySymbol || "₹"}{grandTotal.toFixed(2)}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
                <FormField control={form.control} name="paymentStatus" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="mb-2">Payment Status <span className="text-destructive">*</span></FormLabel>
                    <Dialog open={isStatusPickerOpen} onOpenChange={setIsStatusPickerOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between text-left font-normal h-10",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isSaving}
                          type="button"
                        >
                          {field.value || "Select status"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Select Payment Status</DialogTitle>
                          <DialogDescription>
                            Choose the payment status for this invoice.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <ScrollArea className="h-[200px] rounded-md border p-2">
                            <div className="space-y-1">
                              {paymentStatusOptions.map((s) => (
                                <Button
                                  key={s}
                                  variant={field.value === s ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                  onClick={() => {
                                    field.onChange(s);
                                    setIsStatusPickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="text-sm font-medium">{s}</span>
                                  {field.value === s && (
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
                )}/>
                <FormField control={form.control} name="paymentMode" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel className="mb-2">Payment Mode (Optional)</FormLabel>
                    <Dialog open={isModePickerOpen} onOpenChange={setIsModePickerOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between text-left font-normal h-10",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isSaving}
                          type="button"
                        >
                          {field.value || "Select mode"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Select Payment Mode</DialogTitle>
                          <DialogDescription>
                            Choose the payment mode used.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <ScrollArea className="h-[200px] rounded-md border p-2">
                            <div className="space-y-1">
                              {paymentModeOptions.map((m) => (
                                <Button
                                  key={m}
                                  variant={field.value === m ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-2.5 px-3 relative"
                                  onClick={() => {
                                    field.onChange(m);
                                    setIsModePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="text-sm font-medium">{m}</span>
                                  {field.value === m && (
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
                )}/>
              </div>
              <FormField control={form.control} name="amountPaid" render={({ field }) => (
                <FormItem><FormLabel>Amount Paid ({symbol}) (Optional)</FormLabel><FormControl><Input type="number" step="0.01" placeholder="0.00" {...field} value={field.value ?? ""} disabled={isSaving} /></FormControl><FormMessage /></FormItem>
              )}/>
              <div className="text-right text-sm font-semibold">Amount Due: <span className="text-destructive">{symbol}{amountDue.toFixed(2)}</span></div>
              <FormField control={form.control} name="paymentNotes" render={({ field }) => (<FormItem><FormLabel>Payment Notes (Optional)</FormLabel><FormControl><Textarea placeholder="e.g., Transaction ID, Partial payment details" {...field} rows={2} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="additionalNotes" render={({ field }) => (<FormItem><FormLabel>Additional Invoice Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Terms and conditions, Bank details for transfer, etc." {...field} rows={3} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-6">
            <Button type="submit" disabled={isSaving || isSending || isDownloading || isLoadingCompanySettings}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? "Update Invoice" : "Save Invoice"}
            </Button>
            <Button type="button" variant="outline" onClick={handleSendInvoice} disabled={isSaving || isSending || isDownloading || !initialData?.id || isLoadingCompanySettings}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Send Invoice
            </Button>
            <Button type="button" variant="outline" onClick={handleDownloadPdf} disabled={isSaving || isSending || isDownloading || !initialData?.id || isLoadingCompanySettings}>
               {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Download PDF
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
