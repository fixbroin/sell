"use client";

import { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from '@/lib/mysqlDb';
import type { FirestoreSEOSettings } from '@/types/firestore';
import { defaultSeoValues } from '@/lib/seoUtils';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';

const CACHE_KEY = "global-seo-settings";

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

export function useGlobalSEOSettings() {
  const [seoSettings, setSeoSettings] = useState<FirestoreSEOSettings>(() => getCache<FirestoreSEOSettings>(CACHE_KEY, true) || defaultSeoValues);
  const [isLoading, setIsLoading] = useState(!getCache(CACHE_KEY, true));
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // If it's a bot and we are not in admin, skip fetching to save reads
    if (isBot() && !isAdmin) {
      setIsLoading(false);
      return;
    }

    if (!isAdmin && hasLoadedRef.current) return;

    const fetchSEO = async () => {
      try {
        // Smart Cache Logic: Check global cache version (deduplicated client-side read)
        const remoteVersions = await getRemoteCacheVersions();
        const remoteVersion = remoteVersions.global || 0;
        
        const localVersion = parseInt(localStorage.getItem(`${CACHE_KEY}-version`) || "0");
        const cached = getCache<FirestoreSEOSettings>(CACHE_KEY, true);
        
        if (cached && !isAdmin && remoteVersion <= localVersion) {
            setSeoSettings(cached);
            setIsLoading(false);
            hasLoadedRef.current = true;
            return;
        }
        const res = await fetch('/api/global-seo', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          const finalSeo = { ...defaultSeoValues, ...data } as FirestoreSEOSettings;
          setSeoSettings(finalSeo);
          setCache(CACHE_KEY, finalSeo, true);
          localStorage.setItem(`${CACHE_KEY}-version`, remoteVersion.toString());
        }
      } catch (err) {
        console.error("Error fetching SEO settings:", err);
      } finally {
        setIsLoading(false);
        hasLoadedRef.current = true;
      }
    };

    fetchSEO();
  }, [isAdmin]);

  return { seoSettings, isLoading };
}


