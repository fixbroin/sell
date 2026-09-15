"use client";

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, getDoc } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { AppSettings } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";
const CACHE_KEY = "app-config";

interface UseApplicationConfigReturn {
  config: AppSettings;
  isLoading: boolean;
  error: string | null;
}

const processData = (firestoreData: Partial<AppSettings>): AppSettings => {
  return {
    ...defaultAppSettings,
    ...firestoreData,
    timeSlotSettings: {
      ...defaultAppSettings.timeSlotSettings,
      ...(firestoreData.timeSlotSettings || {}),
      weeklyAvailability: {
        ...defaultAppSettings.timeSlotSettings.weeklyAvailability,
        ...(firestoreData.timeSlotSettings?.weeklyAvailability || {}),
      }
    },
    platformFees: firestoreData.platformFees || defaultAppSettings.platformFees || [],
    enableCancellationPolicy: typeof firestoreData.enableCancellationPolicy === 'boolean' ? firestoreData.enableCancellationPolicy : defaultAppSettings.enableCancellationPolicy,
    isProviderRegistrationEnabled: typeof firestoreData.isProviderRegistrationEnabled === 'boolean' ? firestoreData.isProviderRegistrationEnabled : defaultAppSettings.isProviderRegistrationEnabled,
    isCancelledChequeCompulsory: typeof firestoreData.isCancelledChequeCompulsory === 'boolean' ? firestoreData.isCancelledChequeCompulsory : defaultAppSettings.isCancelledChequeCompulsory,
    enableCancelledChequeUpload: typeof firestoreData.enableCancelledChequeUpload === 'boolean' ? firestoreData.enableCancelledChequeUpload : defaultAppSettings.enableCancelledChequeUpload,
    enableSignatureUpload: typeof firestoreData.enableSignatureUpload === 'boolean' ? firestoreData.enableSignatureUpload : defaultAppSettings.enableSignatureUpload,
    customBankFields: firestoreData.customBankFields || defaultAppSettings.customBankFields || [],
    enableEmailPasswordLogin: typeof firestoreData.enableEmailPasswordLogin === 'boolean' ? firestoreData.enableEmailPasswordLogin : defaultAppSettings.enableEmailPasswordLogin,
    enableOtpLogin: typeof firestoreData.enableOtpLogin === 'boolean' ? firestoreData.enableOtpLogin : defaultAppSettings.enableOtpLogin,
    enableGoogleLogin: typeof firestoreData.enableGoogleLogin === 'boolean' ? firestoreData.enableGoogleLogin : defaultAppSettings.enableGoogleLogin,
    isReferralSystemEnabled: typeof firestoreData.isReferralSystemEnabled === 'boolean' ? firestoreData.isReferralSystemEnabled : defaultAppSettings.isReferralSystemEnabled,
    enableVisitorLogging: typeof firestoreData.enableVisitorLogging === 'boolean' ? firestoreData.enableVisitorLogging : defaultAppSettings.enableVisitorLogging,
    enableUserPresence: typeof firestoreData.enableUserPresence === 'boolean' ? firestoreData.enableUserPresence : defaultAppSettings.enableUserPresence,
    dateFormat: firestoreData.dateFormat || defaultAppSettings.dateFormat,
  };
};

import React, { createContext, useContext } from 'react';

export const ApplicationConfigContext = createContext<AppSettings | null>(null);

export const ApplicationConfigProvider: React.FC<{
  children: React.ReactNode;
  initialConfig: AppSettings;
}> = ({ children, initialConfig }) => {
  const { config } = useApplicationConfig(initialConfig);
  return React.createElement(ApplicationConfigContext.Provider, { value: config }, children);
};

export function useApplicationConfig(initialData?: AppSettings | null): UseApplicationConfigReturn {
  const contextConfig = useContext(ApplicationConfigContext);
  
  // If we are inside a provider and didn't explicitly pass initialData, return the provider's config
  if (contextConfig && !initialData) {
    return { config: contextConfig, isLoading: false, error: null };
  }

  const [config, setConfig] = useState<AppSettings>(() => {
    if (initialData) return processData(initialData);
    const cached = getCache<AppSettings>(CACHE_KEY, true);
    return cached ? processData(cached) : defaultAppSettings;
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (initialData) return false;
    return !getCache(CACHE_KEY, true);
  });
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  // Load cached settings on mount if initialData is not provided
  useEffect(() => {
    if (!initialData) {
      const cached = getCache<AppSettings>(CACHE_KEY, true);
      if (cached) {
        setConfig(processData(cached));
        setIsLoading(false);
      }
    }
  }, [initialData]);

  useEffect(() => {
    const configDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);

    const fetchConfig = async () => {
      try {
        const remoteVersions = await getRemoteCacheVersions();
        const remoteVersion = remoteVersions['app-settings'] || remoteVersions.global || 0;

        const localVersion = parseInt(localStorage.getItem(`${CACHE_KEY}-version`) || "0");
        const cached = getCache<AppSettings>(CACHE_KEY, true);
        const isCheckoutOrPolicy = pathname?.includes('/checkout') || pathname?.includes('/cancellation-policy') || pathname?.includes('/my-bookings');

        if (cached && !isAdmin && !isCheckoutOrPolicy && remoteVersion <= localVersion) {
          setConfig(processData(cached));
          setIsLoading(false);
          return;
        }

        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          const processed = processData(docSnap.data());
          setConfig(processed);
          setCache(CACHE_KEY, processed, true);
          localStorage.setItem(`${CACHE_KEY}-version`, remoteVersion.toString());
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError' && !err?.message?.includes('Failed to fetch')) {
          console.error("Error fetching app config:", err);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, [isAdmin]);

  return { config, isLoading, error };
}
