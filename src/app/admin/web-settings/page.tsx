"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; 
import { Label } from "@/components/ui/label";
import { Settings2, Save, Loader2, AlertTriangle, Building, Image as ImageIcon, FileText, ExternalLink, Trash2, Facebook, Instagram, Linkedin, Youtube, TwitterIcon, Heading1, Heading2, Bold, List, Link as LinkIcon, Type, ImagePlus, Copy, Check, Pilcrow, LayoutDashboard, Plus, Trash, Search, Tags, CheckCircle } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, query, orderBy, onSnapshot } from '@/lib/mysqlDb';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { ref as storageRefStandard, uploadBytesResumable, getDownloadURL, deleteObject } from '@/lib/mysqlStorage';
import type { GlobalWebSettings, ContentPage } from '@/types/firestore';
import NextImage from 'next/image';
import { Progress } from '@/components/ui/progress';
import { compressImage } from "@/lib/imageCompressor";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import PermissionGuard from '@/components/admin/PermissionGuard';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const CONTENT_PAGES_COLLECTION = "contentPages";

const generateRandomHexString = (length: number) => Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
const isFirebaseStorageUrl = (url: string | null | undefined): boolean => !!url && typeof url === 'string' && url.trim().length > 0;
const isValidImageSrc = (url: string | null | undefined): url is string => {
    if (!url || url.trim() === '') return false;
    return url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('/');
};


const generalInfoSchema = z.object({
  websiteName: z.string().min(2, "Website name is too short.").max(50, "Website name is too long.").optional().or(z.literal('')),
  contactEmail: z.string().email("Invalid email address.").optional().or(z.literal('')),
  contactMobile: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone format.").optional().or(z.literal('')),
  address: z.string().max(200, "Address is too long.").optional().or(z.literal('')),
  timezone: z.string().optional().or(z.literal('')),
  logoImageHint: z.string().max(50, { message: "Hint should be max 50 characters."}).optional().or(z.literal('')),
  websiteIconImageHint: z.string().max(50, { message: "Hint should be max 50 characters."}).optional().or(z.literal('')),
});
type GeneralInfoFormData = z.infer<typeof generalInfoSchema>;

const contentPageSchema = z.object({
  title: z.string().min(2, "Title is too short.").max(100, "Title is too long."),
  content: z.string().optional().or(z.literal('')),
  imageUrl: z.string().optional().or(z.literal('')),
  imageHint: z.string().max(50).optional().or(z.literal('')),
});
type ContentPageFormData = z.infer<typeof contentPageSchema>;

const socialMediaLinksSchema = z.object({
    facebook: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    instagram: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    twitter: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    linkedin: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
    youtube: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
});
type SocialMediaLinksFormData = z.infer<typeof socialMediaLinksSchema>;

const homepageContentSchema = z.object({
  whyChooseUs: z.array(z.object({
    id: z.string(),
    title: z.string().min(1, "Title is required"),
    description: z.string().min(1, "Description is required"),
    iconName: z.string().min(1, "Icon name is required"),
  })),
  footerCompanyBio: z.string().optional().or(z.literal('')),
  footerCTA: z.object({
    title: z.string().min(1, "Title is required"),
    subtitle: z.string().optional().or(z.literal('')),
    buttonText: z.string().min(1, "Button text is required"),
    buttonLink: z.string().min(1, "Button link is required"),
  }),
});
type HomepageContentFormData = z.infer<typeof homepageContentSchema>;


const knownPageSlugs = ["about-us", "contact-us", "careers", "terms-and-conditions", "privacy-policy", "faq", "service-disclaimer", "cancellation-policy", "damage-and-claims-policy"];
const pageDisplayNames: Record<string, string> = {
  "about-us": "About Us",
  "contact-us": "Contact Us",
  "careers": "Careers",
  "terms-and-conditions": "Terms and Conditions",
  "privacy-policy": "Privacy Policy",
  "faq": "FAQ",
  "service-disclaimer": "Service Disclaimer",
  "cancellation-policy": "Cancellation Policy",
  "damage-and-claims-policy": "Damage & Claims Policy",
};


export default function WebSettingsPage() {
  const { config: appConfig } = useApplicationConfig();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  const [globalSettings, setGlobalSettings] = useState<GlobalWebSettings>({});
  const [originalGlobalSettings, setOriginalGlobalSettings] = useState<GlobalWebSettings>({});
  
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [websiteIconFile, setWebsiteIconFile] = useState<File | null>(null);
  
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [websiteIconPreview, setWebsiteIconPreview] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState<Record<string, number | null>>({});

  const [contentPages, setContentPages] = useState<ContentPage[]>([]);
  const [selectedPageSlug, setSelectedPageSlug] = useState<string>(knownPageSlugs[0]);
  const [isPagePickerOpen, setIsPagePickerOpen] = useState(false);
  const [pageSearch, setPageSearch] = useState("");

  const selectedPage = useMemo(() => {
    return contentPages.find(p => p.slug === selectedPageSlug);
  }, [contentPages, selectedPageSlug]);

  const searchablePages = useMemo(() => {
    return contentPages.filter(p => p.title.toLowerCase().includes(pageSearch.toLowerCase()));
  }, [contentPages, pageSearch]);

  const [isSavingContent, setIsSavingContent] = useState(false);

  // Content Asset Management
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const [assetUploadProgress, setAssetUploadProgress] = useState<number | null>(null);
  const [lastUploadedAssetUrl, setLastUploadedAssetUrl] = useState<string | null>(null);
  const contentAssetInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Specific Content Page Image
  const [pageImageFile, setPageImageFile] = useState<File | null>(null);
  const [pageImagePreview, setPageImagePreview] = useState<string | null>(null);
  const [pageImageUploadProgress, setPageImageUploadProgress] = useState<number | null>(null);
  const pageImageInputRef = useRef<HTMLInputElement>(null);

  const generalInfoForm = useForm<GeneralInfoFormData>({
    resolver: zodResolver(generalInfoSchema),
    defaultValues: { 
      websiteName: "", 
      contactEmail: "", 
      contactMobile: "", 
      address: "",
      logoImageHint: "",
      websiteIconImageHint: "",
    },
  });

  const contentPageForm = useForm<ContentPageFormData>({
    resolver: zodResolver(contentPageSchema),
    defaultValues: { title: "", content: "", imageUrl: "", imageHint: "" },
  });

  const socialMediaForm = useForm<SocialMediaLinksFormData>({
    resolver: zodResolver(socialMediaLinksSchema),
    defaultValues: {
        facebook: "",
        instagram: "",
        twitter: "",
        linkedin: "",
        youtube: "",
    },
  });

  const homepageContentForm = useForm<HomepageContentFormData>({
    resolver: zodResolver(homepageContentSchema),
    defaultValues: {
      whyChooseUs: [
        { id: '1', title: 'Trusted Professionals', iconName: 'Users', description: 'Experienced and background-verified experts.' },
        { id: '2', title: 'Timely Service', iconName: 'ClockIcon', description: 'We value your time and ensure punctuality.' },
        { id: '3', title: 'Verified Services', iconName: 'ShieldCheck', description: 'Quality assurance for all services provided.' },
        { id: '4', title: 'Transparent Pricing', iconName: 'Star', description: 'No hidden costs, clear and upfront pricing.' },
      ],
      footerCompanyBio: "Your trusted partner for professional home services. We bring skilled experts directly to your doorstep, ensuring quality, reliability, and peace of mind.",
      footerCTA: {
        title: "Ready to get started?",
        subtitle: "Book your service now and experience the best home maintenance.",
        buttonText: "Book a Service",
        buttonLink: "/categories",
      }
    }
  });

  // Media Storage Configuration
  const [storageDriver, setStorageDriver] = useState<'local' | 'remote'>('local');
  const [remoteUploadUrl, setRemoteUploadUrl] = useState<string>('');
  const [remoteSecretKey, setRemoteSecretKey] = useState<string>('');

  const loadGlobalSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as GlobalWebSettings;
        setGlobalSettings(data);
        setOriginalGlobalSettings(data);
        generalInfoForm.reset({
          websiteName: data.websiteName || "",
          contactEmail: data.contactEmail || "",
          contactMobile: data.contactMobile || "",
          address: data.address || "",
          logoImageHint: data.logoImageHint || "",
          websiteIconImageHint: data.websiteIconImageHint || "",
        });
        socialMediaForm.reset({
            facebook: data.socialMediaLinks?.facebook || "",
            instagram: data.socialMediaLinks?.instagram || "",
            twitter: data.socialMediaLinks?.twitter || "",
            linkedin: data.socialMediaLinks?.linkedin || "",
            youtube: data.socialMediaLinks?.youtube || "",
        });
        
        if (data.homepageContent) {
          homepageContentForm.reset({
            whyChooseUs: data.homepageContent.whyChooseUs || [],
            footerCompanyBio: data.homepageContent.footerCompanyBio || "",
            footerCTA: data.homepageContent.footerCTA || {
              title: "Ready to get started?",
              subtitle: "Book your service now and experience the best home maintenance.",
              buttonText: "Book a Service",
              buttonLink: "/categories",
            }
          });
        }
        setLogoPreview(data.logoUrl || null);
        setFaviconPreview(data.faviconUrl || null);
        setWebsiteIconPreview(data.websiteIconUrl || null);
      } else {
        generalInfoForm.reset({ websiteName: "", contactEmail: "", contactMobile: "", address: "", logoImageHint: "", websiteIconImageHint: "" });
        socialMediaForm.reset({ facebook: "", instagram: "", twitter: "", linkedin: "", youtube: "" });
        setLogoPreview(null); setFaviconPreview(null); setWebsiteIconPreview(null);
        setOriginalGlobalSettings({});
      }

      try {
        const storageSnap = await getDoc(doc(db, "webSettings", "storageConfiguration"));
        if (storageSnap.exists()) {
          const sData = storageSnap.data() as any;
          if (sData.driver) setStorageDriver(sData.driver);
          if (sData.remoteUploadUrl) setRemoteUploadUrl(sData.remoteUploadUrl);
          if (sData.remoteSecretKey) setRemoteSecretKey(sData.remoteSecretKey);
        }
      } catch (sErr) {
        console.warn("Error loading storage config:", sErr);
      }
    } catch (error) {
      console.error("Error loading global settings:", error);
      toast({ title: "Error", description: "Could not load global settings.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast, generalInfoForm, socialMediaForm]);

  const loadContentPages = useCallback(async () => {
     try {
      const q = query(collection(db, CONTENT_PAGES_COLLECTION), orderBy("title", "asc"));
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const pages: ContentPage[] = [];
        querySnapshot.forEach((doc) => {
          pages.push({ id: doc.id, ...doc.data() } as ContentPage);
        });
        setContentPages(pages);
        
        knownPageSlugs.forEach(async (slug) => {
          if (!pages.find(p => p.slug === slug)) {
            const newPageData: Omit<ContentPage, 'id'> = {
              slug: slug,
              title: pageDisplayNames[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              content: `Content for ${pageDisplayNames[slug] || slug} coming soon.`,
              updatedAt: Timestamp.now(),
            };
            try {
              await setDoc(doc(db, CONTENT_PAGES_COLLECTION, slug), newPageData);
            } catch (e) { console.error(`Error creating placeholder for ${slug}:`, e);}
          }
        });
      });
      return unsubscribe;
    } catch (error) {
      console.error("Error loading content pages:", error);
      toast({ title: "Error", description: "Could not load content pages.", variant: "destructive" });
    }
    return () => {};
  }, [toast]);

  useEffect(() => {
    loadGlobalSettings();
    const unsubscribeContentPages = loadContentPages();
    return () => {
      if (unsubscribeContentPages && typeof unsubscribeContentPages === 'function') {
        (unsubscribeContentPages as any)();
      }
    };
  }, [loadGlobalSettings, loadContentPages]);

  useEffect(() => {
    if (selectedPageSlug) {
      const pageData = contentPages.find(p => p.slug === selectedPageSlug);
      if (pageData) {
        contentPageForm.reset({ 
          title: pageData.title, 
          content: pageData.content, 
          imageUrl: pageData.imageUrl || "", 
          imageHint: pageData.imageHint || "" 
        });
        setPageImagePreview(pageData.imageUrl || null);
      } else {
        contentPageForm.reset({ 
            title: pageDisplayNames[selectedPageSlug] || selectedPageSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
            content: "", imageUrl: "", imageHint: "" 
        });
        setPageImagePreview(null);
      }
      setPageImageFile(null);
    }
  }, [selectedPageSlug, contentPages, contentPageForm]);


  const handleSaveGeneralInfo = async (data: GeneralInfoFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const updateData: Partial<GlobalWebSettings> = {
        websiteName: data.websiteName,
        contactEmail: data.contactEmail,
        contactMobile: data.contactMobile,
        address: data.address,
        logoImageHint: data.logoImageHint || "",
        websiteIconImageHint: data.websiteIconImageHint || "",
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, updateData, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      await triggerRefresh('sitemap');
      setGlobalSettings(prev => ({ ...prev, ...updateData }));
      setOriginalGlobalSettings(prev => ({...prev, ...updateData}));
      toast({ title: "Success", description: "General information saved." });
    } catch (error) {
      console.error("Error saving general info:", error);
      toast({ title: "Error", description: "Could not save general information.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (file: File, assetType: string, customPath?: string): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      const timestamp = Math.floor(Date.now() / 1000);
      const randomString = generateRandomHexString(8);
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${assetType}_${timestamp}_${randomString}.${extension}`;
      const filePath = customPath ? `${customPath}/${fileName}` : `public/uploads/${assetType === 'content_asset' ? 'page_content' : 'branding'}/${fileName}`;
      const fileRef = storageRefStandard(storage, filePath);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (assetType === 'content_asset') {
            setAssetUploadProgress(progress);
          } else if (assetType === 'page_banner') {
            setPageImageUploadProgress(progress);
          } else {
            setUploadProgress(prev => ({ ...prev, [assetType]: progress }));
          }
        },
        (error) => {
          console.error(`Error uploading ${assetType}:`, error);
          if (assetType === 'content_asset') {
            setAssetUploadProgress(null);
          } else if (assetType === 'page_banner') {
            setPageImageUploadProgress(null);
          } else {
            setUploadProgress(prev => ({ ...prev, [assetType]: null }));
          }
          reject(error);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            if (assetType === 'content_asset') {
                setAssetUploadProgress(null);
            } else if (assetType === 'page_banner') {
                setPageImageUploadProgress(null);
            } else {
                setUploadProgress(prev => ({ ...prev, [assetType]: null }));
            }
            resolve(downloadURL);
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };
  
  const handleSaveBrandingAsset = async (assetType: 'logo' | 'favicon' | 'websiteIcon') => {
    setIsSaving(true);
    setUploadProgress(prev => ({ ...prev, [assetType]: 0 }));

    let fileToUpload: File | null = null;
    let currentDbUrlKey: keyof GlobalWebSettings = 'logoUrl';
    let hintKey: keyof GeneralInfoFormData | null = null;
    
    let setPreviewState: React.Dispatch<React.SetStateAction<string | null>> = setLogoPreview;
    let setFileState: React.Dispatch<React.SetStateAction<File | null>> = setLogoFile;

    if (assetType === 'logo') {
      fileToUpload = logoFile; currentDbUrlKey = 'logoUrl'; hintKey = 'logoImageHint'; setPreviewState = setLogoPreview; setFileState = setLogoFile;
    } else if (assetType === 'favicon') {
      fileToUpload = faviconFile; currentDbUrlKey = 'faviconUrl'; setPreviewState = setFaviconPreview; setFileState = setFaviconFile;
    } else if (assetType === 'websiteIcon') {
      fileToUpload = websiteIconFile; currentDbUrlKey = 'websiteIconUrl'; hintKey = 'websiteIconImageHint'; setPreviewState = setWebsiteIconPreview; setFileState = setWebsiteIconFile;
    }

    const originalDbUrl = originalGlobalSettings[currentDbUrlKey] as string | undefined;
    const currentManualUrl = globalSettings[currentDbUrlKey] as string | undefined;
    let finalImageUrl = currentManualUrl || "";
    const finalImageHint = hintKey ? (generalInfoForm.getValues(hintKey) || "") : undefined;


    try {
      if (fileToUpload) {
        if (originalDbUrl && isFirebaseStorageUrl(originalDbUrl)) {
          try { await deleteObject(storageRefStandard(storage, originalDbUrl)); } 
          catch (e) { console.warn(`Old ${assetType} (DB) not deleted: ${e}`); }
        }
        finalImageUrl = await handleFileUpload(fileToUpload, assetType);
      } else {
        if (finalImageUrl === "" && originalDbUrl && isFirebaseStorageUrl(originalDbUrl)) {
          try { await deleteObject(storageRefStandard(storage, originalDbUrl)); } 
          catch (e) { console.warn(`Old ${assetType} (DB) not deleted on clear: ${e}`); }
        } else if (finalImageUrl !== originalDbUrl && originalDbUrl && isFirebaseStorageUrl(originalDbUrl)) {
          try { await deleteObject(storageRefStandard(storage, originalDbUrl)); } 
          catch (e) { console.warn(`Old ${assetType} (DB) not deleted on URL change: ${e}`); }
        }
      }
      
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const updateData: Partial<GlobalWebSettings> = { updatedAt: Timestamp.now(), [currentDbUrlKey]: finalImageUrl };
      if (hintKey !== null && finalImageHint !== undefined) {
        (updateData as any)[hintKey] = finalImageHint;
      }

      await setDoc(settingsDocRef, updateData, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      await triggerRefresh('sitemap');
      
      setGlobalSettings(prev => ({ ...prev, ...updateData }));
      setOriginalGlobalSettings(prev => ({ ...prev, ...updateData }));
      setPreviewState(finalImageUrl || null);
      setFileState(null);

      toast({ title: "Success", description: `${assetType.charAt(0).toUpperCase() + assetType.slice(1)} saved.` });
    } catch (error: any) {
      console.error(`Error saving ${assetType}:`, error);
      toast({ title: "Error", description: `Could not save ${assetType}. ${error.message}`, variant: "destructive" });
    } finally {
      setIsSaving(false);
      setUploadProgress(prev => ({ ...prev, [assetType]: null }));
    }
  };

  const handleManualUrlChange = (assetType: 'logo' | 'favicon' | 'websiteIcon', url: string) => {
    let currentDbUrlKey: keyof GlobalWebSettings = 'logoUrl';
    let setPreviewState: React.Dispatch<React.SetStateAction<string | null>> = setLogoPreview;
    let setFileState: React.Dispatch<React.SetStateAction<File | null>> = setLogoFile;

    if (assetType === 'logo') { currentDbUrlKey = 'logoUrl'; setPreviewState = setLogoPreview; setFileState = setLogoFile; }
    else if (assetType === 'favicon') { currentDbUrlKey = 'faviconUrl'; setPreviewState = setFaviconPreview; setFileState = setFaviconFile; }
    else if (assetType === 'websiteIcon') { currentDbUrlKey = 'websiteIconUrl'; setPreviewState = setWebsiteIconPreview; setFileState = setWebsiteIconFile; }
    
    setGlobalSettings(prev => ({ ...prev, [currentDbUrlKey]: url }));
    if (!eval(`${assetType}File`)) {
      setPreviewState(url || null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, assetType: 'logo' | 'favicon' | 'websiteIcon') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const maxSizeMB = assetType === 'logo' ? 50 : (assetType === 'favicon' ? 0.5 : 50);
      const expectedTypes = assetType === 'favicon' ? ["image/x-icon", "image/png", "image/svg+xml"] : ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"];
      
      if (!expectedTypes.includes(file.type)) {
        toast({ title: "Invalid File Type", description: `Please select a valid image type (${expectedTypes.join(', ')}).`, variant: "destructive"});
        e.target.value = ""; return;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        toast({ title: "File Too Large", description: `Image must be < ${maxSizeMB}MB.`, variant: "destructive" });
        e.target.value = ""; return;
      }

      let fileToSet = file;
      if (assetType !== 'favicon') {
        try {
          fileToSet = await compressImage(file);
        } catch (err) {
          console.error("Compression failed", err);
        }
      }

      if (assetType === 'logo') { setLogoFile(fileToSet); setLogoPreview(URL.createObjectURL(fileToSet)); }
      if (assetType === 'favicon') { setFaviconFile(fileToSet); setFaviconPreview(URL.createObjectURL(fileToSet)); }
      if (assetType === 'websiteIcon') { setWebsiteIconFile(fileToSet); setWebsiteIconPreview(URL.createObjectURL(fileToSet)); }
    }
  };

  const handleRemoveImage = (assetType: 'logo' | 'favicon' | 'websiteIcon') => {
    let setFile: React.Dispatch<React.SetStateAction<File | null>> = setLogoFile;
    let setPreview: React.Dispatch<React.SetStateAction<string | null>> = setLogoPreview;
    let urlKey: keyof GlobalWebSettings = 'logoUrl';
    let hintKey: keyof GeneralInfoFormData | null = null;

    if (assetType === 'logo') { setFile = setLogoFile; setPreview = setLogoPreview; urlKey = 'logoUrl'; hintKey = 'logoImageHint'; }
    else if (assetType === 'favicon') { setFile = setFaviconFile; setPreview = setFaviconPreview; urlKey = 'faviconUrl';}
    else if (assetType === 'websiteIcon') { setFile = setWebsiteIconFile; setPreview = setWebsiteIconPreview; urlKey = 'websiteIconUrl'; hintKey = 'websiteIconImageHint';}
    
    setFile(null);
    setPreview(null);
    setGlobalSettings(prev => ({ ...prev, [urlKey]: "" }));
    if (hintKey) generalInfoForm.setValue(hintKey, '');
  };

  const handleSaveContentPage = async (data: ContentPageFormData) => {
    if (!selectedPageSlug) {
      toast({ title: "Error", description: "No page selected to save.", variant: "destructive" });
      return;
    }
    setIsSavingContent(true);
    let finalImageUrl = data.imageUrl || "";

    try {
      if (pageImageFile) {
        const existingPage = contentPages.find(p => p.slug === selectedPageSlug);
        if (existingPage?.imageUrl && isFirebaseStorageUrl(existingPage.imageUrl)) {
            try { await deleteObject(storageRefStandard(storage, existingPage.imageUrl)); }
            catch (e) { console.warn("Old page banner not deleted:", e); }
        }
        finalImageUrl = await handleFileUpload(pageImageFile, 'page_banner', `public/uploads/pages/${selectedPageSlug}`);
      } else if (!data.imageUrl) {
        const existingPage = contentPages.find(p => p.slug === selectedPageSlug);
        if (existingPage?.imageUrl && isFirebaseStorageUrl(existingPage.imageUrl)) {
            try { await deleteObject(storageRefStandard(storage, existingPage.imageUrl)); }
            catch (e) { console.warn("Old page banner not deleted on clear:", e); }
        }
        finalImageUrl = "";
      }

      const pageDocRef = doc(db, CONTENT_PAGES_COLLECTION, selectedPageSlug);
      const pageData: ContentPage = {
        id: selectedPageSlug,
        slug: selectedPageSlug,
        title: data.title,
        content: data.content || "",
        imageUrl: finalImageUrl,
        imageHint: data.imageHint || "",
        updatedAt: Timestamp.now(),
      };
      await setDoc(pageDocRef, pageData, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      await triggerRefresh('sitemap');
      toast({ title: "Success", description: `${pageData.title} content saved.` });
      setPageImageFile(null);
    } catch (error) {
      console.error("Error saving content page:", error);
      toast({ title: "Error", description: "Could not save content page.", variant: "destructive" });
    } finally {
      setIsSavingContent(false);
    }
  };

  const handleSaveSocialMediaLinks = async (data: SocialMediaLinksFormData) => {
    setIsSaving(true);
    try {
        const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
        const updateData: Partial<GlobalWebSettings> = {
            socialMediaLinks: {
                facebook: data.facebook || "",
                instagram: data.instagram || "",
                twitter: data.twitter || "",
                linkedin: data.linkedin || "",
                youtube: data.youtube || "",
            },
            updatedAt: Timestamp.now(),
        };
        await setDoc(settingsDocRef, updateData, { merge: true });
        await triggerRefresh('web-settings');
        await triggerRefresh('global-cache');
        await triggerRefresh('sitemap');
        setGlobalSettings(prev => ({ ...prev, ...updateData }));
        setOriginalGlobalSettings(prev => ({...prev, ...updateData}));
        toast({ title: "Success", description: "Social media links saved." });
    } catch (error) {
        console.error("Error saving social media links:", error);
        toast({ title: "Error", description: "Could not save social media links.", variant: "destructive" });
    } finally {
        setIsSaving(false);
    }
  };

  const handleSaveHomepageContent = async (data: HomepageContentFormData) => {
    setIsSaving(true);
    try {
      const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);
      const updateData: Partial<GlobalWebSettings> = {
        homepageContent: data,
        updatedAt: Timestamp.now(),
      };
      await setDoc(settingsDocRef, updateData, { merge: true });
      await triggerRefresh('web-settings');
      await triggerRefresh('global-cache');
      setGlobalSettings(prev => ({ ...prev, ...updateData }));
      setOriginalGlobalSettings(prev => ({...prev, ...updateData}));
      toast({ title: "Success", description: "Homepage content saved." });
    } catch (error) {
      console.error("Error saving homepage content:", error);
      toast({ title: "Error", description: "Could not save homepage content.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveStorageConfig = async () => {
    setIsSaving(true);
    try {
      await setDoc(doc(db, "webSettings", "storageConfiguration"), {
        driver: storageDriver,
        remoteUploadUrl: remoteUploadUrl.trim(),
        remoteSecretKey: remoteSecretKey.trim(),
        updatedAt: Timestamp.now(),
      }, { merge: true });
      await triggerRefresh('web-settings');
      toast({ title: "Storage Settings Saved", description: `Media upload driver set to ${storageDriver === 'remote' ? 'Remote Shared Hosting' : 'Local VPS'}.` });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message || "Failed to update storage settings.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Helper for inserting HTML tags into textarea
  const insertHtmlTag = (tag: string, endTag?: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selected = text.substring(start, end);
    
    const before = text.substring(0, start);
    const after = text.substring(end);
    
    let replacement = "";
    if (endTag) {
        replacement = `${tag}${selected}${endTag}`;
    } else {
        // Self-closing tags or single tags
        replacement = tag;
    }

    const newValue = before + replacement + after;
    contentPageForm.setValue('content', newValue, { shouldValidate: true, shouldDirty: true });
    
    // Set focus and cursor position back
    setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length + selected.length);
    }, 0);
  };

  const handleContentAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size > 50 * 1024 * 1024) {
            toast({ title: "File Too Large", description: "Asset must be < 50MB.", variant: "destructive"});
            return;
        }
        let fileToUpload = file;
        try {
          fileToUpload = await compressImage(file);
        } catch (err) {
          console.error("Compression failed", err);
        }
        setIsUploadingAsset(true);
        try {
            const url = await handleFileUpload(fileToUpload, 'content_asset');
            setLastUploadedAssetUrl(url);
            toast({ title: "Asset Uploaded", description: "You can now copy the URL and use it in your content." });
        } catch (error) {
            toast({ title: "Upload Failed", description: "Could not upload image asset.", variant: "destructive" });
        } finally {
            setIsUploadingAsset(false);
            if (contentAssetInputRef.current) contentAssetInputRef.current.value = "";
        }
    }
  };

  const handlePageImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.size > 50 * 1024 * 1024) {
            toast({ title: "File Too Large", description: "Banner image must be < 50MB.", variant: "destructive"});
            return;
        }
        let fileToSet = file;
        try {
          fileToSet = await compressImage(file);
        } catch (err) {
          console.error("Compression failed", err);
        }
        setPageImageFile(fileToSet);
        setPageImagePreview(URL.createObjectURL(fileToSet));
        contentPageForm.setValue('imageUrl', '');
    }
  };

  const handleRemovePageBanner = () => {
    setPageImageFile(null);
    setPageImagePreview(null);
    contentPageForm.setValue('imageUrl', '');
    if (pageImageInputRef.current) pageImageInputRef.current.value = "";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "URL copied to clipboard." });
  };
  

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading web settings...</p>
      </div>
    );
  }
  
  const renderAssetUploader = (
    assetType: 'logo' | 'favicon' | 'websiteIcon',
    label: string,
    currentPreview: string | null,
    fileInputAccept: string,
    currentFile: File | null,
    hintFieldName?: keyof GeneralInfoFormData
  ) => (
    <div className="space-y-4 p-4 border rounded-md shadow-sm">
      <h3 className="text-lg font-semibold">{label}</h3>
      {currentPreview && isValidImageSrc(currentPreview) ? (
        <div className="my-2 relative w-32 h-32 rounded-md overflow-hidden border bg-muted/10">
          <NextImage src={currentPreview} alt={`${assetType} preview`} fill className="object-contain" unoptimized={currentPreview.startsWith('blob:')} />
        </div>
      ) : (
        <div className="my-2 flex items-center justify-center w-32 h-32 rounded-md border border-dashed bg-muted/10">
          <ImageIcon className="h-10 w-10 text-muted-foreground" />
        </div>
      )}
      
      <Label htmlFor={`${assetType}-file-upload`}>Upload New Image</Label>
      <Input id={`${assetType}-file-upload`} type="file" accept={fileInputAccept} onChange={(e) => handleFileChange(e, assetType)} className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/80 file:text-primary-foreground hover:file:bg-primary/90" disabled={isSaving}/>
      {uploadProgress[assetType] && (
        <div className="mt-2"><Progress value={uploadProgress[assetType]!} className="w-full h-2" /><p className="text-xs text-muted-foreground mt-1">Uploading: {Math.round(uploadProgress[assetType]!)}%</p></div>
      )}

      <Label htmlFor={`${assetType}-url-input`}>Or Enter Image URL</Label>
      <Textarea 
        id={`${assetType}-url-input`}
        placeholder="https://example.com/image.png"
        value={globalSettings[assetType === 'logo' ? 'logoUrl' : assetType === 'favicon' ? 'faviconUrl' : 'websiteIconUrl'] || ""}
        onChange={(e) => handleManualUrlChange(assetType, e.target.value)}
        disabled={isSaving || !!currentFile}
        rows={2}
      />

      {hintFieldName && assetType !== 'favicon' && (
          <FormField
              control={generalInfoForm.control}
              name={hintFieldName}
              render={({ field }) => (
                  <FormItem>
                      <FormLabel>{assetType.charAt(0).toUpperCase() + assetType.slice(1)} Image AI Hint (Optional)</FormLabel>
                      <FormControl>
                          <Input placeholder={`e.g., company ${assetType}`} {...field} disabled={isSaving} />
                      </FormControl>
                      <FormDescription>One or two keywords for AI image search. Max 50 characters.</FormDescription>
                      <FormMessage />
                  </FormItem>
              )}
          />
      )}

      <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:items-center sm:gap-2 mt-2">
        <Button onClick={() => handleSaveBrandingAsset(assetType)} disabled={isSaving || !!uploadProgress[assetType]} className="w-full sm:w-auto">
          {isSaving && !uploadProgress[assetType] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save {label}
        </Button>
        {(currentPreview || currentFile) && <Button variant="ghost" size="sm" onClick={() => handleRemoveImage(assetType)} disabled={isSaving} className="w-full sm:w-auto"><Trash2 className="h-4 w-4 text-destructive"/> Remove</Button>}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings2 className="mr-2 h-6 w-6 text-primary" /> Website Settings
          </CardTitle>
          <CardDescription>
            Manage global website information, branding assets, and content pages.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="general" className="w-full">
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
            <TabsTrigger 
              value="general"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Building className="mr-2 h-4 w-4" />General Info
            </TabsTrigger>
            <TabsTrigger 
              value="branding"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <ImageIcon className="mr-2 h-4 w-4" />Branding
            </TabsTrigger>
            <TabsTrigger 
              value="social_media"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <ExternalLink className="mr-2 h-4 w-4" />Social Media
            </TabsTrigger>
            <TabsTrigger 
              value="homepage_content"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <LayoutDashboard className="mr-2 h-4 w-4" />Homepage Content
            </TabsTrigger>
            <TabsTrigger 
              value="content"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <FileText className="mr-2 h-4 w-4" />Content Pages
            </TabsTrigger>
            <TabsTrigger 
              value="storage"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <ImagePlus className="mr-2 h-4 w-4" />Media Storage
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="mt-0 focus-visible:outline-none">
          <Card>
            <CardHeader><CardTitle>General Information</CardTitle></CardHeader>
            <Form {...generalInfoForm}>
              <form onSubmit={generalInfoForm.handleSubmit(handleSaveGeneralInfo)}>
                <CardContent className="space-y-4">
                  <FormField control={generalInfoForm.control} name="websiteName" render={({ field }) => (<FormItem><FormLabel>Website Name</FormLabel><FormControl><Input placeholder="e.g., Yourbrand Services" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={generalInfoForm.control} name="contactEmail" render={({ field }) => (<FormItem><FormLabel>Contact Email</FormLabel><FormControl><Input type="email" placeholder="e.g., support@yourbrand.com" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={generalInfoForm.control} name="contactMobile" render={({ field }) => (<FormItem><FormLabel>Contact Mobile</FormLabel><FormControl><Input type="tel" placeholder="e.g., +919876543210" {...field} /></FormControl><FormMessage /></FormItem>)} />
                  <FormField control={generalInfoForm.control} name="address" render={({ field }) => (<FormItem><FormLabel>Company Address</FormLabel><FormControl><Textarea placeholder="123 Main St, Anytown, ST 12345" {...field} rows={3} /></FormControl><FormMessage /></FormItem>)} />
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save General Info
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </TabsContent>

        <TabsContent value="branding">
          <Card>
            <CardHeader><CardTitle>Branding Assets</CardTitle><CardDescription>Upload your website's logo, favicon, and general icon, or provide direct URLs.</CardDescription></CardHeader>
             <Form {...generalInfoForm}>
                <CardContent className="space-y-6">
                  {renderAssetUploader('logo', 'Website Logo', logoPreview, "image/png, image/jpeg, image/svg+xml, image/webp", logoFile, "logoImageHint")}
                  {renderAssetUploader('favicon', 'Favicon', faviconPreview, "image/x-icon, image/png, image/svg+xml", faviconFile)}
                  {renderAssetUploader('websiteIcon', 'Website Icon (PWA/Social)', websiteIconPreview, "image/png, image/jpeg, image/svg+xml, image/webp", websiteIconFile, "websiteIconImageHint")}
                </CardContent>
             </Form>
          </Card>
        </TabsContent>
        
        <TabsContent value="social_media">
          <Card>
            <CardHeader>
                <CardTitle>Social Media Links</CardTitle>
                <CardDescription>Enter the full URLs for your social media profiles.</CardDescription>
            </CardHeader>
            <Form {...socialMediaForm}>
                <form onSubmit={socialMediaForm.handleSubmit(handleSaveSocialMediaLinks)}>
                    <CardContent className="space-y-4">
                        <FormField control={socialMediaForm.control} name="facebook" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Facebook className="mr-2 h-4 w-4 text-blue-600"/>Facebook URL</FormLabel><FormControl><Input placeholder="https://facebook.com/yourpage" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="instagram" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Instagram className="mr-2 h-4 w-4 text-pink-600"/>Instagram URL</FormLabel><FormControl><Input placeholder="https://instagram.com/yourprofile" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="twitter" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><TwitterIcon className="mr-2 h-4 w-4 text-sky-500"/>Twitter (X) URL</FormLabel><FormControl><Input placeholder="https://twitter.com/yourhandle" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="linkedin" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Linkedin className="mr-2 h-4 w-4 text-blue-700"/>LinkedIn URL</FormLabel><FormControl><Input placeholder="https://linkedin.com/company/yourcompany" {...field} /></FormControl><FormMessage /></FormItem>)} />
                        <FormField control={socialMediaForm.control} name="youtube" render={({ field }) => (<FormItem><FormLabel className="flex items-center"><Youtube className="mr-2 h-4 w-4 text-red-600"/>YouTube URL</FormLabel><FormControl><Input placeholder="https://youtube.com/yourchannel" {...field} /></FormControl><FormMessage /></FormItem>)} />
                    </CardContent>
                    <CardFooter>
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Social Media Links
                        </Button>
                    </CardFooter>
                </form>
            </Form>
          </Card>
        </TabsContent>

        <TabsContent value="homepage_content">
          <Card>
            <CardHeader>
              <CardTitle>Homepage & Footer Content</CardTitle>
              <CardDescription>Manage the marketing text and CTA sections of your website.</CardDescription>
            </CardHeader>
            <Form {...homepageContentForm}>
              <form onSubmit={homepageContentForm.handleSubmit(handleSaveHomepageContent)}>
                <CardContent className="space-y-8">
                  {/* Why Choose Us Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Why Choose Us Items</h3>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          const current = homepageContentForm.getValues('whyChooseUs');
                          homepageContentForm.setValue('whyChooseUs', [
                            ...current, 
                            { id: Math.random().toString(36).substr(2, 9), title: '', description: '', iconName: 'Users' }
                          ]);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Add Item
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {homepageContentForm.watch('whyChooseUs').map((item, index) => (
                        <Card key={item.id} className="relative bg-muted/20">
                          <CardContent className="pt-6 space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <FormField
                                control={homepageContentForm.control}
                                name={`whyChooseUs.${index}.title`}
                                render={({ field }) => (
                                  <FormItem className="flex-1">
                                    <FormLabel className="text-xs">Title</FormLabel>
                                    <FormControl><Input placeholder="e.g., Trusted Experts" {...field} className="h-8 text-sm" /></FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  const current = homepageContentForm.getValues('whyChooseUs');
                                  homepageContentForm.setValue('whyChooseUs', current.filter((_, i) => i !== index));
                                }}
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            </div>
                            <FormField
                              control={homepageContentForm.control}
                              name={`whyChooseUs.${index}.iconName`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Lucide Icon Name</FormLabel>
                                  <FormControl><Input placeholder="Users, Star, ShieldCheck, etc." {...field} className="h-8 text-sm" /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={homepageContentForm.control}
                              name={`whyChooseUs.${index}.description`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-xs">Description</FormLabel>
                                  <FormControl><Textarea placeholder="Short description..." {...field} className="text-sm" rows={2} /></FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Footer Bio Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Footer Bio</h3>
                    <FormField
                      control={homepageContentForm.control}
                      name="footerCompanyBio"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Introduction (Footer Left)</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Yourbrand is Bangalore's leading home services platform..." 
                              {...field} 
                              rows={4} 
                            />
                          </FormControl>
                          <FormDescription>This text appears in the bottom left of the website footer.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Separator />

                  {/* Footer CTA Section */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Footer CTA (Above Footer Section)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={homepageContentForm.control}
                        name="footerCTA.title"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CTA Title</FormLabel>
                            <FormControl><Input placeholder="Ready to get started?" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={homepageContentForm.control}
                        name="footerCTA.subtitle"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>CTA Subtitle</FormLabel>
                            <FormControl><Input placeholder="Book your service now..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={homepageContentForm.control}
                        name="footerCTA.buttonText"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Button Text</FormLabel>
                            <FormControl><Input placeholder="Book a Service" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={homepageContentForm.control}
                        name="footerCTA.buttonLink"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Button Link</FormLabel>
                            <FormControl><Input placeholder="/categories" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" disabled={isSaving} size="lg">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Homepage Content
                  </Button>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </TabsContent>


        <TabsContent value="content">
          <Card>
            <CardHeader>
                <CardTitle>Content Page Editor</CardTitle>
                <CardDescription>Create or update content for static pages. Supports raw HTML and manual text formatting.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Left Column: Selection & Asset Upload */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="select-page" className="text-sm font-bold">Select Page</Label>
                    <Dialog open={isPagePickerOpen} onOpenChange={setIsPagePickerOpen}>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between text-left font-normal h-10",
                            !selectedPageSlug && "text-muted-foreground"
                          )}
                          disabled={isSavingContent || contentPages.length === 0}
                          type="button"
                          id="select-page"
                        >
                          {selectedPage ? (
                            <div className="flex items-center gap-2">
                              <Tags className="h-4 w-4 text-primary" />
                              <span>{selectedPage.title}</span>
                            </div>
                          ) : (
                            "Select a page..."
                          )}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-6px)] sm:max-w-[425px]">
                        <DialogHeader>
                          <DialogTitle>Select Page</DialogTitle>
                          <DialogDescription>
                            Search and select a static page to edit.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                          <div className="relative">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Type page title..."
                              className="pl-8"
                              value={pageSearch}
                              onChange={(e) => setPageSearch(e.target.value)}
                            />
                          </div>
                          <ScrollArea className="h-[300px] rounded-md border p-2">
                            <div className="space-y-1">
                              {searchablePages.length === 0 ? (
                                <p className="text-center py-4 text-sm text-muted-foreground">No pages found.</p>
                              ) : (
                                searchablePages.map((page: ContentPage) => (
                                  <Button
                                    key={page.slug}
                                    variant={selectedPageSlug === page.slug ? "secondary" : "ghost"}
                                    className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                    onClick={() => {
                                      setSelectedPageSlug(page.slug);
                                      setIsPagePickerOpen(false);
                                      setPageSearch("");
                                    }}
                                    type="button"
                                  >
                                    <div className="flex items-center gap-2 pr-8">
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-semibold text-sm">{page.title}</span>
                                    </div>
                                    {selectedPageSlug === page.slug && (
                                      <CheckCircle className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                    )}
                                  </Button>
                                ))
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <Separator />

                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h4 className="text-sm font-bold flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary"/> Page Banner Image</h4>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Top image for the selected page</p>
                    
                    {pageImagePreview ? (
                        <div className="relative aspect-video w-full rounded border bg-white overflow-hidden group">
                            <NextImage src={pageImagePreview} alt="Page banner" fill className="object-contain" unoptimized={pageImagePreview.startsWith('blob:')} />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <Button variant="destructive" size="sm" className="h-7 text-[10px]" onClick={handleRemovePageBanner}><Trash2 className="h-3.5 w-3.5 mr-1"/>Remove</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center aspect-video w-full border-2 border-dashed rounded-lg bg-muted/50">
                            <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-[10px] text-muted-foreground">No banner set</p>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Input 
                            type="file" 
                            accept="image/*" 
                            ref={pageImageInputRef}
                            onChange={handlePageImageFileChange}
                            disabled={isSavingContent}
                            className="text-xs h-9 file:text-xs file:font-semibold"
                        />
                        {pageImageUploadProgress !== null && (
                            <div className="space-y-1">
                                <Progress value={pageImageUploadProgress} className="h-1" />
                                <p className="text-[10px] text-center">{Math.round(pageImageUploadProgress)}%</p>
                            </div>
                        )}
                    </div>
                    
                    <div className="pt-2">
                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Banner AI Hint</Label>
                        <Input 
                            placeholder="e.g., happy family help" 
                            className="text-xs h-8 mt-1"
                            {...contentPageForm.register('imageHint')}
                            disabled={isSavingContent}
                        />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                    <h4 className="text-sm font-bold flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary"/> Content Assets</h4>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">General images for pasting into content</p>
                    
                    <div className="space-y-2">
                        <Input 
                            type="file" 
                            accept="image/*" 
                            ref={contentAssetInputRef}
                            onChange={handleContentAssetUpload}
                            disabled={isUploadingAsset}
                            className="text-xs h-9 file:text-xs file:font-semibold"
                        />
                        {isUploadingAsset && (
                            <div className="space-y-1">
                                <Progress value={assetUploadProgress} className="h-1" />
                                <p className="text-[10px] text-center">{Math.round(assetUploadProgress || 0)}%</p>
                            </div>
                        )}
                    </div>

                    {lastUploadedAssetUrl && (
                        <div className="mt-2 space-y-2">
                            <div className="relative aspect-video w-full rounded border bg-white overflow-hidden group">
                                <NextImage src={lastUploadedAssetUrl} alt="Last upload" fill className="object-contain" />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                    <Button variant="secondary" size="sm" className="h-7 text-[10px]" onClick={() => copyToClipboard(lastUploadedAssetUrl)}>Copy URL</Button>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Input value={lastUploadedAssetUrl} readOnly className="text-[10px] h-7 font-mono bg-background" />
                                <Button variant="outline" size="icon" className="h-7 w-7 shrink-0" onClick={() => copyToClipboard(lastUploadedAssetUrl)}><Copy className="h-3.5 w-3.5"/></Button>
                            </div>
                        </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Title & Textarea Editor */}
                <div className="lg:col-span-3 space-y-4">
                {selectedPageSlug && (
                    <Form {...contentPageForm}>
                    <form onSubmit={contentPageForm.handleSubmit(handleSaveContentPage)} className="space-y-4">
                        <FormField control={contentPageForm.control} name="title" render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-bold">Display Title</FormLabel>
                                <FormControl><Input placeholder="Page Title" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        
                        <div className="space-y-2">
                            <Label className="text-sm font-bold">Page Content (HTML supported)</Label>
                            
                            {/* Formatting Toolbar */}
                            <div className="flex flex-wrap items-center gap-1 p-1 bg-muted rounded-t-md border border-b-0">
                                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => insertHtmlTag('<h2>', '</h2>')}><Heading2 className="h-3.5 w-3.5 mr-1" /> H2</Button>
                                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => insertHtmlTag('<p>', '</p>')}><Pilcrow className="h-3.5 w-3.5 mr-1" /> P</Button>
                                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => insertHtmlTag('<strong>', '</strong>')}><Bold className="h-3.5 w-3.5 mr-1" /> Strong</Button>
                                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => insertHtmlTag('<ul>\n  <li>', '</li>\n</ul>')}><List className="h-3.5 w-3.5 mr-1" /> List</Button>
                                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => insertHtmlTag('<a href="#" class="text-primary hover:underline">', '</a>')}><LinkIcon className="h-3.5 w-3.5 mr-1" /> Link</Button>
                                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => insertHtmlTag('<img src="INSERT_URL_HERE" className="w-full rounded-lg my-4" alt="Image" />')}><ImageIcon className="h-3.5 w-3.5 mr-1" /> Img</Button>
                                <Separator orientation="vertical" className="h-6 mx-1" />
                                <Button type="button" variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => insertHtmlTag('<br />')}><Type className="h-3.5 w-3.5 mr-1" /> Break</Button>
                            </div>

                            <FormField control={contentPageForm.control} name="content" render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                      <Textarea 
                                        {...field}
                                        ref={(e) => {
                                            field.ref(e);
                                            // Fix: textareaRef.current is managed by ref={field.ref} usually, 
                                            // but if manual assignment is needed:
                                            (textareaRef as any).current = e;
                                        }}
                                        placeholder="Write your page content here... Use the toolbar above or write custom HTML."
                                        rows={22}
                                        value={field.value || ""}
                                        disabled={isSavingContent}
                                        className="font-mono text-sm rounded-t-none border-t-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                      />
                                    </FormControl>
                                    <div className="flex justify-between items-center py-1">
                                        <FormDescription className="text-[10px]">
                                            Last Saved: {contentPages.find(p => p.slug === selectedPageSlug)?.updatedAt ? formatTimestampToReadable(contentPages.find(p => p.slug === selectedPageSlug)?.updatedAt, appConfig) : 'Never'}
                                        </FormDescription>
                                        <Link href={`/${selectedPageSlug}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary underline flex items-center">
                                            <ExternalLink className="h-2.5 w-2.5 mr-1"/>Preview Live Page
                                        </Link>
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <div className="flex justify-end pt-2">
                            <PermissionGuard moduleId="web_settings" action="write">
                                <Button type="submit" disabled={isSavingContent} size="lg" className="w-full sm:w-auto">
                                    {isSavingContent ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Page Content & Banner
                                </Button>
                            </PermissionGuard>
                        </div>
                    </form>
                    </Form>
                )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage" className="mt-0 focus-visible:outline-none">
          <Card className="border shadow-md rounded-2xl">
            <CardHeader>
              <CardTitle className="text-xl flex items-center">
                <ImagePlus className="mr-2 h-5 w-5 text-primary" /> Media Storage Provider Settings
              </CardTitle>
              <CardDescription>
                Choose where website images, service covers, banners, and uploads are stored (Local VPS vs. Remote Shared Hosting Subdomain).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div 
                  onClick={() => setStorageDriver('local')}
                  className={cn(
                    "p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between",
                    storageDriver === 'local' ? "border-primary bg-primary/5 shadow-md" : "border-border/60 hover:border-primary/40 bg-card"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-bold text-base text-foreground">
                      <Building className="h-5 w-5 text-primary" /> Local VPS Storage
                    </div>
                    <Badge variant={storageDriver === 'local' ? "default" : "outline"}>{storageDriver === 'local' ? "Active" : "Select"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Uploads files directly to your VPS server SSD disk (<code className="bg-muted px-1 py-0.5 rounded text-[11px]">/public/uploads/</code>). Fast and direct, ideal when running on VPS.
                  </p>
                </div>

                <div 
                  onClick={() => setStorageDriver('remote')}
                  className={cn(
                    "p-5 rounded-2xl border-2 cursor-pointer transition-all duration-200 flex flex-col justify-between",
                    storageDriver === 'remote' ? "border-primary bg-primary/5 shadow-md" : "border-border/60 hover:border-primary/40 bg-card"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-bold text-base text-foreground">
                      <ExternalLink className="h-5 w-5 text-primary" /> Remote Shared Hosting Server
                    </div>
                    <Badge variant={storageDriver === 'remote' ? "default" : "outline"}>{storageDriver === 'remote' ? "Active" : "Select"}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Uploads files to your Shared Hosting subdomain (<code className="bg-muted px-1 py-0.5 rounded text-[11px]">media.yourbrand.in</code>). Saves VPS disk space and bandwidth!
                  </p>
                </div>
              </div>

              {storageDriver === 'remote' && (
                <div className="space-y-4 p-5 rounded-2xl border border-primary/20 bg-primary/[0.02]">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" /> Remote Shared Hosting Upload Configuration
                  </h4>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Remote Upload Script URL</Label>
                    <Input 
                      placeholder="e.g. https://media.yourbrand.in/upload.php" 
                      value={remoteUploadUrl}
                      onChange={(e) => setRemoteUploadUrl(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">The full HTTP/HTTPS endpoint URL of your PHP upload bridge script on Shared Hosting.</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-semibold">Security Secret Key</Label>
                    <Input 
                      type="password"
                      placeholder="e.g. yourbrand_secure_key_123" 
                      value={remoteSecretKey}
                      onChange={(e) => setRemoteSecretKey(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">A secret password shared between your VPS and Shared Hosting upload script to block unauthorized uploads.</p>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between items-center bg-muted/20 border-t py-4">
              <span className="text-xs text-muted-foreground font-medium">Currently using: <strong>{storageDriver === 'remote' ? 'Remote Shared Hosting' : 'Local VPS Storage'}</strong></span>
              <PermissionGuard moduleId="web_settings" action="write">
                <Button onClick={handleSaveStorageConfig} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Storage Settings
                </Button>
              </PermissionGuard>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Global timestamp helper local to this file for cleaner code
const formatTimestampToReadable = (timestamp: any, appConfig?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return "N/A";
    return `${formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)} ${formatTimeInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata')}`;
};
