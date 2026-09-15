// src/app/careers/page.tsx
import { adminDb } from '@/lib/firebaseAdmin';
import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Briefcase, UserPlus } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 
import AppImage from '@/components/ui/AppImage';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { getContentPageData, getGlobalAppSettings } from '@/lib/webServerUtils';
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

const PAGE_SLUG = "careers";

export async function generateMetadata(
  props: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const pageData = await getContentPageData(PAGE_SLUG);
  const seoSettings = await getGlobalSEOSettings();
  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Yourbrand";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl(); 

  if (!pageData) {
    return {
      title: `Page Not Found${defaultSuffix}`,
      description: "The page you are looking for does not exist.",
    };
  }

  const title = `${pageData.title}${defaultSuffix}`;
  const description = pageData.content?.substring(0, 160) || seoSettings.defaultMetaDescription || `Information about ${pageData.title}`;
  const ogImage = pageData.imageUrl || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${PAGE_SLUG}`;

  return {
    title: title,
    description: description,
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

export default async function CareersPage() {
  try {
    const pageData = await getContentPageData(PAGE_SLUG);
    const appConfig = await getGlobalAppSettings();

    const breadcrumbItems = [
        { label: "Home", href: "/" },
        { label: pageData?.title || "Careers" },
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
      <div className="min-h-screen bg-muted/20 pb-16">
        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs items={breadcrumbItems} />
          
          <div className="max-w-4xl mx-auto mt-6 bg-card rounded-2xl shadow-sm border border-border/50 overflow-hidden">
            {pageData.imageUrl && (
                <div className="relative w-full aspect-[21/9] overflow-hidden">
                    <AppImage 
                        src={pageData.imageUrl} 
                        alt={pageData.title} 
                        fill 
                        priority
                        className="object-cover hover:scale-105 transition-transform duration-700"
                        aiHint={pageData.imageHint || "careers banner"}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3 md:p-10">
                        <h1 className="text-3xl md:text-5xl font-headline font-bold text-white drop-shadow-md">
                        {pageData.title}
                        </h1>
                    </div>
                </div>
            )}

            <div className="p-3 md:p-10 lg:p-12">
                {!pageData.imageUrl && (
                    <div className="mb-8 border-b pb-6">
                        <h1 className="text-4xl font-headline font-bold text-foreground">
                        {pageData.title}
                        </h1>
                    </div>
                )}

                <div className="flex items-center gap-2 mb-8 text-primary font-semibold text-sm uppercase tracking-wider">
                    <Briefcase className="h-4 w-4" />
                    <span>Join Our Growing Team</span>
                </div>

                {pageData.content ? (
                    <article
                    className="prose prose-lg prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap
                                prose-headings:font-headline prose-headings:text-foreground prose-headings:font-bold
                                prose-p:text-foreground/80 prose-p:leading-relaxed
                                prose-a:text-primary hover:prose-a:text-primary/80 prose-a:font-semibold
                                prose-strong:text-foreground prose-strong:font-bold
                                prose-ul:list-disc prose-ol:list-decimal
                                prose-li:marker:text-primary"
                    dangerouslySetInnerHTML={{ __html: pageData.content }}
                    />
                ): (
                    <p className="text-muted-foreground italic text-center py-10">Content for this section is currently being updated. Please check back soon.</p>
                )}

                {pageData.updatedAt && (
                    <div className="mt-12 pt-6 border-t border-border/50 text-right">
                        <p className="text-xs text-muted-foreground">
                             Last updated: {(() => {
                                 const millis = getTimestampMillis(pageData.updatedAt);
                                 return millis ? formatDateInTimezone(new Date(millis), 'Asia/Kolkata', appConfig?.dateFormat) : 'N/A';
                             })()}
                        </p>
                    </div>
                )}
            </div>
          </div>

          <div className="max-w-4xl mx-auto mt-12 bg-primary/10 rounded-2xl p-8 md:p-12 text-center border border-primary/20">
              <div className="bg-primary/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                  <UserPlus className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-2xl font-headline font-bold text-foreground mb-3">Are you a professional provider?</h3>
              <p className="text-muted-foreground mb-8 max-w-md mx-auto">Boost your business by joining our platform as a trusted partner. We're always looking for skilled experts!</p>
              <Link href="/provider-registration" passHref>
                  <Button size="lg" className="rounded-full px-10 shadow-lg shadow-primary/25 h-12 font-bold">
                      Register as a Provider
                  </Button>
              </Link>
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
