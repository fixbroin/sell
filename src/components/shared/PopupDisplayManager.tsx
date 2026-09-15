
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import AppImage from '@/components/ui/AppImage';
import { XIcon, Mail, Loader2, User, Phone,CheckCircle } from 'lucide-react'; 
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, addDoc, Timestamp, limit } from '@/lib/mysqlDb'; 
import type { FirestorePopup, PopupDisplayFrequency, InquirySource, InquiryStatus, FirestorePopupInquiry, FirestoreNotification } from '@/types/firestore'; 
import { usePathname, useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth'; 
import { getGuestId } from '@/lib/guestIdManager'; 
import { useLoading } from '@/contexts/LoadingContext';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { triggerPushNotification } from '@/lib/fcmUtils';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const POPUP_SESSION_STORAGE_KEY_PREFIX = 'yourbrandPopupShown_';
const POPUP_DAY_STORAGE_KEY_PREFIX = 'yourbrandPopupDayShown_'; 
const NEWSLETTER_SUBMITTED_KEY = 'yourbrand_newsletter_submitted'; // Key for permanent submission tracking

export default function PopupDisplayManager() {
  const [allActivePopups, setAllActivePopups] = useState<FirestorePopup[]>([]);
  const [currentPopupToDisplay, setCurrentPopupToDisplay] = useState<FirestorePopup | null>(null);
  const [isPopupVisible, setIsPopupVisible] = useState(false);
  const [isLoadingPopups, setIsLoadingPopups] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [emailForSubscription, setEmailForSubscription] = useState('');
  const [nameForSubscription, setNameForSubscription] = useState(''); 
  const [mobileForSubscription, setMobileForSubscription] = useState(''); 
  const [isSubscribing, setIsSubscribing] = useState(false); 
  const { user, triggerAuthRedirect } = useAuth();
  const { showLoading } = useLoading();
  const [showPromoCode, setShowPromoCode] = useState(false);
  const [isSubmittedSuccessfully, setIsSubmittedSuccessfully] = useState(false); // New state
  const { config: appConfig } = useApplicationConfig();
  const countryCode = appConfig?.defaultOtpCountryCode || '+91';
  const [isInputFocused, setIsInputFocused] = useState(false);

  const popupShownThisLoadRef = useRef(false);
  const exitIntentListenerRef = useRef<(() => void) | null>(null);
  const scrollListenerRef = useRef<(() => void) | null>(null);
  const timerRefs = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleVisualViewportResize = () => {
      if (!window.visualViewport) return;
      // If the height is significantly smaller than the screen height, keyboard is probably open
      const isKeyboardOpen = window.visualViewport.height < window.innerHeight * 0.85;
      setIsInputFocused(isKeyboardOpen);
    };

    window.visualViewport.addEventListener('resize', handleVisualViewportResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
    };
  }, []);

  const validateEmail = (email: string) => {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
  };

  const validateMobile = (mobile: string) => {
    return /^\d{10}$/.test(mobile);
  };

  const checkFrequency = useCallback((popupId: string, frequency: PopupDisplayFrequency): boolean => {
    if (frequency === "always") return true;

    if (frequency === "once_per_session") {
      const sessionKey = `${POPUP_SESSION_STORAGE_KEY_PREFIX}${popupId}`;
      if (sessionStorage.getItem(sessionKey) === 'true') {
        return false;
      }
    }

    if (frequency === "once_per_day") {
      const dayKey = `${POPUP_DAY_STORAGE_KEY_PREFIX}${popupId}`;
      const lastShownTimestamp = localStorage.getItem(dayKey);
      if (lastShownTimestamp) {
        const today = new Date().toDateString();
        const lastShownDate = new Date(parseInt(lastShownTimestamp, 10)).toDateString();
        if (today === lastShownDate) {
          return false;
        }
      }
    }
    return true;
  }, []);

  const markAsShown = useCallback((popupId: string, frequency: PopupDisplayFrequency) => {
    if (frequency === "once_per_session") {
      const sessionKey = `${POPUP_SESSION_STORAGE_KEY_PREFIX}${popupId}`;
      sessionStorage.setItem(sessionKey, 'true');
    }
    if (frequency === "once_per_day") {
      const dayKey = `${POPUP_DAY_STORAGE_KEY_PREFIX}${popupId}`;
      localStorage.setItem(dayKey, Date.now().toString());
    }
  }, []);

  const activatePopup = useCallback((popup: FirestorePopup) => {
    const isFormPopup = ['newsletter_signup', 'lead_capture', 'subscribe'].includes(popup.popupType);
    if (isFormPopup) {
      try {
        if (localStorage.getItem(NEWSLETTER_SUBMITTED_KEY) === 'true') {
          console.log(`PopupDisplayManager: Skipping form popup "${popup.name}" because user has already submitted.`);
          return;
        }
      } catch (e) {
        console.warn("Could not read from localStorage to check submission status.");
      }
    }

    if (popupShownThisLoadRef.current) return;

    if (checkFrequency(popup.id, popup.displayFrequency)) {
      console.log(`PopupDisplayManager: Activating popup "${popup.name}" (Rule: ${popup.displayRuleType})`);
      setCurrentPopupToDisplay(popup);
      setIsPopupVisible(true);
      markAsShown(popup.id, popup.displayFrequency);
      popupShownThisLoadRef.current = true;

      if (exitIntentListenerRef.current) {
        exitIntentListenerRef.current();
        exitIntentListenerRef.current = null;
      }
      if (scrollListenerRef.current) {
        scrollListenerRef.current();
        scrollListenerRef.current = null;
      }
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    } else {
      console.log(`PopupDisplayManager: Frequency check failed for popup "${popup.name}"`);
    }
  }, [checkFrequency, markAsShown]);


  useEffect(() => {
    const fetchPopupsAndSetupTriggers = async () => {
      setIsLoadingPopups(true);
      popupShownThisLoadRef.current = false;

      try {
        const popupsCollectionRef = collection(db, "adminPopups");
        const q = query(popupsCollectionRef, where("isActive", "==", true), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const fetchedPopups = querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestorePopup));
        
        // Filter based on targetPages configuration and current pathname
        const targetablePopups = fetchedPopups.filter(popup => {
            const targets = popup.targetPages || [];
            // If empty, default to homepage only (legacy behavior)
            if (targets.length === 0) return pathname === '/';
            // If contains wildcard, show everywhere
            if (targets.includes('*')) return true;
            // Otherwise, check if current path is in targets
            return targets.includes(pathname);
        });

        if (targetablePopups.length === 0) {
            setIsLoadingPopups(false);
            return;
        }

        const pageLoadPopup = targetablePopups.find(p => p.displayRuleType === 'on_page_load');
        if (pageLoadPopup) {
          activatePopup(pageLoadPopup);
        }
        if (popupShownThisLoadRef.current) { setIsLoadingPopups(false); return; }

        targetablePopups.filter(p => p.displayRuleType === 'after_x_seconds').forEach(popup => {
          if (!popupShownThisLoadRef.current && checkFrequency(popup.id, popup.displayFrequency)) {
            const delay = (popup.displayRuleValue || 5) * 1000;
            const timerId = setTimeout(() => {
              if (!popupShownThisLoadRef.current) {
                activatePopup(popup);
              }
            }, delay);
            timerRefs.current.push(timerId);
          }
        });
        if (popupShownThisLoadRef.current) { setIsLoadingPopups(false); return; }

        const scrollPopup = targetablePopups.find(p => p.displayRuleType === 'on_scroll_percentage');
        if (scrollPopup && !popupShownThisLoadRef.current && checkFrequency(scrollPopup.id, scrollPopup.displayFrequency)) {
          const handleScroll = () => {
            if (popupShownThisLoadRef.current) {
              window.removeEventListener('scroll', handleScroll);
              return;
            }
            const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
            if (scrollPercent >= (scrollPopup.displayRuleValue || 50)) {
              activatePopup(scrollPopup);
              window.removeEventListener('scroll', handleScroll);
            }
          };
          window.addEventListener('scroll', handleScroll, { passive: true });
          scrollListenerRef.current = () => window.removeEventListener('scroll', handleScroll);
        }
        if (popupShownThisLoadRef.current) { setIsLoadingPopups(false); return; }

        const exitIntentPopup = targetablePopups.find(p => p.displayRuleType === 'on_exit_intent');
        if (exitIntentPopup && !popupShownThisLoadRef.current && checkFrequency(exitIntentPopup.id, exitIntentPopup.displayFrequency)) {
          const isDesktop = window.innerWidth >= 768;

          if (isDesktop) {
            const handleDesktopMouseOut = (e: MouseEvent) => {
              if (popupShownThisLoadRef.current) {
                document.documentElement.removeEventListener('mouseout', handleDesktopMouseOut);
                return;
              }
              if (e.clientY <= 0) {
                activatePopup(exitIntentPopup);
                document.documentElement.removeEventListener('mouseout', handleDesktopMouseOut);
              }
            };
            document.documentElement.addEventListener('mouseout', handleDesktopMouseOut);
            exitIntentListenerRef.current = () => document.documentElement.removeEventListener('mouseout', handleDesktopMouseOut);
          } else { 
            const mobileExitIntentStateKey = 'yourbrandMobileExitIntentMarker';
            let statePushedByManager = false;
            const pushOurState = () => {
                if (history.state?.[mobileExitIntentStateKey] !== true) {
                    history.pushState({ [mobileExitIntentStateKey]: true }, "");
                    statePushedByManager = true;
                }
            };
            pushOurState(); 
            const handleMobilePopState = (event: PopStateEvent) => {
              if (event.state?.[mobileExitIntentStateKey] !== true && !popupShownThisLoadRef.current) {
                activatePopup(exitIntentPopup);
              }
              window.removeEventListener('popstate', handleMobilePopState);
              exitIntentListenerRef.current = null; 
            };
            window.addEventListener('popstate', handleMobilePopState);
            exitIntentListenerRef.current = () => {
              window.removeEventListener('popstate', handleMobilePopState);
            };
          }
        }

      } catch (error) {
        console.error("Error fetching or setting up popups:", error);
        toast({ title: "Popup System Error", description: "Could not initialize popups.", variant: "destructive" });
      } finally {
        setIsLoadingPopups(false);
      }
    };

    fetchPopupsAndSetupTriggers();

    return () => {
      if (exitIntentListenerRef.current) {
        exitIntentListenerRef.current();
        exitIntentListenerRef.current = null;
      }
      if (scrollListenerRef.current) {
        scrollListenerRef.current();
        scrollListenerRef.current = null;
      }
      timerRefs.current.forEach(clearTimeout);
      timerRefs.current = [];
    };
  }, [pathname, toast, activatePopup, checkFrequency]);


  const handlePopupClose = () => {
    setIsPopupVisible(false);
    setIsSubmittedSuccessfully(false);
    setEmailForSubscription('');
    setNameForSubscription(''); 
    setMobileForSubscription(''); 
  };

  const handleActionClick = (targetUrl?: string | null) => {
    if (targetUrl) {
      if (targetUrl.startsWith('http')) {
        window.open(targetUrl, '_blank');
      } else {
        showLoading();
        if (!user && (targetUrl.startsWith('/category/') || targetUrl.startsWith('/service/'))) {
            triggerAuthRedirect(targetUrl);
        } else {
            router.push(targetUrl);
        }
      }
    }
    handlePopupClose();
  };
  
  const handleSubscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (currentPopupToDisplay?.showNameInput && !nameForSubscription.trim()) {
        toast({ title: "Name Required", description: "Please enter your name.", variant: "destructive" });
        return;
    }

    if (currentPopupToDisplay?.showEmailInput) {
        if (!emailForSubscription) {
            toast({ title: "Email Required", description: "Please enter your email address.", variant: "destructive" });
            return;
        }
        if (!validateEmail(emailForSubscription)) {
            toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
            return;
        }
    }

    if (currentPopupToDisplay?.showMobileInput) {
        if (!mobileForSubscription.trim()) {
            toast({ title: "Mobile Required", description: "Please enter your mobile number.", variant: "destructive" });
            return;
        }
        if (!validateMobile(mobileForSubscription)) {
            toast({ title: "Invalid Mobile", description: "Please enter a valid 10-digit mobile number.", variant: "destructive" });
            return;
        }
    }

    if (!currentPopupToDisplay) {
        toast({ title: "Error", description: "Popup data missing.", variant: "destructive"});
        return;
    }
    setIsSubscribing(true);
    
    let inquirySource: InquirySource = 'other_popup';
    if (currentPopupToDisplay.popupType === 'newsletter_signup') inquirySource = 'newsletter_popup';
    else if (currentPopupToDisplay.popupType === 'lead_capture') inquirySource = 'lead_capture_popup';
    else if (currentPopupToDisplay.popupType === 'subscribe') inquirySource = 'newsletter_popup';

    const capturedFormData: Record<string, any> = {};
    if (currentPopupToDisplay.showEmailInput && emailForSubscription) capturedFormData.email = emailForSubscription;
    if (currentPopupToDisplay.showNameInput && nameForSubscription) capturedFormData.name = nameForSubscription;
    if (currentPopupToDisplay.showMobileInput && mobileForSubscription) {
        capturedFormData.mobile = `${countryCode}${mobileForSubscription}`;
    }


    const popupInquiryData: Omit<FirestorePopupInquiry, 'id'> = {
        popupId: currentPopupToDisplay.id,
        popupName: currentPopupToDisplay.name,
        popupType: currentPopupToDisplay.popupType,
        email: (currentPopupToDisplay.showEmailInput && emailForSubscription) ? emailForSubscription : undefined,
        name: (currentPopupToDisplay.showNameInput && nameForSubscription) ? nameForSubscription : (user?.displayName || undefined),
        phone: (currentPopupToDisplay.showMobileInput && mobileForSubscription) ? `${countryCode}${mobileForSubscription}` : undefined,
        submittedAt: Timestamp.now(),
        status: 'new' as InquiryStatus,
        source: inquirySource,
        formData: capturedFormData,
    };

    try {
        const docRef = await addDoc(collection(db, "popupSubmissions"), popupInquiryData);

        // --- ADMIN NOTIFICATION FOR NEW POPUP INQUIRY ---
        try {
          const adminQuery = query(collection(db, "users"), where("email", "==", ADMIN_EMAIL), limit(1));
          const adminSnapshot = await getDocs(adminQuery);
          if (!adminSnapshot.empty) {
            const adminId = adminSnapshot.docs[0].id;
            const adminNotification: Omit<FirestoreNotification, 'id'> = {
              userId: adminId,
              title: "New Popup Submission",
              message: `From: ${popupInquiryData.name || popupInquiryData.email || "Unknown"} (Source: ${popupInquiryData.popupName})`,
              type: "info",
              href: `/admin/inquiries`,
              read: false,
              createdAt: Timestamp.now(),
            };
            await addDoc(collection(db, "userNotifications"), adminNotification);
            triggerPushNotification({
              userId: adminId,
              title: adminNotification.title,
              body: adminNotification.message,
              href: adminNotification.href
            }).catch(err => console.error("Error sending admin popup push:", err));
          }
        } catch (notifyErr) {
          console.error("Error sending admin popup notifications:", notifyErr);
        }
        // --- END ADMIN NOTIFICATION ---

        setIsSubmittedSuccessfully(true); // Mark as successful
        toast({ title: "Submitted!", description: `Thank you for your submission.`, className:"bg-green-100 text-green-700 border-green-300" });
        
        if (['newsletter_signup', 'lead_capture', 'subscribe'].includes(currentPopupToDisplay?.popupType)) {
           try {
             localStorage.setItem(NEWSLETTER_SUBMITTED_KEY, 'true');
           } catch (e) {
             console.warn("Could not write submission status to localStorage.");
           }
        }
        
        setEmailForSubscription(''); 
        setNameForSubscription('');
        setMobileForSubscription('');
        
        if (currentPopupToDisplay?.targetUrl) {
            // If there's a promo code, give them more time to see/copy it
            const delay = currentPopupToDisplay.promoCode ? 3000 : 1500;
            setTimeout(() => {
                 if (currentPopupToDisplay.targetUrl!.startsWith('http')) {
                    window.open(currentPopupToDisplay.targetUrl!, '_blank');
                 } else {
                    showLoading();
                    if (!user && (currentPopupToDisplay.targetUrl!.startsWith('/category/') || currentPopupToDisplay.targetUrl!.startsWith('/service/'))) {
                         triggerAuthRedirect(currentPopupToDisplay.targetUrl!);
                    } else {
                        router.push(currentPopupToDisplay.targetUrl!);
                    }
                 }
                 handlePopupClose();
            }, delay);
        } else if (!currentPopupToDisplay.promoCode) {
            // Only close automatically if there's no promo code to show
            setTimeout(() => {
                handlePopupClose();
            }, 2000);
        }
    } catch (error) {
        console.error("Error saving popup submission:", error);
        toast({ title: "Submission Failed", description: "Could not process your submission. Please try again.", variant: "destructive" });
    } finally {
        setIsSubscribing(false);
    }
  };

  const handleCopyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      toast({
        description: "Coupon code copied!",
      });
    }, (err) => {
      console.error('Could not copy text: ', err);
      toast({
        title: "Copy Failed",
        description: "Could not copy code. Please try again.",
        variant: "destructive"
      });
    });
  };
  const getVideoEmbedUrl = (url: string): string => {
    let videoId;
    if (url.includes("youtube.com/watch?v=")) {
      videoId = url.split("v=")[1]?.split("&")[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${videoId}`;
    }
    if (url.includes("youtu.be/")) {
      videoId = url.split("youtu.be/")[1]?.split("?")[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&showinfo=0&rel=0&loop=1&playlist=${videoId}`;
    }
    if (url.includes("vimeo.com/")) {
      videoId = url.split("vimeo.com/")[1]?.split("?")[0];
      if (videoId && !isNaN(Number(videoId))) {
         return `https://player.vimeo.com/video/${videoId}?autoplay=1&muted=1&controls=0&loop=1&autopause=0&background=1`;
      }
    }
    return url;
  };

  useEffect(() => {
    if (currentPopupToDisplay?.promoCode) {
        // If there are input fields, only show promo code AFTER submission
        const hasInputs = currentPopupToDisplay.showNameInput || currentPopupToDisplay.showEmailInput || currentPopupToDisplay.showMobileInput;
        
        if (hasInputs) {
            setShowPromoCode(isSubmittedSuccessfully);
            return;
        }

        const requiredFieldsCount = currentPopupToDisplay.promoCodeConditionFieldsRequired ?? 0;

        if (requiredFieldsCount === 0) {
            setShowPromoCode(true);
            return;
        }

        let numEnabledFields = 0;
        if (currentPopupToDisplay.showNameInput) numEnabledFields++;
        if (currentPopupToDisplay.showEmailInput) numEnabledFields++;
        if (currentPopupToDisplay.showMobileInput) numEnabledFields++;

        if (numEnabledFields === 0 && requiredFieldsCount > 0) {
            setShowPromoCode(false);
            return;
        }
        
        let filledAndValidCount = 0;
        if (currentPopupToDisplay.showNameInput && nameForSubscription.trim() !== "") {
            filledAndValidCount++;
        }
        if (currentPopupToDisplay.showEmailInput && emailForSubscription.trim() !== "" && /^\S+@\S+\.\S+$/.test(emailForSubscription)) {
            filledAndValidCount++;
        }
        if (currentPopupToDisplay.showMobileInput && mobileForSubscription.trim() !== "" && /^\+?[1-9]\d{1,14}$/.test(mobileForSubscription)) {
            filledAndValidCount++;
        }
        setShowPromoCode(filledAndValidCount >= requiredFieldsCount);
    } else {
        setShowPromoCode(false);
    }
  }, [currentPopupToDisplay, nameForSubscription, emailForSubscription, mobileForSubscription, isSubmittedSuccessfully]);


  if (isLoadingPopups || !currentPopupToDisplay || !isPopupVisible) {
    return null;
  }

  const isDirectVideoLink = currentPopupToDisplay.videoUrl && (currentPopupToDisplay.videoUrl.endsWith('.mp4') || currentPopupToDisplay.videoUrl.endsWith('.webm') || currentPopupToDisplay.videoUrl.endsWith('.ogv'));
  const embedUrl = currentPopupToDisplay.videoUrl ? getVideoEmbedUrl(currentPopupToDisplay.videoUrl) : '';

  return (
    <Dialog open={isPopupVisible} onOpenChange={(open) => { if (!open) handlePopupClose(); }}>
      <DialogContent className={cn(
        "max-w-[90%] sm:max-w-md md:max-w-lg p-0 overflow-hidden shadow-2xl rounded-xl transition-all duration-300",
        isInputFocused ? "!-translate-y-[85%] sm:!-translate-y-[50%] top-[50%]" : ""
      )}>
        {currentPopupToDisplay.showCloseButton !== false && (
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-3 top-3 z-50 h-7 w-7 rounded-full bg-background/60 hover:bg-background/90 text-muted-foreground hover:text-foreground backdrop-blur-sm"
              aria-label="Close popup"
              onClick={handlePopupClose} 
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </DialogClose>
        )}

        <div 
          className="relative"
          onClick={currentPopupToDisplay.popupType === 'video' && currentPopupToDisplay.targetUrl ? () => handleActionClick(currentPopupToDisplay.targetUrl) : undefined}
          style={currentPopupToDisplay.popupType === 'video' && currentPopupToDisplay.targetUrl ? { cursor: 'pointer' } : {}}
        >
          {currentPopupToDisplay.imageUrl && currentPopupToDisplay.popupType !== 'video' && (
          <div className={cn("flex items-center justify-center transition-all duration-300", isInputFocused ? "h-0 opacity-0 overflow-hidden" : "h-auto opacity-100")}>
            <div 
              className="relative aspect-square w-48 md:w-64 overflow-hidden"
              onClick={currentPopupToDisplay.targetUrl ? () => handleActionClick(currentPopupToDisplay.targetUrl) : undefined}
              style={currentPopupToDisplay.targetUrl ? {cursor: 'pointer'} : {}}
            >
              <AppImage
                src={currentPopupToDisplay.imageUrl}
                alt={currentPopupToDisplay.title || "Popup Image"}
                fill
                className="object-contain object-center"
                data-ai-hint={currentPopupToDisplay.imageHint || "popup marketing image"}
              />
            </div>
          </div>
          )}
          
          {currentPopupToDisplay.popupType === 'video' && currentPopupToDisplay.videoUrl && (
            <div className={cn("relative w-full aspect-video bg-black transition-all duration-300", isInputFocused ? "h-0 opacity-0 overflow-hidden" : "h-auto opacity-100")}>
              {isDirectVideoLink ? (
                 <video
                    src={embedUrl}
                    className="w-full h-full"
                    autoPlay
                    muted
                    loop
                    playsInline
                    webkit-playsinline="true" 
                />
              ) : (
                <iframe
                    src={embedUrl}
                    title={currentPopupToDisplay.title || "Popup Video"}
                    className="w-full h-full"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen={true}
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                ></iframe>
              )}
            </div>
          )}
          
          <div className="p-3 space-y-3 text-center">
            <DialogHeader >
              {currentPopupToDisplay.title && (
                <DialogTitle className="text-center text-2xl font-headline text-foreground">
                  {currentPopupToDisplay.title}
                </DialogTitle>
              )}
            </DialogHeader>
            {currentPopupToDisplay.displayText && (
              <DialogDescription className="text-muted-foreground text-base">
                {currentPopupToDisplay.displayText}
              </DialogDescription>
            )}
            {isSubmittedSuccessfully ? (
              <div className="py-6 animate-in fade-in zoom-in duration-500">
                <div className="mb-4 flex flex-col items-center justify-center">
                   <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-2">
                      <CheckCircle className="h-8 w-8" />
                   </div>
                   <h3 className="text-xl font-bold text-foreground">Thank You!</h3>
                   <p className="text-muted-foreground mt-1">Your submission was successful.</p>
                </div>

                {currentPopupToDisplay.promoCode && (
                  <div className="mt-4 p-4 border border-dashed border-primary/50 bg-primary/5 rounded-xl">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest mb-2">Your Reward Code</p>
                    <button
                      onClick={() => handleCopyToClipboard(currentPopupToDisplay.promoCode || '')}
                      className="text-2xl font-black text-primary tracking-tighter hover:scale-105 transition-transform cursor-pointer focus:outline-none"
                      aria-label={`Copy coupon code: ${currentPopupToDisplay.promoCode}`}
                    >
                      {currentPopupToDisplay.promoCode}
                    </button>
                    <p className="text-[10px] text-muted-foreground mt-2 italic">Click code to copy</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {currentPopupToDisplay.promoCode && showPromoCode && (
                  <div className="py-2">
                    <p className="text-sm text-muted-foreground">Use promo code:</p>
                    <button
                      onClick={() => handleCopyToClipboard(currentPopupToDisplay.promoCode || '')}
                      className="text-lg font-bold text-primary tracking-wider border border-dashed border-primary/50 bg-primary/10 py-1.5 px-3 rounded-md inline-block transition-colors hover:bg-primary/20 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      aria-label={`Copy coupon code: ${currentPopupToDisplay.promoCode}`}
                    >
                      {currentPopupToDisplay.promoCode}
                    </button>
                  </div>
                )}
                
                {(currentPopupToDisplay.showNameInput || currentPopupToDisplay.showEmailInput || currentPopupToDisplay.showMobileInput) && (
                  <form onSubmit={handleSubscribe} className="flex flex-col gap-3 mt-2">
                    {currentPopupToDisplay.showNameInput && (
                        <div className="flex flex-col gap-1.5 text-left">
                            <label className="text-xs font-medium text-muted-foreground ml-1">Full Name</label>
                            <Input
                                type="text"
                                placeholder="Full Name"
                                value={nameForSubscription}
                                onChange={(e) => setNameForSubscription(e.target.value)}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                required={currentPopupToDisplay.showNameInput} 
                                className="h-10 text-base"
                                disabled={isSubscribing}
                                aria-label="Full Name"
                            />
                        </div>
                    )}
                    {currentPopupToDisplay.showEmailInput && (
                        <div className="flex flex-col gap-1.5 text-left">
                            <label className="text-xs font-medium text-muted-foreground ml-1">Email Address</label>
                            <Input
                                type="email"
                                placeholder="you@example.com"
                                value={emailForSubscription}
                                onChange={(e) => setEmailForSubscription(e.target.value)}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setIsInputFocused(false)}
                                required={currentPopupToDisplay.showEmailInput}
                                className="h-10 text-base"
                                disabled={isSubscribing}
                                aria-label="Email Address"
                            />
                        </div>
                    )}
                    {currentPopupToDisplay.showMobileInput && (
                        <div className="flex flex-col gap-1.5 text-left">
                            <label className="text-xs font-medium text-muted-foreground ml-1">Mobile Number</label>
                            <div className="flex gap-2">
                                <div className="flex items-center justify-center px-3 bg-muted border rounded-md text-sm font-medium text-muted-foreground whitespace-nowrap">
                                    {countryCode}
                                </div>
                                <Input
                                    type="tel"
                                    placeholder="10-digit mobile number"
                                    value={mobileForSubscription}
                                    onChange={(e) => setMobileForSubscription(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                    onFocus={() => setIsInputFocused(true)}
                                    onBlur={() => setIsInputFocused(false)}
                                    required={currentPopupToDisplay.showMobileInput} 
                                    className="h-10 text-base"
                                    disabled={isSubscribing}
                                    aria-label="Mobile Number"
                                    maxLength={10}
                                />
                            </div>
                        </div>
                    )}
                    <Button type="submit" className="w-full h-10" disabled={isSubscribing}>
                      {isSubscribing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4"/>}
                      Submit
                    </Button>
                  </form>
                )}
              </>
            )}

             {currentPopupToDisplay.buttonText && currentPopupToDisplay.targetUrl && (
               <DialogFooter className="mt-4 sm:justify-center">
                 <Button size="lg" onClick={() => handleActionClick(currentPopupToDisplay.targetUrl)} className="w-full sm:w-auto">
                   {currentPopupToDisplay.buttonText}
                 </Button>
               </DialogFooter>
             )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
