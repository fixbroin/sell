
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProviderApplication, KycDocument, BankDetails, ProviderApplicationStatus } from '@/types/firestore';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserCircle, Briefcase, FileText, Banknote, MapPin, Image as ImageIcon, ShieldCheck, CheckCircle, AlertTriangle, XCircle, Loader2, Download, Edit as EditIcon, ExternalLink, Copy, Mail, Phone } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
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
import { doc, updateDoc, Timestamp } from '@/lib/mysqlDb';
import { useRouter } from 'next/navigation';

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

  useEffect(() => {
    if (application) {
      setAdminNotes(application.adminReviewNotes || "");
    } else {
      setAdminNotes("");
    }
  }, [application]);

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
                <DetailRow label="Category" value={application.workCategoryName || 'N/A'} />
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
  );
}
