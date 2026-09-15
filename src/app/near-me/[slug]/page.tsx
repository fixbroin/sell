import React from 'react';
import { adminDb } from '@/lib/firebaseAdmin';
import type { FirestoreCategory, FirestoreCity, FirestoreArea } from '@/types/firestore';
import { getBaseUrl } from '@/lib/config';
import { getCategorySearchTerm, generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';
import { Metadata, ResolvingMetadata } from 'next';
import NearMeLocationDetector from '@/components/category/NearMeLocationDetector';
import { Badge } from '@/components/ui/badge';
import Link from '@/components/shared/TransitionLink';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import JsonLdScript from '@/components/shared/JsonLdScript';
import { MapPin, ShieldCheck, Clock, CheckCircle2 } from 'lucide-react';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';

interface NearMeCategoryPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata(
  { params }: NearMeCategoryPageProps
): Promise<Metadata> {
  const { slug } = await params;
  const categorySnapshot = await adminDb.collection('adminCategories').where('slug', '==', slug).limit(1).get();
  
  if (categorySnapshot.empty) return { title: "Service Near Me | Yourbrand" };
  
  const category = categorySnapshot.docs[0].data() as FirestoreCategory;
  const searchTerm = getCategorySearchTerm(category.name);
  const appBaseUrl = getBaseUrl();

  return {
    title: `${searchTerm} Near Me | Local ${searchTerm} Services in Bangalore | Yourbrand`,
    description: `Looking for a ${searchTerm.toLowerCase()} near me? Yourbrand provides verified, high-quality ${category.name.toLowerCase()} experts across Bangalore. Book same-day service now.`,
    alternates: {
      canonical: `${appBaseUrl}/near-me/${slug}`,
    }
  };
}

const getNearMePageData = cache(async (slug: string) => {
  return unstable_cache(
    async () => {
      try {
        const categorySnapshot = await adminDb.collection('adminCategories').where('slug', '==', slug).limit(1).get();
        const citySnapshot = await adminDb.collection('cities').where('slug', '==', 'bangalore').limit(1).get();

        if (categorySnapshot.empty || citySnapshot.empty) return null;

        const category = { id: categorySnapshot.docs[0].id, ...categorySnapshot.docs[0].data() } as FirestoreCategory;
        const city = { id: citySnapshot.docs[0].id, ...citySnapshot.docs[0].data() } as FirestoreCity;

        const areasSnap = await adminDb.collection('areas')
          .where('cityId', '==', city.id)
          .where('isActive', '==', true)
          .orderBy('name', 'asc')
          .get();
        
        const areas = areasSnap.docs.map(doc => ({ 
          id: doc.id, 
          name: doc.data().name, 
          slug: doc.data().slug,
          latitude: doc.data().latitude,
          longitude: doc.data().longitude
        } as FirestoreArea));

        return { category, city, areas };
      } catch (error) {
        console.error("Error in getNearMePageData:", error);
        return null;
      }
    },
    [`near-me-data-${slug}`],
    { revalidate: false, tags: ['categories', 'cities', 'areas', 'global-cache'] }
  )();
});

export default async function NearMeCategoryPage({ params }: NearMeCategoryPageProps) {
  const { slug } = await params;
  
  const pageData = await getNearMePageData(slug);
  if (!pageData) return <div>Service Not Found</div>;

  const { category, city, areas } = pageData;
  const searchTerm = getCategorySearchTerm(category.name);

  const faqs = [
    {
        question: `How soon can a ${searchTerm.toLowerCase()} reach me in Bangalore?`,
        answer: `Yourbrand offers same-day service. Once you book, a verified ${searchTerm.toLowerCase()} near you will be assigned, typically reaching your location within 60-90 minutes.`
    },
    {
        question: `Are the ${searchTerm.toLowerCase()} experts verified?`,
        answer: `Yes, every professional on Yourbrand undergoes a rigorous multi-level background check and skill verification process to ensure safety and quality.`
    },
    {
        question: `What are the charges for ${searchTerm.toLowerCase()} services near me?`,
        answer: `We provide upfront, transparent pricing. You will see the exact rates for your specific needs before you confirm the booking. No hidden costs.`
    }
  ];

  return (
    <div className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-5xl mx-auto">
          
          {/* Main Title */}
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-5xl font-headline font-bold text-foreground mb-6">
                {searchTerm} Near Me
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Connect with the highest-rated <strong>{searchTerm.toLowerCase()} experts</strong> in your neighborhood. Fast, reliable, and background-verified professionals in Bangalore.
            </p>
          </div>

          {/* Smart Detector Component */}
          <div className="mb-20">
            <NearMeLocationDetector 
              categorySlug={slug}
              searchTerm={searchTerm}
              cityName={city.name}
              citySlug={city.slug}
              areas={areas}
            />
          </div>

          {/* Value Props */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            <div className="flex flex-col items-center text-center p-3 bg-card border rounded-2xl">
                <ShieldCheck className="h-10 w-10 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Verified Pros</h3>
                <p className="text-sm text-muted-foreground">Every expert is background checked and highly skilled.</p>
            </div>
            <div className="flex flex-col items-center text-center p-3 bg-card border rounded-2xl">
                <Clock className="h-10 w-10 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">60 Min Arrival</h3>
                <p className="text-sm text-muted-foreground">Fastest response time for emergency repairs in Bangalore.</p>
            </div>
            <div className="flex flex-col items-center text-center p-3 bg-card border rounded-2xl">
                <CheckCircle2 className="h-10 w-10 text-primary mb-4" />
                <h3 className="font-bold text-lg mb-2">Quality Guarantee</h3>
                <p className="text-sm text-muted-foreground">99.9% satisfaction or we will fix it for free.</p>
            </div>
          </div>

          {/* Massive Interlinking Grid */}
          <div className="mb-20">
            <h2 className="text-2xl md:text-3xl font-headline font-bold mb-8 flex items-center gap-2">
                <MapPin className="h-6 w-6 text-primary" /> {searchTerm} in Your Locality
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {areas.map(area => (
                    <Link key={area.id} href={`/${city.slug}/${area.slug}/${slug}`}>
                        <Badge variant="outline" className="w-full justify-center py-2 hover:bg-primary hover:text-white transition-all cursor-pointer border-muted-foreground/20">
                            {searchTerm} in {area.name}
                        </Badge>
                    </Link>
                ))}
            </div>
          </div>

          {/* FAQs */}
          <div className="max-w-3xl mx-auto mb-20">
            <h2 className="text-2xl md:text-3xl font-headline font-bold mb-8 text-center">FAQs about {searchTerm} Services</h2>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`faq-${index}`}>
                  <AccordionTrigger className="text-left font-medium">{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Bottom Content */}
          <div className="prose prose-sm md:prose-base max-w-none text-muted-foreground bg-muted/30 p-8 md:p-12 rounded-3xl">
             <h3 className="text-foreground">Dominating Local {searchTerm} Needs in Bangalore</h3>
             <p>
                Searching for a <strong>{searchTerm.toLowerCase()} near me</strong> usually means you have an urgent repair or installation need. Yourbrand has optimized its entire platform to ensure that whether you are in Electronic City, Whitefield, or Jayanagar, you are never more than a few clicks away from a professional. 
             </p>
             <p>
                Our <strong>local {searchTerm.toLowerCase()} services</strong> include everything from minor repairs to major renovations. By focusing on hyper-local availability, we reduce travel time for our providers, which translates to faster service and better prices for you.
             </p>
          </div>

        </div>
      </div>

      {/* FAQ Schema */}
      <JsonLdScript 
        idSuffix={`near-me-faqs-${slug}`}
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": faqs.map(f => ({
            "@type": "Question",
            "name": f.question,
            "acceptedAnswer": { "@type": "Answer", "text": f.answer }
          }))
        }}
      />

      {/* Breadcrumb List Schema */}
      {(() => {
        const appBaseUrl = getBaseUrl();
        const breadcrumbSchema = generateBreadcrumbSchema([
          { name: "Home", url: appBaseUrl },
          { name: "Near Me", url: `${appBaseUrl}/near-me` },
          { name: `${searchTerm} Near Me`, url: `${appBaseUrl}/near-me/${slug}` }
        ]);
        return <JsonLdScript idSuffix={`near-me-breadcrumbs-${slug}`} data={breadcrumbSchema} />;
      })()}
    </div>
  );
}
