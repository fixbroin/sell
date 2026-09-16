
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProviderApplication, KycDocument, BankDetails, ProviderApplicationStatus } from '@/types/firestore';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCircle, Briefcase, FileText, Banknote, MapPin, Image as ImageIcon, ShieldCheck, CheckCircle, AlertTriangle, XCircle, Loader2, Download, Edit as EditIcon, ExternalLink, Copy, Mail, Phone, Plus, X, Tag, Search, Wrench } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import NextImage from 'next/image';
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { generateProviderApplicationPdf } from '@/lib/generateProviderPDF';
import { triggerPdfDownload } from '@/lib/pdfUtils';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { Separator } from "@/components/ui/separator";
import { cn, getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from "@/lib/utils";
import { db } from '@/lib/firebase';
import { doc, updateDoc, Timestamp, collection, query, where, orderBy, getDocs } from '@/lib/mysqlDb';
import { useRouter } from 'next/navigation';
import { Switch } from '@/components/ui/switch';

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";

interface ProviderApplicationDetailsModalProps {
  application: ProviderApplication | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus: (applicationId: string, newStatus: ProviderApplicationStatus, notes?: string) => Promise<void>;
  isLoadingStatusUpdate: boolean;
}

const formatTimestampToReadable = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return "N/A";
  const d = new Date(millis);
  return `${formatDateInTimezone(d, 'Asia/Kolkata')} ${formatTimeInTimezone(d, 'Asia/Kolkata')}`;
};


const DetailRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="py-2.5 border-b border-border/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-sm last:border-b-0">
    <span className="font-semibold text-muted-foreground sm:w-1/3 shrink-0">{label}</span>
    <span className="text-foreground sm:w-2/3 break-words font-medium">{value}</span>
  </div>
);

const KycDocDisplay: React.FC<{ 
  doc?: KycDocument | null, 
  docName: string,
  onVerify?: () => void,
  isVerifying?: boolean
}> = ({ doc, docName, onVerify, isVerifying }) => {
  if (!doc || (!doc.docNumber && !doc.frontImageUrl)) return <p className="text-sm text-muted-foreground">Not Provided</p>;
  return (
    <div className="space-y-1 border p-4 rounded-xl bg-muted/5 border-border/60">
      <div className="flex justify-between items-center border-b pb-2 mb-2">
        <span className="text-sm font-bold text-primary">{doc.docLabel || docName}</span>
        <div className="flex items-center gap-2">
          <Badge variant={doc.verified ? "default" : "secondary"} className={cn(doc.verified && "bg-green-500 hover:bg-green-600")}>
              {doc.verified ? "Verified" : "Pending"}
          </Badge>
          {!doc.verified && onVerify && (
              <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-[10px] border-green-500 text-green-600 hover:bg-green-50"
                  onClick={(e) => { e.stopPropagation(); onVerify(); }}
                  disabled={isVerifying}
              >
                  {isVerifying ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <CheckCircle className="h-3 w-3 mr-1"/>}
                  Approve
              </Button>
          )}
        </div>
      </div>
      
      <DetailRow label="Document ID / Number" value={doc.docNumber || "N/A"} />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
        {doc.frontImageUrl && (
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Front View</span>
            <div className="relative aspect-video w-full border rounded-lg bg-white overflow-hidden group shadow-sm">
              <NextImage src={doc.frontImageUrl} alt={`${docName} Front`} fill className="object-contain p-1"/>
              <a href={doc.frontImageUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 bg-black/50 p-1.5 rounded-md text-white hover:bg-black/70 transition-colors"><ExternalLink className="h-3.5 w-3.5"/></a>
            </div>
          </div>
        )}
        {doc.backImageUrl && (
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Back View</span>
            <div className="relative aspect-video w-full border rounded-lg bg-white overflow-hidden group shadow-sm">
              <NextImage src={doc.backImageUrl} alt={`${docName} Back`} fill className="object-contain p-1"/>
              <a href={doc.backImageUrl} target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 bg-black/50 p-1.5 rounded-md text-white hover:bg-black/70 transition-colors"><ExternalLink className="h-3.5 w-3.5"/></a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const BankDetailsDisplay: React.FC<{ 
  details?: BankDetails | null,
  customFieldsConfig?: any[],
  onVerify?: () => void,
  isVerifying?: boolean
}> = ({ details, customFieldsConfig, onVerify, isVerifying }) => {
  if (!details || !details.bankName) return <p className="text-sm text-muted-foreground">Not Provided</p>;
  return (
    <div className="space-y-1">
      <DetailRow label="Bank Name" value={details.bankName} />
      <DetailRow label="Account Holder" value={details.accountHolderName} />
      <DetailRow label="Account Number" value={details.accountNumber} />
      {details.customFields && Object.keys(details.customFields).length > 0 ? (
        Object.entries(details.customFields).map(([key, val]) => {
          const fieldCfg = customFieldsConfig?.find(f => f.id === key);
          const formattedLabel = fieldCfg?.name || (key === 'ifsc' ? 'IFSC Code' : key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()));
          return <DetailRow key={key} label={formattedLabel} value={val} />;
        })
      ) : (
        <DetailRow label="IFSC Code" value={details.ifscCode} />
      )}
      
      <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 last:border-b-0 text-sm">
        <span className="font-semibold text-muted-foreground sm:w-1/3 shrink-0">Verification Status</span>
        <div className="sm:w-2/3 flex items-center justify-between gap-4">
          <Badge variant={details.verified ? "default" : "secondary"} className={cn(details.verified && "bg-green-500 hover:bg-green-600")}>
            {details.verified ? "Verified" : "Pending Verification"}
          </Badge>
          {!details.verified && onVerify && (
            <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-[10px] border-green-500 text-green-600 hover:bg-green-50"
                onClick={onVerify}
                disabled={isVerifying}
            >
                {isVerifying ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <CheckCircle className="h-3 w-3 mr-1"/>}
                Verify Bank Account
            </Button>
          )}
        </div>
      </div>

      {details.cancelledChequeUrl && (
         <div className="py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Cancelled Cheque</span>
              <a href={details.cancelledChequeUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                View Full Size <ExternalLink className="h-3 w-3"/>
              </a>
            </div>
            <div className="relative w-48 h-32 border rounded-lg overflow-hidden bg-white">
              <NextImage src={details.cancelledChequeUrl} alt="Cancelled Cheque" fill className="object-contain p-1"/>
            </div>
        </div>
      )}
    </div>
  );
};


export default function ProviderApplicationDetailsModal({
  application,
  isOpen,
  onClose,
  onUpdateStatus,
  isLoadingStatusUpdate,
}: ProviderApplicationDetailsModalProps) {
  const [adminNotes, setAdminNotes] = useState("");
  const { toast } = useToast();
  const { settings: globalCompanySettings } = useGlobalSettings();
  const { config: appConfig } = useApplicationConfig();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [verifyingDocType, setVerifyingDocType] = useState<string | null>(null);
  const router = useRouter();

  const [allAdminCategories, setAllAdminCategories] = useState<{ id: string; name: string }[]>([]);
  const [allAdminServices, setAllAdminServices] = useState<{ id: string; name: string; categoryId?: string; categoryName?: string }[]>([]);
  
  const [additionalCats, setAdditionalCats] = useState<{ id: string; name: string }[]>([]);
  const [additionalServicesList, setAdditionalServicesList] = useState<{ id: string; name: string; categoryName?: string }[]>([]);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState("");
  const [isUpdatingCategories, setIsUpdatingCategories] = useState(false);

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [isUpdatingServices, setIsUpdatingServices] = useState(false);

  const [isOnlineStatus, setIsOnlineStatus] = useState<boolean>(true);
  const [isUpdatingOnline, setIsUpdatingOnline] = useState(false);

  useEffect(() => {
    if (application) {
      setAdminNotes(application.adminReviewNotes || "");
      setAdditionalCats(application.additionalCategories || []);
      setAdditionalServicesList(application.additionalServices || []);
      setIsOnlineStatus(application.isOnline !== false);
    } else {
      setAdminNotes("");
      setAdditionalCats([]);
      setAdditionalServicesList([]);
      setIsOnlineStatus(true);
    }
  }, [application]);

  const handleToggleOnlineAdmin = async () => {
    if (!application?.id || isUpdatingOnline) return;
    setIsUpdatingOnline(true);
    const newStatus = !isOnlineStatus;
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, application.id);
      await updateDoc(appDocRef, {
        isOnline: newStatus,
        updatedAt: Timestamp.now()
      });
      setIsOnlineStatus(newStatus);
      toast({
        title: newStatus ? "Provider Set to Online" : "Provider Set to Offline",
        description: newStatus 
          ? `Provider "${application.fullName || 'Provider'}" is now Online and receiving bookings.`
          : `Provider "${application.fullName || 'Provider'}" is now Offline (paused from bookings & map).`
      });
    } catch (e: any) {
      console.error("Error updating online status:", e);
      toast({ title: "Error", description: e.message || "Failed to update availability status.", variant: "destructive" });
    } finally {
      setIsUpdatingOnline(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const fetchCategoriesAndServices = async () => {
        try {
          const [catsSnap, subCatsSnap, servicesSnap] = await Promise.all([
            getDocs(query(collection(db, "adminCategories"), where("isActive", "==", true), orderBy("name"))),
            getDocs(collection(db, "adminSubCategories")),
            getDocs(query(collection(db, "adminServices"), where("isActive", "==", true), orderBy("name")))
          ]);

          const catMap: Record<string, string> = {};
          const categoriesList = catsSnap.docs.map(d => {
            const name = d.data().name || d.id;
            catMap[d.id] = name;
            return { id: d.id, name };
          });
          setAllAdminCategories(categoriesList);

          const subCatParentMap: Record<string, string> = {};
          subCatsSnap.docs.forEach(d => {
            const data = d.data();
            if (data.parentId) {
              subCatParentMap[d.id] = data.parentId;
            }
          });

          const servicesList = servicesSnap.docs.map(d => {
            const data = d.data();
            const parentCatId = data.subCategoryId ? subCatParentMap[data.subCategoryId] : undefined;
            const categoryName = parentCatId ? catMap[parentCatId] : undefined;
            return {
              id: d.id,
              name: data.name || 'Unnamed Service',
              categoryId: parentCatId,
              categoryName: categoryName || 'Service'
            };
          });
          setAllAdminServices(servicesList);
        } catch (e) {
          console.error("Error fetching admin categories/services for provider modal:", e);
        }
      };
      fetchCategoriesAndServices();
    }
  }, [isOpen]);

  const handleAddCategory = async (catObj: { id: string; name: string }) => {
    if (!application?.id) return;

    setIsUpdatingCategories(true);
    try {
      const newAdditional = [...additionalCats.filter(c => c.id !== catObj.id), catObj];
      const newAllCategoryIds = Array.from(new Set([
        application.workCategoryId,
        ...newAdditional.map(c => c.id)
      ].filter(Boolean) as string[]));

      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, application.id);
      await updateDoc(appDocRef, {
        additionalCategories: newAdditional,
        allCategoryIds: newAllCategoryIds,
        updatedAt: Timestamp.now()
      });

      setAdditionalCats(newAdditional);
      setIsCategoryModalOpen(false);
      setCategorySearchQuery("");
      toast({ title: "Category Added", description: `Added "${catObj.name}" to provider's categories.` });
    } catch (e: any) {
      console.error("Error adding category to provider:", e);
      toast({ title: "Error", description: e.message || "Failed to add category.", variant: "destructive" });
    } finally {
      setIsUpdatingCategories(false);
    }
  };

  const handleRemoveCategory = async (catIdToRemove: string) => {
    if (!application?.id) return;

    setIsUpdatingCategories(true);
    try {
      const newAdditional = additionalCats.filter(c => c.id !== catIdToRemove);
      const newAllCategoryIds = Array.from(new Set([
        application.workCategoryId,
        ...newAdditional.map(c => c.id)
      ].filter(Boolean) as string[]));

      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, application.id);
      await updateDoc(appDocRef, {
        additionalCategories: newAdditional,
        allCategoryIds: newAllCategoryIds,
        updatedAt: Timestamp.now()
      });

      setAdditionalCats(newAdditional);
      toast({ title: "Category Removed", description: "Category removed from provider." });
    } catch (e: any) {
      console.error("Error removing category from provider:", e);
      toast({ title: "Error", description: e.message || "Failed to remove category.", variant: "destructive" });
    } finally {
      setIsUpdatingCategories(false);
    }
  };

  const handleAddService = async (serviceObj: { id: string; name: string; categoryName?: string }) => {
    if (!application?.id) return;

    setIsUpdatingServices(true);
    try {
      const newServices = [...additionalServicesList.filter(s => s.id !== serviceObj.id), serviceObj];
      const newAdditionalServiceIds = Array.from(new Set(newServices.map(s => s.id)));

      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, application.id);
      await updateDoc(appDocRef, {
        additionalServices: newServices,
        additionalServiceIds: newAdditionalServiceIds,
        updatedAt: Timestamp.now()
      });

      setAdditionalServicesList(newServices);
      setIsServiceModalOpen(false);
      setServiceSearchQuery("");
      toast({ title: "Service Added", description: `Added "${serviceObj.name}" to provider's services.` });
    } catch (e: any) {
      console.error("Error adding service to provider:", e);
      toast({ title: "Error", description: e.message || "Failed to add service.", variant: "destructive" });
    } finally {
      setIsUpdatingServices(false);
    }
  };

  const handleRemoveService = async (serviceIdToRemove: string) => {
    if (!application?.id) return;

    setIsUpdatingServices(true);
    try {
      const newServices = additionalServicesList.filter(s => s.id !== serviceIdToRemove);
      const newAdditionalServiceIds = Array.from(new Set(newServices.map(s => s.id)));

      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, application.id);
      await updateDoc(appDocRef, {
        additionalServices: newServices,
        additionalServiceIds: newAdditionalServiceIds,
        updatedAt: Timestamp.now()
      });

      setAdditionalServicesList(newServices);
      toast({ title: "Service Removed", description: "Specific service removed from provider." });
    } catch (e: any) {
      console.error("Error removing service from provider:", e);
      toast({ title: "Error", description: e.message || "Failed to remove service.", variant: "destructive" });
    } finally {
      setIsUpdatingServices(false);
    }
  };

  if (!application) return null;

  const handleStatusAction = (newStatus: ProviderApplicationStatus) => {
    if (!application?.id) return;

    if (newStatus === 'rejected' || newStatus === 'needs_update') {
        if (!adminNotes.trim()) {
            toast({
              title: "Notes Required",
              description: "Please provide notes for approval, rejection, or requesting updates.",
              variant: "destructive"
            });
            return;
        }
    }
    onUpdateStatus(application.id, newStatus, adminNotes);
  };

  const handleVerifyDocument = async (docType: string) => {
    if (!application?.id) return;
    setVerifyingDocType(docType);
    
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, application.id);
      const updatePayload: any = { updatedAt: Timestamp.now() };

      if (docType === 'aadhaar') {
        updatePayload['aadhaar.verified'] = true;
      } else if (docType === 'pan') {
        updatePayload['pan.verified'] = true;
      } else if (docType === 'bank') {
        updatePayload['bankDetails.verified'] = true;
      } else {
        // Find and update in additionalDocuments array
        const updatedDocs = application.additionalDocuments?.map(d => 
          d.docType === docType ? { ...d, verified: true } : d
        );
        updatePayload['additionalDocuments'] = updatedDocs;
      }

      await updateDoc(appDocRef, updatePayload);
      toast({ title: "Verified", description: "Document has been marked as verified." });
    } catch (error) {
      console.error("Error verifying document:", error);
      toast({ title: "Error", description: "Could not verify document.", variant: "destructive" });
    } finally {
      setVerifyingDocType(null);
    }
  };

  const handleDownloadProviderPdf = async () => {
    if (!application) return;
    setIsDownloadingPdf(true);
    try {
      const companyInfo = {
        name: globalCompanySettings?.websiteName || "Yourbrand.in",
        address: globalCompanySettings?.address || "Company Address Placeholder",
        contactEmail: globalCompanySettings?.contactEmail || 'support@example.com',
        contactMobile: globalCompanySettings?.contactMobile || '+91-XXXXXXXXXX',
        logoUrl: globalCompanySettings?.logoUrl || undefined,
      };
      const pdfDataUri = await generateProviderApplicationPdf(application, companyInfo, appConfig?.customBankFields);
      triggerPdfDownload(pdfDataUri, `ProviderApp-${application.fullName?.replace(/\s+/g, '_') || application.id}.pdf`);
    } catch (error) {
      console.error("Error generating or downloading provider PDF:", error);
      toast({ title: "PDF Error", description: (error as Error).message || "Could not generate or download PDF.", variant: "destructive" });
    } finally {
      setIsDownloadingPdf(false);
    }
  };


  return (
    <>
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl w-[calc(100vw-6px)] sm:w-[90vw] h-[calc(100vh-6px)] max-h-[calc(100vh-6px)] grid grid-rows-[auto_1fr_auto] p-0 overflow-x-hidden">
        <DialogHeader className="p-4 sm:p-3 border-b flex-shrink-0 w-full max-w-full overflow-hidden">
          <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
            <Avatar className="h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0">
              <AvatarImage src={application.profilePhotoUrl || undefined} alt={application.fullName || "Provider"} />
              <AvatarFallback className="text-xl sm:text-2xl">{application.fullName ? application.fullName[0].toUpperCase() : "P"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-3 flex-wrap">
              <DialogTitle className="text-xl sm:text-2xl break-words max-w-full font-bold">{application.fullName || "Provider Application"}</DialogTitle>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap mt-1 sm:mt-0">
                <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/40">ID: {application.id}</span>
                <Badge variant="outline" className="text-xs capitalize bg-background shrink-0">{application.status.replace(/_/g, ' ')}</Badge>
                {application.status === 'approved' && (
                  <div
                    onClick={() => !isUpdatingOnline && handleToggleOnlineAdmin()}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold transition-all cursor-pointer select-none",
                      isOnlineStatus
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                        : "bg-muted/80 border-border text-muted-foreground hover:bg-muted"
                    )}
                    title={isOnlineStatus ? "Click switch to set provider Offline" : "Click switch to set provider Online"}
                  >
                    <span className={cn("h-2 w-2 rounded-full", isOnlineStatus ? "bg-emerald-500 animate-pulse" : "bg-zinc-400")} />
                    <span>{isOnlineStatus ? "Online" : "Offline"}</span>
                    {isUpdatingOnline ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={isOnlineStatus}
                        onCheckedChange={handleToggleOnlineAdmin}
                        className="scale-[0.65] origin-center data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-700 pointer-events-none"
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col flex-grow min-h-0 w-full overflow-hidden">
          <Tabs defaultValue="work" className="flex flex-col flex-grow min-h-0 overflow-hidden w-full">
            {/* Sticky Tabs List at the top of content */}
            <div className="px-4 sm:px-6 pt-4 pb-2 border-b flex-shrink-0 w-full bg-muted/10">
              <TabsList className="h-11 w-full justify-start gap-1 bg-muted p-1 overflow-x-auto no-scrollbar flex-nowrap rounded-lg">
                <TabsTrigger value="work" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><Briefcase className="mr-1.5 h-4 w-4 shrink-0"/>Category & Skills</TabsTrigger>
                <TabsTrigger value="personal" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><UserCircle className="mr-1.5 h-4 w-4 shrink-0"/>Personal Info</TabsTrigger>
                <TabsTrigger value="kyc" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><FileText className="mr-1.5 h-4 w-4 shrink-0"/>KYC Documents</TabsTrigger>
                <TabsTrigger value="bank" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><Banknote className="mr-1.5 h-4 w-4 shrink-0"/>Location & Bank</TabsTrigger>
                <TabsTrigger value="confirmation" className="px-3 py-1.5 text-xs sm:text-sm whitespace-nowrap rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"><EditIcon className="mr-1.5 h-4 w-4 shrink-0"/>Status</TabsTrigger>
              </TabsList>
            </div>

            {/* Scrollable Tab Content Wrapper */}
            <div className="flex-grow overflow-y-auto min-h-0 p-4 sm:p-3 w-full">
              <TabsContent value="work" className="space-y-1 focus-visible:outline-none focus-visible:ring-0 mt-0 w-full">
                <DetailRow label="Primary Category" value={application.workCategoryName || 'N/A'} />

                {/* Additional Categories Section */}
                <div className="py-3 border-b border-border/40 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div>
                      <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider block">Additional Categories</span>
                      <span className="text-[11px] text-muted-foreground">Provider can receive bookings for any service in these categories</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0 self-start sm:self-auto gap-1 border-primary/40 text-primary hover:bg-primary/5"
                      onClick={() => {
                        setCategorySearchQuery("");
                        setIsCategoryModalOpen(true);
                      }}
                      disabled={isUpdatingCategories}
                    >
                      <Plus className="h-3 w-3" />
                      Add Category
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center min-h-[28px]">
                    {additionalCats.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No additional categories assigned.</span>
                    ) : (
                      additionalCats.map(cat => (
                        <Badge key={cat.id} variant="secondary" className="px-2.5 py-1 text-xs flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 font-medium">
                          <span>{cat.name}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCategory(cat.id)}
                            disabled={isUpdatingCategories}
                            className="hover:text-destructive hover:bg-destructive/10 rounded p-0.5 transition-colors"
                            title={`Remove ${cat.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                {/* Additional Specific Services Section */}
                <div className="py-3 border-b border-border/40 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                    <div>
                      <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider block">Additional Specific Services</span>
                      <span className="text-[11px] text-muted-foreground">Assign individual services (e.g. Drilling, Photo Frame Fixing) from other categories</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs shrink-0 self-start sm:self-auto gap-1 border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/5 dark:text-emerald-400"
                      onClick={() => {
                        setServiceSearchQuery("");
                        setIsServiceModalOpen(true);
                      }}
                      disabled={isUpdatingServices}
                    >
                      <Plus className="h-3 w-3" />
                      Add Specific Service
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center min-h-[28px]">
                    {additionalServicesList.length === 0 ? (
                      <span className="text-xs text-muted-foreground italic">No specific individual services assigned.</span>
                    ) : (
                      additionalServicesList.map(srv => (
                        <Badge key={srv.id} variant="secondary" className="px-2.5 py-1 text-xs flex items-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium">
                          <span>{srv.name}</span>
                          {srv.categoryName && (
                            <span className="text-[10px] opacity-75 font-normal">({srv.categoryName})</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveService(srv.id)}
                            disabled={isUpdatingServices}
                            className="hover:text-destructive hover:bg-destructive/10 rounded p-0.5 transition-colors"
                            title={`Remove ${srv.name}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                <DetailRow label="Experience" value={application.experienceLevelLabel || 'N/A'} />
                <DetailRow label="Skill Level" value={application.skillLevelLabel || 'N/A'} />
                <div className="pt-4">
                  <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Bio / About Me</Label>
                  <p className="text-muted-foreground whitespace-pre-wrap mt-1.5 border p-4 rounded-xl bg-muted/10 text-sm leading-relaxed border-border/40">
                    {application.bio || 'No bio provided.'}
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="personal" className="space-y-1 focus-visible:outline-none focus-visible:ring-0 mt-0 w-full">
                {application.profilePhotoUrl && (
                  <div className="py-3 border-b border-border/40 flex flex-col items-start gap-1">
                    <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Profile Photo</span>
                    <div className="flex items-center gap-4 mt-1">
                      <div className="relative w-24 h-24 border-2 border-primary/20 rounded-full overflow-hidden bg-muted shadow-sm">
                        <NextImage src={application.profilePhotoUrl} alt="Provider Profile Photo" fill className="object-cover"/>
                      </div>
                      <a href={application.profilePhotoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 border px-2.5 py-1.5 rounded-lg bg-background hover:bg-muted/30 transition-colors">
                        View Full Size <ExternalLink className="h-3 w-3"/>
                      </a>
                    </div>
                  </div>
                )}
                <DetailRow label="Full Name" value={application.fullName || 'N/A'} />
                <DetailRow 
                  label="Email" 
                  value={
                    application.email ? (
                      <div className="flex items-center justify-between w-full gap-2">
                        <span>{application.email}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-muted"
                            onClick={() => {
                              navigator.clipboard.writeText(application.email!);
                              toast({ title: "Copied", description: "Email address copied to clipboard." });
                            }}
                            title="Copy Email"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <a 
                            href={`mailto:${application.email}`} 
                            className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                            title="Send Email"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    ) : 'N/A'
                  } 
                />
                <DetailRow 
                  label="Mobile" 
                  value={
                    application.mobileNumber ? (
                      <div className="flex items-center justify-between w-full gap-2">
                        <span>{application.mobileNumber}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-muted"
                            onClick={() => {
                              navigator.clipboard.writeText(application.mobileNumber!);
                              toast({ title: "Copied", description: "Mobile number copied to clipboard." });
                            }}
                            title="Copy Mobile"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <a 
                            href={`tel:${application.mobileNumber}`} 
                            className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                            title="Call Mobile"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    ) : 'N/A'
                  } 
                />
                <DetailRow 
                  label="Alternate Mobile" 
                  value={
                    application.alternateMobile && application.alternateMobile !== 'N/A' ? (
                      <div className="flex items-center justify-between w-full gap-2">
                        <span>{application.alternateMobile}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-muted"
                            onClick={() => {
                              navigator.clipboard.writeText(application.alternateMobile!);
                              toast({ title: "Copied", description: "Alternate mobile number copied to clipboard." });
                            }}
                            title="Copy Alternate Mobile"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <a 
                            href={`tel:${application.alternateMobile}`} 
                            className="h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                            title="Call Alternate Mobile"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    ) : 'N/A'
                  } 
                />
                <DetailRow label="Address" value={application.address || 'N/A'} />
                <DetailRow label="Age" value={application.age || 'N/A'} />
                <DetailRow label="Qualification" value={application.qualificationLabel || 'N/A'} />
                <DetailRow label="Languages Spoken" value={application.languagesSpokenLabels?.join(', ') || 'N/A'} />
                <DetailRow label="Submitted" value={formatTimestampToReadable(application.submittedAt || application.createdAt)} />
              </TabsContent>

              <TabsContent value="kyc" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 w-full">
                {application.aadhaar && (application.aadhaar.docNumber || application.aadhaar.frontImageUrl) && (
                  <KycDocDisplay 
                    doc={application.aadhaar} 
                    docName="Aadhaar Card"
                    onVerify={() => handleVerifyDocument('aadhaar')}
                    isVerifying={verifyingDocType === 'aadhaar'}
                  />
                )}
                {application.pan && (application.pan.docNumber || application.pan.frontImageUrl) && (
                  <KycDocDisplay 
                    doc={application.pan} 
                    docName="PAN Card"
                    onVerify={() => handleVerifyDocument('pan')}
                    isVerifying={verifyingDocType === 'pan'}
                  />
                )}
                
                {application.additionalDocuments && application.additionalDocuments.length > 0 && (
                  <div className="pt-2">
                    <h4 className="font-bold text-sm text-primary uppercase tracking-wider mb-3 border-b pb-1">Additional Documents</h4>
                    <div className="space-y-4">
                      {application.additionalDocuments.map((doc, idx) => (
                        <KycDocDisplay 
                          key={idx} 
                          doc={doc} 
                          docName={doc.docLabel || doc.docType || `Additional Document ${idx+1}`}
                          onVerify={() => handleVerifyDocument(doc.docType)}
                          isVerifying={verifyingDocType === doc.docType}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="bank" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 w-full">
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-primary uppercase tracking-wider mb-2">Work Area</h4>
                  {application.workAreaAddress && (
                    <DetailRow label="Location / Zone" value={application.workAreaAddress} />
                  )}
                  <DetailRow label="Center Coordinates" value={application.workAreaCenter ? `${application.workAreaCenter.latitude.toFixed(6)}, ${application.workAreaCenter.longitude.toFixed(6)}` : 'N/A'} />
                  <DetailRow label="Service Radius" value={application.workAreaRadiusKm ? `${application.workAreaRadiusKm} km` : 'N/A'} />
                  {application.workAreaCenter && (
                    <div className="pt-2">
                      <Button variant="outline" size="sm" onClick={() => window.open(`https://www.google.com/maps?q=${application.workAreaCenter?.latitude},${application.workAreaCenter?.longitude}`, '_blank')} className="h-8 text-xs">
                        View on Google Maps <ExternalLink className="ml-1.5 h-3.5 w-3.5"/>
                      </Button>
                    </div>
                  )}
                </div>
                <Separator className="my-2" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-primary uppercase tracking-wider mb-2">Bank Details</h4>
                  <BankDetailsDisplay 
                    details={application.bankDetails} 
                    customFieldsConfig={appConfig?.customBankFields}
                    onVerify={() => handleVerifyDocument('bank')}
                    isVerifying={verifyingDocType === 'bank'}
                  />
                </div>
              </TabsContent>

              <TabsContent value="confirmation" className="space-y-4 focus-visible:outline-none focus-visible:ring-0 mt-0 w-full">
                {application.status === 'approved' && (
                  <div className="space-y-2 border p-4 rounded-xl bg-muted/10 border-border/60">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-sm text-primary">Availability Status (Online / Offline)</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isOnlineStatus 
                            ? "Provider is currently Online and active for customer bookings, map coverage, and auto-dispatch."
                            : "Provider is currently Offline (paused). Excluded from map serviceability, time slots, and auto-dispatch."}
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
                        <span className={cn("text-xs font-bold", isOnlineStatus ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                          {isOnlineStatus ? "Online" : "Offline"}
                        </span>
                        {isUpdatingOnline ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : (
                          <Switch
                            checked={isOnlineStatus}
                            onCheckedChange={handleToggleOnlineAdmin}
                            className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-700 cursor-pointer"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-primary uppercase tracking-wider mb-2">Terms Confirmation</h4>
                  <DetailRow 
                    label="Terms Agreement" 
                    value={application.termsConfirmedAt ? (
                      <span className="flex items-center text-green-600 font-semibold"><CheckCircle className="mr-1.5 h-4 w-4 shrink-0"/>Confirmed on {formatTimestampToReadable(application.termsConfirmedAt)}</span>
                    ) : (
                      <span className="flex items-center text-destructive font-semibold"><XCircle className="mr-1.5 h-4 w-4 shrink-0"/>Not Confirmed</span>
                    )} 
                  />
                </div>
                {(appConfig?.enableSignatureUpload !== false || application.signatureUrl) && (
                  <>
                    <Separator className="my-2" />
                    <div className="space-y-1">
                      <h4 className="font-bold text-sm text-primary uppercase tracking-wider mb-2">Signature</h4>
                      {application.signatureUrl ? (
                        <div className="py-2.5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-muted-foreground text-xs uppercase tracking-wider">Signature Image</span>
                            <a href={application.signatureUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                              View Full Size <ExternalLink className="h-3 w-3"/>
                            </a>
                          </div>
                          <div className="relative w-48 h-24 border rounded-lg overflow-hidden bg-white">
                            <NextImage src={application.signatureUrl} alt="Provider Signature" fill className="object-contain p-1"/>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-sm">No signature provided.</p>
                      )}
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Admin Review Notes (Now scrolls with content) */}
              {(application.status === 'pending_review' || application.status === 'needs_update' || application.status === 'rejected') && (
                <div className="mt-6 pt-4 border-t w-full">
                  <Label htmlFor="adminReviewNotes" className="font-semibold text-sm">Admin Review Notes:</Label>
                  <Textarea
                    id="adminReviewNotes"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add notes for approval, rejection, or update request..."
                    rows={2}
                    className="mt-1.5 text-sm bg-background"
                    disabled={isLoadingStatusUpdate}
                  />
                </div>
              )}
            </div>
          </Tabs>
        </div>

        <DialogFooter className="p-3 sm:p-3 border-t bg-muted/50 flex flex-col gap-2 sm:gap-0 sm:flex-row sm:justify-between items-center flex-shrink-0 w-full">
          {/* Mobile Layout (Visible only on mobile) */}
          <div className="flex flex-col gap-2 w-full sm:hidden">
            {/* Row 1: Status Actions */}
            <div className="grid grid-cols-3 gap-1.5 w-full">
              {application.status !== 'approved' && (
                <Button 
                  size="sm"
                  onClick={() => handleStatusAction('approved')} 
                  disabled={isLoadingStatusUpdate} 
                  className="bg-green-600 hover:bg-green-700 text-[11px] h-8 px-1"
                >
                  {isLoadingStatusUpdate ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <CheckCircle className="mr-1 h-3.5 w-3.5 shrink-0"/>}
                  Approve
                </Button>
              )}
              {application.status !== 'rejected' && (
                <Button 
                  size="sm"
                  variant="destructive" 
                  onClick={() => handleStatusAction('rejected')} 
                  disabled={isLoadingStatusUpdate} 
                  className="text-[11px] h-8 px-1"
                >
                  {isLoadingStatusUpdate ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <XCircle className="mr-1 h-3.5 w-3.5 shrink-0"/>}
                  Reject
                </Button>
              )}
              {application.status !== 'needs_update' && (
                <Button 
                  size="sm"
                  variant="outline" 
                  onClick={() => handleStatusAction('needs_update')} 
                  disabled={isLoadingStatusUpdate} 
                  className="border-yellow-500 text-yellow-600 hover:bg-yellow-500/10 text-[11px] h-8 px-0.5"
                >
                  {isLoadingStatusUpdate ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <AlertTriangle className="mr-1 h-3.5 w-3.5 shrink-0"/>}
                  Needs Update
                </Button>
              )}
            </div>

            {/* Row 2: Secondary Actions */}
            <div className="grid grid-cols-2 gap-1.5 w-full">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDownloadProviderPdf} 
                disabled={isLoadingStatusUpdate || isDownloadingPdf} 
                className="text-[11px] h-8 px-2 w-full flex items-center justify-center gap-1"
              >
                {isDownloadingPdf ? <Loader2 className="mr-1 h-3 w-3 animate-spin"/> : <Download className="mr-1 h-3 w-3"/>}
                PDF
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push(`/provider-registration?editApplicationId=${application.id}`)}
                disabled={isLoadingStatusUpdate}
                className="text-[11px] h-8 px-2 w-full flex items-center justify-center gap-1"
              >
                <EditIcon className="h-3 w-3" />
                Edit
              </Button>
            </div>
          </div>

          {/* Desktop Layout (Hidden on Mobile) */}
          <div className="hidden sm:flex sm:justify-between sm:items-center w-full">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleDownloadProviderPdf} 
              disabled={isLoadingStatusUpdate || isDownloadingPdf} 
              className="text-xs h-9 px-3"
            >
              {isDownloadingPdf ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <Download className="mr-1.5 h-3.5 w-3.5"/>}
              Download PDF
            </Button>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => router.push(`/provider-registration?editApplicationId=${application.id}`)}
                disabled={isLoadingStatusUpdate}
                className="text-xs h-9 px-3 flex items-center gap-1.5"
              >
                <EditIcon className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              
              {application.status !== 'approved' && (
                <Button 
                  size="sm"
                  onClick={() => handleStatusAction('approved')} 
                  disabled={isLoadingStatusUpdate} 
                  className="bg-green-600 hover:bg-green-700 text-xs h-9 px-3"
                >
                  {isLoadingStatusUpdate ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <CheckCircle className="mr-1.5 h-3.5 w-3.5"/>}
                  Approve
                </Button>
              )}
              
              {application.status !== 'rejected' && (
                <Button 
                  size="sm"
                  variant="destructive" 
                  onClick={() => handleStatusAction('rejected')} 
                  disabled={isLoadingStatusUpdate} 
                  className="text-xs h-9 px-3"
                >
                  {isLoadingStatusUpdate ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <XCircle className="mr-1.5 h-3.5 w-3.5"/>}
                  Reject
                </Button>
              )}
              
              {application.status !== 'needs_update' && (
                <Button 
                  size="sm"
                  variant="outline" 
                  onClick={() => handleStatusAction('needs_update')} 
                  disabled={isLoadingStatusUpdate} 
                  className="border-yellow-500 text-yellow-600 hover:bg-yellow-500/10 text-xs h-9 px-3"
                >
                  {isLoadingStatusUpdate ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <AlertTriangle className="mr-1.5 h-3.5 w-3.5"/>}
                  Needs Update
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Searchable Category Pop-up Dialog */}
    <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
      <DialogContent className="max-w-md w-[92vw] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            Add Work Category
          </DialogTitle>
          <DialogDescription className="text-xs">
            Search and select an additional category to assign to this provider.
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search category name..."
              value={categorySearchQuery}
              onChange={(e) => setCategorySearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto divide-y divide-border/40 p-1">
          {allAdminCategories
            .filter(c => 
              c.id !== application.workCategoryId && 
              !additionalCats.some(a => a.id === c.id) &&
              c.name.toLowerCase().includes(categorySearchQuery.toLowerCase().trim())
            )
            .map(cat => (
              <div 
                key={cat.id} 
                className="flex items-center justify-between p-2.5 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
                onClick={() => handleAddCategory(cat)}
              >
                <span className="text-sm font-medium">{cat.name}</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Select
                </Button>
              </div>
            ))}

          {allAdminCategories.filter(c => 
            c.id !== application.workCategoryId && 
            !additionalCats.some(a => a.id === c.id) &&
            c.name.toLowerCase().includes(categorySearchQuery.toLowerCase().trim())
          ).length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No matching categories found.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* Searchable Specific Service Pop-up Dialog */}
    <Dialog open={isServiceModalOpen} onOpenChange={setIsServiceModalOpen}>
      <DialogContent className="max-w-lg w-[94vw] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-base font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4 text-emerald-600" />
            Add Specific Service
          </DialogTitle>
          <DialogDescription className="text-xs">
            Search and assign an individual service from any category (e.g. Drilling, Photo Frame Fixing).
          </DialogDescription>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by service name or category..."
              value={serviceSearchQuery}
              onChange={(e) => setServiceSearchQuery(e.target.value)}
              className="pl-8 h-9 text-xs"
              autoFocus
            />
          </div>
        </DialogHeader>

        <div className="max-h-80 overflow-y-auto divide-y divide-border/40 p-1">
          {allAdminServices
            .filter(s => 
              !additionalServicesList.some(a => a.id === s.id) &&
              (
                s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase().trim()) ||
                (s.categoryName && s.categoryName.toLowerCase().includes(serviceSearchQuery.toLowerCase().trim()))
              )
            )
            .map(srv => (
              <div 
                key={srv.id} 
                className="flex items-center justify-between p-2.5 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer gap-2"
                onClick={() => handleAddService(srv)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">{srv.name}</span>
                  {srv.categoryName && (
                    <span className="text-[11px] text-muted-foreground">{srv.categoryName}</span>
                  )}
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 shrink-0">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Select
                </Button>
              </div>
            ))}

          {allAdminServices.filter(s => 
            !additionalServicesList.some(a => a.id === s.id) &&
            (
              s.name.toLowerCase().includes(serviceSearchQuery.toLowerCase().trim()) ||
              (s.categoryName && s.categoryName.toLowerCase().includes(serviceSearchQuery.toLowerCase().trim()))
            )
          ).length === 0 && (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No matching services found.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
