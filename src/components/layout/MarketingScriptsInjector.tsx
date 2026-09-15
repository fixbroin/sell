
"use client";

import Script from 'next/script';
import { useMarketingSettings } from '@/hooks/useMarketingSettings';
import { useEffect } from 'react';
import { initializeFCM, onForegroundMessage } from '@/lib/fcmUtils';
import { useAuth } from '@/hooks/useAuth';
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import InjectRawHtml from '@/components/shared/InjectRawHtml'; // Import the new component
import { usePathname } from 'next/navigation';

const MarketingScriptsInjector = () => {
  const { settings: marketingSettings, isLoading: isLoadingMarketing } = useMarketingSettings();
  const { settings: globalSettings, isLoading: isLoadingGlobal } = useGlobalSettings();
  const { user, isLoading: isLoadingAuth } = useAuth();
  const pathname = usePathname();

  const isAdminPath = pathname?.startsWith('/admin');

  useEffect(() => {
    // Meta Pixel PageView event on route change (basic example)
    if (marketingSettings.metaPixelId && typeof window !== 'undefined' && (window as any).fbq) {
      (window as any).fbq('track', 'PageView');
    }
  }, [marketingSettings.metaPixelId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !isLoadingMarketing && !isLoadingGlobal && !isLoadingAuth) {
      // Use a more specific config check if needed, e.g. globalSettings.isPushNotificationsEnabled
      if (globalSettings.isChatEnabled && marketingSettings.firebasePublicVapidKey) {
        initializeFCM(user?.uid)
          .then(token => {
            if (token) {
              console.log("FCM initialized and token received by injector:", token);
              onForegroundMessage();
            } else {
              console.log("FCM initialization did not return a token from injector.");
            }
          })
          .catch(err => console.error("Error during FCM initialization from injector:", err));
      }
    }
  }, [
    user, 
    isLoadingAuth, 
    globalSettings.isChatEnabled, 
    isLoadingGlobal, 
    marketingSettings.firebasePublicVapidKey, 
    isLoadingMarketing
  ]);


  if (isLoadingMarketing) {
    return null;
  }
  
  // Choose primary ID for gtag script: GTM > GA4 > Ads ID. GTM is handled separately now.
  const primaryGtagId = marketingSettings.googleAnalyticsId || marketingSettings.googleAdsConversionId;

  return (
    <>
      {/* Google Tag Manager (GTM) */}
      {marketingSettings.googleTagManagerId && (
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${marketingSettings.googleTagManagerId}');
            `,
          }}
        />
      )}

      {/* Google Tag (gtag.js) - Load if ANY gtag-compatible ID exists AND GTM is not used. */}
      {primaryGtagId && !marketingSettings.googleTagManagerId && (
        <>
          <Script
            id="gtag-script"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${primaryGtagId}`}
          />
          <Script
            id="gtag-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${primaryGtagId}');
                ${marketingSettings.googleAdsConversionId ? `gtag('config', '${marketingSettings.googleAdsConversionId}');` : ''}
                ${marketingSettings.googleRemarketingTag ? `gtag('config', '${marketingSettings.googleRemarketingTag}');` : ''}
                ${marketingSettings.googleOptimizeContainerId ? `gtag('config', '${marketingSettings.googleOptimizeContainerId}');` : ''}
              `,
            }}
          />
        </>
      )}

      {/* Meta Pixel (Facebook Pixel) */}
      {marketingSettings.metaPixelId && (
        <Script
          id="fb-pixel-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${marketingSettings.metaPixelId}');
              fbq('track', 'PageView');
            `,
          }}
        />
      )}
      
      {/* Microsoft Bing UET Tag */}
      {marketingSettings.bingUetTagId && (
        <Script
          id="bing-uet-tag"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${marketingSettings.bingUetTagId}"};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","//bat.bing.com/bat.js","uetq");
            `,
          }}
        />
      )}
      
      {/* Pinterest Tag */}
      {marketingSettings.pinterestTagId && (
        <Script
          id="pinterest-tag"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(e){if(!window.pintrk){window.pintrk = function () {
              window.pintrk.queue.push(Array.prototype.slice.call(arguments))};var
                n=window.pintrk;n.queue=[],n.version="3.0";var
                t=document.createElement("script");t.async=!0,t.src=e;var
                r=document.getElementsByTagName("script")[0];
                r.parentNode.insertBefore(t,r)}}("https://s.pinimg.com/ct/core.js");
              pintrk('load', '${marketingSettings.pinterestTagId}');
              pintrk('page');
            `,
          }}
        />
      )}

      {/* Microsoft Clarity */}
      {marketingSettings.microsoftClarityProjectId && !isAdminPath && (
        <Script
          id="microsoft-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "${marketingSettings.microsoftClarityProjectId}");
            `,
          }}
        />
      )}
      
      {/* Custom Head Script */}
      {marketingSettings.customHeadScript && (
        <Script
          id="custom-head-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: marketingSettings.customHeadScript }}
        />
      )}

      {/* Custom Body Script uses InjectRawHtml now */}
      {marketingSettings.customBodyScript && (
        <InjectRawHtml htmlContent={marketingSettings.customBodyScript} />
      )}

      {/* Script to load Firebase config for Service Worker */}
      <Script
        id="firebase-config-loader"
        src="/api/firebase-config"
        strategy="afterInteractive"
      />
    </>
  );
};

export default MarketingScriptsInjector;
