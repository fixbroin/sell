
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Camera, Image as ImageIcon, Trash2, PlusCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import type { ProviderApplication, ProviderControlOptions, KycDocument } from '@/types/firestore';
import { useEffect, useRef, useState, useMemo } from "react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { Progress } from "@/components/ui/progress";
import { compressImage } from "@/lib/imageCompressor";
import { nanoid } from 'nanoid';
import { cn } from "@/lib/utils";

const STORAGE_KEY = 'yourbrand_reg_step3';



const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && (url.includes("firebasestorage.googleapis.com") || url.startsWith("/uploads/") || url.includes("uploads/"));
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};

const step3KycSchema = z.object({
  aadhaarNumber: z.string().optional().or(z.literal('')),
  panNumber: z.string().optional().or(z.literal('')),
});

type Step3FormData = z.infer<typeof step3KycSchema>;

interface FileUploadState {
  file: File | null;
  previewUrl: string | null;
  uploadProgress: number | null;
  existingUrl?: string | null;
  originalFileName?: string | null; 
}

interface Step3KycDocumentsProps {
  onNext: (data: Partial<ProviderApplication>) => void;
  onPrevious: () => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
  userUid: string;
  isEditModeByAdmin?: boolean;
  enableDefaultIndianKyc?: boolean;
}

export default function Step3KycDocuments({
  onNext,
  onPrevious,
  initialData,
  controlOptions,
  isSaving, 
  userUid,
  isEditModeByAdmin = false,
  enableDefaultIndianKyc = true,
}: Step3KycDocumentsProps) {
  const { toast } = useToast();
  const [isFormBusy, setIsFormBusy] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const schema = useMemo(() => {
    return enableDefaultIndianKyc
      ? z.object({
          aadhaarNumber: z.string().trim().regex(/^[2-9]{1}[0-9]{3}[0-9]{4}[0-9]{4}$/, "Invalid Aadhaar number (12 digits, not starting with 0/1)."),
          panNumber: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format (e.g., ABCDE1234F)."),
        })
      : z.object({
          aadhaarNumber: z.string().optional().or(z.literal('')),
          panNumber: z.string().optional().or(z.literal('')),
        });
  }, [enableDefaultIndianKyc]);

  const form = useForm<Step3FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      aadhaarNumber: initialData.aadhaar?.docNumber || "",
      panNumber: initialData.pan?.docNumber || "",
    },
  });

  const [aadhaarFront, setAadhaarFront] = useState<FileUploadState>({ file: null, previewUrl: initialData.aadhaar?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.frontImageUrl, originalFileName: initialData.aadhaar?.frontImageFileName });
  const [aadhaarBack, setAadhaarBack] = useState<FileUploadState>({ file: null, previewUrl: initialData.aadhaar?.backImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.backImageUrl, originalFileName: initialData.aadhaar?.backImageFileName });
  const [panFront, setPanFront] = useState<FileUploadState>({ file: null, previewUrl: initialData.pan?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.pan?.frontImageUrl, originalFileName: initialData.pan?.frontImageFileName });
  
  const [additionalDocsData, setAdditionalDocumentsData] = useState<Record<string, { docNumber?: string, front: FileUploadState, back?: FileUploadState }>>({});

  const activeAdditionalDocTypes = useMemo(() => {
    return controlOptions?.additionalDocTypes?.filter(opt => opt.isActive) || [];
  }, [controlOptions]);

  // Load from Local Storage on mount
  useEffect(() => {
    if (isEditModeByAdmin || !userUid) return;
    const userStorageKey = `${STORAGE_KEY}_${userUid}`;
    const saved = localStorage.getItem(userStorageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        form.reset({ ...initialData, ...data });
      } catch (e) {
        console.error("Error restoring Step 3 from storage:", e);
      }
    }
  }, [initialData, form, userUid, isEditModeByAdmin]);

  // Reset form and states when initialData changes (critical for admin switching providers)
  useEffect(() => {
    form.reset({
      aadhaarNumber: initialData.aadhaar?.docNumber || "",
      panNumber: initialData.pan?.docNumber || "",
    });
    setAadhaarFront({ file: null, previewUrl: initialData.aadhaar?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.frontImageUrl, originalFileName: initialData.aadhaar?.frontImageFileName });
    setAadhaarBack({ file: null, previewUrl: initialData.aadhaar?.backImageUrl || null, uploadProgress: null, existingUrl: initialData.aadhaar?.backImageUrl, originalFileName: initialData.aadhaar?.backImageFileName });
    setPanFront({ file: null, previewUrl: initialData.pan?.frontImageUrl || null, uploadProgress: null, existingUrl: initialData.pan?.frontImageUrl, originalFileName: initialData.pan?.frontImageFileName });
  }, [initialData, form]);

  // Auto-save to Local Storage on change
  useEffect(() => {
    if (isEditModeByAdmin || !userUid) return;
    const subscription = form.watch((value) => {
      const userStorageKey = `${STORAGE_KEY}_${userUid}`;
      localStorage.setItem(userStorageKey, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form, userUid, isEditModeByAdmin]);

  useEffect(() => {
    const initialAddDocs: typeof additionalDocsData = {};
    activeAdditionalDocTypes.forEach(type => {
      const existing = initialData.additionalDocuments?.find(d => d.docType === type.id);
      initialAddDocs[type.id] = {
        docNumber: existing?.docNumber || "",
        front: { file: null, previewUrl: existing?.frontImageUrl || null, uploadProgress: null, existingUrl: existing?.frontImageUrl, originalFileName: existing?.frontImageFileName },
        back: type.imageCount === 2 ? { file: null, previewUrl: existing?.backImageUrl || null, uploadProgress: null, existingUrl: existing?.backImageUrl, originalFileName: existing?.backImageFileName } : undefined
      };
    });
    setAdditionalDocumentsData(initialAddDocs);
  }, [activeAdditionalDocTypes, initialData.additionalDocuments]);

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (update: (prev: FileUploadState) => FileUploadState) => void
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Image must be < 50MB.", variant: "destructive" });
        e.target.value = ""; return;
      }
      setter(prev => ({ ...prev, file: file, previewUrl: URL.createObjectURL(file), uploadProgress: null, originalFileName: file.name }));
    }
  };

  const handleAdditionalDocFileChange = (typeId: string, side: 'front' | 'back', file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Image must be < 50MB.", variant: "destructive" });
      return;
    }
    setAdditionalDocumentsData(prev => {
      const current = prev[typeId];
      const sideState = side === 'front' ? current.front : current.back;
      return {
        ...prev,
        [typeId]: {
          ...current,
          [side]: { ...sideState, file, previewUrl: URL.createObjectURL(file), uploadProgress: null, originalFileName: file.name }
        }
      };
    });
  };

  const handleRemoveFile = (setter: (update: (prev: FileUploadState) => FileUploadState) => void) => {
    setter(prev => {
      if (prev.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl);
      return { ...prev, file: null, previewUrl: null, uploadProgress: null, originalFileName: null };
    });
  };

  const handleRemoveAdditionalDocFile = (typeId: string, side: 'front' | 'back') => {
    setAdditionalDocumentsData(prev => {
      const current = prev[typeId];
      const sideState = side === 'front' ? current.front : current.back;
      if (sideState?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(sideState.previewUrl);
      return {
        ...prev,
        [typeId]: {
          ...current,
          [side]: { ...sideState, file: null, previewUrl: null, uploadProgress: null, originalFileName: null }
        }
      };
    });
  };

  const uploadFile = async (
    fileState: FileUploadState,
    storagePath: string,
    onProgress: (p: number) => void
  ): Promise<{ url: string | null; fileName: string | null }> => {
    if (!fileState.file) {
      if (!fileState.previewUrl && fileState.existingUrl && isFirebaseStorageUrl(fileState.existingUrl)) {
        try { await deleteObject(storageRefStandard(storage, fileState.existingUrl)); }
        catch (e) { console.warn("Deletion failed", e); }
        return { url: null, fileName: null };
      }
      return { url: fileState.existingUrl || null, fileName: fileState.originalFileName || null };
    }

    const file = fileState.file;
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const finalPath = `${storagePath}_${generateRandomHexString(8)}.${extension}`;
    const fileRef = storageRefStandard(storage, finalPath);

    if (fileState.existingUrl && isFirebaseStorageUrl(fileState.existingUrl)) {
      try { await deleteObject(storageRefStandard(storage, fileState.existingUrl)); }
      catch (e) { console.warn("Old file cleanup failed", e); }
    }

    const uploadTask = uploadBytesResumable(fileRef, file);
    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
        (error) => reject(error),
        async () => {
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ url, fileName: file.name });
          } catch (e) { reject(e); }
        }
      );
    });
  };

  const handleSubmit = async (data: Step3FormData) => {
    const errors: string[] = [];
    
    if (enableDefaultIndianKyc) {
      if (!aadhaarFront.file && !aadhaarFront.previewUrl) errors.push("Aadhaar Front Image");
      if (!aadhaarBack.file && !aadhaarBack.previewUrl) errors.push("Aadhaar Back Image");
      if (!panFront.file && !panFront.previewUrl) errors.push("PAN Card Front Image");
    }

    activeAdditionalDocTypes.forEach(type => {
      const docData = additionalDocsData[type.id];
      const docNumber = docData?.docNumber || "";
      const isFilling = docNumber.trim() !== "" || docData?.front.file || docData?.front.previewUrl;

      if (type.isRequired || isFilling) {
        if (!docData?.front.file && !docData?.front.previewUrl) errors.push(`${type.label} Front Image`);
        if (type.imageCount === 2 && !docData?.back?.file && !docData?.back?.previewUrl) errors.push(`${type.label} Back Image`);

        if (type.docNumberMinLength && docNumber.length < type.docNumberMinLength) {
            errors.push(`${type.label} Number (Min ${type.docNumberMinLength} chars)`);
        }
        if (type.docNumberMaxLength && docNumber.length > type.docNumberMaxLength) {
            errors.push(`${type.label} Number (Max ${type.docNumberMaxLength} chars)`);
        }
        if (type.docNumberType === 'numeric' && !/^\d*$/.test(docNumber)) {
            errors.push(`${type.label} Number must be digits only`);
        }
        if (type.docNumberType === 'alphabetic' && !/^[a-zA-Z]*$/.test(docNumber)) {
            errors.push(`${type.label} Number must be alphabets only`);
        }
        if (type.docNumberType === 'alphanumeric' && !/^[a-zA-Z0-9]*$/.test(docNumber)) {
            errors.push(`${type.label} Number must be alphanumeric`);
        }
      }
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      toast({ title: "Validation Error", description: "Please correct the highlighted fields to proceed.", variant: "destructive" });
      return;
    }

    setIsFormBusy(true);
    setValidationErrors([]);

    try {
      const [frontAadhaar, backAadhaar, frontPan] = await Promise.all([
        (enableDefaultIndianKyc || aadhaarFront.file)
          ? uploadFile(aadhaarFront, `provider_documents/${userUid}/aadhaar_front`, p => setAadhaarFront(prev => ({...prev, uploadProgress: p})))
          : Promise.resolve({ url: aadhaarFront.existingUrl || null, fileName: aadhaarFront.originalFileName || null }),
        (enableDefaultIndianKyc || aadhaarBack.file)
          ? uploadFile(aadhaarBack, `provider_documents/${userUid}/aadhaar_back`, p => setAadhaarBack(prev => ({...prev, uploadProgress: p})))
          : Promise.resolve({ url: aadhaarBack.existingUrl || null, fileName: aadhaarBack.originalFileName || null }),
        (enableDefaultIndianKyc || panFront.file)
          ? uploadFile(panFront, `provider_documents/${userUid}/pan_front`, p => setPanFront(prev => ({...prev, uploadProgress: p})))
          : Promise.resolve({ url: panFront.existingUrl || null, fileName: panFront.originalFileName || null })
      ]);

      const additionalDocuments: KycDocument[] = [];
      for (const type of activeAdditionalDocTypes) {
        const docData = additionalDocsData[type.id];
        if (docData) {
          const [front, back] = await Promise.all([
            uploadFile(docData.front, `provider_documents/${userUid}/${type.id}_front`, p => setAdditionalDocumentsData(prev => ({
              ...prev, [type.id]: { ...prev[type.id], front: { ...prev[type.id].front, uploadProgress: p } }
            }))),
            docData.back ? uploadFile(docData.back, `provider_documents/${userUid}/${type.id}_back`, p => setAdditionalDocumentsData(prev => ({
              ...prev, [type.id]: { ...prev[type.id], back: { ...prev[type.id].back!, uploadProgress: p } }
            }))) : Promise.resolve({url: null, fileName: null})
          ]);

          if (front.url || back.url || docData.docNumber) {
            additionalDocuments.push({
              docType: type.id,
              docLabel: type.label,
              docNumber: docData.docNumber || "",
              frontImageUrl: front.url || undefined,
              frontImageFileName: front.fileName || undefined,
              backImageUrl: back.url || undefined,
              backImageFileName: back.fileName || undefined,
              verified: false,
            });
          }
        }
      }

      onNext({
        aadhaar: (enableDefaultIndianKyc || frontAadhaar.url) ? { docType: 'aadhaar', docNumber: data.aadhaarNumber || "", frontImageUrl: frontAadhaar.url || "", backImageUrl: backAadhaar.url || "", verified: initialData.aadhaar?.verified || false, frontImageFileName: frontAadhaar.fileName || undefined, backImageFileName: backAadhaar.fileName || undefined } : undefined,
        pan: (enableDefaultIndianKyc || frontPan.url) ? { docType: 'pan', docNumber: data.panNumber || "", frontImageUrl: frontPan.url || "", verified: initialData.pan?.verified || false, frontImageFileName: frontPan.fileName || undefined } : undefined,
        additionalDocuments
      });

    } catch (error) {
      toast({ title: "Upload Failed", description: "An error occurred while uploading documents. Please try again.", variant: "destructive" });
    } finally {
      setIsFormBusy(false);
    }
  };

  const renderUploadBox = (
    label: string, 
    fileState: FileUploadState, 
    onFileSelect: (f: File) => void, 
    onRemove: () => void,
    isRequired = false
  ) => {
    const hasError = validationErrors.some(e => e.includes(label));
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <Label className={cn("text-xs font-semibold", hasError && "text-destructive")}>
            {label} {isRequired && <span className="text-destructive">*</span>}
          </Label>
          {hasError && <Badge variant="destructive" className="h-4 px-1 text-[10px] animate-pulse">REQUIRED</Badge>}
        </div>
        
        <div 
          onClick={() => !isFormBusy && !isSaving && document.getElementById(`input-${label}`)?.click()}
          className={cn(
            "relative aspect-[3/2] rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden",
            hasError ? "border-destructive bg-destructive/5" : "border-muted-foreground/25 hover:border-primary/50 bg-muted/30"
          )}
        >
          {fileState.previewUrl ? (
            <>
              <NextImage src={fileState.previewUrl} alt={label} fill className="object-contain p-1" unoptimized={fileState.previewUrl.startsWith('blob:')} />
              <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                <Camera className="h-8 w-8 text-white" />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Camera className={cn("h-10 w-10", hasError ? "text-destructive" : "text-muted-foreground")} />
              {hasError && <AlertCircle className="h-5 w-5 text-destructive animate-bounce" />}
            </div>
          )}
          
          {fileState.uploadProgress !== null && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-4">
              <Loader2 className="h-8 w-8 text-white animate-spin mb-2" />
              <Progress value={fileState.uploadProgress} className="h-1.5 w-full bg-white/20" />
              <span className="text-[10px] text-white mt-1 font-bold">{Math.round(fileState.uploadProgress)}%</span>
            </div>
          )}
        </div>

        <input 
          id={`input-${label}`}
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={async (e) => {
            if (e.target.files?.[0]) {
              const file = e.target.files[0];
              let fileToSet = file;
              try {
                fileToSet = await compressImage(file);
              } catch (err) {
                console.error("Compression failed", err);
              }
              onFileSelect(fileToSet);
            }
          }}
          disabled={isFormBusy || isSaving}
        />

        <div className="flex items-center gap-2">
          <Button 
            type="button" 
            variant={hasError ? "destructive" : "outline"} 
            size="sm" 
            className="h-8 text-[10px]"
            onClick={() => document.getElementById(`input-${label}`)?.click()}
            disabled={isFormBusy || isSaving}
          >
            Choose File
          </Button>
          {(fileState.file || fileState.previewUrl) && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-[10px] text-destructive" onClick={onRemove} disabled={isFormBusy || isSaving}>
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
        <Card className="border-none shadow-none">
          <CardHeader className="px-0"><CardTitle className="text-xl">KYC Documents</CardTitle></CardHeader>
          <CardContent className="px-0 space-y-8">
            {enableDefaultIndianKyc && (
              <>
                <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
                  <h3 className="font-bold flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary"/> Aadhaar Details</h3>
                  <FormField control={form.control} name="aadhaarNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Aadhaar Number *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="XXXX XXXX XXXX" 
                          {...field} 
                          maxLength={12} 
                          onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ''))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderUploadBox("Aadhaar Front", aadhaarFront, f => setAadhaarFront(prev => ({...prev, file: f, previewUrl: URL.createObjectURL(f), originalFileName: f.name})), () => handleRemoveFile(setAadhaarFront), true)}
                    {renderUploadBox("Aadhaar Back", aadhaarBack, f => setAadhaarBack(prev => ({...prev, file: f, previewUrl: URL.createObjectURL(f), originalFileName: f.name})), () => handleRemoveFile(setAadhaarBack), true)}
                  </div>
                </div>

                <div className="space-y-4 p-4 border rounded-lg bg-muted/10">
                  <h3 className="font-bold flex items-center gap-2"><ImageIcon className="h-5 w-5 text-primary"/> PAN Details</h3>
                  <FormField control={form.control} name="panNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>PAN Number *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="ABCDE1234F" 
                          {...field} 
                          style={{textTransform:'uppercase'}} 
                          onChange={(e) => field.onChange(e.target.value.toUpperCase().replace(/\s/g, ''))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {renderUploadBox("PAN Card Front", panFront, f => setPanFront(prev => ({...prev, file: f, previewUrl: URL.createObjectURL(f), originalFileName: f.name})), () => handleRemoveFile(setPanFront), true)}
                  </div>
                </div>
              </>
            )}

            {activeAdditionalDocTypes.length > 0 && (
              <div className="space-y-6">
                <h3 className="font-bold text-lg flex items-center gap-2"><PlusCircle className="h-5 w-5 text-primary"/> {enableDefaultIndianKyc ? "Additional Documents" : "Identity Verification Documents"}</h3>
                {activeAdditionalDocTypes.map(type => {
                  const docState = additionalDocsData[type.id];
                  if (!docState) return null;
                  
                  const numberError = validationErrors.find(e => e.includes(`${type.label} Number`));

                  return (
                    <div key={type.id} className="space-y-4 p-4 border rounded-lg bg-primary/5">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-bold text-primary">{type.label} {type.isRequired && '*'}</Label>
                        {type.isRequired && <Badge className="bg-primary/20 text-primary border-primary/30">Mandatory</Badge>}
                      </div>
                      {type.description && <p className="text-xs text-muted-foreground">{type.description}</p>}
                      
                      <FormItem>
                        <FormLabel className={cn(numberError && "text-destructive")}>Document Number {type.isRequired && '*'}</FormLabel>
                        <FormControl>
                            <Input 
                            placeholder={`Enter ${type.label} number`}
                            value={docState.docNumber}
                            onChange={e => setAdditionalDocumentsData(prev => ({...prev, [type.id]: {...prev[type.id], docNumber: e.target.value}}))}
                            disabled={isFormBusy || isSaving}
                            className={cn(numberError && "border-destructive focus-visible:ring-destructive")}
                            />
                        </FormControl>
                        {numberError && <p className="text-xs font-medium text-destructive">{numberError}</p>}
                        <FormDescription className="text-[10px]">
                            Type: <span className="capitalize">{type.docNumberType || 'any'}</span>
                            {type.docNumberMinLength ? ` | Min: ${type.docNumberMinLength}` : ''}
                            {type.docNumberMaxLength ? ` | Max: ${type.docNumberMaxLength}` : ''}
                        </FormDescription>
                      </FormItem>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {renderUploadBox(`${type.label} Front`, docState.front, f => handleAdditionalDocFileChange(type.id, 'front', f), () => handleRemoveAdditionalDocFile(type.id, 'front'), type.isRequired)}
                        {type.imageCount === 2 && renderUploadBox(`${type.label} Back`, docState.back!, f => handleAdditionalDocFileChange(type.id, 'back', f), () => handleRemoveAdditionalDocFile(type.id, 'back'), type.isRequired)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {validationErrors.length > 0 && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-destructive">Validation errors found:</p>
              <ul className="list-disc list-inside text-xs text-destructive/80 mt-1">
                {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          </div>
        )}

        <CardFooter className="flex justify-between px-0">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={isFormBusy || isSaving}>Previous</Button>
          <Button type="submit" disabled={isFormBusy || isSaving}>
            {isFormBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {isFormBusy ? "Uploading..." : "Save & Continue"}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}
