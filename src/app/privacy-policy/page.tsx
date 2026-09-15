
// src/app/privacy-policy/page.tsx
import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 
import AppImage from '@/components/ui/AppImage';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { getContentPageData, getGlobalWebSettings, getGlobalAppSettings } from '@/lib/webServerUtils';
import { formatDateInTimezone } from '@/lib/utils';

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

const PAGE_SLUG = "privacy-policy";

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

export default async function PrivacyPolicyPage() {
  try {
    const pageData = await getContentPageData(PAGE_SLUG);
    const appConfig = await getGlobalAppSettings();

    const breadcrumbItems = [
        { label: "Home", href: "/" },
        { label: pageData?.title || "Privacy Policy" },
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
                      aiHint={pageData.imageHint || "privacy banner"}
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
          
          {pageData.content ? (
              <article
              className="prose prose-quoteless prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap
                        prose-headings:font-headline prose-headings:text-foreground
                        prose-p:text-foreground/80
                        prose-a:text-primary hover:prose-a:text-primary/80
                        prose-strong:text-foreground
                        prose-ul:list-disc prose-ol:list-decimal
                        prose-li:marker:text-primary"
              dangerouslySetInnerHTML={{ __html: pageData.content }}
              />
          ): (
              <p className="text-muted-foreground">No content available for this page yet.</p>
          )}
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
