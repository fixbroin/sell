"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, getDoc, Timestamp } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, ThemeColors, ThemePalette, GlobalAdminPopup, LoaderType } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS } from '@/lib/colorUtils';
import { defaultGlobalWebSettings } from '@/config/webDefaults';
import { getCache, setCache, getRemoteCacheVersions } from '@/lib/client-cache';
import { usePathname } from 'next/navigation';
import { getTimestampMillis } from '@/lib/utils';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const CACHE_KEY = "global-web-settings";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

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

const processSettingsData = (data: Partial<GlobalWebSettings>): GlobalWebSettings => {
  const mergedLightPalette: Required<ThemePalette> = { ...DEFAULT_LIGHT_THEME_COLORS_HSL };
  THEME_PALETTE_KEYS.forEach(key => {
    if (data.themeColors?.light?.[key]) {
      (mergedLightPalette[key] as any) = data.themeColors.light[key];
    }
  });

  const mergedDarkPalette: Required<ThemePalette> = { ...DEFAULT_DARK_THEME_COLORS_HSL };
  THEME_PALETTE_KEYS.forEach(key => {
    if (data.themeColors?.dark?.[key]) {
      (mergedDarkPalette[key] as any) = data.themeColors.dark[key];
    }
  });

  const globalAdminPopup = {
    ...defaultGlobalWebSettings.globalAdminPopup,
    ...(data.globalAdminPopup || {}),
  } as GlobalAdminPopup;

  if (globalAdminPopup.sentAt && !(globalAdminPopup.sentAt instanceof Timestamp)) {
    const millis = getTimestampMillis(globalAdminPopup.sentAt);
    if (millis) {
      globalAdminPopup.sentAt = Timestamp.fromMillis(millis);
    }
  }

  return {
    ...defaultGlobalWebSettings,
    ...data,
    themeColors: {
      light: mergedLightPalette,
      dark: mergedDarkPalette,
    },
    socialMediaLinks: {
      ...defaultGlobalWebSettings.socialMediaLinks,
      ...(data.socialMediaLinks || {}),
    },
    homepageContent: data.homepageContent,
    globalAdminPopup,
  };
};

export function useGlobalSettings(initialData?: GlobalWebSettings | null) {
  const [settings, setSettings] = useState<GlobalWebSettings>(() => {
    if (initialData) return processSettingsData(initialData);
    return defaultGlobalWebSettings;
  });
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');
  const hasLoadedRef = useRef(false);
  const isVisitorBot = useRef(isBot());

  useEffect(() => {
    if (settings?.loaderType && typeof document !== 'undefined') {
      document.cookie = `yourbrand-loader-type=${settings.loaderType}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [settings?.loaderType]);

  useEffect(() => {
    if (!initialData) {
      const cached = getCache<GlobalWebSettings>(CACHE_KEY, true);
      if (cached) {
        setSettings(processSettingsData(cached));
        setIsLoading(false);
      }
    }
  }, [initialData]);

  useEffect(() => {
    if (isVisitorBot.current && !isAdmin) {
      setIsLoading(false);
      return;
    }

    const fetchSettings = async () => {
      try {
        const remoteVersions = await getRemoteCacheVersions();
        const remoteVersion = remoteVersions.global || 0;
        
        const localVersion = parseInt(localStorage.getItem(`${CACHE_KEY}-version`) || "0");
        const cached = getCache<GlobalWebSettings>(CACHE_KEY, true);
        
        if (cached && !isAdmin && remoteVersion <= localVersion) {
          setSettings(processSettingsData(cached));
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/global-settings', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.webSettings) {
            const processed = processSettingsData(data.webSettings);
            setSettings(processed);
            setCache(CACHE_KEY, processed, true);
            localStorage.setItem(`${CACHE_KEY}-version`, remoteVersion.toString());
          }
        }
      } catch (err) {
        console.warn("Global settings REST fetch fallback:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [isAdmin]);

  return { settings, isLoading, error };
}
