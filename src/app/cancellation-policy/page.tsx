
// src/app/cancellation-policy/page.tsx
import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch, HandCoins } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 
import AppImage from '@/components/ui/AppImage';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { getContentPageData, getGlobalWebSettings, getGlobalAppSettings } from '@/lib/webServerUtils';
import { formatDateInTimezone, formatCurrency } from '@/lib/utils';

function getTimestampMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'object') {
    if (ts.seconds !== undefined) return ts.seconds * 1000 + (ts.nanoseconds || 0) / 1000000;
    if (ts._seconds !== undefined) return ts._seconds * 1000 + (ts._nanoseconds || 0) / 1000000;
    if (ts instanceof Date) return ts.getTime();
  }
  if (typeof ts === 'string') {
    const date = new Date(ts);
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }
  return typeof ts === 'number' ? ts : 0;
}

export const revalidate = false;

const PAGE_SLUG = "cancellation-policy";

export async function generateMetadata(
  props: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;
  
  const pageData = await getContentPageData(PAGE_SLUG);
  const seoSettings = await getGlobalSEOSettings();
  const webSettings = await getGlobalWebSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Yourbrand";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); 

  if (!pageData) {
    return {
      title: `Page Not Found${defaultSuffix}`,
      description: "The page you are looking for does not exist.",
      openGraph: {
        title: `Page Not Found${defaultSuffix}`,
        description: "The page you are looking for does not exist.",
        siteName: siteName,
      }
    };
  }

  const title = `${pageData.title}${defaultSuffix}`;
  const description = pageData.content?.substring(0, 160) || seoSettings.defaultMetaDescription || `Information about ${pageData.title}`;
  const keywords = seoSettings.defaultMetaKeywords?.split(',').map(k => k.trim()).filter(k => k);
  const ogImage = pageData.imageUrl || webSettings?.websiteIconUrl || webSettings?.logoUrl || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${PAGE_SLUG}`;

  return {
    title: title,
    description: description,
    keywords: keywords && keywords.length > 0 ? keywords : undefined,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: title,
      description: description,
      url: canonicalUrl,
      siteName: siteName,
      type: 'article',
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

export default async function CancellationPolicyPage() {
  try {
    const pageData = await getContentPageData(PAGE_SLUG);
    const appConfig = await getGlobalAppSettings();
    
    const symbol = appConfig?.currencySymbol || "₹";
    const decimals = appConfig?.currencyDecimalPoints ?? 2;
    const code = appConfig?.currencyCode || "INR";

    const freeDays = appConfig?.freeCancellationDays || 0;
    const freeHours = appConfig?.freeCancellationHours || 0;
    const freeMins = appConfig?.freeCancellationMinutes || 0;

    let freeWindowText = "";
    if (freeDays > 0) freeWindowText += `${freeDays} day(s) `;
    if (freeHours > 0) freeWindowText += `${freeHours} hour(s) `;
    if (freeMins > 0 || freeWindowText === "") freeWindowText += `${freeMins} minute(s)`;
    freeWindowText = freeWindowText.trim();

    const finalHours = appConfig?.finalCancellationHours || 0;
    const finalMins = appConfig?.finalCancellationMinutes || 0;

    let finalWindowText = "";
    if (finalHours > 0) finalWindowText += `${finalHours} hour(s) `;
    if (finalMins > 0 || finalWindowText === "") finalWindowText += `${finalMins} minute(s)`;
    finalWindowText = finalWindowText.trim();

    const breadcrumbItems = [
        { label: "Home", href: "/" },
        { label: pageData?.title || "Cancellation Policy" },
    ];

    if (!pageData) {
      return (
        <div className="container mx-auto px-4 py-16 text-center">
          <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
          <h1 className="text-4xl font-bold text-destructive mb-4">404 - Page Not Found</h1>
          <p className="text-lg text-muted-foreground mb-8">
            Sorry, the page for '{PAGE_SLUG}' could not be found.
          </p>
          <Link href="/" passHref>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Home
            </Button>
          </Link>
        </div>
      );
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs items={breadcrumbItems} />
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-center justify-center mb-8">
            <div className="absolute left-0 hidden sm:block">
              <Link href="/" passHref>
                <Button variant="outline" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
                </Button>
              </Link>
            </div>
            <h1 className="text-4xl font-headline font-semibold text-foreground text-center">
              {pageData.title}
            </h1>
          </div>

          {pageData.imageUrl && (
              <div className="relative w-full aspect-video rounded-xl overflow-hidden mb-8 shadow-lg">
                  <AppImage 
                      src={pageData.imageUrl} 
                      alt={pageData.title} 
                      fill 
                      priority
                      className="object-cover"
                      aiHint={pageData.imageHint || "cancellation banner"}
                  />
              </div>
          )}

          <div className="mb-4 text-center">
            {pageData.updatedAt && (
              <p className="text-sm text-muted-foreground">
                Last updated: {(() => {
                    const millis = getTimestampMillis(pageData.updatedAt);
                    return millis ? formatDateInTimezone(new Date(millis), 'Asia/Kolkata', appConfig?.dateFormat) : 'N/A';
                })()}
              </p>
            )}
          </div>
          
          {/* Dynamic Active Policy Card */}
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-4">Active Cancellation Rules</h2>
            {!appConfig?.enableCancellationPolicy ? (
              <p className="text-sm text-muted-foreground">
                Cancellation policy is currently disabled. You can cancel any booking at any time for a full 100% refund.
              </p>
            ) : (
              <div className="space-y-4">
                {/* 1. Free Cancellation */}
                <div className="flex gap-4 items-start">
                  <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0 text-green-500 font-bold text-sm">1</div>
                  <div>
                    <h3 className="font-semibold text-foreground">Free Cancellation Window</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Cancel at least{" "}
                      <strong>{freeWindowText}</strong>{" "}
                      before your scheduled service time for a <strong>100% refund</strong>.
                    </p>
                  </div>
                </div>

                {/* 2. Standard Cancellation Fee */}
                <div className="flex gap-4 items-start border-t pt-4">
                  <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 text-amber-500 font-bold text-sm">2</div>
                  <div>
                    <h3 className="font-semibold text-foreground">Standard Cancellation Fee</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {appConfig.enableFinalCancellationWindow ? (
                        <>
                          Cancellations made between <strong>{freeWindowText}</strong> and <strong>{finalWindowText}</strong> before the scheduled service start time will incur a fee of{" "}
                          <strong>
                            {appConfig.cancellationFeeType === 'percentage' 
                              ? `${appConfig.cancellationFeeValue}%` 
                              : formatCurrency(appConfig.cancellationFeeValue || 0, symbol, decimals, code)}
                          </strong>.
                        </>
                      ) : (
                        <>
                          Cancellations made after the free cancellation window has passed (less than <strong>{freeWindowText}</strong> before the scheduled service start time) will incur a fee of{" "}
                          <strong>
                            {appConfig.cancellationFeeType === 'percentage' 
                              ? `${appConfig.cancellationFeeValue}%` 
                              : formatCurrency(appConfig.cancellationFeeValue || 0, symbol, decimals, code)}
                          </strong>.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* 3. Final Restricted Window */}
                {appConfig.enableFinalCancellationWindow && (
                  <div className="flex gap-4 items-start border-t pt-4">
                    <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 text-destructive font-bold text-sm">3</div>
                    <div>
                      <h3 className="font-semibold text-destructive">Final Restricted Window (No Refund)</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        Cancellations made within{" "}
                        <strong>{finalWindowText}</strong>{" "}
                        before the scheduled service start time will receive a <strong>100% cancellation charge (No Refund / {formatCurrency(0, symbol, decimals, code)} Refund)</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* 4. Pay After Service / COD Note */}
                <div className="flex gap-4 items-start border-t pt-4">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                    <HandCoins className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">Pay After Service / Cash on Delivery</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      For bookings scheduled under <strong>Pay After Service</strong> or <strong>Cash on Delivery</strong>, any applicable cancellation fee or restricted charge must be paid securely online before the cancellation request is processed.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error(`Error rendering page ${PAGE_SLUG}:`, error);
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
        <h1 className="text-4xl font-bold text-destructive mb-4">Server Error</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Sorry, an error occurred while trying to load this page.
        </p>
        <Link href="/" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Home
          </Button>
        </Link>
      </div>
    );
  }
}
