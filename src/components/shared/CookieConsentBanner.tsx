
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Cookie } from 'lucide-react';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import { cn } from '@/lib/utils';

const COOKIE_CONSENT_KEY = 'yourbrand_cookie_consent_accepted';

export default function CookieConsentBanner() {
  const { settings: globalSettings, isLoading: isLoadingSettings } = useGlobalSettings();
  const [isVisible, setIsVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isLoadingSettings || !isMounted) {
      return;
    }

    if (globalSettings.isCookieConsentEnabled) {
      try {
        const consentGiven = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (consentGiven !== 'true') {
          setIsVisible(true);
        }
      } catch (error) {
        console.warn("CookieConsentBanner: Could not access localStorage.", error);
        // Fallback: show banner if localStorage is unavailable, as consent cannot be verified.
        // Or, decide not to show it to avoid issues on restricted environments.
        // For now, let's assume it's better to show it if we can't confirm consent.
        setIsVisible(true); 
      }
    } else {
      setIsVisible(false);
    }
  }, [globalSettings, isLoadingSettings, isMounted]);

  const handleAccept = () => {
    try {
      localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    } catch (error) {
      console.warn("CookieConsentBanner: Could not write to localStorage.", error);
      // Consent might not be saved, banner might reappear.
    }
    setIsVisible(false);
  };

  if (!isVisible || !isMounted || isLoadingSettings || !globalSettings.isCookieConsentEnabled) {
    return null;
  }

  const bannerMessage = globalSettings.cookieConsentMessage || "We use cookies to improve your experience. By continuing, you agree to our Cookie Policy.";

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-[200] bg-background/95 border-t border-border shadow-t-2xl p-4 transition-transform duration-500 ease-out",
        isVisible ? "translate-y-0" : "translate-y-full"
      )}
      role="dialog"
      aria-live="polite"
      aria-label="Cookie Consent"
      aria-describedby="cookie-consent-message"
    >
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-start text-sm text-muted-foreground">
          <Cookie className="h-5 w-5 mr-3 mt-0.5 text-primary flex-shrink-0" />
          <p id="cookie-consent-message">{bannerMessage}</p>
        </div>
        <div className="flex flex-shrink-0 gap-2 w-full sm:w-auto">
          <Button onClick={handleAccept} className="w-full sm:w-auto">Accept</Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/cookie-policy">Learn More</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
