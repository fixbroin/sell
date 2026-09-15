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
  categoryName?: string;
  price?: number;
  discountedPrice?: number | null;
  description?: string;
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
    'hi', 'hello', 'hey', 'hlo', 'helo', 'hai', 'hii', 'hiii',
    'good morning', 'good afternoon', 'good evening', 'namaste', 'greeting', 'greetings'
  ];
  return greetings.some(g => m === g || m.startsWith(g + ' ') || m.endsWith(' ' + g));
}

function getTimeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function isRescheduleIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(reschedule|re-schedule|change date|change time|change slot|different date|different time|postpone|prepone|shift booking|shift date|shift time|modify date|modify time)\b/i.test(m);
}

function isCancellationIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(cancel|cancellation|cancelling|refund|stop booking|drop booking|dont need|don't need|money back|cancel order)\b/i.test(m);
}

function isBookingInquiryIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(booking|my booking|order|status|track|where is my|technician|provider|when will|scheduled|bk-|\b\d{4,}\b)\b/i.test(m);
}

function isCustomServiceIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(custom service|custom work|custom request|custom job|special request|unlisted service|new service)\b/i.test(m);
}

function isServiceIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(fix|repair|install|service|problem|issue|need|want|book|hire|clean|cleaning|pest|electrician|plumber|carpenter|painter|ac|appliance|purifier|refrigerator|fridge|washing machine|geyser|fan|switch|leak|pipe|sofa|bathroom|kitchen|motor|wire|wiring|lock|door)\b/i.test(m);
}

function isLocationIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(city|area|location|where|available|service in|near|coverage|pincode|address|operational)\b/i.test(m);
}

function isHumanSupportIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(human|person|agent|support|talk to someone|representative|manual|help me|frustrated|call me|contact person|customer care|executive|speak to)\b/i.test(m);
}

function isLegitimacyOrTrustIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(fake|fraud|scam|cheat|cheater|trust|genuine|real|authentic|spam|legit|safe|secure|police|registered|legal|licensed|complaint|consumer court|scammer|bogus)\b/i.test(m);
}

function isPaymentIssueIntent(message: string): boolean {
  const m = normalizeText(message);
  return /\b(amount deducted|money deducted|money cut|debited|paid but|payment done but|charged but|no booking|booking not showing|booking not opened|booking missing|not confirmed|failed booking|money lost|payment lost)\b/i.test(m);
}

/* -------------------------
   Intelligent Service Matcher
   ------------------------- */
function searchServices(
  userMessage: string,
  services: FlatService[],
  categories: FirestoreCategory[]
): {
  exactMatch: FlatService | null;
  topMatches: FlatService[];
  matchedCategory: FirestoreCategory | null;
} {
  const cleanMsg = normalizeText(userMessage);
  const stopWords = new Set([
    'i', 'need', 'want', 'please', 'help', 'with', 'my', 'to', 'book', 'do', 'you',
    'have', 'services', 'service', 'the', 'a', 'an', 'for', 'in', 'near', 'me', 'at',
    'is', 'are', 'can', 'we', 'get', 'give', 'looking', 'some', 'any', 'work'
  ]);
  const allTokens = tokenize(cleanMsg);
  const userTokens = allTokens.filter(t => !stopWords.has(t) && t.length > 1);
  const searchTokens = userTokens.length > 0 ? userTokens : allTokens;

  // 1. Direct Category Match Check
  let matchedCategory: FirestoreCategory | null = null;
  for (const c of categories) {
    const cName = normalizeText(c.name || '');
    if (!cName) continue;
    if (cleanMsg === cName || cleanMsg.includes(cName) || cName.includes(cleanMsg)) {
      matchedCategory = c;
      break;
    }
  }

  // 2. Score each service in catalog
  const scored: { service: FlatService; score: number }[] = [];

  for (const s of services) {
    const sName = normalizeText(s.name);
    const sSlug = normalizeText(s.slug);
    const sDesc = normalizeText(s.description || '');
    const sCat = normalizeText(s.categoryName || '');
    let score = 0;

    // Direct exact match on full name or slug
    if (sName === cleanMsg || sSlug === cleanMsg) {
      score += 400;
    } else if (cleanMsg.includes(sName)) {
      score += 260;
    } else if (sName.includes(cleanMsg)) {
      score += 220;
    }

    // Token analysis
    const sNameTokens = new Set(tokenize(sName));
    let matchedTokenCount = 0;

    for (const token of searchTokens) {
      if (sNameTokens.has(token)) {
        score += 70;
        matchedTokenCount++;
      } else if (sName.includes(token)) {
        score += 45;
        matchedTokenCount++;
      } else if (sDesc.includes(token)) {
        score += 20;
      } else if (sCat.includes(token)) {
        score += 25;
      }
    }

    // High token match ratio bonus
    if (searchTokens.length > 0 && matchedTokenCount === searchTokens.length) {
      score += 100;
    }

    // Boost if in the matched category
    if (matchedCategory && s.parentCategoryId === matchedCategory.id) {
      score += 50;
    }

    if (score >= 40) {
      scored.push({ service: s, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);

  const exactMatch = (scored.length > 0 && scored[0].score >= 180) ? scored[0].service : null;
  const topMatches = scored.slice(0, 3).map(item => item.service);

  return { exactMatch, topMatches, matchedCategory };
}

/* -------------------------
   Data Fetchers (Using adminDb)
   ------------------------- */
async function getLocations(): Promise<LocationData> {
  const baseUrl = getBaseUrl().replace(/\/$/, '');
  const [citiesSnap, areasSnap] = await Promise.all([
    adminDb.collection('cities').where('isActive', '==', true).get(),
    adminDb.collection('areas').where('isActive', '==', true).get(),
  ]);

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
    const cat = categoriesArr.find(c => c.id === pCatId);

    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      url: `${baseUrl}/service/${s.slug}`,
      subCategoryId: s.subCategoryId,
      parentCategoryId: pCatId,
      categoryName: cat?.name || '',
      price: s.price,
      discountedPrice: s.discountedPrice,
      description: s.description || s.shortDescription || '',
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
      contentParts.push(`${data.title}: ${data.content.substring(0, 400)}...`);
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

async function getUserAndBookings(userId?: string): Promise<{
  name: string;
  email: string;
  phone: string;
  bookings: FirestoreBooking[];
  adminId: string | null;
}> {
  if (!userId) return { name: 'Valued Customer', email: '', phone: '', bookings: [], adminId: null };
  let name = 'Valued Customer';
  let email = '';
  let phone = '';
  let adminId: string | null = null;
  const bookings: FirestoreBooking[] = [];

  const userSnap = await adminDb.collection('users').doc(userId).get();
  if (userSnap.exists) {
    const u = userSnap.data() as Partial<FirestoreUser>;
    name = (u.displayName || (u as any).fullName || 'Valued Customer') as string;
    email = u.email || '';
    phone = (u as any).phoneNumber || (u as any).phone || '';
  }

  const bookingSnap = await adminDb.collection('bookings')
    .where('userId', '==', userId)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();

  bookingSnap.forEach((bDoc) => {
    bookings.push({ id: bDoc.id, ...bDoc.data() } as FirestoreBooking);
  });
  
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com";
  const adminQuery = await adminDb.collection("users").where("email", "==", adminEmail).limit(1).get();
  if (!adminQuery.empty) {
    adminId = adminQuery.docs[0].id;
  }

  return { name, email, phone, bookings, adminId };
}

async function getAppConfig(): Promise<AppSettings | null> {
  const docSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
  return docSnap.exists ? (docSnap.data() as AppSettings) : null;
}

async function getGlobalSettings(): Promise<{ websiteName?: string }> {
  try {
    const docSnap = await adminDb.collection('webSettings').doc('global').get();
    if (docSnap.exists) return docSnap.data() as any;
  } catch (e) {}
  return { websiteName: "Yourbrand" };
}

/* -------------------------
   System Prompt Builder for Gemini Fallback
   ------------------------- */
function buildSystemPrompt(params: {
  name: string;
  websiteName: string;
  bookings: FirestoreBooking[];
  categories: FirestoreCategory[];
  flatServices: FlatService[];
  locations: LocationData;
  websiteContent: string;
  baseUrl: string;
  appConfig: AppSettings | null;
}) {
  const { name, websiteName, bookings, categories, flatServices, locations, websiteContent, baseUrl, appConfig } = params;

  const catalogSummary = categories.map(c => {
    const catServices = flatServices.filter(s => s.parentCategoryId === c.id);
    const serviceList = catServices.map(s => `• ${s.name} (${baseUrl}/service/${s.slug})`).join('\n');
    return `### Category: ${c.name}\n${serviceList || '• Inquire directly'}`;
  }).join('\n\n');

  const citiesText = locations.cities.map(c => `${c.name}: ${c.url}`).join(', ');

  let cancellationDetails = `Please refer to our [Cancellation Policy](${baseUrl}/cancellation-policy).`;
  if (appConfig) {
    const time = `${appConfig.freeCancellationDays || 0}d ${appConfig.freeCancellationHours || 0}h ${appConfig.freeCancellationMinutes || 0}m`;
    const symbol = appConfig.currencySymbol || '₹';
    const fee = appConfig.cancellationFeeType === 'fixed' ? `${symbol}${appConfig.cancellationFeeValue}` : `${appConfig.cancellationFeeValue}%`;
    cancellationDetails = `Free cancellation is available up to ${time} before the service. After that, a cancellation fee of ${fee} applies.`;
    if (appConfig.enableFinalCancellationWindow) {
      const finalTime = `${appConfig.finalCancellationHours || 0}h ${appConfig.finalCancellationMinutes || 0}m`;
      cancellationDetails += ` Cancellations within ${finalTime} before the service incur a 100% cancellation charge.`;
    }
  }

  return `
You are the official ${websiteName} AI Support Specialist. Your goal is to provide accurate, helpful, friendly, and concise answers to customers.

CURRENT USER: ${name}

COMPANY POLICIES:
1. RESCHEDULING: We do NOT support direct rescheduling for existing bookings. If a customer wants to change date/time, explain politely that they can cancel their current booking (per cancellation policy) and place a new booking for their preferred slot.
2. CANCELLATION: ${cancellationDetails}
   Direct link to cancel: [My Bookings](${baseUrl}/my-bookings). Full policy: [Cancellation Policy](${baseUrl}/cancellation-policy).
3. CUSTOM SERVICE: If a user asks for a service that is NOT present in our service catalog below, apologize and say:
   "We don't currently offer that specific service in our catalog, but you can submit a custom request here: [Custom Service](${baseUrl}/custom-service) and our team will get back to you with a quote!"
4. DIRECT LINKS: Always format links cleanly in markdown: [Link Title](${baseUrl}/service/slug) or [My Bookings](${baseUrl}/my-bookings).
5. HUMAN ESCALATION: If the customer asks for a human, calls, complaints, or if you cannot resolve their issue, say:
   "I am connecting you to our human support team right now. Our support staff has been notified via email and alert, and an agent will be with you shortly."
6. TRUST & LEGITIMACY: If the customer asks if the company is fake, a scam, fraud, or spam, firmly and professionally reassure them that ${websiteName} is a 100% verified, legally registered company with background-verified technicians, secure encrypted payments, and post-service warranty.
7. PAYMENT DEDUCTED BUT BOOKING MISSING: If the customer says money was deducted from their bank/UPI but no booking is showing, reassure them immediately that their money is 100% safe. Explain that it is a temporary network sync between the bank and gateway, that a ticket has been raised with our team, and that if no booking was generated the amount will automatically refund within 3 to 5 business days.

WEBSITE KNOWLEDGE BASE:
${websiteContent}

CITIES COVERED:
${citiesText}

SERVICE CATALOG:
${catalogSummary}

USER BOOKINGS:
${bookings.length ? JSON.stringify(bookings.slice(0, 3), null, 2) : 'No bookings in account.'}
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

    // Load full system context in parallel
    const [userData, data, locations, websiteContent, appConfig, globalSettings] = await Promise.all([
      getUserAndBookings(userId),
      getFullData(),
      getLocations(),
      getWebsiteContent(),
      getAppConfig(),
      getGlobalSettings(),
    ]);

    const { name, email, bookings, adminId } = userData;
    const { categories, flatServiceList } = data;
    const websiteName = globalSettings.websiteName || "Yourbrand";
    const currencySymbol = appConfig?.currencySymbol || '₹';

    // 0) Check if AI Agent should be silent (Admin Takeover)
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

    // Support Email Helper
    const triggerSupportEmail = async (msg: string) => {
      if (!userId) return;
      try {
        await sendHumanSupportRequestEmail({
          userId,
          userName: name,
          userEmail: email || 'admin@yourdomain.com',
          lastMessage: msg,
          chatUrl: `${baseUrl}/admin/chat`,
          smtpHost: appConfig?.smtpHost,
          smtpPort: appConfig?.smtpPort,
          smtpUser: appConfig?.smtpUser,
          smtpPass: appConfig?.smtpPass,
          senderEmail: appConfig?.senderEmail,
          siteName: `${websiteName} Support Alert`,
        });
      } catch (err) {
        console.error("Failed to send human support request email:", err);
      }
    };

    // 1) Greeting (with conversation memory check)
    if (isGreeting(message)) {
      if (history && history.length > 0) {
        return {
          response: `Hello again, ${name}! How can I continue assisting you? Feel free to ask about any service details, pricing, or your bookings.`
        };
      }
      const timeGreeting = getTimeOfDayGreeting();
      return {
        response: `${timeGreeting}, ${name}! Welcome to ${websiteName}. How can I assist you with our home services or your bookings today?`
      };
    }

    // 2) Payment Deducted but Booking Missing / Technical Network Delay
    if (isPaymentIssueIntent(message)) {
      await triggerSupportEmail(`[PAYMENT DISCREPANCY ALERT] ${message}`);
      return {
        response: `I completely understand your concern, ${name}, and please rest assured: **your money is 100% safe.**\n\n` +
          `Occasionally, due to a temporary network delay between your bank/UPI app and our payment gateway, the amount gets deducted while the booking confirmation takes a few moments to sync.\n\n` +
          `Here is what you need to know:\n` +
          `1. 🔄 **Automatic Refund Guarantee:** If a booking was not created due to a technical/network issue, our payment gateway and banking system will **automatically refund the full deducted amount back to your original bank account/UPI within 3 to 5 business days**.\n` +
          `2. 🚨 **High-Priority Ticket Raised:** I have **already alerted our finance and operations team via high-priority notification** with your account details. Our staff is reviewing the transaction logs and will contact you shortly to verify and resolve this.\n` +
          `3. 📱 **Check Your Account:** You can also refresh your [My Bookings](${baseUrl}/my-bookings) page in a few minutes, as bookings confirmed via server webhook often appear automatically.\n\n` +
          `We are on it and will ensure this is resolved for you immediately!`
      };
    }

    // 3) Company Legitimacy, Trust, Scam/Spam Concerns
    if (isLegitimacyOrTrustIntent(message)) {
      return {
        response: `Rest assured, ${name} — **${websiteName} is a 100% legally registered, verified, and trusted home services platform.**\n\n` +
          `Here is why thousands of homeowners trust us:\n` +
          `🛡️ **Background-Verified Technicians:** Every professional undergoes strict identity, document, and police-level background verification before entering any customer's home.\n` +
          `🔒 **100% Safe Payments:** We use RBI-approved, bank-grade encrypted gateways (Razorpay & Stripe). We never store your card or bank credentials, and official tax invoices are issued for every service.\n` +
          `✨ **Service Warranty:** All services come with our standard post-service warranty so you are always covered.\n` +
          `🚫 **Zero Tolerance for Fraud & Spam:** We adhere to strict data privacy policies. We never sell your personal information or spam you.\n` +
          `🏢 **Dedicated Human Operations:** Our operations team and active customer support are always reachable directly via chat or email.\n\n` +
          `Your safety, security, and satisfaction are always our highest priority!`
      };
    }

    // 4) Human Support Explicit Intent
    if (isHumanSupportIntent(message)) {
      await triggerSupportEmail(message);
      return {
        response: `I understand, ${name}. I am connecting you to our human support team right now. Our support staff has been alerted via email and notification, and an agent will join this chat shortly.`
      };
    }

    // 3) Rescheduling Inquiry ("Reschedule is not there")
    if (isRescheduleIntent(message)) {
      return {
        response: `Hi ${name}, we currently **do not support direct rescheduling** of existing bookings.\n\n` +
          `However, you can easily cancel your current booking (subject to our cancellation policy) and place a new booking for your desired date and time slot.\n\n` +
          `👉 You can manage your bookings here: [My Bookings](${baseUrl}/my-bookings)\n` +
          `📄 Review our policy here: [Cancellation Policy](${baseUrl}/cancellation-policy)`
      };
    }

    // 4) Cancellation & Refund Inquiry
    if (isCancellationIntent(message)) {
      let cancellationPolicyText = "";
      if (appConfig) {
        const time = `${appConfig.freeCancellationDays || 0}d ${appConfig.freeCancellationHours || 0}h ${appConfig.freeCancellationMinutes || 0}m`;
        const fee = appConfig.cancellationFeeType === 'fixed'
          ? `${currencySymbol}${appConfig.cancellationFeeValue}`
          : `${appConfig.cancellationFeeValue}%`;

        cancellationPolicyText = `\n\n**Cancellation Policy:**\n` +
          `• **Free Cancellation:** Up to ${time} before your scheduled service time.\n` +
          `• **Cancellation Fee:** If cancelled after this free window, a cancellation charge of ${fee} will apply.\n`;

        if (appConfig.enableFinalCancellationWindow) {
          const finalTime = `${appConfig.finalCancellationHours || 0}h ${appConfig.finalCancellationMinutes || 0}m`;
          cancellationPolicyText += `• **Last-Minute Window:** Cancellations within ${finalTime} before the service incur a 100% cancellation charge.\n`;
        }
      }

      return {
        response: `Hi ${name}, you can cancel your booking directly from your account.${cancellationPolicyText}\n` +
          `👉 Click here to cancel: [Cancel in My Bookings](${baseUrl}/my-bookings)\n` +
          `📄 For full details, read our [Cancellation Policy](${baseUrl}/cancellation-policy).`
      };
    }

    // 5) Booking Status & Tracking Inquiry
    if (isBookingInquiryIntent(message)) {
      if (bookings.length > 0) {
        const cleanMsg = message.toLowerCase();
        let targetBooking: FirestoreBooking = bookings[0]; // Default to most recent

        // Check if user specifically requested a booking ID or number
        for (const b of bookings) {
          const bId = (b.bookingId || '').toLowerCase();
          const bNum = (b.bookingNumber || '').toString();
          if (bId && cleanMsg.includes(bId)) {
            targetBooking = b;
            break;
          }
          if (bNum && cleanMsg.includes(bNum)) {
            targetBooking = b;
            break;
          }
        }

        const serviceList = (targetBooking.services || [])
          .map(s => `${s.name} (x${s.quantity || 1})`)
          .join(', ');

        let providerInfo = "We are assigning a verified technician near your area shortly.";
        if (targetBooking.providerId) {
          providerInfo = "A verified professional has been assigned to your service.";
        }

        let responseText = `Hi ${name}! Here are the details for your booking **${targetBooking.bookingId}**:\n\n` +
          `📌 **Status:** **${targetBooking.status}**\n` +
          `📅 **Scheduled Date:** ${formatScheduledDate(targetBooking.scheduledDate)}\n` +
          `⏰ **Time Slot:** ${targetBooking.scheduledTimeSlot}\n` +
          `🛠️ **Services:** ${serviceList || 'Standard Service'}\n` +
          `💰 **Total Amount:** ${currencySymbol}${targetBooking.totalAmount || 0} (${targetBooking.paymentMethod || 'Online'})\n` +
          `👷 **Technician:** ${providerInfo}\n\n` +
          `👉 Track complete status and invoices here: [View My Bookings](${baseUrl}/my-bookings)`;

        if (bookings.length > 1) {
          const others = bookings
            .filter(b => b.bookingId !== targetBooking.bookingId)
            .slice(0, 2)
            .map(b => `• **${b.bookingId}**: ${b.status} (${formatScheduledDate(b.scheduledDate)})`)
            .join('\n');
          if (others) {
            responseText += `\n\n**Other Recent Bookings:**\n${others}`;
          }
        }

        return { response: responseText };
      } else {
        return {
          response: `Hi ${name}, I checked your account, but I don't see any active or past bookings right now. Would you like to explore our popular services and book something new?`
        };
      }
    }

    // 6) Explicit Custom Service Intent
    if (isCustomServiceIntent(message)) {
      return {
        response: `Looking for a custom or specialized service, ${name}? You can submit your requirements here: [Submit Custom Service Request](${baseUrl}/custom-service). Our team will review it and get back to you with a custom quote!`
      };
    }

    // 7) Location / Coverage Check
    if (isLocationIntent(message)) {
      const msg = normalizeText(message);
      const matchedCity = locations.cities.find(c => msg.includes(normalizeText(c.name)));
      const matchedArea = locations.areas.find(a => msg.includes(normalizeText(a.name)));

      if (matchedArea) {
        return {
          response: `Yes ${name}, we provide full coverage in **${matchedArea.name}** (${matchedArea.cityName}). You can view area-specific services here: [Services in ${matchedArea.name}](${matchedArea.url})`
        };
      }
      if (matchedCity) {
        return {
          response: `Absolutely! We are fully operational across **${matchedCity.name}**. Explore our services here: [Services in ${matchedCity.name}](${matchedCity.url})`
        };
      }
      if (msg.includes('where') || msg.includes('city') || msg.includes('area') || msg.includes('location')) {
        const cityNames = locations.cities.map(c => `[${c.name}](${c.url})`).join(', ');
        return {
          response: `${websiteName} currently operates in: ${cityNames || 'major cities'}. Contact our support if you'd like to check a specific neighborhood!`
        };
      }
    }

    // 8) Intelligent Service Matching (Exact + Almost-Match)
    const { exactMatch, topMatches, matchedCategory } = searchServices(message, flatServiceList, categories);

    if (exactMatch) {
      const priceText = exactMatch.discountedPrice
        ? `**${currencySymbol}${exactMatch.discountedPrice}** (Original: ~~${currencySymbol}${exactMatch.price}~~)`
        : `**${currencySymbol}${exactMatch.price || 0}**`;

      return {
        response: `I found the exact service you're looking for, ${name}!\n\n` +
          `👉 **[${exactMatch.name}](${exactMatch.url})**\n` +
          `💵 Price: ${priceText}\n` +
          `${exactMatch.description ? `ℹ️ ${exactMatch.description.slice(0, 120)}...\n` : ''}\n` +
          `Click the link above to view details and book directly!`
      };
    }

    if (topMatches.length > 0) {
      const list = topMatches.map(s => {
        const p = s.discountedPrice ? `${currencySymbol}${s.discountedPrice}` : `${currencySymbol}${s.price || 0}`;
        return `• **[${s.name}](${s.url})** — ${p}`;
      }).join('\n');

      return {
        response: `Here are the best matching services for your request:\n\n${list}\n\n` +
          `Would you like to book one of these, or can I help you find something else?`
      };
    }

    if (matchedCategory) {
      const servicesInCat = flatServiceList.filter(s => s.parentCategoryId === matchedCategory.id).slice(0, 5);
      if (servicesInCat.length > 0) {
        const list = servicesInCat.map(s => {
          const p = s.discountedPrice ? `${currencySymbol}${s.discountedPrice}` : `${currencySymbol}${s.price || 0}`;
          return `• **[${s.name}](${s.url})** — ${p}`;
        }).join('\n');

        return {
          response: `We have several **${matchedCategory.name}** services available:\n\n${list}\n\n` +
            `You can browse all options or let me know what specific issue you need resolved!`
        };
      }
    }

    // 9) True Unsupported Service (Service Intent but truly not in catalog)
    if (isServiceIntent(message)) {
      return {
        response: `We don't currently offer that specific service in our standard catalog yet, ${name}.\n\n` +
          `However, you can submit a custom request here: 👉 **[Submit Custom Service](${baseUrl}/custom-service)**\n` +
          `Our operations team will review your requirements and get back to you with a custom quote!`
      };
    }

    // 10) Gemini 2.5 Flash LLM Fallback (With Rich Context & Policy Guardrails)
    const systemPrompt = buildSystemPrompt({
      name,
      websiteName,
      bookings,
      categories,
      flatServices: flatServiceList,
      locations,
      websiteContent,
      baseUrl,
      appConfig,
    });

    const conversationMessages = [
      ...history,
      { role: 'user' as const, content: [{ text: message }] }
    ];

    const response = await ai.generate({
      model: 'googleai/gemini-3.6-flash',
      system: systemPrompt,
      messages: conversationMessages,
      config: { temperature: 0.3 },
    });

    let responseText = response.text || "";

    // Always alert support staff via email for general/other customer questions
    await triggerSupportEmail(`[USER INQUIRY ALERT] ${message}`);
    responseText += `\n\n💬 *Our support staff has also been notified of your query. An executive will follow up with you if any further details or help is needed!*`;

    return { response: responseText };
  }
);

export { chatAgentFlow };

