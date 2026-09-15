

// src/lib/colorUtils.ts
import type { ThemePalette } from '@/types/firestore';

/**
 * Converts a HEX color string to an HSL string "H S% L%".
 * @param hex The HEX color string (e.g., "#RRGGBB" or "#RGB").
 * @returns The HSL string or an empty string if conversion fails.
 */
export function hexToHslString(hex: string | null | undefined): string {
  if (!hex || typeof hex !== 'string') return "";
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.substring(1, 3), 16);
    g = parseInt(hex.substring(3, 5), 16);
    b = parseInt(hex.substring(5, 7), 16);
  } else {
    return ""; // Invalid HEX format
  }

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  h = Math.round(h * 360);
  s = Math.round(s * 100);
  l = Math.round(l * 100);

  return `${h} ${s}% ${l}%`;
}

/**
 * Converts an HSL string "H S% L%" to a HEX color string.
 * @param hslString The HSL string (e.g., "210 50% 75%").
 * @returns The HEX color string (e.g., "#RRGGBB") or an empty string if conversion fails.
 */
export function hslStringToHex(hslString: string | null | undefined): string {
  if (!hslString || typeof hslString !== 'string') return "";
  const parts = hslString.match(/(\d+)\s*(\d+)%?\s*(\d+)%?/);
  if (!parts) return "";

  let h = parseInt(parts[1], 10);
  let s = parseInt(parts[2], 10) / 100;
  let l = parseInt(parts[3], 10) / 100;

  if (s < 0) s = 0; if (s > 1) s = 1;
  if (l < 0) l = 0; if (l > 1) l = 1;


  if (s === 0) {
    const grayVal = Math.round(l * 255);
    const grayHex = grayVal.toString(16).padStart(2, '0');
    return `#${grayHex}${grayHex}${grayHex}`;
  }

  const hueToRgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  h /= 360;

  const r = Math.round(hueToRgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, h) * 255);
  const b = Math.round(hueToRgb(p, q, h - 1 / 3) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}


// Define the complete default HSL palettes based on globals.css
export const DEFAULT_LIGHT_THEME_COLORS_HSL: Required<ThemePalette> = {
  background: "196 67% 96%",
  foreground: "210 10% 23%",
  card: "0 0% 100%",
  "card-foreground": "210 10% 23%",
  popover: "0 0% 100%",
  "popover-foreground": "210 10% 23%",
  primary: "181 39% 45%",
  "primary-foreground": "0 0% 100%",
  secondary: "196 50% 90%",
  "secondary-foreground": "210 10% 23%",
  muted: "196 50% 90%",
  "muted-foreground": "210 10% 45%",
  accent: "183 49% 30%",
  "accent-foreground": "0 0% 100%",
  destructive: "0 100% 50%",
  "destructive-foreground": "0 0% 98%",
  border: "0 0% 75%",
  input: "0 0% 47%",
  ring: "181 39% 45%",
  "chart-1": "12 76% 61%",
  "chart-2": "173 58% 39%",
  "chart-3": "197 37% 24%",
  "chart-4": "43 74% 66%",
  "chart-5": "27 87% 67%",
  "sidebar-background": "0 0% 98%",
  "sidebar-foreground": "240 5.3% 26.1%",
  "sidebar-primary": "240 5.9% 10%",
  "sidebar-primary-foreground": "0 0% 98%",
  "sidebar-accent": "240 4.8% 95.9%",
  "sidebar-accent-foreground": "240 5.9% 10%",
  "sidebar-border": "220 13% 91%",
  "sidebar-ring": "217.2 91.2% 59.8%",
};

export const DEFAULT_DARK_THEME_COLORS_HSL: Required<ThemePalette> = {
  background: "210 10% 10%",
  foreground: "196 67% 96%",
  card: "210 10% 15%",
  "card-foreground": "196 67% 96%",
  popover: "210 10% 15%",
  "popover-foreground": "196 67% 96%",
  primary: "181 39% 55%",
  "primary-foreground": "0 0% 10%",
  secondary: "210 10% 25%",
  "secondary-foreground": "196 67% 96%",
  muted: "210 10% 25%",
  "muted-foreground": "196 50% 70%",
  accent: "183 49% 40%",
  "accent-foreground": "0 0% 10%",
  destructive: "0 70% 50%",
  "destructive-foreground": "0 0% 98%",
  border: "210 10% 30%",
  input: "210 10% 30%",
  ring: "181 39% 55%",
  "chart-1": "220 70% 50%",
  "chart-2": "160 60% 45%",
  "chart-3": "30 80% 55%",
  "chart-4": "280 65% 60%",
  "chart-5": "340 75% 55%",
  "sidebar-background": "240 5.9% 10%",
  "sidebar-foreground": "240 4.8% 95.9%",
  "sidebar-primary": "224.3 76.3% 48%",
  "sidebar-primary-foreground": "0 0% 100%",
  "sidebar-accent": "240 3.7% 15.9%",
  "sidebar-accent-foreground": "240 4.8% 95.9%",
  "sidebar-border": "240 3.7% 15.9%",
  "sidebar-ring": "217.2 91.2% 59.8%",
};

// Deriving keys from an actual object helps with static analysis
export const THEME_PALETTE_KEYS = Object.keys(DEFAULT_LIGHT_THEME_COLORS_HSL) as Array<keyof ThemePalette>;

/**
 * Generates CSS variable declarations for a given theme palette.
 * @param palette The (potentially partial) theme palette from Firestore.
 * @param defaultPalette The fallback default HSL palette.
 * @returns A string of CSS variable declarations.
 */
export const generatePaletteCssVariables = (palette: Partial<ThemePalette> | undefined, defaultPalette: Required<ThemePalette>): string => {
  let cssText = "";
  (Object.keys(defaultPalette) as Array<keyof ThemePalette>).forEach(key => {
    const cssVarName = `--${key}`;
    const hslValue = palette?.[key] || defaultPalette[key];
    if (hslValue) {
      cssText += `  ${cssVarName}: ${hslValue};\n`;
    }
  });
  return cssText;
};

// Keys for the admin theme settings UI (the core customizable ones)
export const CORE_THEME_PALETTE_KEYS: Array<keyof Pick<ThemePalette, 'primary' | 'foreground' | 'accent' | 'background' | 'secondary' | 'card' | 'border' | 'destructive' | 'input' | 'ring' | 'primary-foreground' | 'secondary-foreground' | 'card-foreground' | 'popover' | 'popover-foreground' | 'muted' | 'muted-foreground' | 'accent-foreground' | 'destructive-foreground' >> = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring'
];
