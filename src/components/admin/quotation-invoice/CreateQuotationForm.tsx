
"use client";

import { useState, useEffect, useMemo } from 'react';
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
import { Loader2, FileText, UserPlus, PlusCircle, Trash2, CalendarIcon, Save, Send, Download, Search, UserCircle as UserIcon, XCircle, Check, ChevronsUpDown } from "lucide-react";
import type { FirestoreUser, QuotationItem, FirestoreQuotation, QuotationStatus, CompanyDetailsForPdf } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, Timestamp, query, orderBy, doc, setDoc, updateDoc, getDoc } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import { generateQuotationPdf } from '@/lib/quotationGenerator';
import { uploadPdfToStorage, triggerPdfDownload, dataUriToBlob } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getTimestampMillis, formatDateInTimezone } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';


const quotationItemSchema = z.object({
  id: z.string().optional(),
  itemName: z.string().min(1, "Item name is required."),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1."),
  ratePerUnit: z.coerce.number().min(0, "Rate must be non-negative."),
  total: z.number().optional(),
});

const quotationStatusOptions: [string, ...string[]] = ['Draft', 'Sent', 'Accepted', 'Rejected', 'ConvertedToInvoice'];

const createQuotationFormSchema = z.object({
  userId: z.string().optional().or(z.literal('')),
  customerName: z.string().min(2, "Customer name is required if not selecting user."),
  customerEmail: z.string().email("Invalid email format.").optional().or(z.literal('')),
  customerMobile: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format (e.g., +919876543210 or 9876543210).")
    .optional().or(z.literal('')),
  quotationNumber: z.string().min(1, "Quotation number is required."),
  quotationDate: z.date({ required_error: "Quotation date is required."}),
  serviceTitle: z.string().min(3, "Service title is required."),
  serviceDescription: z.string().optional().or(z.literal('')),
  items: z.array(quotationItemSchema).min(1, "At least one item is required."),
  additionalNotes: z.string().optional().or(z.literal('')),
  taxPercent: z.coerce.number().min(0).max(100).optional().default(0),
  status: z.enum(quotationStatusOptions).default('Draft'),
});

type CreateQuotationFormData = z.infer<typeof createQuotationFormSchema>;

const generateQuotationNumber = () => {
  const now = new Date();
  const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `QUOT-${timestamp}-${randomSuffix}`;
};

interface CreateQuotationFormProps {
  initialData?: FirestoreQuotation | null;
  onSaveSuccess?: (savedItem: FirestoreQuotation) => void;
}

export default function CreateQuotationForm({ initialData, onSaveSuccess }: CreateQuotationFormProps) {
  const { toast } = useToast();
  const router = useRouter();
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const { settings: companySettings, isLoading: isLoadingCompanySettings } = useGlobalSettings();
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [isUserSearchOpen, setIsUserSearchOpen] = useState(false);
  const [selectedUserForDisplay, setSelectedUserForDisplay] = useState<{name: string, email: string} | null>(null);
  const [isStatusPickerOpen, setIsStatusPickerOpen] = useState(false);

  const isEditing = !!initialData?.id;

  const form = useForm<CreateQuotationFormData>({
    resolver: zodResolver(createQuotationFormSchema),
    defaultValues: {
      userId: "", customerName: "", customerEmail: "", customerMobile: "",
      quotationNumber: generateQuotationNumber(),
      quotationDate: new Date(),
      serviceTitle: "", serviceDescription: "", items: [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
      additionalNotes: "", taxPercent: 0, status: 'Draft',
    },
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  
  // Watch values for reactive calculation
  const watchedItems = useWatch({ control: form.control, name: "items" }) || [];
  const watchedTaxPercent = useWatch({ control: form.control, name: "taxPercent" }) || 0;

  const { subtotal, taxAmount, grandTotal } = useMemo(() => {
    let currentSubtotal = 0;
    watchedItems.forEach((item) => {
      currentSubtotal += (item.quantity || 0) * (item.ratePerUnit || 0);
    });
    const currentTaxAmount = (currentSubtotal * (watchedTaxPercent || 0)) / 100;
    return {
      subtotal: currentSubtotal,
      taxAmount: currentTaxAmount,
      grandTotal: currentSubtotal + currentTaxAmount
    };
  }, [watchedItems, watchedTaxPercent]);

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
        quotationNumber: initialData.quotationNumber,
        quotationDate: new Date(getTimestampMillis(initialData.quotationDate)),
        serviceTitle: initialData.serviceTitle || "",
        serviceDescription: initialData.serviceDescription || "",
        items: initialData.items.map(item => ({ ...item, id: item.id || nanoid() })) || [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
        additionalNotes: initialData.additionalNotes || "",
        taxPercent: initialData.taxPercent || 0,
        status: initialData.status || 'Draft',
      });
       if(initialData.userId && users.length > 0){
          const user = users.find(u => u.id === initialData.userId);
          setSelectedUserForDisplay(user ? {name: user.displayName || user.email || 'Selected User', email: user.email || ''} : null);
      }
    } else {
      form.reset({
        userId: "", customerName: "", customerEmail: "", customerMobile: "", quotationNumber: generateQuotationNumber(), quotationDate: new Date(),
        serviceTitle: "", serviceDescription: "", items: [{ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 }],
        additionalNotes: "", taxPercent: 0, status: 'Draft',
      });
      setSelectedUserForDisplay(null);
    }
  }, [initialData, form, users]);

  const onSubmit = async (data: CreateQuotationFormData) => {
    setIsSaving(true);
    try {
      const quotationDataForFirestore: Partial<Omit<FirestoreQuotation, 'id' | 'createdAt' | 'updatedAt'>> & { createdAt?: Timestamp, updatedAt: Timestamp } = {
        quotationNumber: data.quotationNumber,
        quotationDate: Timestamp.fromDate(data.quotationDate),
        customerName: data.customerName,
        serviceTitle: data.serviceTitle,
        status: data.status as QuotationStatus,
        items: data.items.map(item => ({
          itemName: item.itemName,
          quantity: item.quantity,
          ratePerUnit: item.ratePerUnit,
          total: (item.quantity || 0) * (item.ratePerUnit || 0),
        })),
        subtotal: subtotal,
        taxPercent: data.taxPercent || 0,
        taxAmount: taxAmount,
        totalAmount: grandTotal,
        updatedAt: Timestamp.now(),
      };
      
      if (data.userId && data.userId.trim() !== "") quotationDataForFirestore.userId = data.userId;
      if (data.customerEmail && data.customerEmail.trim() !== "") quotationDataForFirestore.customerEmail = data.customerEmail;
      if (data.customerMobile && data.customerMobile.trim() !== "") quotationDataForFirestore.customerMobile = data.customerMobile;
      if (data.serviceDescription && data.serviceDescription.trim() !== "") quotationDataForFirestore.serviceDescription = data.serviceDescription;
      if (data.additionalNotes && data.additionalNotes.trim() !== "") quotationDataForFirestore.additionalNotes = data.additionalNotes;

      let savedItem: FirestoreQuotation;

      if (isEditing && initialData?.id) {
        await updateDoc(doc(db, "quotations", initialData.id), quotationDataForFirestore);
        savedItem = { ...initialData, ...quotationDataForFirestore, id: initialData.id } as FirestoreQuotation;
        toast({ title: "Success", description: "Quotation updated successfully." });
      } else {
        quotationDataForFirestore.createdAt = Timestamp.now();
        const docRef = await addDoc(collection(db, "quotations"), quotationDataForFirestore as Omit<FirestoreQuotation, 'id'>);
        savedItem = { ...quotationDataForFirestore, id: docRef.id } as FirestoreQuotation;
        toast({ title: "Success", description: "Quotation saved as draft." });
      }
      
      if (onSaveSuccess) onSaveSuccess(savedItem);

    } catch (error) {
      console.error("Error saving quotation:", error);
      toast({ title: "Error", description: (error as Error).message || "Could not save quotation.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewUserRedirect = () => {
    router.push('/admin/users');
  };

  const handleSendQuotation = async () => {
    const currentInitialData = initialData;
    if (!currentInitialData?.id) {
      toast({ title: "Save First", description: "Please save the quotation before sending.", variant: "default" });
      return;
    }
    setIsSending(true);
    try {
      const quotationSnap = await getDoc(doc(db, "quotations", currentInitialData.id));
      if (!quotationSnap.exists()) throw new Error("Quotation not found for sending.");
      const savedQuotation = { id: quotationSnap.id, ...quotationSnap.data() } as FirestoreQuotation;
      
      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "Yourbrand", address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "", contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
        currencySymbol: appConfig?.currencySymbol || "₹",
        dateFormat: appConfig?.dateFormat,
      };

      const pdfDataUri = await generateQuotationPdf(savedQuotation, companyInfo);
      const pdfBlob = dataUriToBlob(pdfDataUri);
      if (!pdfBlob) throw new Error("Failed to generate PDF blob.");
      
      const storagePath = `quotations_pdf/${currentInitialData.id}_${savedQuotation.quotationNumber}.pdf`;
      const downloadUrl = await uploadPdfToStorage(pdfBlob, storagePath);
      
      await updateDoc(doc(db, "quotations", currentInitialData.id), { status: 'Sent', pdfUrl: downloadUrl, updatedAt: Timestamp.now() });
      form.setValue('status', 'Sent'); 
      if (onSaveSuccess) onSaveSuccess({ ...savedQuotation, status: 'Sent', pdfUrl: downloadUrl, updatedAt: Timestamp.now() });

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
      setIsSending(false);
    }
  };

  const handleDownloadPdf = async () => {
    const currentInitialData = initialData;
     if (!currentInitialData?.id) {
      toast({ title: "Save First", description: "Please save the quotation before downloading.", variant: "default" });
      return;
    }
    setIsDownloading(true);
    try {
      const quotationSnap = await getDoc(doc(db, "quotations", currentInitialData.id));
      if (!quotationSnap.exists()) throw new Error("Quotation not found for download.");
      const savedQuotation = { id: quotationSnap.id, ...quotationSnap.data() } as FirestoreQuotation;

      const companyInfo: CompanyDetailsForPdf = {
        name: companySettings?.websiteName || "Yourbrand", address: companySettings?.address || "",
        contactEmail: companySettings?.contactEmail || "", contactMobile: companySettings?.contactMobile || "",
        logoUrl: companySettings?.logoUrl || undefined,
        currencySymbol: appConfig?.currencySymbol || "₹",
        dateFormat: appConfig?.dateFormat,
      };

      const pdfDataUri = await generateQuotationPdf(savedQuotation, companyInfo);
      triggerPdfDownload(pdfDataUri, `Quotation-${savedQuotation.quotationNumber}.pdf`);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      toast({ title: "Error Downloading", description: (error as Error).message || "Could not download PDF.", variant: "destructive" });
    } finally {
      setIsDownloading(false);
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? "Edit Quotation" : "Create New Quotation"}</CardTitle>
        <CardDescription>
          {isEditing ? `Editing Quotation #: ${initialData?.quotationNumber}` : "Fill in the details to generate a new quotation."}
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
              <Button type="button" variant="outline" size="sm" onClick={handleCreateNewUserRedirect} disabled={isSaving}><UserPlus className="mr-2 h-4 w-4" /> Create New User</Button>
              <FormField control={form.control} name="customerName" render={({ field }) => (<FormItem><FormLabel>Customer Name <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Customer's full name" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="customerEmail" render={({ field }) => (<FormItem><FormLabel>Customer Email (Optional)</FormLabel><FormControl><Input type="email" placeholder="customer@example.com" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="customerMobile" render={({ field }) => (<FormItem><FormLabel>Customer Mobile (Optional)</FormLabel><FormControl><Input type="tel" placeholder="+919876543210" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
            </div>

            {/* Quotation Details */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Quotation Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="quotationNumber" render={({ field }) => (<FormItem><FormLabel>Quotation Number <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="e.g., QUOT-2023-001" {...field} disabled={isSaving || isEditing} /></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="quotationDate" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Quotation Date <span className="text-destructive">*</span></FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl><Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")} disabled={isSaving}>
                      {field.value ? formatDateInTimezone(new Date(field.value), 'Asia/Kolkata') : <span>Pick a date</span>}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                    </Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus disabled={isSaving}/></PopoverContent></Popover><FormMessage /></FormItem>
                )}/>
              </div>
              <FormField control={form.control} name="serviceTitle" render={({ field }) => (<FormItem><FormLabel>Service Title <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="e.g., Full Home Painting (3BHK)" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="serviceDescription" render={({ field }) => (<FormItem><FormLabel>Service Description (Optional)</FormLabel><FormControl><Textarea placeholder="Detailed scope of work..." {...field} rows={3} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              {(isEditing || initialData?.status) && (
                <FormField control={form.control} name="status" render={({ field }) => (
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
                          disabled={isSaving}
                          type="button"
                        >
                          {field.value || "Select status"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Select Status</DialogTitle>
                          <DialogDescription>
                            Choose the current status for this quotation.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <ScrollArea className="h-[200px] rounded-md border p-2">
                            <div className="space-y-1">
                              {quotationStatusOptions.map((s) => (
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
              )}
            </div>

            {/* Itemized List */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Items / Services</h3>
              {fields.map((item, index) => (
                <div key={item.id} className="p-3 border rounded-md space-y-3 relative">
                  <div className="grid grid-cols-1 sm:grid-cols-itemized-quotation gap-3 items-end">
                    <FormField control={form.control} name={`items.${index}.itemName`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Item Name <span className="text-destructive">*</span></FormLabel><FormControl><Input placeholder="Service or Product" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`items.${index}.quantity`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Qty <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" placeholder="1" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormField control={form.control} name={`items.${index}.ratePerUnit`} render={({ field }) => (<FormItem><FormLabel className="text-xs">Rate/Unit ({symbol}) <span className="text-destructive">*</span></FormLabel><FormControl><Input type="number" step="0.01" placeholder="100.00" {...field} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
                    <FormItem><FormLabel className="text-xs">Total ({symbol})</FormLabel><Input type="text" value={((form.watch(`items.${index}.quantity`) || 0) * (form.watch(`items.${index}.ratePerUnit`) || 0)).toFixed(2)} disabled readOnly className="bg-muted/50"/></FormItem>
                  </div>
                  {fields.length > 1 && (<Button type="button" variant="ghost" size="icon" className="absolute top-1 right-1 h-6 w-6 text-destructive" onClick={() => remove(index)} disabled={isSaving}><Trash2 className="h-4 w-4" /></Button>)}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => append({ id: nanoid(), itemName: "", quantity: 1, ratePerUnit: 0 })} disabled={isSaving}><PlusCircle className="mr-2 h-4 w-4" /> Add Item</Button>
            </div>

            {/* Totals & Notes */}
            <div className="space-y-3 p-4 border rounded-md">
              <h3 className="text-lg font-medium">Summary & Notes</h3>
              <FormField control={form.control} name="additionalNotes" render={({ field }) => (<FormItem><FormLabel>Additional Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Terms, validity, etc." {...field} rows={3} disabled={isSaving} /></FormControl><FormMessage /></FormItem>)}/>
              <div className="space-y-1 text-right text-sm">
                <div>Subtotal: <span className="font-semibold">{symbol}{subtotal.toFixed(2)}</span></div>
                <div className="flex items-center justify-end gap-2">
                  <FormLabel htmlFor="taxPercentInput" className="text-sm whitespace-nowrap">Tax (%):</FormLabel>
                  <FormField control={form.control} name="taxPercent" render={({ field }) => (<FormItem className="inline-block w-20"><FormControl><Input type="number" id="taxPercentInput" step="0.01" placeholder="0" {...field} disabled={isSaving} className="h-8 text-right" /></FormControl><FormMessage className="text-left text-xs" /></FormItem>)}/>
                </div>
                <div>Tax Amount: <span className="font-semibold">{symbol}{taxAmount.toFixed(2)}</span></div>
                <div className="text-lg font-bold text-primary">Grand Total: {symbol}{grandTotal.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row justify-end gap-2 pt-6">
            <Button type="submit" disabled={isSaving || isSending || isDownloading || isLoadingCompanySettings}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditing ? "Update Quotation" : "Save Draft"}
            </Button>
            <Button type="button" variant="outline" onClick={handleSendQuotation} disabled={isSaving || isSending || isDownloading || !initialData?.id || isLoadingCompanySettings}>
              {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
               Send Quotation
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
