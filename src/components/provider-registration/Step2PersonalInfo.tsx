
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox"; 
import { Badge } from "@/components/ui/badge";
import type { ProviderApplication, ProviderControlOptions, LanguageOption, QualificationOption } from '@/types/firestore';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Loader2, User, Mail, Phone, MapPin, BookOpen, Languages, Camera, Image as ImageIcon, Trash2, AlertCircle, ArrowLeft, ChevronRight, Check } from "lucide-react";
import NextImage from 'next/image';
import { useToast } from "@/hooks/use-toast";
import { storage } from '@/lib/firebase';
import { compressImage } from "@/lib/imageCompressor";
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import { Progress } from "@/components/ui/progress";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = 'yourbrand_reg_step2';

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && (url.includes("firebasestorage.googleapis.com") || url.startsWith("/uploads/") || url.includes("uploads/"));
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};


const step2PersonalInfoSchema = z.object({
  fullName: z.string().min(2, "Full name is required.").max(100),
  email: z.string().email("Invalid email.").optional().or(z.literal('')),
  mobileNumber: z.string().min(10, "Valid mobile number required.").max(15).regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format."),
  address: z.string().min(5, "Address is required.").max(250),
  age: z.coerce.number().min(18, "Must be at least 18.").max(99, "Age seems incorrect."),
  qualificationId: z.string({ required_error: "Please select your qualification." }),
  alternateMobile: z.string().max(15).regex(/^\+?[1-9]\d{1,14}$/, "Invalid alternate phone format.").optional().or(z.literal('')),
  languagesSpokenIds: z.array(z.string()).min(1, "Select at least one language spoken.").max(5, "Select up to 5 languages."),
  profilePhotoUrl: z.string().optional().nullable(),
});

type Step2FormData = z.infer<typeof step2PersonalInfoSchema>;

interface Step2PersonalInfoProps {
  onNext: (data: Partial<ProviderApplication>, uploadedPhotoUrl?: string | null) => void;
  onPrevious: () => void;
  initialData: Partial<ProviderApplication>;
  controlOptions: ProviderControlOptions | null;
  isSaving: boolean;
  userUid: string;
  isEditModeByAdmin?: boolean;
}

export default function Step2PersonalInfo({
  onNext,
  onPrevious,
  initialData,
  controlOptions,
  isSaving,
  userUid,
  isEditModeByAdmin = false,
}: Step2PersonalInfoProps) {
  const { toast } = useToast();
  const { user, firestoreUser } = useAuth();
  const [currentImagePreview, setCurrentImagePreview] = useState<string | null>(initialData.profilePhotoUrl || null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [showPhotoError, setShowPhotoError] = useState(false);
  const [isQualificationDialogOpen, setIsQualificationDialogOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  const form = useForm<Step2FormData>({
    resolver: zodResolver(step2PersonalInfoSchema),
    defaultValues: {
      fullName: initialData?.fullName || firestoreUser?.displayName || user?.displayName || "",
      email: initialData?.email || firestoreUser?.email || user?.email || "",
      mobileNumber: initialData?.mobileNumber || firestoreUser?.mobileNumber || user?.phoneNumber || "",
      address: initialData?.address || "",
      age: initialData?.age ?? undefined, 
      qualificationId: initialData?.qualificationId || undefined,
      alternateMobile: initialData?.alternateMobile || "",
      languagesSpokenIds: initialData?.languagesSpokenIds || [],
      profilePhotoUrl: initialData?.profilePhotoUrl || null,
    },
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load from Local Storage on mount
  useEffect(() => {
    if (!isMounted || isEditModeByAdmin || !userUid) return;
    const userStorageKey = `${STORAGE_KEY}_${userUid}`;
    const saved = localStorage.getItem(userStorageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        form.reset({ ...form.getValues(), ...data });
        if (data.profilePhotoUrl) {
          setCurrentImagePreview(data.profilePhotoUrl);
        }
      } catch (e) {
        console.error("Error restoring Step 2 from storage:", e);
      }
    }
  }, [isMounted, form, userUid, isEditModeByAdmin]);

  // Auto-save to Local Storage on change
  useEffect(() => {
    if (isEditModeByAdmin || !userUid) return;
    const subscription = form.watch((value) => {
      const userStorageKey = `${STORAGE_KEY}_${userUid}`;
      localStorage.setItem(userStorageKey, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form, userUid, isEditModeByAdmin]);
  
  // Sync with initialData and firestoreUser for auto-fill
  useEffect(() => {
    if (!isMounted) return;

    const currentValues = form.getValues();
    // Only auto-fill if fields are currently empty (prevents overwriting user's active typing)
    const shouldFill = !currentValues.fullName && !currentValues.mobileNumber;

    if (isEditModeByAdmin || shouldFill || initialData?.fullName) {
        form.reset({
            fullName: initialData.fullName || firestoreUser?.displayName || user?.displayName || "",
            email: initialData.email || firestoreUser?.email || user?.email || "",
            mobileNumber: initialData.mobileNumber || firestoreUser?.mobileNumber || user?.phoneNumber || "",
            address: initialData.address || "",
            age: initialData.age ?? undefined, 
            qualificationId: initialData.qualificationId || undefined,
            alternateMobile: initialData.alternateMobile || "",
            languagesSpokenIds: initialData.languagesSpokenIds || [],
            profilePhotoUrl: initialData.profilePhotoUrl || null,
        });
        setCurrentImagePreview(initialData.profilePhotoUrl || null);
    }
  }, [initialData, firestoreUser, user, form, isMounted, isEditModeByAdmin]);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      if (file.size > 50 * 1024 * 1024) {
        toast({ title: "File Too Large", description: "Image must be < 50MB.", variant: "destructive" });
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedFile(null); setCurrentImagePreview(form.getValues('profilePhotoUrl') || initialData.profilePhotoUrl || null); return;
      }
      
      let fileToSet = file;
      try {
        fileToSet = await compressImage(file);
      } catch (err) {
        console.error("Compression failed, using original file", err);
      }

      setSelectedFile(fileToSet); 
      setCurrentImagePreview(URL.createObjectURL(fileToSet));
      form.setValue('profilePhotoUrl', null, { shouldValidate: false });
      setShowPhotoError(false);
    } else {
      setSelectedFile(null); setCurrentImagePreview(form.getValues('profilePhotoUrl') || initialData.profilePhotoUrl || null);
    }
  };

  const handleRemoveImage = () => {
    if (selectedFile && currentImagePreview?.startsWith('blob:')) URL.revokeObjectURL(currentImagePreview);
    setSelectedFile(null); setCurrentImagePreview(null);
    form.setValue('profilePhotoUrl', null, { shouldValidate: true });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (data: Step2FormData) => {
    // If we have no new file, and preview was cleared, and there was no initial photo
    if (!selectedFile && !currentImagePreview) {
        setShowPhotoError(true);
        toast({ title: "Profile Photo Required", description: "Please upload your passport size profile photo to continue.", variant: "destructive" });
        return;
    }

    let finalPhotoUrl = initialData.profilePhotoUrl || null;

    if (selectedFile) {
      setStatusMessage("Uploading profile photo..."); setUploadProgress(0);
      try {
        if (initialData.profilePhotoUrl && isFirebaseStorageUrl(initialData.profilePhotoUrl)) {
          try { await deleteObject(storageRefStandard(storage, initialData.profilePhotoUrl)); }
          catch (e) { console.warn("Old profile photo not deleted:", e); }
        }

        const extension = selectedFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const randomString = generateRandomHexString(8);
        const fileName = `profile_photo_${randomString}.${extension}`;
        const imagePath = `provider_profiles/${userUid}/${fileName}`;
        const imageRef = storageRefStandard(storage, imagePath);
        const uploadTask = uploadBytesResumable(imageRef, selectedFile);

        finalPhotoUrl = await new Promise<string>((resolve, reject) => {
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(error),
            async () => { try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (e) { reject(e); } }
          );
        });
        setStatusMessage("Photo uploaded.");
      } catch (uploadError) {
        toast({ title: "Photo Upload Failed", description: (uploadError as Error).message || "Could not upload photo.", variant: "destructive" });
        setStatusMessage(""); setUploadProgress(null); return; 
      }
    } else if (!currentImagePreview && initialData.profilePhotoUrl && isFirebaseStorageUrl(initialData.profilePhotoUrl)) {
        setStatusMessage("Removing profile photo...");
        try { 
          await deleteObject(storageRefStandard(storage, initialData.profilePhotoUrl)); 
          finalPhotoUrl = null; 
        }
        catch (e) { console.warn("Old profile photo not deleted:", e); }
        setStatusMessage("Photo removed.");
    }
    
    const qualification = controlOptions?.qualificationOptions.find(q => q.id === data.qualificationId);
    const languages = controlOptions?.languageOptions.filter(lang => data.languagesSpokenIds.includes(lang.id));

    const applicationStepData: Partial<ProviderApplication> = {
      ...data,
      age: Number(data.age) || undefined, 
      profilePhotoUrl: (finalPhotoUrl as string | undefined) || undefined,
      qualificationLabel: qualification?.label,
      languagesSpokenLabels: languages?.map(l => l.label),
    };
    onNext(applicationStepData, finalPhotoUrl);
  };

  const displayPreviewUrl = isValidImageSrc(currentImagePreview) ? currentImagePreview : null;
  const effectiveIsSaving = isSaving || statusMessage.startsWith("Uploading");


  if (!controlOptions) {
    return <Card><CardContent className="pt-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /> Loading options...</CardContent></Card>;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <CardContent className="space-y-6">
          <FormField control={form.control} name="fullName" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center"><User className="mr-2 h-4 w-4 text-muted-foreground"/>Full Name <span className="text-destructive ml-1">*</span></FormLabel>
              <FormControl><Input placeholder="Your full name" {...field} disabled={effectiveIsSaving}/></FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField control={form.control} name="email" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center"><Mail className="mr-2 h-4 w-4 text-muted-foreground"/>Email (Optional)</FormLabel>
              <FormControl><Input type="email" placeholder="your.email@example.com" {...field} disabled={effectiveIsSaving} /></FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField control={form.control} name="mobileNumber" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Mobile Number <span className="text-destructive ml-1">*</span></FormLabel>
              <FormControl><Input type="tel" placeholder="+91 XXXXX XXXXX" {...field} disabled={effectiveIsSaving} /></FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField control={form.control} name="address" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center"><MapPin className="mr-2 h-4 w-4 text-muted-foreground"/>Current Address <span className="text-destructive ml-1">*</span></FormLabel>
              <FormControl><Textarea placeholder="Your full residential address" {...field} rows={3} disabled={effectiveIsSaving}/></FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          <FormField 
            control={form.control} 
            name="age" 
            render={({ field }) => {
              const inputValue = field.value === undefined || field.value === null ? '' : String(field.value);
              return (
                <FormItem>
                  <FormLabel>Age <span className="text-destructive ml-1">*</span></FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="e.g., 25" 
                      {...field} 
                      value={inputValue}
                      onChange={(e) => {
                        field.onChange(e.target.value === '' ? null : e.target.value); 
                      }}
                      disabled={effectiveIsSaving}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          <FormField
            control={form.control}
            name="qualificationId"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel className="flex items-center"><BookOpen className="mr-2 h-4 w-4 text-muted-foreground"/>Highest Qualification <span className="text-destructive ml-1">*</span></FormLabel>
                <Dialog open={isQualificationDialogOpen} onOpenChange={setIsQualificationDialogOpen}>
                  <DialogTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-between h-11 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                        disabled={effectiveIsSaving}
                      >
                        <span className="truncate">
                          {field.value
                            ? controlOptions.qualificationOptions.find((opt) => opt.id === field.value)?.label
                            : "Select your qualification"}
                        </span>
                        <ChevronRight className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </FormControl>
                  </DialogTrigger>
                  <DialogContent className="p-0 max-w-[90vw] sm:max-w-md">
                    <DialogHeader className="p-4 border-b">
                      <DialogTitle>Select Qualification</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="h-72">
                      <div className="p-2 space-y-1">
                        {controlOptions.qualificationOptions.map((opt) => (
                          <Button
                            key={opt.id}
                            variant="ghost"
                            className="w-full justify-between font-normal h-11 px-3"
                            onClick={() => {
                              field.onChange(opt.id);
                              setIsQualificationDialogOpen(false);
                            }}
                          >
                            <span>{opt.label}</span>
                            {field.value === opt.id && <Check className="h-4 w-4 text-primary" />}
                          </Button>
                        ))}
                      </div>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField control={form.control} name="alternateMobile" render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center"><Phone className="mr-2 h-4 w-4 text-muted-foreground"/>Alternate Mobile (Optional)</FormLabel>
              <FormControl><Input type="tel" placeholder="+91 XXXXX XXXXX" {...field} disabled={effectiveIsSaving}/></FormControl>
              <FormMessage />
            </FormItem>
          )}/>
          
          <FormItem>
            <FormLabel className="flex items-center"><Languages className="mr-2 h-4 w-4 text-muted-foreground"/>Languages Spoken (Select at least one) <span className="text-destructive ml-1">*</span></FormLabel>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2 border rounded-md max-h-40 overflow-y-auto">
              {controlOptions.languageOptions.map((language) => (
                <FormField key={language.id} control={form.control} name="languagesSpokenIds"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-2 space-y-0 p-1.5 rounded hover:bg-accent/50">
                      <FormControl>
                        <Checkbox
                          checked={field.value?.includes(language.id)}
                          onCheckedChange={(checked) => {
                            return checked
                              ? field.onChange([...(field.value || []), language.id])
                              : field.onChange((field.value || []).filter((id) => id !== language.id));
                          }}
                          disabled={effectiveIsSaving}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">{language.label}</FormLabel>
                    </FormItem>
                  )}
                />
              ))}
            </div>
             <FormMessage>{form.formState.errors.languagesSpokenIds?.message}</FormMessage>
          </FormItem>

          <div className="space-y-3 mt-4">
            <div className="flex justify-between items-center">
              <FormLabel className={cn("flex items-center", showPhotoError && "text-destructive")}>
                <Camera className="mr-2 h-4 w-4" />Passport Size Profile Photo <span className="text-destructive ml-1">*</span>
              </FormLabel>
            </div>
            <FormDescription className="text-[11px] text-muted-foreground leading-normal mb-2">
              Please upload a clear, professional passport-size photo. Do not upload selfies, casual photos, group photos, or pictures with filters. The photo should show your face clearly facing forward against a plain light background.
            </FormDescription>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[460px] mx-auto w-full">
              {/* Left: Upload Box */}
              <div className="flex flex-col space-y-1 max-w-[180px] mx-auto w-full">
                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-between w-full">
                  <span>Your Photo</span>
                  {showPhotoError && <Badge variant="destructive" className="h-4 px-1.5 text-[10px] animate-pulse">REQUIRED</Badge>}
                </div>
                <div 
                  onClick={() => !effectiveIsSaving && fileInputRef.current?.click()}
                  className={cn(
                    "relative aspect-square w-full max-w-[180px] mx-auto rounded-lg border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer overflow-hidden shadow-sm",
                    showPhotoError ? "border-destructive bg-destructive/5 animate-pulse" : "border-muted-foreground/25 hover:border-primary/50 bg-muted/30"
                  )}
                >
                  {displayPreviewUrl ? (
                    <>
                      <NextImage src={displayPreviewUrl} alt="Profile preview" fill className="object-cover" unoptimized={displayPreviewUrl.startsWith('blob:')} sizes="180px"/>
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Camera className="h-6 w-6 text-white" />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Camera className={cn("h-8 w-8", showPhotoError ? "text-destructive" : "text-muted-foreground")} />
                      {showPhotoError && <AlertCircle className="h-5 w-5 text-destructive animate-bounce" />}
                      <span className={cn("text-[9px] font-bold", showPhotoError ? "text-destructive" : "text-muted-foreground")}>CLICK TO UPLOAD</span>
                    </div>
                  )}
                  
                  {uploadProgress !== null && selectedFile && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-2">
                      <Loader2 className="h-5 w-5 text-white animate-spin mb-1" />
                      <Progress value={uploadProgress} className="h-1 w-10/12 bg-white/20" />
                      <span className="text-[9px] text-white mt-1 font-bold">{Math.round(uploadProgress)}%</span>
                    </div>
                  )}
                </div>

                <FormControl>
                  <Input 
                    type="file" 
                    accept="image/png, image/jpeg, image/webp" 
                    onChange={handleFileSelected} 
                    ref={fileInputRef} 
                    className="hidden" 
                    disabled={effectiveIsSaving}
                  />
                </FormControl>

                <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                  <span>Max size: 50MB</span>
                  {(displayPreviewUrl || selectedFile) && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage} disabled={effectiveIsSaving} className="text-[10px] h-6 px-1.5 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3 w-3 mr-1" />Remove
                    </Button>
                  )}
                </div>
              </div>

              {/* Right: Example Box */}
              <div className="flex flex-col space-y-1 max-w-[180px] mx-auto w-full">
                <div className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" /> Example / Demo
                </div>
                <div className="relative aspect-square w-full max-w-[180px] mx-auto rounded-lg border border-border/70 bg-background flex flex-col items-center justify-center overflow-hidden transition-all shadow-sm">
                  <NextImage src="/sample-passport.png" alt="Sample passport photo" fill className="object-cover" />
                </div>
                <span className="text-[10px] text-muted-foreground text-center">Formal Passport Size</span>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button type="button" variant="outline" onClick={onPrevious} disabled={effectiveIsSaving}>Previous</Button>
          <Button type="submit" disabled={effectiveIsSaving}>
            {effectiveIsSaving && !statusMessage.startsWith("Uploading") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             {statusMessage && statusMessage.startsWith("Uploading") ? statusMessage : effectiveIsSaving ? "Saving..." : "Save & Continue"}
          </Button>
        </CardFooter>
      </form>
    </Form>
  );
}
