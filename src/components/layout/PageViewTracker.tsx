
"use client";

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMarketingSettings } from '@/hooks/useMarketingSettings';
import { logUserActivity } from '@/lib/activityLogger';
import { getGuestId } from '@/lib/guestIdManager';
import { useAuth } from '@/hooks/useAuth';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

const isBot = (): boolean => {
  if (typeof window === 'undefined') return true;
  const botPatterns = [
      'bot', 'crawler', 'spider', 'crawling', 'googlebot', 'bingbot', 'yandexbot', 
      'slurp', 'duckduckbot', 'baiduspider', 'adsbot', 'mediapartners-google',
      'lighthouse', 'gtmetrix', 'pingdom', 'facebookexternalhit', 'whatsapp', 'linkedinbot'
  ];
  const ua = navigator.userAgent.toLowerCase();
  return botPatterns.some(pattern => ua.includes(pattern));
};

const PageViewTracker = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isVisitorBot = isBot();
  
  const { settings: marketingSettings, isLoading: isLoadingMarketingSettings } = useMarketingSettings();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const { config: appConfig, isLoading: isLoadingAppConfig } = useApplicationConfig();
  const lastLoggedUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (isVisitorBot || isLoadingMarketingSettings || isLoadingAuth || isLoadingAppConfig) {
      return;
    }

    const fullUrl = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`;

    // Exclude admin, API routes, and common static file extensions from logging
    const excludedPrefixes = ['/admin', '/api/', '/_next/', '/firebase-messaging-sw.js'];
    const excludedExtensions = ['.ico', '.png', '.jpg', '.jpeg', '.svg', '.webmanifest', '.xml', '.txt'];
    if (excludedPrefixes.some(prefix => pathname.startsWith(prefix)) || 
        excludedExtensions.some(ext => pathname.endsWith(ext))) {
      return;
    }
    
    // Prevent duplicate logging for the same URL in the same view/render cycle
    if (lastLoggedUrlRef.current === fullUrl) {
      return;
    }
    lastLoggedUrlRef.current = fullUrl;

    const shouldLog = appConfig?.enableVisitorLogging !== false;

    if (shouldLog) {
      // Log page view to Firestore via UserActivity logger
      const guestId = !user ? getGuestId() : null;
      logUserActivity(
        'pageView',
        { pageUrl: fullUrl, pageTitle: typeof document !== 'undefined' ? document.title : '' },
        user?.uid,
        guestId,
        user?.displayName
      );

      // Log visitor info
      const logVisitor = async () => {
        try {
          await fetch('/api/log-visitor-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pathname: fullUrl,
              userAgent: navigator.userAgent,
            }),
          });
        } catch (error) {
          console.error("Error in PageViewTracker logging visitor:", error);
        }
      };

      logVisitor();
    }

    // Google Tag Manager
    if (marketingSettings.googleTagManagerId && typeof window !== 'undefined' && window.dataLayer) {
      window.dataLayer.push({
        event: 'page_view_gtm', // Changed event name to avoid conflict with GA4 page_view
        page_path: fullUrl,
        page_title: typeof document !== 'undefined' ? document.title : undefined,
      });
    }

    // gtag.js (for GA4 or Google Ads without GTM)
    if (marketingSettings.googleTagId && typeof window !== 'undefined' && typeof window.gtag === 'function' && !marketingSettings.googleTagManagerId) {
      window.gtag('config', marketingSettings.googleTagId, {
        page_path: fullUrl,
        page_title: typeof document !== 'undefined' ? document.title : undefined,
      });
    }

  }, [pathname, searchParams, marketingSettings, isLoadingMarketingSettings, user, isLoadingAuth, appConfig, isLoadingAppConfig, isVisitorBot]);

  return null; 
};

export default PageViewTracker;
