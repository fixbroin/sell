"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { MarketingSettings, FirebaseClientConfig } from '@/types/firestore';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const MARKETING_CONFIG_COLLECTION = "webSettings";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";
const CACHE_KEY = "marketing-settings";

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

export const defaultMarketingValues: MarketingSettings = {
  googleTagManagerId: "",
  googleAnalyticsId: "",
  googleAdsConversionId: "",
  googleAdsConversionLabel: "",
  googleOptimizeContainerId: "",
  googleRemarketingTag: "",
  metaPixelId: "",
  metaConversionApi: { accessToken: "", pixelId: "", testEventCode: "" },
  bingUetTagId: "",
  pinterestTagId: "",
  microsoftClarityProjectId: "",
  googleMerchantCenter: { feedUrl: "", accountId: "" },
  facebookCatalog: { feedUrl: "", pixelId: "" },
  adsTxtContent: "",
  customHeadScript: "",
  customBodyScript: "",
  firebasePublicVapidKey: "",
  firebaseAdminSdkJson: "",
  firebaseClientConfig: {
    apiKey: "", authDomain: "", projectId: "", storageBucket: "",
    messagingSenderId: "", appId: "", measurementId: "",
  },
  whatsAppApiToken: "",
  whatsAppPhoneNumberId: "",
  whatsAppBusinessAccountId: "",
  whatsAppVerifyToken: "",
};

interface UseMarketingSettingsReturn {
  settings: MarketingSettings;
  isLoading: boolean;
  error: string | null;
}

export function useMarketingSettings(): UseMarketingSettingsReturn {
  const [settings, setSettings] = useState<MarketingSettings>(() => getCache<MarketingSettings>(CACHE_KEY, true) || defaultMarketingValues);
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const hasLoadedRef = useRef(false);

  const processData = useCallback((firestoreData: Partial<MarketingSettings>): MarketingSettings => {
    return {
      ...defaultMarketingValues,
      ...firestoreData,
      metaConversionApi: { ...defaultMarketingValues.metaConversionApi, ...firestoreData.metaConversionApi },
      googleMerchantCenter: { ...defaultMarketingValues.googleMerchantCenter, ...firestoreData.googleMerchantCenter },
      facebookCatalog: { ...defaultMarketingValues.facebookCatalog, ...firestoreData.facebookCatalog },
      firebaseClientConfig: { ...defaultMarketingValues.firebaseClientConfig, ...firestoreData.firebaseClientConfig },
    };
  }, []);

  useEffect(() => {
    if (isBot() && !isAdmin) {
      setIsLoading(false);
      return;
    }

    const docRef = doc(db, MARKETING_CONFIG_COLLECTION, MARKETING_CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const processed = processData(docSnap.data());
        setSettings(processed);
        setCache(CACHE_KEY, processed, true);
      }
      setIsLoading(false);
      hasLoadedRef.current = true;
    }, (err: any) => {
      if (err?.name !== 'AbortError' && !err?.message?.includes('Failed to fetch')) {
        console.error("Error subscribing to marketing settings:", err);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [processData, isAdmin]);

  return { settings, isLoading, error };
}


