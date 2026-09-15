import { adminDb } from '@/lib/firebaseAdmin';
import type { ContentPage, GlobalWebSettings } from "@/types/firestore";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft, PackageSearch, Mail, Phone, MapPin, Clock, Calendar } from "lucide-react";
import type { Metadata, ResolvingMetadata } from 'next';
import { getGlobalSEOSettings } from '@/lib/seoServerUtils';
import { getBaseUrl } from '@/lib/config'; 
import { formatDateInTimezone } from '@/lib/utils';

import ContactUsForm from "@/components/forms/ContactUsForm";
import AppImage from '@/components/ui/AppImage';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
import { Card, CardContent } from "@/components/ui/card";
import { getContentPageData, getGlobalAppSettings } from '@/lib/webServerUtils';
import JsonLdScript from '@/components/shared/JsonLdScript';
import type { BreadcrumbItem } from '@/types/ui';

export const revalidate = false;

const PAGE_SLUG = "contact-us";

export async function generateMetadata(
  _: {},
  parent: ResolvingMetadata
): Promise<Metadata> {
  const pageData = await getContentPageData(PAGE_SLUG);
  const seoSettings = await getGlobalSEOSettings();
  const appBaseUrl = getBaseUrl();

  const title = pageData?.metaTitle || `Contact Us | ${seoSettings.siteName || 'Yourbrand'}`;
  const description = pageData?.metaDescription || "Contact Yourbrand for any queries, support, or feedback regarding our home services in Bangalore.";

  return {
    title: title,
    description: description,
    alternates: {
      canonical: `${appBaseUrl}/contact-us`,
    },
    openGraph: {
      title: title,
      description: description,
      url: `/contact-us`,
      type: 'website',
    },
  };
}

export default async function ContactUsPage() {
  const pageData = await getContentPageData(PAGE_SLUG);

  // Load App Settings for working hours
  let timeSlotSettings: any = {};
  let appConfig: any = null;
  try {
    appConfig = await getGlobalAppSettings();
    timeSlotSettings = appConfig?.timeSlotSettings || {};
  } catch (dbErr) {
    console.warn("ContactUsPage: Could not load applicationConfig from DB, using defaults:", dbErr);
  }
  
  const defaultWeeklyAvailability = {
    monday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
    tuesday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
    wednesday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
    thursday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
    friday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
    saturday: { isEnabled: true, startTime: "10:00", endTime: "14:00", intervals: [{ startTime: "10:00", endTime: "14:00" }] },
    sunday: { isEnabled: true, startTime: "10:00", endTime: "14:00", intervals: [{ startTime: "10:00", endTime: "14:00" }] },
  };

  const weeklyAvailability: any = {
    ...defaultWeeklyAvailability,
    ...(timeSlotSettings.weeklyAvailability || {})
  };

  // Load Leaves (active and upcoming)
  let leavesSnap: any = { docs: [] };
  try {
    const todayISO = new Date().toLocaleDateString('en-CA');
    leavesSnap = await adminDb.collection("leaves")
        .where("endDate", ">=", todayISO)
        .get();
  } catch (e) {
    console.warn("ContactUsPage: Could not load leaves from DB:", e);
  }
  const leaves = leavesSnap.docs
      .map((doc: any) => ({ id: doc.id, ...doc.data() }))
      .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));

  if (!pageData) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <div className="bg-muted w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
          <PackageSearch className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold mb-4">Contact Page Not Found</h1>
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
  const contactSchema = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    "name": "Contact Yourbrand",
    "description": "Contact Yourbrand for professional home services in Bangalore. Reach us via phone, email, or visit our office.",
    "url": `${appBaseUrl}/contact-us`,
    "mainEntity": {
      "@type": "LocalBusiness",
      "name": "Yourbrand",
      "image": `${appBaseUrl}/android-chrome-512x512.png`,
      "telephone": "+91-7353113455",
      "email": "support@yourdomain.com",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "#44, G S Palya Road, Konappana Agrahara, Electronic City Phase 2",
        "addressLocality": "Bangalore",
        "addressRegion": "KA",
        "postalCode": "560100",
        "addressCountry": "IN"
      },
      "openingHoursSpecification": {
        "@type": "OpeningHoursSpecification",
        "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        "opens": "08:00",
        "closes": "20:00"
      }
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <JsonLdScript data={contactSchema} idSuffix="contact-page-schema" />
      {/* Header Section */}
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
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contact Info Cards */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="rounded-[2.5rem] border-none shadow-xl bg-primary text-primary-foreground overflow-hidden">
                <CardContent className="p-10 space-y-10">
                  <div className="space-y-4">
                    <h3 className="text-2xl font-bold font-headline">Contact Information</h3>
                    <p className="text-primary-foreground/80 font-medium">Reach out to us through any of these channels.</p>
                  </div>
                  
                  <div className="space-y-8">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <Phone className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-1">Call Us</p>
                        <p className="text-xl font-bold">+91-7353113455</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <Mail className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-1">Email Us</p>
                        <p className="text-xl font-bold">support@yourdomain.com</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
                        <MapPin className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-1">Visit Us</p>
                        <p className="text-lg font-bold leading-relaxed">
                          #44 G S Palya Road, Konappana Agrahara, Electronic City Phase 2, Bangalore - 560100
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-2">
              <Card className="rounded-[2.5rem] border-border/50 shadow-2xl bg-card overflow-hidden">
                <CardContent className="p-8 md:p-12">
                  <ContactUsForm />
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Working Hours & Holidays Section */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-16">
            {/* Service Working Hours (Left side) */}
            <div className="lg:col-span-6 bg-card border border-border/50 rounded-[2.5rem] shadow-2xl p-8 md:p-12">
              <h3 className="text-2xl font-bold font-headline mb-6 flex items-center gap-3 text-foreground">
                <Clock className="h-6 w-6 text-primary" /> Service Working Hours
              </h3>
              <div className="space-y-4">
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                  const dayName = day.charAt(0).toUpperCase() + day.slice(1);
                  const config = weeklyAvailability[day];
                  const isEnabled = config?.isEnabled ?? false;
                  
                  return (
                    <div key={day} className="flex justify-between items-center py-2 border-b border-border/30 last:border-0">
                      <span className="font-semibold text-foreground/80">{dayName}</span>
                      {isEnabled ? (
                        <div className="flex flex-col items-end gap-1">
                          {config.intervals && config.intervals.length > 0 ? (
                            config.intervals.map((interval: any, idx: number) => (
                              <span key={idx} className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
                                {interval.startTime} - {interval.endTime}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm font-medium bg-primary/10 text-primary px-3 py-1 rounded-full">
                              {config.startTime || "09:00 AM"} - {config.endTime || "06:00 PM"}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm font-medium bg-muted text-muted-foreground px-3 py-1 rounded-full">
                          Closed
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Holidays & Leaves (Right side) */}
            <div className="lg:col-span-6 bg-card border border-border/50 rounded-[2.5rem] shadow-2xl p-8 md:p-12">
              <h3 className="text-2xl font-bold font-headline mb-6 flex items-center gap-3 text-foreground">
                <Calendar className="h-6 w-6 text-primary" /> Holidays & Leaves
              </h3>
              {leaves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <Calendar className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="font-medium">No scheduled holidays or provider leaves.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {leaves.map((leave: any) => {
                    const isFullDay = leave.leaveType === 'full_day';
                    const dateDisplay = leave.startDate === leave.endDate 
                      ? formatDateInTimezone(new Date(leave.startDate), 'Asia/Kolkata', appConfig?.dateFormat)
                      : `${formatDateInTimezone(new Date(leave.startDate), 'Asia/Kolkata', appConfig?.dateFormat)} - ${formatDateInTimezone(new Date(leave.endDate), 'Asia/Kolkata', appConfig?.dateFormat)}`;

                    return (
                      <div key={leave.id} className="p-4 rounded-2xl bg-muted/40 border border-border/40 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <span className="font-bold text-foreground/80 text-sm md:text-base">{dateDisplay}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${isFullDay ? 'bg-red-100 text-red-800 dark:bg-red-950/20 dark:text-red-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300'}`}>
                            {isFullDay ? 'Full Day' : 'Partial Day'}
                          </span>
                        </div>
                        {!isFullDay && (
                          <p className="text-xs text-muted-foreground font-semibold">
                            Hours: {leave.startTime} - {leave.endTime}
                          </p>
                        )}
                        <p className="text-sm font-medium text-muted-foreground">
                          Reason: <span className="text-foreground/90 font-bold">{leave.reason || (isFullDay ? "Provider Leave / Holiday" : "Provider on Leave / Custom Gaps")}</span>
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Embedded Content */}
          <div className="mt-16 bg-card rounded-[3rem] shadow-2xl border border-border/50 overflow-hidden">
            <div className="p-8 md:p-16 lg:p-20">
              <div 
                className="prose prose-xl dark:prose-invert max-w-none 
                  prose-headings:font-headline prose-headings:font-bold prose-headings:text-foreground
                  prose-p:text-muted-foreground prose-p:leading-relaxed
                  prose-strong:text-foreground prose-strong:font-bold
                  prose-ul:list-disc prose-li:marker:text-primary"
                dangerouslySetInnerHTML={{ __html: pageData.content }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
