'use server';

/**
 * src/ai/flows/chatWithAgentFlow.ts
 *
 * Enhanced production-ready AI chat flow for Yourbrand.
 * Now location-aware, website-knowledgeable, and respects admin takeover.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { adminDb } from '@/lib/firebaseAdmin';
import { getBaseUrl } from '@/lib/config';
import type {
  FirestoreUser,
  FirestoreBooking,
  FirestoreCategory,
  FirestoreSubCategory,
  FirestoreService,
  AppSettings,
  DayAvailability,
  FirestoreCity,
  FirestoreArea,
  ContentPage,
  FirestoreFAQ,
  ChatSession,
} from '@/types/firestore';
import { sendHumanSupportRequestEmail } from './sendHumanSupportRequestEmailFlow';
import { formatScheduledDate } from '@/lib/utils';

/* -------------------------
   Input / Output Schemas
   ------------------------- */
const ChatHistoryItemSchema = z.object({
  role: z.enum(['user', 'model', 'system']),
  content: z.array(z.object({ text: z.string() })),
});
export type ChatHistoryItem = z.infer<typeof ChatHistoryItemSchema>;

const ChatAgentInputSchema = z.object({
  history: z.array(ChatHistoryItemSchema),
  message: z.string(),
  userId: z.string().optional(),
});
export type ChatAgentInput = z.infer<typeof ChatAgentInputSchema>;

const ChatAgentOutputSchema = z.object({
  response: z.string(),
  isSilent: z.boolean().optional(),
});
export type ChatAgentOutput = z.infer<typeof ChatAgentOutputSchema>;

export async function chatWithAgent(input: ChatAgentInput): Promise<ChatAgentOutput> {
  return chatAgentFlow(input);
}

/* -------------------------
   Helper Types & Utilities
   ------------------------- */
type FlatService = {
  id: string;
  name: string;
  slug: string;
  url: string;
  subCategoryId?: string;
  parentCategoryId?: string;
};

type LocationData = {
    cities: { name: string; slug: string; url: string }[];
    areas: { name: string; slug: string; cityName: string; url: string }[];
};

function normalizeText(s: string): string {
  return (s || '').toString().trim().toLowerCase();
}

function tokenize(s: string): string[] {
  return normalizeText(s).split(/\W+/).filter(Boolean);
}

function isGreeting(message: string): boolean {
  const m = normalizeText(message);
  const greetings = [
    'hi', 'hello', 'hey', 'hlo', 'helo',
    'good morning', 'good afternoon', 'good evening', 'namaste'
  ];
  return greetings.includes(m);
}

function isTooShortForServiceMatch(message: string): boolean {
  return message.trim().split(/\s+/).length < 2;
}

function isServiceIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(fix|repair|install|service|problem|issue|need|want|book|hire|clean|pest|electrician|plumber|carpenter|painter|ac|appliance)\b/.test(m);
}

function isCustomServiceIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(custom service|custom work|custom request|custom job|special request)\b/.test(m);
}

function isLocationIntent(message: string): boolean {
    const m = normalizeText(message);
    return /\b(city|area|location|where|available|service in|near|coverage)\b/.test(m);
}

function isHumanSupportIntent(message: string): boolean {
    const m = normalizeText(message);
    return /\b(human|person|agent|support|talk to someone|representative|manual|help me|frustrated|call me)\b/.test(m);
}

function isPolicyIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(cancel|refund|money back|reschedule|policy|timing|fee|chargeback|return)\b/.test(m);
}

/* -------------------------
   Matching Logic
   ------------------------- */
function findBestService(userMessage: string, services: FlatService[]): FlatService | null {
  const msg = normalizeText(userMessage);
  const msgTokens = new Set(tokenize(msg));
  let best: { service: FlatService | null; score: number } = { service: null, score: 0 };

  for (const s of services) {
    const name = normalizeText(s.name);
    let score = 0;
    if (name === msg) score += 200;
    if (name.includes(msg) || msg.includes(name)) score += 100;

    const serviceTokens = tokenize(name);
    let overlap = 0;
    for (const t of serviceTokens) {
      if (msgTokens.has(t)) overlap++;
    }
    const overlapRatio = serviceTokens.length ? overlap / serviceTokens.length : 0;
    score += Math.round(overlapRatio * 60);

    if (score > best.score) best = { service: s, score };
  }
  return best.score >= 45 ? best.service : null;
}

function findCategoryIntent(message: string, categories: FirestoreCategory[]): FirestoreCategory | null {
  const m = normalizeText(message);
  for (const c of categories) {
    const name = normalizeText(c.name || '');
    if (!name) continue;
    if (m.includes(name) || name.includes(m)) return c;
  }
  return null;
}

/* -------------------------
   Firestore Fetchers (Using adminDb)
   ------------------------- */
async function getLocations(): Promise<LocationData> {
    const baseUrl = getBaseUrl().replace(/\/$/, '');
    const citiesSnap = await adminDb.collection('cities').where('isActive', '==', true).get();
    const areasSnap = await adminDb.collection('areas').where('isActive', '==', true).get();

    const cities = citiesSnap.docs.map(d => {
        const data = d.data() as FirestoreCity;
        return { name: data.name, slug: data.slug, url: `${baseUrl}/${data.slug}` };
    });

    const areas = areasSnap.docs.map(d => {
        const data = d.data() as FirestoreArea;
        return { name: data.name, slug: data.slug, cityName: data.cityName, url: `${baseUrl}/${data.cityName}/${data.slug}` };
    });

    return { cities, areas };
}

async function getFullData(): Promise<{
  categories: FirestoreCategory[];
  subCategories: FirestoreSubCategory[];
  flatServiceList: FlatService[];
}> {
  const baseUrl = getBaseUrl().replace(/\/$/, '');

  const [cats, subs, servs] = await Promise.all([
    adminDb.collection('adminCategories').where('isActive', '!=', false).get(),
    adminDb.collection('adminSubCategories').where('isActive', '!=', false).get(),
    adminDb.collection('adminServices').where('isActive', '==', true).get()
  ]);

  const categoriesArr = cats.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreCategory));
  const subCatsArr = subs.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreSubCategory));
  const servicesArr = servs.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreService));

  const flatServiceList: FlatService[] = servicesArr.map((s) => {
    let pCatId = s.parentCategoryId;
    if (!pCatId && s.subCategoryId) {
      const sub = subCatsArr.find(sc => sc.id === s.subCategoryId);
      if (sub) pCatId = sub.parentId;
    }

    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      url: `${baseUrl}/service/${s.slug}`,
      subCategoryId: s.subCategoryId,
      parentCategoryId: pCatId,
    };
  });

  return { categories: categoriesArr, subCategories: subCatsArr, flatServiceList };
}

async function getWebsiteContent(): Promise<string> {
    const pages = ['about-us', 'contact-us', 'careers', 'terms-and-conditions', 'privacy-policy'];
    const contentParts: string[] = [];
    
    for (const slug of pages) {
        const snap = await adminDb.collection('contentPages').where('slug', '==', slug).limit(1).get();
        if (!snap.empty) {
            const data = snap.docs[0].data() as ContentPage;
            contentParts.push(`${data.title}: ${data.content.substring(0, 500)}...`);
        }
    }

    const faqSnap = await adminDb.collection('adminFAQs').where('isActive', '==', true).limit(5).get();
    if (!faqSnap.empty) {
        contentParts.push("\nCommon FAQs:\n" + faqSnap.docs.map(d => {
            const f = d.data() as FirestoreFAQ;
            return `Q: ${f.question}\nA: ${f.answer}`;
        }).join('\n'));
    }

    return contentParts.join('\n\n');
}

async function getUserAndBookings(userId?: string): Promise<{ name: string; email: string; bookings: FirestoreBooking[]; adminId: string | null }> {
  if (!userId) return { name: 'Valued Customer', email: '', bookings: [], adminId: null };
  let name = 'Valued Customer';
  let email = '';
  let adminId: string | null = null;
  const bookings: FirestoreBooking[] = [];

  const userSnap = await adminDb.collection('users').doc(userId).get();
  if (userSnap.exists) {
    const u = userSnap.data() as Partial<FirestoreUser>;
    name = (u.displayName || (u as any).fullName || 'Valued Customer') as string;
    email = u.email || '';
  }

  const bookingSnap = await adminDb.collection('bookings')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  bookingSnap.forEach((bDoc) => {
    bookings.push({ id: bDoc.id, ...bDoc.data() } as FirestoreBooking);
  });
  
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com";
  const adminQuery = await adminDb.collection("users").where("email", "==", adminEmail).limit(1).get();
  if (!adminQuery.empty) {
    adminId = adminQuery.docs[0].id;
  }

  return { name, email, bookings, adminId };
}

async function getAppConfig(): Promise<AppSettings | null> {
    const docSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    return docSnap.exists ? docSnap.data() as AppSettings : null;
}

/* -------------------------
   System Prompt Builder
   ------------------------- */
function buildSystemPrompt(params: {
  name: string;
  bookings: FirestoreBooking[];
  flatServices: FlatService[];
  locations: LocationData;
  websiteContent: string;
  baseUrl: string;
  appConfig: AppSettings | null;
}) {
  const { name, bookings, flatServices, locations, websiteContent, baseUrl, appConfig } = params;

  const servicesText = flatServices.map(s => `${s.name}: ${s.url}`).join('\n');
  const citiesText = locations.cities.map(c => `${c.name}: ${c.url}`).join(', ');
  const areasText = locations.areas.map(a => `${a.name} (${a.cityName}): ${a.url}`).join('\n');

  // Cancellation Policy Logic
  let cancellationDetails = `Please refer to our [Cancellation Policy](${baseUrl}/cancellation-policy) for details.`;
  if (appConfig) {
    const time = `${appConfig.freeCancellationDays || 0}d ${appConfig.freeCancellationHours || 0}h ${appConfig.freeCancellationMinutes || 0}m`;
    const symbol = appConfig.currencySymbol || '₹';
    const fee = appConfig.cancellationFeeType === 'fixed' ? `${symbol}${appConfig.cancellationFeeValue}` : `${appConfig.cancellationFeeValue}%`;
    cancellationDetails = `Free cancellation is available up to ${time} before the service. After this period, a cancellation fee of ${fee} will apply.`;
    if (appConfig.enableFinalCancellationWindow) {
      const finalTime = `${appConfig.finalCancellationHours || 0}h ${appConfig.finalCancellationMinutes || 0}m`;
      cancellationDetails += ` Cancellations made within ${finalTime} before the service start time will incur a 100% cancellation charge (no refund).`;
    }
    cancellationDetails += ` Detailed policy: ${baseUrl}/cancellation-policy`;
  }

  return `
You are the official Yourbrand AI Support Specialist. Your goal is to provide accurate, helpful, and concise information about Yourbrand's services, locations, and policies.

Current User: ${name}

CANCELLATION & REFUND POLICY:
${cancellationDetails}

WEBSITE KNOWLEDGE BASE:
${websiteContent}

OPERATING LOCATIONS:
We operate in the following cities: ${citiesText}
Specific areas covered:
${areasText.slice(0, 1000)}

AVAILABLE SERVICES:
${servicesText.slice(0, 2000)}

USER'S RECENT BOOKINGS:
${bookings.length ? JSON.stringify(bookings, null, 2) : 'No bookings found.'}

GUIDELINES:
1. Always prioritize providing direct booking URLs for services.
2. If asked about locations, confirm availability in the cities/areas listed above. If not listed, apologize and offer human support.
3. For company info (About, Careers, etc.), use the summaries provided.
4. If a service or category is NOT found, apologize and say: "We don't offer that specific service yet, but you can submit a custom request at ${baseUrl}/custom-service and we'll try to help you!"
5. Keep responses professional, friendly, and under 3-4 sentences unless listing services.
6. Use full Markdown for links: [Service Name](${baseUrl}/service/slug).
7. CRITICAL: If a user is frustrated, asks for a human, or you cannot solve their problem, say "I am connecting you to our human support team right now. They will be with you shortly." and nothing else.
8. REFERRALS: If enabled, users can find their referral code in their profile to earn rewards.
`;
}

/* -------------------------
   Main Flow
   ------------------------- */
const chatAgentFlow = ai.defineFlow(
  {
    name: 'chatAgentFlow',
    inputSchema: ChatAgentInputSchema,
    outputSchema: ChatAgentOutputSchema,
  },
  async (input) => {
    const { history, message, userId } = input;
    const baseUrl = getBaseUrl().replace(/\/$/, '');

    // Load rich context
    const [userData, data, locations, websiteContent, appConfig] = await Promise.all([
      getUserAndBookings(userId),
      getFullData(),
      getLocations(),
      getWebsiteContent(),
      getAppConfig(),
    ]);

    const { name, email, bookings, adminId } = userData;
    const { categories, subCategories, flatServiceList } = data;

    // Check if AI Agent should be silent (Admin takeover)
    if (userId && adminId) {
        const sessionId = [userId, adminId].sort().join('_');
        const sessionSnap = await adminDb.collection('chats').doc(sessionId).get();
        if (sessionSnap.exists) {
            const sessionData = sessionSnap.data() as ChatSession;
            if (sessionData.aiAgentActive === false) {
                console.log(`AI Agent is silent for session ${sessionId} due to admin takeover.`);
                return { response: "", isSilent: true };
            }
        }
    }

    // Helper to send support email
    const triggerSupportEmail = async (msg: string) => {
        if (!userId) return;
        await sendHumanSupportRequestEmail({
            userId,
            userName: name,
            userEmail: email,
            lastMessage: msg,
            chatUrl: `${baseUrl}/admin/chat`, 
            smtpHost: appConfig?.smtpHost,
            smtpPort: appConfig?.smtpPort,
            smtpUser: appConfig?.smtpUser,
            smtpPass: appConfig?.smtpPass,
            senderEmail: appConfig?.senderEmail,
            siteName: "Yourbrand Support Alert",
        });
    };

    // 1) Greeting
    if (isGreeting(message)) {
      return { response: `Hi ${name}! I'm your Yourbrand assistant. How can I help you with our services or your bookings today?` };
    }

    // 2) Human Support Explicit Intent
    if (isHumanSupportIntent(message)) {
        await triggerSupportEmail(message);
        return { response: `I understand, ${name}. I am connecting you to our human support team right now. They have been notified and will be with you shortly.` };
    }

    // 3) Policy Questions (Cancellation/Refund)
    if (isPolicyIntent(message)) {
        let cancellationText = `You can view our full policy here: ${baseUrl}/cancellation-policy. `;
        if (appConfig) {
             const time = `${appConfig.freeCancellationDays || 0}d ${appConfig.freeCancellationHours || 0}h ${appConfig.freeCancellationMinutes || 0}m`;
             const symbol = appConfig.currencySymbol || '₹';
             const fee = appConfig.cancellationFeeType === 'fixed' ? `${symbol}${appConfig.cancellationFeeValue}` : `${appConfig.cancellationFeeValue}%`;
            cancellationText = `Our policy allows free cancellation up to ${time} before the service starts. After that, a fee of ${fee} applies. Check details here: ${baseUrl}/cancellation-policy`;
        }
        return { response: cancellationText };
    }

    // 4) Booking Status
    if (/\b(booking|my booking|status|order|where is my|help with my booking)\b/i.test(message)) {
      if (bookings.length > 0) {
        const latest = bookings[0];
        let responseText = `Hi ${name}, I found ${bookings.length} booking(s) in your account. Your most recent booking (${latest.bookingId}) is currently **${latest.status}**. It is scheduled for ${formatScheduledDate(latest.scheduledDate)} during the ${latest.scheduledTimeSlot} slot.`;
        
        if (bookings.length > 1) {
            const others = bookings.slice(1, 3).map(b => `- ${b.bookingId}: ${b.status} (${formatScheduledDate(b.scheduledDate)})`).join('\n');
            responseText += `\n\nYour other recent bookings:\n${others}\n\nYou can view full details in your account here: ${baseUrl}/my-bookings`;
        } else {
            responseText += `\n\nYou can track this booking here: ${baseUrl}/my-bookings`;
        }
        return { response: responseText };
      } else {
        return { response: `I checked your account, ${name}, but I don't have any bookings from your account at the moment. Would you like to explore our services and book something new?` };
      }
    }

    // 5) Location Check
    if (isLocationIntent(message)) {
        const msg = normalizeText(message);
        const matchedCity = locations.cities.find(c => msg.includes(normalizeText(c.name)));
        const matchedArea = locations.areas.find(a => msg.includes(normalizeText(a.name)));

        if (matchedArea) {
            return { response: `Yes ${name}, we provide full coverage in ${matchedArea.name} (${matchedArea.cityName}). You can view area-specific services here: ${matchedArea.url}` };
        }
        if (matchedCity) {
            return { response: `Absolutely! We are fully operational in ${matchedCity.name}. Check out our services in your city: ${matchedCity.url}` };
        }
        if (msg.includes('where') || msg.includes('city') || msg.includes('area')) {
            const cityNames = locations.cities.map(c => c.name).join(', ');
            return { response: `Yourbrand currently operates in ${cityNames}. We cover many areas including ${locations.areas.slice(0, 5).map(a => a.name).join(', ')}, and more!` };
        }
    }

    // 6) Custom Service
    if (isCustomServiceIntent(message)) {
      return { response: `Looking for something unique, ${name}? You can submit a custom request here: ${baseUrl}/custom-service, and our team will get back to you with a quote.` };
    }

    // 7) Service Matching (Deterministic) - IMPROVED CATEGORY-FIRST
    const matchedCatIntent = findCategoryIntent(message, categories);
    const hasServiceIntent = isServiceIntent(message);

    if ((hasServiceIntent || matchedCatIntent) && !isTooShortForServiceMatch(message)) {
      // 1. Identify Target Category
      let targetCat: FirestoreCategory | null = matchedCatIntent;
      
      // If no direct category match, check if any service matches well and use its parent category
      if (!targetCat) {
          const globalServiceMatch = findBestService(message, flatServiceList);
          if (globalServiceMatch && globalServiceMatch.parentCategoryId) {
              targetCat = categories.find(c => c.id === globalServiceMatch.parentCategoryId) || null;
          }
      }

      // 2. Handle Found Category
      if (targetCat) {
          // Search for best service match ONLY within this category
          const servicesInCat = flatServiceList.filter(s => s.parentCategoryId === targetCat?.id);
          const bestServiceInCat = findBestService(message, servicesInCat);

          if (bestServiceInCat) {
              return { response: `I found the perfect match for you in our ${targetCat.name} category! You can book our [${bestServiceInCat.name}](${bestServiceInCat.url}) service directly.` };
          }

          // If no specific service match but we have a category, list services in that category (ignoring sub-categories as requested)
          const topServices = servicesInCat.slice(0, 6);
          if (topServices.length > 0) {
              const list = topServices.map(s => `- [${s.name}](${s.url})`).join('\n');
              return { response: `We have several ${targetCat.name} services available! Here are some popular options:\n${list}\n\nDo any of these match what you're looking for?` };
          } else {
              return { response: `We offer ${targetCat.name} services, but I couldn't find a specific match for your request right now. You can browse the category here: ${baseUrl}/category/${targetCat.slug} or submit a custom request at ${baseUrl}/custom-service.` };
          }
      }

      // 3. Category NOT Found for a Service Intent
      if (hasServiceIntent) {
          return { response: `We don't have that category related services yet, but you can submit a custom request at ${baseUrl}/custom-service and we'll try to help you! Alternatively, please contact our support for more assistance.` };
      }
    }

    // 8) LLM Fallback (Genkit/Gemini)
    const systemPrompt = buildSystemPrompt({
      name,
      bookings,
      flatServices: flatServiceList,
      locations,
      websiteContent,
      baseUrl,
      appConfig
    });

    const response = await ai.generate({
      model: 'googleai/gemini-3.6-flash',
      system: systemPrompt,
      prompt: message,
      config: { temperature: 0.4 },
    });

    // Check if Gemini triggered the human support phrase
    if (response.text.includes("human support team")) {
        await triggerSupportEmail(message);
    }

    return { response: response.text };
  }
);

export { chatAgentFlow };

