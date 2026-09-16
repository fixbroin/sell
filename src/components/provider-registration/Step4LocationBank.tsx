
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { ProviderApplication, ProviderControlOptions, BankDetails } from '@/types/firestore';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MapPin, Banknote, Camera, Image as ImageIcon, Trash2, Check, Lock, ChevronRight, AlertCircle, FileText, ChevronsDown } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage, db } from '@/lib/firebase';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState, useCallback } from "react";
import { Timestamp, doc, getDoc } from '@/lib/mysqlDb';
import { nanoid } from 'nanoid';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import dynamic from 'next/dynamic';
import { compressImage } from "@/lib/imageCompressor";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STORAGE_KEY = 'fixbro_reg_step4';

const ProviderMapZoneSelector = dynamic(() => import('@/components/provider-registration/ProviderMapZoneSelector'), {
  loading: () => <div className="flex items-center justify-center h-64 bg-muted rounded-md"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>,
  ssr: false
});

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && (url.includes("firebasestorage.googleapis.com") || url.startsWith("/uploads/") || url.includes("uploads/"));
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const DEFAULT_MAP_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore
const createStep4Schema = (maxRadius: number) => z.object({
  workAreaCenter: z.object({
    lat: z.number({ required_error: "Please select a location on the map." }),
    lng: z.number({ required_error: "Please select a location on the map." }),
  }).optional().refine(val => val !== undefined && val.lat !== undefined && val.lng !== undefined, {
    message: "Please select a location on the map.",
  }),
  workAreaRadiusKm: z.coerce.number().min(1, "Radius must be at least 1 km.").max(maxRadius, `Radius cannot exceed the maximum of ${maxRadius} km.`),
  workAreaAddress: z.string().optional(),
  bankName: z.string().min(2, "Bank name is required.").max(100),
  accountHolderName: z.string().min(2, "Account holder name is required.").max(100),
  accountNumber: z.string().min(5, "Account number seems too short.").max(25, "Account number too long."),
  confirmAccountNumber: z.string(),
  ifscCode: z.string().optional(),
  cancelledChequeUrl: z.string().optional().nullable(),
  signatureUrl: z.string().optional().nullable(),
  termsConfirmation: z.boolean().refine(value => value === true, {
    message: "You must agree to the terms and conditions.",
  }),
  customFields: z.record(z.string().optional()),
}).refine(data => data.accountNumber === data.confirmAccountNumber, {
  message: "Account numbers do not match.",
  path: ["confirmAccountNumber"],
});

type Step4FormData = z.infer<ReturnType<typeof createStep4Schema>>;

interface Step4LocationBankProps {
  onSubmit: (data: Partial<ProviderApplication>) => void;
  onPrevious: () => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
  userUid: string;
  isEditModeByAdmin?: boolean;
}

export default function Step4LocationBank({
  onSubmit,
  onPrevious,
  initialData,
  isSaving,
  userUid,
  isEditModeByAdmin = false,
}: Step4LocationBankProps) {
  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [selectedAddressText, setSelectedAddressText] = useState<string>(initialData.workAreaAddress || "");
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [termsContent, setTermsContent] = useState("");
  const [canAgreeTerms, setCanAgreeTerms] = useState(false);
  const termsScrollRef = useRef<HTMLDivElement>(null);

  const [currentChequePreview, setCurrentChequePreview] = useState<string | null>(initialData.bankDetails?.cancelledChequeUrl || null);
  const [selectedChequeFile, setSelectedChequeFile] = useState<File | null>(null);
  const chequeFileInputRef = useRef<HTMLInputElement>(null);
  const [chequeUploadProgress, setChequeUploadProgress] = useState<number | null>(null);
  const [chequeStatusMessage, setChequeStatusMessage] = useState("");
  const [isFormBusyForCheque, setIsFormBusyForCheque] = useState(false);

  const [currentSignaturePreview, setCurrentSignaturePreview] = useState<string | null>(initialData.signatureUrl || null);
  const [selectedSignatureFile, setSelectedSignatureFile] = useState<File | null>(null);
  const signatureFileInputRef = useRef<HTMLInputElement>(null);
  const [signatureUploadProgress, setSignatureUploadProgress] = useState<number | null>(null);
  const [signatureStatusMessage, setSignatureStatusMessage] = useState("");
  const [isFormBusyForSignature, setIsFormBusyForSignature] = useState(false);

  const maxRadius = appConfig.maxProviderRadiusKm || 50;
  const step4Schema = createStep4Schema(maxRadius);
  const enableCancelledCheque = appConfig?.enableCancelledChequeUpload !== false;
  const enableSignature = appConfig?.enableSignatureUpload !== false;
  
  const form = useForm<Step4FormData>({
    resolver: zodResolver(step4Schema),
    defaultValues: {
      workAreaCenter: initialData.workAreaCenter ? { lat: initialData.workAreaCenter.latitude, lng: initialData.workAreaCenter.longitude } : undefined,
      workAreaRadiusKm: initialData.workAreaRadiusKm || 5,
      workAreaAddress: initialData.workAreaAddress || "",
      bankName: initialData.bankDetails?.bankName || "",
      accountHolderName: initialData.bankDetails?.accountHolderName || "",
      accountNumber: initialData.bankDetails?.accountNumber || "",
      confirmAccountNumber: initialData.bankDetails?.accountNumber || "",
      ifscCode: initialData.bankDetails?.ifscCode || "",
      cancelledChequeUrl: initialData.bankDetails?.cancelledChequeUrl || null,
      signatureUrl: initialData.signatureUrl || null,
      termsConfirmation: initialData.termsConfirmedAt ? true : false,
      customFields: {},
    },
  });

  // Automated flow: Open map if location not set
  useEffect(() => {
    const hasSelectedLocation = initialData.workAreaCenter?.latitude && initialData.workAreaCenter?.longitude;
    const storageData = localStorage.getItem(STORAGE_KEY);
    if (!hasSelectedLocation && !storageData) {
      setIsMapModalOpen(true);
    }
  }, [initialData.workAreaCenter]);

  // Load terms content
  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const docRef = doc(db, "providerControlOptions", "termsAndConditions");
        const snap = await getDoc(docRef);
        if (snap.exists()) setTermsContent(snap.data().content || "");
      } catch (e) {
        console.error("Error loading terms:", e);
      }
    };
    fetchTerms();
  }, []);

  // Restore from Local Storage
  useEffect(() => {
    if (isEditModeByAdmin || !userUid) return;
    const userStorageKey = `${STORAGE_KEY}_${userUid}`;
    const saved = localStorage.getItem(userStorageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        form.reset({ ...initialData, ...data });
        if (data.workAreaAddress) setSelectedAddressText(data.workAreaAddress);
        if (data.cancelledChequeUrl) setCurrentChequePreview(data.cancelledChequeUrl);
        if (data.signatureUrl) setCurrentSignaturePreview(data.signatureUrl);
      } catch (e) {
        console.error("Error restoring Step 4 from storage:", e);
      }
    }
  }, [initialData, form, userUid, isEditModeByAdmin]);

  // Auto-save to Local Storage
  useEffect(() => {
    if (isEditModeByAdmin || !userUid) return;
    const subscription = form.watch((value) => {
      const userStorageKey = `${STORAGE_KEY}_${userUid}`;
      localStorage.setItem(userStorageKey, JSON.stringify({
        ...value,
        workAreaAddress: selectedAddressText || value.workAreaAddress,
      }));
    });
    return () => subscription.unsubscribe();
  }, [form, userUid, isEditModeByAdmin, selectedAddressText]);

  const customFields = appConfig?.customBankFields || [
    { id: 'ifsc', name: 'IFSC Code', type: 'alphanumeric', required: true, placeholder: 'Enter IFSC code' }
  ];

  useEffect(() => {
    const defaultCustomFields: Record<string, string> = {};
    customFields.forEach(f => {
      defaultCustomFields[f.id] = initialData.bankDetails?.customFields?.[f.id] || 
                                 (f.id === 'ifsc' ? initialData.bankDetails?.ifscCode : '') || "";
    });

    form.reset({
      workAreaCenter: initialData.workAreaCenter ? { lat: initialData.workAreaCenter.latitude, lng: initialData.workAreaCenter.longitude } : undefined,
      workAreaRadiusKm: initialData.workAreaRadiusKm || 5,
      workAreaAddress: initialData.workAreaAddress || "",
      bankName: initialData.bankDetails?.bankName || "",
      accountHolderName: initialData.bankDetails?.accountHolderName || "",
      accountNumber: initialData.bankDetails?.accountNumber || "",
      confirmAccountNumber: initialData.bankDetails?.accountNumber || "",
      ifscCode: initialData.bankDetails?.ifscCode || "",
      cancelledChequeUrl: initialData.bankDetails?.cancelledChequeUrl || null,
      signatureUrl: initialData.signatureUrl || null,
      termsConfirmation: initialData.termsConfirmedAt ? true : false,
      customFields: defaultCustomFields,
    });
    if (initialData.workAreaAddress) {
      setSelectedAddressText(initialData.workAreaAddress);
    }
    setCurrentChequePreview(initialData.bankDetails?.cancelledChequeUrl || null);
    setSelectedChequeFile(null);
    if (chequeFileInputRef.current) chequeFileInputRef.current.value = "";
    
    setCurrentSignaturePreview(initialData.signatureUrl || null);
    setSelectedSignatureFile(null);
    if (signatureFileInputRef.current) signatureFileInputRef.current.value = "";
  }, [initialData, form, customFields]);

  const handleLocationConfirm = (locationData: {
    center: { lat: number; lng: number };
    radiusKm: number;
    address: string;
  }) => {
    form.setValue("workAreaCenter", locationData.center, { shouldValidate: true });
    form.setValue("workAreaRadiusKm", locationData.radiusKm, { shouldValidate: true });
    form.setValue("workAreaAddress", locationData.address);
    setSelectedAddressText(locationData.address);
    setIsMapModalOpen(false);
    if (!form.getValues("termsConfirmation")) {
      setIsTermsModalOpen(true);
    }
  };

  const handleScrollTerms = () => {
    const el = termsScrollRef.current;
    if (el) {
      const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 5;
      if (isAtBottom) setCanAgreeTerms(true);
    }
  };

  const handleScrollToBottom = () => {
    const el = termsScrollRef.current;
    if (el) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: 'smooth'
      });
      setCanAgreeTerms(true);
    }
  };

  useEffect(() => {
    if (isTermsModalOpen && termsScrollRef.current) {
      const el = termsScrollRef.current;
      if (el.scrollHeight <= el.clientHeight) {
        setCanAgreeTerms(true);
      }
    }
  }, [isTermsModalOpen, termsContent]);

  const handleAgreeTerms = () => {
    form.setValue("termsConfirmation", true, { shouldValidate: true });
    setIsTermsModalOpen(false);
    toast({ title: "Consent Recorded", description: "You have agreed to the terms and conditions." });
  };

  const handleFileUpload = async (
    file: File,
    storageFolder: string,
    fileTypeLabel: string,
    existingUrl: string | null | undefined,
    setUploadProgressFn: React.Dispatch<React.SetStateAction<number | null>>,
    setStatusMessageFn: React.Dispatch<React.SetStateAction<string>>
  ): Promise<{ url: string; fileName: string } | null> => {
    setStatusMessageFn(`Uploading ${fileTypeLabel}...`);
    setUploadProgressFn(0);
    try {
      if (existingUrl && isFirebaseStorageUrl(existingUrl)) {
        try { await deleteObject(storageRefStandard(storage, existingUrl)); }
        catch (e) { console.warn(`Old ${fileTypeLabel} image not deleted:`, e); }
      }
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const randomString = generateRandomHexString(8);
      const autoFileName = `${fileTypeLabel.toLowerCase().replace(/\s+/g, '_')}_${randomString}.${extension}`;
      const imagePath = `provider_documents/${userUid}/${storageFolder}/${autoFileName}`;
      const imageRef = storageRefStandard(storage, imagePath);
      const uploadTask = uploadBytesResumable(imageRef, file);

      const downloadURL = await new Promise<string>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => setUploadProgressFn((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
          (error) => reject(error),
          async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); } }
        );
      });
      setStatusMessageFn(`${fileTypeLabel} uploaded.`);
      return { url: downloadURL, fileName: file.name };
    } catch (uploadError) {
      toast({ title: `${fileTypeLabel} Upload Failed`, description: (uploadError as Error).message || `Could not upload ${fileTypeLabel}.`, variant: "destructive" });
      setStatusMessageFn(""); setUploadProgressFn(null);
      throw uploadError;
    }
  };

  const handleSubmit = async (data: Step4FormData) => {
    if (!data.termsConfirmation) {
        form.setError("termsConfirmation", { type: "manual", message: "You must confirm the information." });
        return;
    }
    
    const errors: string[] = [];
    if (appConfig.isCancelledChequeCompulsory && !selectedChequeFile && !data.cancelledChequeUrl && !initialData.bankDetails?.cancelledChequeUrl) {
        errors.push("Cancelled Cheque Image");
    }
    if (!selectedSignatureFile && !data.signatureUrl && !initialData.signatureUrl) {
        errors.push("Signature Image");
    }

    const enableCancelledCheque = appConfig.enableCancelledChequeUpload !== false;
    const isChequeCompulsory = appConfig.isCancelledChequeCompulsory === true;
    const enableSignature = appConfig.enableSignatureUpload !== false;

    // A. Validate dynamic custom bank fields
    let hasCustomErrors = false;
    customFields.forEach(f => {
      const val = data.customFields?.[f.id] || "";
      if (f.required && !val.trim()) {
        form.setError(`customFields.${f.id}` as any, {
          type: "manual",
          message: `${f.name} is required.`
        });
        hasCustomErrors = true;
      } else if (val.trim()) {
        if (f.type === 'number' && !/^\d+$/.test(val.trim())) {
          form.setError(`customFields.${f.id}` as any, {
            type: "manual",
            message: `${f.name} must contain only numbers.`
          });
          hasCustomErrors = true;
        } else if (f.type === 'text' && !/^[A-Za-z\s]+$/.test(val.trim())) {
          form.setError(`customFields.${f.id}` as any, {
            type: "manual",
            message: `${f.name} must contain only letters.`
          });
          hasCustomErrors = true;
        } else if (f.type === 'alphanumeric' && !/^[a-zA-Z0-9\s]+$/.test(val.trim())) {
          form.setError(`customFields.${f.id}` as any, {
            type: "manual",
            message: `${f.name} must contain only letters and numbers.`
          });
          hasCustomErrors = true;
        }
      }
    });

    if (hasCustomErrors) {
      toast({ title: "Validation Error", description: "Please complete all bank fields correctly.", variant: "destructive" });
      return;
    }

    // B. Check Cancelled Cheque upload if required
    if (enableCancelledCheque && isChequeCompulsory && !selectedChequeFile && !data.cancelledChequeUrl) {
      errors.push("Cancelled Cheque Image");
    }

    if (errors.length > 0) {
        setValidationErrors(errors);
        toast({ title: "Missing Required Fields", description: "Please upload required documents", variant: "destructive" });
        return;
    }

    setValidationErrors([]);
    setIsFormBusyForCheque(!!selectedChequeFile);
    setIsFormBusyForSignature(!!selectedSignatureFile);

    let finalChequeUrl = initialData.bankDetails?.cancelledChequeUrl || null;
    let finalChequeFileName = initialData.bankDetails?.cancelledChequeFileName || null;

    let finalSignatureUrl = initialData.signatureUrl || null;
    let finalSignatureFileName = initialData.signatureFileName || null;

    try {
      if (enableCancelledCheque && selectedChequeFile) {
        const chequeUploadResult = await handleFileUpload(selectedChequeFile, 'bank', 'Cancelled Cheque', initialData.bankDetails?.cancelledChequeUrl, setChequeUploadProgress, setChequeStatusMessage);
        finalChequeUrl = chequeUploadResult?.url || null;
        finalChequeFileName = chequeUploadResult?.fileName || null;
      } else if (enableCancelledCheque && !currentChequePreview && initialData.bankDetails?.cancelledChequeUrl) {
        try {
          if (isFirebaseStorageUrl(initialData.bankDetails.cancelledChequeUrl)) {
            await deleteObject(storageRefStandard(storage, initialData.bankDetails.cancelledChequeUrl));
          }
        } catch (e) { console.warn("Old cheque not deleted:", e); }
        finalChequeUrl = null;
        finalChequeFileName = null;
      }

      if (enableSignature && selectedSignatureFile) {
        const signatureUploadResult = await handleFileUpload(selectedSignatureFile, 'signature', 'Signature', initialData.signatureUrl, setSignatureUploadProgress, setSignatureStatusMessage);
        finalSignatureUrl = signatureUploadResult?.url || null;
        finalSignatureFileName = signatureUploadResult?.fileName || null;
      } else if (enableSignature && !currentSignaturePreview && initialData.signatureUrl) {
        try {
          if (isFirebaseStorageUrl(initialData.signatureUrl)) {
            await deleteObject(storageRefStandard(storage, initialData.signatureUrl));
          }
        } catch (e) { console.warn("Old signature not deleted:", e); }
        finalSignatureUrl = null;
        finalSignatureFileName = null;
      }
      
      if (enableSignature && !finalSignatureUrl && !initialData.signatureUrl) { 
        toast({ title: "Signature Required", description: "Please upload your signature image to proceed.", variant: "destructive" });
        setIsFormBusyForCheque(false); setIsFormBusyForSignature(false);
        return;
      }

      const bankDetailsData: BankDetails = {
        bankName: data.bankName,
        accountHolderName: data.accountHolderName,
        accountNumber: data.accountNumber,
        ifscCode: (data.customFields?.['ifsc'] || data.ifscCode || "").toUpperCase(),
        customFields: data.customFields as Record<string, string>,
        cancelledChequeUrl: enableCancelledCheque ? (finalChequeUrl || undefined) : undefined,
        cancelledChequeFileName: enableCancelledCheque ? (finalChequeFileName || undefined) : undefined,
        verified: initialData.bankDetails?.verified || false,
      };
      
      const applicationStepData: Partial<ProviderApplication> = {
        workAreaCenter: {
          latitude: data.workAreaCenter!.lat,
          longitude: data.workAreaCenter!.lng,
        },
        workAreaRadiusKm: data.workAreaRadiusKm,
        workAreaAddress: selectedAddressText || data.workAreaAddress || undefined,
        bankDetails: bankDetailsData,
        termsConfirmedAt: data.termsConfirmation ? Timestamp.now() : undefined,
        signatureUrl: enableSignature ? (finalSignatureUrl || initialData.signatureUrl) : undefined,
        signatureFileName: enableSignature ? (finalSignatureFileName || initialData.signatureFileName) : undefined,
      };
      onSubmit(applicationStepData);

    } catch (error) {
      console.error("Error in Step 4 submission:", error);
    } finally {
      setIsFormBusyForCheque(false);
      setIsFormBusyForSignature(false);
      setChequeStatusMessage(""); setSignatureStatusMessage("");
      setChequeUploadProgress(null); setSignatureUploadProgress(null);
    }
  };

  const displayChequePreviewUrl = isValidImageSrc(currentChequePreview) ? currentChequePreview : null;
  const displaySignaturePreviewUrl = isValidImageSrc(currentSignaturePreview) ? currentSignaturePreview : null;
  const effectiveIsSaving = isSaving || isFormBusyForCheque || isFormBusyForSignature;
  
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <CardContent className="space-y-6">
          <Card className="p-4 border bg-muted/10 shadow-sm">
            <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center">
                <MapPin className="mr-2 h-5 w-5 text-primary" />
                Work Location & Service Area
              </CardTitle>
              {form.watch("workAreaCenter") && (
                <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 font-medium">
                  <Check className="h-3 w-3 mr-1" /> Location Set
                </Badge>
              )}
            </CardHeader>
            <CardContent className="p-0 space-y-3">
              {form.watch("workAreaCenter") ? (
                <div className="rounded-lg border bg-background p-3.5 space-y-2.5">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Selected Work Center</p>
                    <p className="text-sm font-medium text-foreground">
                      {selectedAddressText || form.watch("workAreaAddress") || "Center point selected on map"}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      Coordinates: {form.watch("workAreaCenter")?.lat?.toFixed(5)}, {form.watch("workAreaCenter")?.lng?.toFixed(5)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1.5 border-t text-xs">
                    <span className="text-muted-foreground">Coverage Radius:</span>
                    <Badge variant="outline" className="font-semibold text-primary border-primary/30">
                      {form.watch("workAreaRadiusKm") || 5} km radius
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 justify-center gap-2 mt-1"
                    onClick={() => setIsMapModalOpen(true)}
                    disabled={effectiveIsSaving}
                  >
                    <MapPin className="h-4 w-4 text-primary" />
                    Change Service Location & Radius
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Please pinpoint your work center location and set your service radius on the map.</span>
                  </div>
                  <Button
                    type="button"
                    className="w-full h-11 justify-center gap-2"
                    onClick={() => setIsMapModalOpen(true)}
                    disabled={effectiveIsSaving}
                  >
                    <MapPin className="h-4 w-4" />
                    Set Service Location & Radius on Map
                  </Button>
                </div>
              )}

              {form.formState.errors.workAreaCenter && (
                <p className="text-xs font-medium text-destructive mt-1">
                  {form.formState.errors.workAreaCenter.message || "Please select a location on the map."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="p-4 border shadow-sm">
            <CardHeader className="p-0 pb-3"><CardTitle className="text-lg flex items-center"><Banknote className="mr-2 h-5 w-5 text-primary"/>Bank Account Details</CardTitle></CardHeader>
            <CardContent className="p-0 space-y-4">
              <FormField control={form.control} name="accountHolderName" render={({ field }) => (<FormItem><FormLabel>Account Holder Name *</FormLabel><FormControl><Input placeholder="As per bank records" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <FormField control={form.control} name="bankName" render={({ field }) => (<FormItem><FormLabel>Bank Name *</FormLabel><FormControl><Input placeholder="e.g., State Bank of India" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={form.control} name="accountNumber" render={({ field }) => (<FormItem><FormLabel>Account Number *</FormLabel><FormControl><Input placeholder="Enter bank account number" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
                <FormField control={form.control} name="confirmAccountNumber" render={({ field }) => (<FormItem><FormLabel>Confirm Account Number *</FormLabel><FormControl><Input placeholder="Re-enter account number" {...field} disabled={effectiveIsSaving}/></FormControl><FormMessage /></FormItem>)}/>
              </div>
              {customFields.map((field) => (
                <FormField
                  key={field.id}
                  control={form.control}
                  name={`customFields.${field.id}`}
                  render={({ field: inputField }) => (
                    <FormItem>
                      <FormLabel>{field.name} {field.required ? '*' : ''}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={field.placeholder || `Enter ${field.name}`}
                          {...inputField}
                          value={inputField.value ?? ""}
                          onChange={(e) => {
                            const rawVal = e.target.value;
                            let formattedVal = rawVal;
                            if (field.type === 'alphanumeric' || field.type === 'text') {
                              formattedVal = rawVal.toUpperCase();
                            }
                            inputField.onChange(formattedVal);
                          }}
                          disabled={effectiveIsSaving}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}

              {enableCancelledCheque && (
                <FormItem className="space-y-2">
                  <FormLabel className="flex items-center text-sm font-semibold">
                    <Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Upload Cancelled Cheque {appConfig.isCancelledChequeCompulsory ? "*" : "(Optional)"}
                  </FormLabel>
                  <FormDescription className="text-[11px] text-muted-foreground leading-normal mb-2">
                    Please upload a clear picture of your cancelled cheque. Make sure the account number, IFSC code, and your name are clearly visible. See the example on the right.
                  </FormDescription>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Upload Box */}
                    <div className="flex flex-col space-y-1 max-w-[220px] mx-auto w-full">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between w-full">
                        <span>Your Document</span>
                        {validationErrors.includes("Cancelled Cheque Image") && <Badge variant="destructive" className="h-4 px-1.5 text-[10px] animate-pulse">REQUIRED</Badge>}
                      </div>
                      <div 
                        onClick={() => !effectiveIsSaving && chequeFileInputRef.current?.click()}
                        className={cn(
                          "relative aspect-square w-full max-w-[220px] mx-auto rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-sm",
                          validationErrors.includes("Cancelled Cheque Image") ? "border-destructive bg-destructive/5 animate-pulse" : "border-muted-foreground/25 hover:border-primary/50 bg-muted/30"
                        )}
                      >
                        {displayChequePreviewUrl ? (
                          <>
                            <NextImage src={displayChequePreviewUrl} alt="Cheque preview" fill className="object-contain p-1" unoptimized={displayChequePreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/>
                            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="h-8 w-8 text-white" /></div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Camera className={cn("h-8 w-8", validationErrors.includes("Cancelled Cheque Image") ? "text-destructive" : "text-muted-foreground")} />
                            {validationErrors.includes("Cancelled Cheque Image") && <AlertCircle className="h-5 w-5 text-destructive animate-bounce" />}
                            <span className={cn("text-[10px] font-bold", validationErrors.includes("Cancelled Cheque Image") ? "text-destructive" : "text-muted-foreground")}>CLICK TO UPLOAD</span>
                          </div>
                        )}
                        {chequeUploadProgress !== null && selectedChequeFile && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
                            <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                            <Progress value={chequeUploadProgress} className="h-1.5 w-full bg-white/20" />
                          </div>
                        )}
                      </div>
                      <FormControl><Input type="file" accept="image/png, image/jpeg, image/webp" onChange={async (e) => { if (e.target.files?.[0]) { const file = e.target.files[0]; if (file.size > 50 * 1024 * 1024) { toast({ title: "File Too Large", description: "Image must be < 50MB.", variant: "destructive" }); e.target.value = ""; return; } let fileToSet = file; try { fileToSet = await compressImage(file); } catch (err) { console.error("Compression failed", err); } setSelectedChequeFile(fileToSet); setCurrentChequePreview(URL.createObjectURL(fileToSet)); form.setValue('cancelledChequeUrl', null, { shouldValidate: false }); } }} ref={chequeFileInputRef} className="hidden" disabled={effectiveIsSaving}/></FormControl>
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                        <span>Max size: 50MB</span>
                        {(displayChequePreviewUrl || selectedChequeFile) && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedChequeFile(null); setCurrentChequePreview(null); form.setValue('cancelledChequeUrl', null); }} disabled={effectiveIsSaving} className="text-[10px] h-6 px-2 text-destructive hover:bg-destructive/10">
                            <Trash2 className="h-3 w-3 mr-1 text-destructive"/>Remove Image
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Right: Example Box */}
                    <div className="flex flex-col space-y-1 max-w-[220px] mx-auto w-full">
                      <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Example / Demo
                      </div>
                      <div className="relative aspect-square w-full max-w-[220px] mx-auto rounded-lg border border-border/70 bg-background flex flex-col items-center justify-center overflow-hidden transition-all shadow-sm">
                        <NextImage src="/sample-cheque.png" alt="Sample cancelled cheque" fill className="object-contain p-1" />
                      </div>
                      <span className="text-[10px] text-muted-foreground text-center">Reference Image</span>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            </CardContent>
          </Card>

          {enableSignature && (
            <Card className="p-4 border shadow-sm">
              <CardContent className="p-0">
                <FormField
                  control={form.control}
                  name="signatureUrl"
                  render={() => (
                    <FormItem className="space-y-2">
                      <FormLabel className="flex items-center text-sm font-semibold">
                        <Camera className="mr-2 h-4 w-4 text-muted-foreground"/>Upload Signature *
                      </FormLabel>
                      <FormDescription className="text-[11px] text-muted-foreground leading-normal mb-2">
                        Please upload a clear image of your signature on a clean white paper. See the example on the right.
                      </FormDescription>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Left: Upload Box */}
                        <div className="flex flex-col space-y-1 max-w-[220px] mx-auto w-full">
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between w-full">
                            <span>Your Document</span>
                            {validationErrors.includes("Signature Image") && <Badge variant="destructive" className="h-4 px-1.5 text-[10px] animate-pulse">REQUIRED</Badge>}
                          </div>
                          <div 
                            onClick={() => !effectiveIsSaving && signatureFileInputRef.current?.click()}
                            className={cn(
                              "relative aspect-square w-full max-w-[220px] mx-auto rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-sm",
                              validationErrors.includes("Signature Image") ? "border-destructive bg-destructive/5 animate-pulse" : "border-muted-foreground/25 hover:border-primary/50 bg-muted/30"
                            )}
                          >
                            {displaySignaturePreviewUrl ? (
                              <>
                                <NextImage src={displaySignaturePreviewUrl} alt="Signature preview" fill className="object-contain p-1" unoptimized={displaySignaturePreviewUrl.startsWith('blob:')} sizes="(max-width: 640px) 100vw, 50vw"/>
                                <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"><Camera className="h-8 w-8 text-white" /></div>
                              </>
                            ) : (
                              <div className="flex flex-col items-center gap-2">
                                <Camera className={cn("h-8 w-8", validationErrors.includes("Signature Image") ? "text-destructive" : "text-muted-foreground")} />
                                {validationErrors.includes("Signature Image") && <AlertCircle className="h-5 w-5 text-destructive animate-bounce" />}
                                <span className={cn("text-[10px] font-bold", validationErrors.includes("Signature Image") ? "text-destructive" : "text-muted-foreground")}>CLICK TO UPLOAD</span>
                              </div>
                            )}
                            {signatureUploadProgress !== null && selectedSignatureFile && (
                              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
                                <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
                                <Progress value={signatureUploadProgress} className="h-1.5 w-full bg-white/20" />
                              </div>
                            )}
                          </div>
                          <FormControl>
                            <input 
                              type="file" 
                              accept="image/png, image/jpeg, image/webp" 
                              className="hidden"
                              onChange={async (e) => { if (e.target.files?.[0]) { const file = e.target.files[0]; if (file.size > 50 * 1024 * 1024) { toast({ title: "File Too Large", description: "Image must be < 50MB.", variant: "destructive" }); return; } let fileToSet = file; try { fileToSet = await compressImage(file); } catch (err) { console.error("Compression failed", err); } setSelectedSignatureFile(fileToSet); setCurrentSignaturePreview(URL.createObjectURL(fileToSet)); form.setValue('signatureUrl', null, { shouldValidate: false }); } }}
                              ref={signatureFileInputRef} 
                              disabled={effectiveIsSaving}
                            />
                          </FormControl>
                          <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                            <span>Max size: 50MB</span>
                            {currentSignaturePreview && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedSignatureFile(null); setCurrentSignaturePreview(null); form.setValue('signatureUrl', null); }} disabled={effectiveIsSaving} className="text-[10px] h-6 px-2 text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-3 w-3 mr-1"/>Remove Signature
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Right: Example Box */}
                        <div className="flex flex-col space-y-1 max-w-[220px] mx-auto w-full">
                          <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Check className="h-3.5 w-3.5" /> Example / Demo
                          </div>
                          <div className="relative aspect-square w-full max-w-[220px] mx-auto rounded-lg border border-border/70 bg-background flex flex-col items-center justify-center overflow-hidden transition-all shadow-sm">
                            <NextImage src="/sample-signature.png" alt="Sample signature" fill className="object-contain p-1" />
                          </div>
                          <span className="text-[10px] text-muted-foreground text-center">Reference Image</span>
                        </div>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          )}

          <div className="space-y-4 pt-4 border-t">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <FormLabel className="text-sm font-semibold">Terms & Conditions Confirmation</FormLabel>
                <Button type="button" variant="outline" size="sm" onClick={() => setIsTermsModalOpen(true)} className="h-8 text-xs">
                    <FileText className="mr-1.5 h-3.5 w-3.5" /> Read Terms Again
                </Button>
            </div>
            
            <FormField
                control={form.control}
                name="termsConfirmation"
                render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow-sm bg-primary/5 border-primary/20">
                    <FormControl>
                    <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={effectiveIsSaving}
                        id="termsConfirmationStep4"
                    />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                    <FormLabel htmlFor="termsConfirmationStep4" className="cursor-pointer text-sm font-semibold text-primary">
                        I confirm that all the information provided above is true and accurate to the best of my knowledge.
                    </FormLabel>
                    <FormMessage />
                    </div>
                </FormItem>
                )}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6 bg-muted/5">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={effectiveIsSaving}>Previous</Button>
          <Button type="submit" disabled={effectiveIsSaving}>
            {effectiveIsSaving && !(isFormBusyForCheque || isFormBusyForSignature) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isFormBusyForCheque && chequeStatusMessage ? chequeStatusMessage : 
             isFormBusyForSignature && signatureStatusMessage ? signatureStatusMessage : 
             effectiveIsSaving ? "Submitting..." : "Submit Application"}
          </Button>
        </CardFooter>
      </form>

      {/* Popups Flow */}
      <Dialog open={isMapModalOpen} onOpenChange={(open) => { if (!open) setIsMapModalOpen(false); }}>
        <DialogContent className="max-w-3xl w-[95vw] h-[90vh] p-0 flex flex-col" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()} hideCloseButton={true}>
          <DialogHeader className="p-4 border-b">
            <DialogTitle>Set Your Service Location</DialogTitle>
            <DialogDescription>Select the center point from where you will provide services.</DialogDescription>
          </DialogHeader>
          <div className="flex-grow relative">
            {!isLoadingAppSettings && appConfig.googleMapsApiKey ? (
              <ProviderMapZoneSelector 
                apiKey={appConfig.googleMapsApiKey} 
                initialCenter={form.getValues('workAreaCenter') || null}
                initialRadiusKm={form.getValues('workAreaRadiusKm') || 5}
                maxRadiusKm={maxRadius}
                onConfirm={handleLocationConfirm} 
                onClose={() => setIsMapModalOpen(false)} 
              />
            ) : <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-primary"/></div>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTermsModalOpen} onOpenChange={(open) => { if (!open) setIsTermsModalOpen(false); }}>
        <DialogContent 
          className="max-w-xl w-[90vw] p-0 flex flex-col" 
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          hideCloseButton={true}
        >
          <DialogHeader className="p-3 border-b bg-primary text-primary-foreground">
            <DialogTitle className="text-xl">Provider Terms & Conditions</DialogTitle>
            <DialogDescription className="text-primary-foreground/80">Please read and accept our terms to join the network.</DialogDescription>
          </DialogHeader>
          <div className="relative flex-grow flex flex-col">
            <div 
              ref={termsScrollRef}
              onScroll={handleScrollTerms}
              className="flex-grow overflow-y-auto max-h-[60vh] p-3 text-sm leading-relaxed prose prose-sm dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: termsContent || "<p>Loading terms...</p>" }}
            />
             {!canAgreeTerms && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none z-20">
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes slow-bounce {
                    0%, 100% {
                      transform: translateY(0);
                      animation-timing-function: cubic-bezier(0.8,0,1,1);
                    }
                    50% {
                      transform: translateY(-8px);
                      animation-timing-function: cubic-bezier(0,0,0.2,1);
                    }
                  }
                  .animate-slow-bounce {
                    animation: slow-bounce 2.2s infinite;
                  }
                `}} />
                <button
                  type="button"
                  onClick={handleScrollToBottom}
                  className="pointer-events-auto bg-[#45A0A2] hover:bg-[#398486] text-white px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-1.5 transition-all duration-300 animate-slow-bounce select-none whitespace-nowrap cursor-pointer border border-[#45A0A2]/20 hover:scale-105 active:scale-95 uppercase tracking-wider"
                >
                  <ChevronsDown className="h-4 w-4 animate-pulse" />
                  Read & Scroll Down
                </button>
              </div>
            )}
          </div>
          <DialogFooter className="p-3 border-t bg-muted/50 flex flex-col gap-3">
            <div className="flex items-center space-x-2 text-xs text-muted-foreground italic">
              {!canAgreeTerms && <span>Please scroll to the bottom to enable the Agree button.</span>}
              {canAgreeTerms && <span className="text-green-600 flex items-center gap-1"><Check className="h-3 w-3"/> Content read. You may proceed.</span>}
            </div>
            <Button onClick={handleAgreeTerms} disabled={!canAgreeTerms} className="w-full">
              I Agree to the Terms & Conditions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
