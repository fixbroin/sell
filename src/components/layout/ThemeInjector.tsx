
"use client";

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { doc, onSnapshot } from '@/lib/mysqlDb';
import { db } from '@/lib/firebase';
import type { GlobalWebSettings, ThemeColors, ThemePalette } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, THEME_PALETTE_KEYS, generatePaletteCssVariables } from '@/lib/colorUtils';

const WEB_SETTINGS_DOC_ID = "global";
const WEB_SETTINGS_COLLECTION = "webSettings";
const THEME_STYLE_TAG_ID = "yourbrand-dynamic-theme-styles";

const ThemeInjector = () => {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  useEffect(() => {
    // Public site: The theme is already server-injected via RootLayout's style tag.
    // We don't need a real-time listener for every single visitor.
    if (!isAdmin) return;

    const settingsDocRef = doc(db, WEB_SETTINGS_COLLECTION, WEB_SETTINGS_DOC_ID);

    const applyDynamicStyles = (themeColors?: ThemeColors) => {
      let fullCssText = ":root {\n";
      fullCssText += generatePaletteCssVariables(themeColors?.light, DEFAULT_LIGHT_THEME_COLORS_HSL);
      fullCssText += "}\n\n";

      fullCssText += ".dark {\n";
      fullCssText += generatePaletteCssVariables(themeColors?.dark, DEFAULT_DARK_THEME_COLORS_HSL);
      fullCssText += "}\n";
      
      let styleTag = document.getElementById(THEME_STYLE_TAG_ID) as HTMLStyleElement | null;
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = THEME_STYLE_TAG_ID;
        document.head.appendChild(styleTag);
      }
      styleTag.textContent = fullCssText;
    };
    
    const unsubscribe = onSnapshot(settingsDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const globalSettings = docSnap.data() as GlobalWebSettings;
        applyDynamicStyles(globalSettings.themeColors);
      } else {
        // Document doesn't exist, apply hardcoded defaults for both themes
        applyDynamicStyles({
          light: DEFAULT_LIGHT_THEME_COLORS_HSL,
          dark: DEFAULT_DARK_THEME_COLORS_HSL,
        });
      }
    }, (error) => {
      console.error("Error fetching theme settings for injector:", error);
      // Fallback to hardcoded defaults on error
      applyDynamicStyles({
        light: DEFAULT_LIGHT_THEME_COLORS_HSL,
        dark: DEFAULT_DARK_THEME_COLORS_HSL,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return null; // This component does not render anything itself
};

export default ThemeInjector;
