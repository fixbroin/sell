
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { FeaturesConfiguration, MarketingAutomationSettings } from '@/types/firestore';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';

const FEATURES_CONFIG_COLLECTION = "webSettings";
const FEATURES_CONFIG_DOC_ID = "featuresConfiguration";
const MARKETING_AUTOMATION_DOC_ID = "marketingAutomation";
const CACHE_KEY = "features-and-marketing-config";

const defaultFeaturesConfig: FeaturesConfiguration = {
  showMostPopularServices: true,
  showRecentlyAddedServices: true,
  showCategoryWiseServices: true,
  showBlogSection: true,
  showCustomServiceButton: true,
  homepageCategoryVisibility: {},
  ads: [],
};

interface UseFeaturesAndAutomationConfigReturn {
  featuresConfig: FeaturesConfiguration;
  marketingConfig: MarketingAutomationSettings | null;
  isLoading: boolean;
}

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

export function useFeaturesConfig(): UseFeaturesAndAutomationConfigReturn {
  const [featuresConfig, setFeaturesConfig] = useState<FeaturesConfiguration>(() => {
    const cached = getCache<{features: FeaturesConfiguration, marketing: MarketingAutomationSettings | null}>(CACHE_KEY, true);
    return cached ? cached.features : defaultFeaturesConfig;
  });
  const [marketingConfig, setMarketingConfig] = useState<MarketingAutomationSettings | null>(() => {
    const cached = getCache<{features: FeaturesConfiguration, marketing: MarketingAutomationSettings | null}>(CACHE_KEY, true);
    return cached ? cached.marketing : null;
  });
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (isBot()) {
      setIsLoading(false);
      return;
    }

    const docRef = doc(db, FEATURES_CONFIG_COLLECTION, FEATURES_CONFIG_DOC_ID);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setFeaturesConfig({ ...defaultFeaturesConfig, ...docSnap.data() });
      }
      setIsLoading(false);
      hasLoadedRef.current = true;
    }, (err: any) => {
      if (err?.name !== 'AbortError' && !err?.message?.includes('Failed to fetch')) {
        console.error("Error subscribing to features config:", err);
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { featuresConfig, marketingConfig, isLoading };
}

