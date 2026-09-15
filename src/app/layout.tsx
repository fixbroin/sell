import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import AppLayout from '@/components/layout/AppLayout';
import { AuthProvider } from '@/contexts/AuthContext';
import { LoadingProvider } from '@/contexts/LoadingContext';
import GlobalActionLoader from '@/components/shared/GlobalActionLoader';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import React, { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { getBaseUrl } from '@/lib/config';
import MarketingScriptsInjector from '@/components/layout/MarketingScriptsInjector';
import Script from 'next/script';
import { Roboto } from 'next/font/google';
import PageViewTracker from '@/components/layout/PageViewTracker';
import ThemeInjector from '@/components/layout/ThemeInjector';
import DynamicManifest from '@/components/layout/DynamicManifest';
import ScrollMemory from '@/components/layout/ScrollMemory';
import KeyboardBehaviorManager from '@/components/layout/KeyboardBehaviorManager';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL, hslStringToHex, generatePaletteCssVariables } from '@/lib/colorUtils';
import { getGlobalWebSettings, getGlobalAppSettings } from '@/lib/webServerUtils';

const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
});

export async function generateMetadata(): Promise<Metadata> {
  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();
  const siteName = seoSettings.siteName || 'Yourbrand';
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const defaultDescription = seoSettings.defaultMetaDescription || 'Book home services easily with Yourbrand.';
  const defaultKeywords = (seoSettings.defaultMetaKeywords || '').split(',').map(k => k.trim()).filter(k => k);
  const defaultOgImage = `/default-image.png`;
  const ogImage = seoSettings.structuredDataImage || defaultOgImage;
  const absoluteOgImage = ogImage.startsWith('http') ? ogImage : `${appBaseUrl}${ogImage.startsWith('/') ? '' : '/'}${ogImage}`;

  return {
    metadataBase: new URL(appBaseUrl),
    title: {
      default: siteName,
      template: `%s${defaultSuffix}`,
    },
    description: defaultDescription,
    keywords: defaultKeywords.length > 0 ? defaultKeywords : undefined,
    manifest: '/manifest.json', // Default manifest
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: siteName,
    },
    openGraph: {
      siteName: siteName,
      title: siteName,
      description: defaultDescription,
      url: '/',
      images: [{ url: absoluteOgImage, width: 1200, height: 630, alt: siteName }],
      type: 'website',
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any', rel: 'icon' },
        { url: '/android-chrome-192x192.png', type: 'image/png', sizes: '192x192' },
        { url: '/android-chrome-512x512.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-touch-icon.png',
    }
  };
}

export async function generateViewport(): Promise<Viewport> {
  const webSettings = await getGlobalWebSettings();
  const themeColorValue = hslStringToHex(webSettings.themeColors?.light?.primary || DEFAULT_LIGHT_THEME_COLORS_HSL.primary!);

  return {
    themeColor: themeColorValue,
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    userScalable: true,
    interactiveWidget: 'resizes-visual',
  };
}

const RootSuspenseLoader = () => (
  <div className="flex justify-center items-center min-h-screen w-full">
    <Loader2 className="h-12 w-12 animate-spin text-primary" />
    <p className="ml-3 text-muted-foreground">Loading...</p>
  </div>
);


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [webSettings, appConfig] = await Promise.all([
    getGlobalWebSettings(),
    getGlobalAppSettings()
  ]);
  
  // Pre-generate the CSS variables for server injection to eliminate flicker
  const serverThemeStyles = `
    :root {
      ${generatePaletteCssVariables(webSettings.themeColors?.light, DEFAULT_LIGHT_THEME_COLORS_HSL)}
    }
    .dark {
      ${generatePaletteCssVariables(webSettings.themeColors?.dark, DEFAULT_DARK_THEME_COLORS_HSL)}
    }
  `;

  return (
    <html lang="en" className={`${roboto.variable}`} suppressHydrationWarning>
      <body className="font-body antialiased no-select">
        <style 
          id="yourbrand-dynamic-theme-styles" 
          precedence="high"
          href="yourbrand-dynamic-theme-styles"
          dangerouslySetInnerHTML={{ __html: serverThemeStyles }} 
        />
        <script
          id="yourbrand-initial-theme"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = (function() { 
                  try {
                    const storedTheme = localStorage.getItem('yourbrand-theme');
                    if (storedTheme === 'light' || storedTheme === 'dark') return storedTheme;
                    return 'light';
                  } catch (e) { return 'light'; }
                })();
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
                try {
                    if (localStorage.getItem('yourbrand-theme') !== theme) {
                        localStorage.setItem('yourbrand-theme', theme);
                    }
                } catch (e) { }
              })();
            `,
          }}
        />
        

        <ThemeInjector />
        <AuthProvider>
          <LoadingProvider>
            <DynamicManifest />
            <KeyboardBehaviorManager />
            <Suspense fallback={null}>
              <ScrollMemory />
            </Suspense>
            <MarketingScriptsInjector />
            <Suspense fallback={null}>
              <PageViewTracker />
            </Suspense>
            <AppLayout initialWebSettings={webSettings} initialAppConfig={appConfig}>
              {children}
            </AppLayout>
            <GlobalActionLoader />
          </LoadingProvider>
        </AuthProvider>

        <Toaster />
      </body>
    </html>
  );
}
    
