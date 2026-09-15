
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, ShieldOff } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, query, orderBy, where, limit, addDoc } from '@/lib/mysqlDb';
import type {
  ProviderApplication,
  ProviderApplicationStatus,
  ProviderControlOptions,
  FirestoreCategory,
  FirestoreUser,
  BankDetails,
  PinCodeAreaMapping,
  FirestoreNotification,
} from '@/types/firestore';
import ProviderRegistrationStepper from '@/components/provider-registration/ProviderRegistrationStepper';
import Step0AuthPrompt from '@/components/provider-registration/Step0AuthPrompt';
import ApplicationStatusDisplay from '@/components/provider-registration/ApplicationStatusDisplay';
import Step1CategorySkills from '@/components/provider-registration/Step1CategorySkills';
import Step2PersonalInfo from '@/components/provider-registration/Step2PersonalInfo';
import Step3KycDocuments from '@/components/provider-registration/Step3KycDocuments';
import Step4LocationBank from '@/components/provider-registration/Step4LocationBank';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { sendNewProviderApplicationAdminEmail, type NewProviderApplicationAdminEmailInput } from "@/ai/flows/sendProviderApplicationAdminNotificationFlow";
import { getBaseUrl } from '@/lib/config';
import { useToast } from '@/hooks/use-toast';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';

const RegistrationCompleted = ({ isAdminEdit }: { isAdminEdit?: boolean }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-center text-2xl font-headline">
        {isAdminEdit ? "Application Updated" : "Application Submitted!"}
      </CardTitle>
    </CardHeader>
    <CardContent className="text-center">
      <p className="text-muted-foreground mb-6">
        {isAdminEdit 
          ? "The provider's application details have been successfully updated." 
          : "Thank you for submitting your provider application. We will review it and get back to you soon regarding the status."}
      </p>
      <Link href={isAdminEdit ? "/admin/provider-applications" : "/"}>
        <Button>{isAdminEdit ? "Back to Admin Panel" : "Back to Home"}</Button>
      </Link>
    </CardContent>
  </Card>
);

const PROVIDER_APPLICATION_COLLECTION = "providerApplications";
const PROVIDER_CONTROL_OPTIONS_COLLECTION = "providerControlOptions";

const removeUndefined = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Timestamp)) {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([_, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    );
  }
  return obj;
};

export default function ProviderRegistrationPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(0);
  const [applicationData, setApplicationData] = useState<Partial<ProviderApplication>>({});
  const [applicationStatus, setApplicationStatus] = useState<ProviderApplicationStatus | null>(null);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [isSavingStep, setIsSavingStep] = useState(false);

  const [controlOptions, setControlOptions] = useState<ProviderControlOptions | null>(null);
  const [isLoadingControls, setIsLoadingControls] = useState(true);
  const [userFirestoreData, setUserFirestoreData] = useState<Partial<FirestoreUser> | null>(null);

  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const { settings: globalSettings } = useGlobalSettings();

  const [isEditModeByAdmin, setIsEditModeByAdmin] = useState(false);
  const [editingApplicationIdForAdmin, setEditingApplicationIdForAdmin] = useState<string | null>(null);

  const formContainerRef = useRef<HTMLDivElement>(null);
  const prevStepRef = useRef<number | null>(null);

  useEffect(() => {
    const editAppId = searchParams.get('editApplicationId');
    if (editAppId && user?.email === ADMIN_EMAIL) {
      setEditingApplicationIdForAdmin(editAppId);
      setIsEditModeByAdmin(true);
    } else {
      setEditingApplicationIdForAdmin(null);
      setIsEditModeByAdmin(false);
    }
  }, [searchParams, user]);

  useEffect(() => {
    if (isLoadingPage || !formContainerRef.current) return;

    const isInitialOrRefresh = prevStepRef.current === null;
    const isForward = !isInitialOrRefresh && currentStep > (prevStepRef.current || 0);
    
    if (isInitialOrRefresh) {
      const timer = setTimeout(() => {
        const firstIncomplete = formContainerRef.current?.querySelector('.border-destructive, input:not([value]), textarea:not(:empty)') as HTMLElement;
        if (firstIncomplete) {
          firstIncomplete.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstIncomplete.focus();
        } else {
          formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 500);
      return () => clearTimeout(timer);
    }

    if (isForward) {
      const timer = setTimeout(() => {
        formContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      return () => clearTimeout(timer);
    }
    
    prevStepRef.current = currentStep;
  }, [currentStep, isLoadingPage]);

  const fetchControlOptions = useCallback(async () => {
    setIsLoadingControls(true);
    try {
      const fetchArrayOption = async (docId: string, fieldName: string) => {
        const docRef = doc(db, PROVIDER_CONTROL_OPTIONS_COLLECTION, docId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? (docSnap.data()[fieldName] as any[] || []) : [];
      };

      const categoriesSnap = await getDocs(query(collection(db, "adminCategories"), orderBy("order", "asc")));
      const fetchedCategories = categoriesSnap.docs.map(d => ({...d.data(), id: d.id } as FirestoreCategory));

      const [experienceLevels, skillLevels, qualificationOptions, languageOptions, additionalDocTypes, pinCodeMappingsDoc] = await Promise.all([
        fetchArrayOption("experienceLevels", "levels"),
        fetchArrayOption("skillLevels", "levels"),
        fetchArrayOption("qualificationOptions", "options"),
        fetchArrayOption("languageOptions", "options"),
        fetchArrayOption("additionalDocTypes", "options"),
        getDoc(doc(db, PROVIDER_CONTROL_OPTIONS_COLLECTION, "pinCodeAreaMappings")),
      ]);
      
      const fetchedPinCodeMappings = pinCodeMappingsDoc.exists() ? (pinCodeMappingsDoc.data().mappings as PinCodeAreaMapping[] || []) : [];

      setControlOptions({
        categories: fetchedCategories,
        experienceLevels,
        skillLevels,
        qualificationOptions,
        languageOptions,
        additionalDocTypes,
        pinCodeAreaMappings: fetchedPinCodeMappings.sort((a, b) => a.order - b.order),
      });
    } catch (error) {
      console.error("Error fetching control options:", error);
    } finally {
      setIsLoadingControls(false);
    }
  }, []);

  const fetchApplicationAndUserData = useCallback(async () => {
    const targetUserId = isEditModeByAdmin ? editingApplicationIdForAdmin : user?.uid;
    if (!targetUserId) {
      setIsLoadingPage(false);
      return;
    }
    setIsLoadingPage(true);
    try {
      const userDocRef = doc(db, "users", targetUserId);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        setUserFirestoreData(userDocSnap.data() as FirestoreUser);
      }

      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, targetUserId);
      const docSnap = await getDoc(appDocRef);
      const cachedStep = targetUserId ? sessionStorage.getItem(`provider_reg_current_step_${targetUserId}`) : null;
      
      if (docSnap.exists()) {
        const data = docSnap.data() as ProviderApplication;
        setApplicationData(data);
        setApplicationStatus(data.status);
        if (cachedStep) {
          setCurrentStep(parseInt(cachedStep, 10));
        } else if (!isEditModeByAdmin) {
          if (data.status === 'approved') {
            // No action needed
          } else if (data.status.startsWith('pending_step_')) {
            setCurrentStep(parseInt(data.status.replace('pending_step_', ''), 10));
          } else if (data.status === 'needs_update') {
            setCurrentStep(1); 
          }
        } else {
            setCurrentStep(1);
        }
      } else {
        if (isEditModeByAdmin) {
          toast({ title: "Error", description: "Application not found for editing.", variant: "destructive" });
          router.push('/admin/provider-applications');
          return;
        }
        if (cachedStep) {
          setCurrentStep(parseInt(cachedStep, 10));
        } else {
          setCurrentStep(1);
        }
      }
    } catch (error) {
      console.error("Error fetching provider application:", error);
    } finally {
      setIsLoadingPage(false);
    }
  }, [user, isEditModeByAdmin, editingApplicationIdForAdmin, router, toast]);

  useEffect(() => {
    if (!authLoading && !isLoadingAppConfig) {
      if (user || (isEditModeByAdmin && editingApplicationIdForAdmin)) {
        fetchApplicationAndUserData();
        fetchControlOptions();
      } else {
        setCurrentStep(0);
        setIsLoadingPage(false);
        setIsLoadingControls(false);
      }
    }
  }, [user, authLoading, fetchApplicationAndUserData, fetchControlOptions, isLoadingAppConfig, isEditModeByAdmin, editingApplicationIdForAdmin]);

  useEffect(() => {
    if (!isEditModeByAdmin && applicationStatus === 'approved') {
      router.push('/provider');
    }
  }, [applicationStatus, isEditModeByAdmin, router]);

  // Keep track of active step on page reload / refresh
  useEffect(() => {
    const targetUserId = editingApplicationIdForAdmin || user?.uid;
    if (targetUserId && currentStep > 0 && currentStep < 5) {
      sessionStorage.setItem(`provider_reg_current_step_${targetUserId}`, String(currentStep));
    }
  }, [currentStep, editingApplicationIdForAdmin, user]);

  // Clean up cached step upon registration completion
  useEffect(() => {
    const targetUserId = editingApplicationIdForAdmin || user?.uid;
    if (targetUserId && currentStep === 5) {
      sessionStorage.removeItem(`provider_reg_current_step_${targetUserId}`);
    }
  }, [currentStep, editingApplicationIdForAdmin, user]);

  const handleSaveStep = async (stepData: Partial<ProviderApplication>, nextStepStatus: ProviderApplicationStatus) => {
    const targetUserIdForSave = editingApplicationIdForAdmin || user?.uid;
    if (!targetUserIdForSave) return;
    setIsSavingStep(true);
  
    const currentStatusForSave = isEditModeByAdmin ? (applicationData.status || 'pending_review') : nextStepStatus;

    const currentAppData: Partial<ProviderApplication> = {
      ...applicationData,
      ...stepData,
      status: currentStatusForSave,
      userId: targetUserIdForSave,
      updatedAt: Timestamp.now(),
    };
  
    if (!currentAppData.createdAt && !isEditModeByAdmin) {
      currentAppData.createdAt = Timestamp.now();
    }
    setApplicationData(currentAppData);
  
    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, targetUserIdForSave);
      await setDoc(appDocRef, removeUndefined(currentAppData), { merge: true });
    } catch (error) {
      console.error("Error saving step data:", error);
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleNextStep = async (stepDataFromComponent: Partial<ProviderApplication>) => {
    const nextStep = currentStep + 1;
    const nextProviderStepStatus = `pending_step_${nextStep}` as ProviderApplicationStatus;
    await handleSaveStep(stepDataFromComponent, nextProviderStepStatus);
    setCurrentStep(nextStep);
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleFinalSubmitApplication = async (finalStepData: Partial<ProviderApplication>) => {
    const targetUserIdForSubmit = editingApplicationIdForAdmin || user?.uid;
    if (!targetUserIdForSubmit) return;
    setIsSavingStep(true);

    const completeFinalData: Partial<ProviderApplication> = {
      ...applicationData, ...finalStepData,
      updatedAt: Timestamp.now(),
    };
    
    if (isEditModeByAdmin) {
      completeFinalData.status = applicationData.status || 'pending_review';
    } else {
      completeFinalData.status = 'pending_review';
      if (!applicationData.submittedAt) completeFinalData.submittedAt = Timestamp.now();
    }
    setApplicationData(completeFinalData);

    try {
      const appDocRef = doc(db, PROVIDER_APPLICATION_COLLECTION, targetUserIdForSubmit);
      await setDoc(appDocRef, removeUndefined(completeFinalData), { merge: true });

      localStorage.removeItem('yourbrand_reg_step1');
      localStorage.removeItem('yourbrand_reg_step2');
      localStorage.removeItem('yourbrand_reg_step3');
      localStorage.removeItem('yourbrand_reg_step4');

      if (isEditModeByAdmin) {
        toast({ title: "Application Updated", description: "Provider application details saved by admin." });
        router.push('/admin/provider-applications');
      } else {
        setApplicationStatus('pending_review');
        setCurrentStep(5);

        const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
        const adminSnapshot = await getDocs(adminQuery);
        if (!adminSnapshot.empty) {
          const adminUid = adminSnapshot.docs[0].id;
          const adminNotificationData: FirestoreNotification = {
            userId: adminUid, title: "New Provider Application",
            message: `Provider ${completeFinalData.fullName || user?.email} has submitted an application.`,
            type: "admin_alert", href: `/admin/provider-applications?appId=${targetUserIdForSubmit}`,
            read: false, createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), adminNotificationData);
        }

        if (appConfig.smtpHost && appConfig.senderEmail) {
          const emailInput: NewProviderApplicationAdminEmailInput = {
            applicationId: targetUserIdForSubmit,
            providerName: completeFinalData.fullName || user?.displayName || "N/A",
            providerEmail: completeFinalData.email || user?.email || "no-reply@yourbrand.in",
            providerCategory: completeFinalData.workCategoryName || "N/A",
            applicationUrl: `${getBaseUrl()}/admin/provider-applications?appId=${targetUserIdForSubmit}`,
            smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort,
            smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail,
            siteName: globalSettings.websiteName || "Yourbrand",
            logoUrl: globalSettings.logoUrl,
          };
          try { 
            const result = await sendNewProviderApplicationAdminEmail(emailInput); 
            if (!result.success) {
              console.error("Email flow reported failure:", result.message);
            }
          } catch (emailError) { 
            console.error("EMAIL ERROR FULL:", emailError); 
          }
        }
      }
    } catch (error) {
      console.error("Error during final application submission:", error);
      toast({ title: "Error", description: `Could not submit application.`, variant: "destructive" });
    } finally {
      setIsSavingStep(false);
    }
  };

  if (authLoading || isLoadingPage || isLoadingControls || isLoadingAppConfig) {
    return (<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>);
  }

  if (!appConfig.isProviderRegistrationEnabled && user?.email !== ADMIN_EMAIL && !isEditModeByAdmin) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <ShieldOff className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
        <h1 className="text-3xl font-bold text-foreground mb-4">Registrations Closed</h1>
        <p className="text-lg text-muted-foreground mb-8">We are not accepting new provider registrations at this time. Please check back later.</p>
        <Link href="/"><Button variant="outline">Go Back to Home</Button></Link>
      </div>
    );
  }

  const renderStepContent = () => {
    if (!isEditModeByAdmin && applicationStatus === 'approved') return <ApplicationStatusDisplay status="approved" />;
    if (!isEditModeByAdmin && applicationStatus === 'rejected') return <ApplicationStatusDisplay status="rejected" message={applicationData.adminReviewNotes} />;
    if (!isEditModeByAdmin && applicationStatus === 'pending_review') return <ApplicationStatusDisplay status="pending_review" />;

    switch (currentStep) {
      case 0: return <Step0AuthPrompt redirectUrl="/provider-registration" />;
      case 1: return <Step1CategorySkills onNext={handleNextStep} initialData={applicationData} controlOptions={controlOptions} isSaving={isSavingStep} userUid={editingApplicationIdForAdmin || user?.uid || ""} isEditModeByAdmin={isEditModeByAdmin} />;
      case 2: return <Step2PersonalInfo onNext={handleNextStep} onPrevious={handlePreviousStep} initialData={applicationData} controlOptions={controlOptions} isSaving={isSavingStep} userUid={editingApplicationIdForAdmin || user?.uid || ""} isEditModeByAdmin={isEditModeByAdmin} />;
      case 3: return <Step3KycDocuments onNext={handleNextStep} onPrevious={handlePreviousStep} initialData={applicationData} controlOptions={controlOptions} isSaving={isSavingStep} userUid={editingApplicationIdForAdmin || user?.uid || ""} isEditModeByAdmin={isEditModeByAdmin} enableDefaultIndianKyc={appConfig?.enableDefaultIndianKyc === undefined ? true : appConfig.enableDefaultIndianKyc} />;
      case 4: return <Step4LocationBank onSubmit={handleFinalSubmitApplication} onPrevious={handlePreviousStep} initialData={applicationData} controlOptions={controlOptions} isSaving={isSavingStep} userUid={editingApplicationIdForAdmin || user?.uid || ""} isEditModeByAdmin={isEditModeByAdmin} />;
      case 5: return <RegistrationCompleted isAdminEdit={isEditModeByAdmin} />;
      default: return <Card><CardContent className="pt-6">Loading step...</CardContent></Card>;
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 min-h-screen" ref={formContainerRef}>
      <Card className="max-w-3xl mx-auto shadow-xl scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-2xl md:text-3xl font-headline text-center">
            {isEditModeByAdmin ? "Edit Provider Application" : "Provider Registration"}
          </CardTitle>
          {currentStep > 0 && currentStep < 5 && (
            <CardDescription className="text-center">
              {isEditModeByAdmin 
                ? `Editing application for: ${applicationData.fullName || editingApplicationIdForAdmin}`
                : "Complete the steps below to join our network."}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {currentStep > 0 && currentStep < 5 && (
            <ProviderRegistrationStepper currentStep={currentStep} />
          )}
          <div className="mt-6">
            {renderStepContent()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
