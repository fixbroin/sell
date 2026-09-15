import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle, PackageSearch } from "lucide-react";
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import JsonLdScript from '@/components/shared/JsonLdScript';
import { generateBreadcrumbSchema } from '@/lib/seoAdvancedUtils';
import { getBaseUrl } from '@/lib/config';
import { getFaqsServer } from '@/lib/webServerUtils';

export const revalidate = false;

export default async function FAQPage() {
  const faqs = await getFaqsServer();

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "FAQ" },
  ];

  const appBaseUrl = getBaseUrl();
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: "Home", url: appBaseUrl },
    { name: "FAQ", url: `${appBaseUrl}/faq` }
  ]);

  const faqSchema = faqs.length > 0 ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq: any) => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  } : null;

  return (
    <>
      <JsonLdScript data={breadcrumbSchema} idSuffix="breadcrumb-faq" />
      {faqSchema && <JsonLdScript data={faqSchema} idSuffix="main-faq" />}
      <div className="container mx-auto px-4 py-16 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <Breadcrumbs items={breadcrumbItems} />
        
        <div className="text-center mt-12 mb-16">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 mb-6">
            <HelpCircle className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-headline font-bold text-foreground mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about Yourbrand services, bookings, and more.
          </p>
        </div>

        {faqs.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-3xl border border-dashed border-border">
            <PackageSearch className="mx-auto h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-2xl font-headline font-bold mb-2 text-foreground/80">No FAQs Available</h2>
            <p className="text-muted-foreground">We're still building our knowledge base. Check back soon!</p>
          </div>
        ) : (
          <div className="bg-card rounded-3xl border border-border/50 shadow-sm overflow-hidden">
            <Accordion type="single" collapsible className="w-full divide-y divide-border/50">
              {faqs.map((faq: any) => (
                <AccordionItem key={faq.id} value={`item-${faq.id}`} className="border-none px-6 md:px-8 py-2">
                  <AccordionTrigger className="text-left hover:no-underline text-lg font-bold py-6 hover:text-primary transition-colors">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-base leading-relaxed pb-8 whitespace-pre-wrap">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
