
// src/app/cookie-policy/page.tsx
import type { GlobalWebSettings, ContentPage } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 

import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import AppImage from '@/components/ui/AppImage';
import { getContentPageData, getGlobalWebSettings } from '@/lib/webServerUtils';

export const revalidate = false;

const PAGE_SLUG = "cookie-policy";

export async function generateMetadata(
  props: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const resolvedParent = await parent;

  const pageDataFromDb = await getContentPageData(PAGE_SLUG);
  const webSettings = await getGlobalWebSettings();
  const seoSettings = await getGlobalSEOSettings();
  
  const pageData = pageDataFromDb || (webSettings.cookiePolicyContent ? {
    title: "Cookie Policy",
    content: webSettings.cookiePolicyContent,
  } as ContentPage : null);

  const siteName = resolvedParent.openGraph?.siteName || seoSettings.siteName || "Yourbrand";
  const defaultSuffix = seoSettings.defaultMetaTitleSuffix || ` - ${siteName}`;
  const appBaseUrl = getBaseUrl();

  const title = pageData ? `${pageData.title}${defaultSuffix}` : `Cookie Policy${defaultSuffix}`;
  const description = pageData?.content?.substring(0, 160) || `Read our cookie policy to understand how ${siteName} uses cookies.`;
  const ogImage = pageData?.imageUrl || webSettings?.websiteIconUrl || webSettings?.logoUrl || seoSettings.structuredDataImage || `${appBaseUrl}/default-image.png`;
  const canonicalUrl = `${appBaseUrl}/${PAGE_SLUG}`;

  return {
    title,
    description,
    keywords: ["cookie policy", "cookies", siteName.toLowerCase(), "privacy"],
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: siteName,
      type: 'website', 
      images: ogImage ? [{ url: ogImage }] : [],
    },
  };
}

export default async function CookiePolicyPage() {
  const pageDataFromDb = await getContentPageData(PAGE_SLUG);
  const webSettings = await getGlobalWebSettings();

  const pageData = pageDataFromDb || (webSettings.cookiePolicyContent ? {
    title: "Cookie Policy",
    content: webSettings.cookiePolicyContent,
  } as ContentPage : null);

  const pageTitleForDisplay = pageData?.title || "Cookie Policy";

  const breadcrumbItems: BreadcrumbItem[] = [
      { label: "Home", href: "/" },
      { label: pageTitleForDisplay },
  ];

  if (!pageData) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground mb-6" />
        <h1 className="text-4xl font-bold text-destructive mb-4">Policy Not Found</h1>
        <p className="text-lg text-muted-foreground mb-8">
          Sorry, the Cookie Policy content is not available at this moment.
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
              <Button variant="outline" size="sm" className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to Home
              </Button>
            </Link>
          </div>
          <h1 className="text-4xl font-headline font-semibold text-foreground text-center">
            {pageTitleForDisplay}
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
                  aiHint={pageData.imageHint || "cookie banner"}
              />
          </div>
        )}
        
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
      </div>
    </div>
  );
}
