import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import type { BreadcrumbItem } from '@/types/ui';
import { getBaseUrl } from '@/lib/config'; 
import AppImage from '@/components/ui/AppImage';
import { getContentPageData, getGlobalWebSettings } from '@/lib/webServerUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';

export const revalidate = false;

const PAGE_SLUG = "about-us";

export async function generateMetadata(
  props: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const pageData = await getContentPageData(PAGE_SLUG);
  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();

  if (!pageData) return { title: `About Us | Yourbrand` };

  const title = pageData.metaTitle || `About Us | ${seoSettings.siteName || 'Yourbrand'}`;
  const description = pageData.metaDescription || pageData.excerpt || "Learn more about Yourbrand - Bangalore's most trusted home services provider.";

  return {
    title: title,
    description: description,
    alternates: {
      canonical: `${appBaseUrl}/about-us`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/about-us`,
      type: 'website',
    },
  };
}

export default async function AboutUsPage() {
  const pageData = await getContentPageData(PAGE_SLUG);

  if (!pageData) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <PackageSearch className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold mb-4">About Us Page Not Found</h1>
        <p className="text-muted-foreground mb-8">
          The content for this page is currently being updated.
        </p>
        <Link href="/" passHref>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: pageData.title },
  ];

  const appBaseUrl = getBaseUrl();
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Yourbrand",
    "url": appBaseUrl,
    "logo": `${appBaseUrl}/android-chrome-512x512.png`,
    "description": pageData.metaDescription || "Yourbrand is Bangalore's leading home services provider, offering professional carpentry, electrical, plumbing, and more.",
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+91-7353113455",
      "contactType": "customer service",
      "areaServed": "IN",
      "availableLanguage": ["en", "kn", "hi"]
    },
    "sameAs": [
      "https://www.facebook.com/yourbrand.in",
      "https://x.com/yourbrand",
      "https://www.instagram.com/yourbrand/",
      "https://www.linkedin.com/company/yourbrand-in",
      "https://www.youtube.com/@yourbrand"
    ]
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <JsonLdScript data={organizationSchema} idSuffix="about-org" />
      {/* Hero Section */}
      <div className="bg-primary/5 py-20 md:py-32">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={breadcrumbItems} />
          <div className="max-w-4xl mx-auto text-center mt-12">
            <h1 className="text-5xl md:text-7xl font-headline font-bold text-foreground mb-8">
              {pageData.title}
            </h1>
            {pageData.excerpt && (
              <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed">
                {pageData.excerpt}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 -mt-16">
        <div className="max-w-4xl mx-auto bg-card rounded-[3rem] shadow-2xl border border-border/50 overflow-hidden">
          {pageData.coverImageUrl && (
            <div className="relative aspect-video w-full">
              <AppImage
                src={pageData.coverImageUrl}
                alt={pageData.title}
                fill
                className="object-cover"
                priority
              />
            </div>
          )}
          
          <div className="p-8 md:p-16 lg:p-20">
            <div 
              className="prose prose-xl dark:prose-invert max-w-none 
                prose-headings:font-headline prose-headings:font-bold prose-headings:text-foreground
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-strong:text-foreground prose-strong:font-bold
                prose-ul:list-disc prose-li:marker:text-primary
                prose-img:rounded-3xl prose-img:shadow-xl"
              dangerouslySetInnerHTML={{ __html: pageData.content }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
