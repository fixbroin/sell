
import { type NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp, type DocumentReference } from '@/lib/mysqlDbAdmin';
import { initFirebaseAdmin } from '@/lib/firebase-admin';
import { sendMarketingEmail } from '@/ai/flows/sendMarketingEmailFlow';
import type { MarketingAutomationSettings, AppSettings, GlobalWebSettings, FirestoreUser, FirestoreService, UserCart, FirestoreCategory, FirestoreSubCategory } from '@/types/firestore';
import { getBaseUrl } from '@/lib/config';
import { getMarketingAutomationSettings, getGlobalAppSettings, getGlobalWebSettings } from '@/lib/webServerUtils';
import { formatDateInTimezone } from '@/lib/utils';

/**
 * Server-side helper to safely get milliseconds from various timestamp formats.
 * Important for Server Components/API Routes handling both Admin SDK and serialized data.
 */
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

// Helper to convert delay settings to milliseconds
const toMs = (delay?: MarketingAutomationSettings['noBookingReminderDelay']): number => {
    if (!delay) return 0;
    const { days = 0, hours = 0, minutes = 0 } = delay;
    return (days * 86400000) + (hours * 3600000) + (minutes * 60000);
};

// Helper function to replace all merge tags
const replaceMergeTags = (
    template: string,
    user: FirestoreUser,
    appConfig: AppSettings,
    globalSettings: GlobalWebSettings,
    dynamicContent: {
        popularServicesHtml: string;
        cartContentHtml: string;
        popularCategoriesHtml: string;
        allServicesHtml: string;
        allCategoriesHtml: string;
        categoryServicesHtml: string;
    }
): string => {
    const cartLink = `${getBaseUrl()}/cart`;
    let body = template;
    body = body.replace(/\{\{name\}\}/g, user.displayName || 'Valued Customer');
    body = body.replace(/\{\{email\}\}/g, user.email || '');
    body = body.replace(/\{\{mobile\}\}/g, user.mobileNumber || '');
    body = body.replace(/\{\{signupDate\}\}/g, (() => {
        const millis = getTimestampMillis(user.createdAt);
        return millis ? formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat) : '';
    })());
    
    // Correctly sourced settings
    body = body.replace(/\{\{websiteName\}\}/g, globalSettings.websiteName || 'Yourbrand');
    body = body.replace(/\{\{websiteUrl\}\}/g, getBaseUrl());
    body = body.replace(/\{\{supportEmail\}\}/g, globalSettings.contactEmail || 'support@yourdomain.com');
    body = body.replace(/\{\{companyAddress\}\}/g, globalSettings.address || 'Company Address');
    
    // Dynamic content
    body = body.replace(/\{\{popular_services\}\}/g, dynamicContent.popularServicesHtml);
    body = body.replace(/\{\{popular_categories\}\}/g, dynamicContent.popularCategoriesHtml);
    body = body.replace(/\{\{all_services\}\}/g, dynamicContent.allServicesHtml);
    body = body.replace(/\{\{all_categories\}\}/g, dynamicContent.allCategoriesHtml);
    body = body.replace(/\{\{cart_items\}\}/g, dynamicContent.cartContentHtml);
    const firstCartItemName = dynamicContent.cartContentHtml.match(/<li>(.*?)<\/li>/)?.[1]?.replace(/ \(x\d+\)/, '') || 'Your items';
    body = body.replace(/\{\{cart_item_name\}\}/g, firstCartItemName);
    body = body.replace(/\{\{cart_link\}\}/g, cartLink);
    body = body.replace(/\{\{category_services\}\}/g, dynamicContent.categoryServicesHtml);

    return body;
};

export async function GET(req: NextRequest) {
    const secret = new URL(req.url).searchParams.get('secret');
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();
        const now = Date.now();
        console.log("Marketing cron job started at:", new Date(now).toISOString());

        // --- 1. Fetch configurations first (uses server-side cache) ---
        const [marketingConfig, appConfig, globalSettings] = await Promise.all([
             getMarketingAutomationSettings(),
             getGlobalAppSettings(),
             getGlobalWebSettings(),
        ]);
        
        if (!marketingConfig || !appConfig || !globalSettings) {
            console.log("Settings documents not found. Aborting cron job.");
            return NextResponse.json({ status: 'Settings not found' }, { status: 500 });
        }

        // Early Exit: If no marketing features are enabled, stop now.
        const anyEnabled = marketingConfig.noBookingReminderEnabled || 
                           marketingConfig.abandonedCartEnabled || 
                           marketingConfig.recurringEngagementEnabled;
        
        if (!anyEnabled) {
            console.log("No marketing features enabled. Exiting.");
            return NextResponse.json({ status: 'ok', sent: 0, message: 'No features enabled' });
        }

        const baseUrl = getBaseUrl();
        
        // Lazy Load Content Variables
        let contentLoaded = false;
        let allServicesMap = new Map<string, FirestoreService>();
        let allSubCategoriesMap = new Map<string, FirestoreSubCategory>();
        let popularServicesHtml = "";
        let popularCategoriesHtml = "";
        let allServicesHtml = "";
        let allCategoriesHtml = "";
        let categoryServicesCache = new Map<string, string>();

        const loadContent = async () => {
            if (contentLoaded) return;
            console.log("Lazy loading marketing content data...");
            const [allServicesSnap, allCategoriesSnap, allSubCategoriesSnap] = await Promise.all([
                db.collection("adminServices").where("isActive", "==", true).orderBy("name", "asc").get(),
                db.collection("adminCategories").orderBy("order", "asc").get(),
                db.collection("adminSubCategories").get(),
            ]);

            allServicesMap = new Map(allServicesSnap.docs.map(doc => [doc.id, doc.data() as FirestoreService]));
            allSubCategoriesMap = new Map(allSubCategoriesSnap.docs.map(doc => [doc.id, doc.data() as FirestoreSubCategory]));

            // Popular Content
            const popularServicesQuery = db.collection('adminServices').where('isActive', '==', true).orderBy('rating', 'desc').orderBy('reviewCount', 'desc').limit(5);
            const popularServicesSnapshot = await popularServicesQuery.get();
            const popularServices = popularServicesSnapshot.docs.map(doc => doc.data() as FirestoreService);
            popularServicesHtml = `<ul>${popularServices.map(s => `<li><a href="${baseUrl}/service/${s.slug}">${s.name}</a></li>`).join('')}</ul>`;
            
            const popularCategoriesSnapshot = await db.collection("adminCategories").orderBy('order', 'asc').limit(5).get();
            const popularCategories = popularCategoriesSnapshot.docs.map(doc => doc.data() as FirestoreCategory);
            popularCategoriesHtml = `<ul>${popularCategories.map(c => `<li><a href="${baseUrl}/category/${c.slug}">${c.name}</a></li>`).join('')}</ul>`;

            // All Content
            allServicesHtml = `<ul>${allServicesSnap.docs.map(doc => `<li><a href="${baseUrl}/service/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
            allCategoriesHtml = `<ul>${allCategoriesSnap.docs.map(doc => `<li><a href="${baseUrl}/category/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
            
            contentLoaded = true;
        };

        const getCategoryServicesHtml = async (configCategoryId?: string, cart?: UserCart | null): Promise<string> => {
            let categoryIdToFetch: string | undefined = configCategoryId && configCategoryId !== "none" ? configCategoryId : undefined;

            // Fallback to cart if config doesn't specify a category
            if (!categoryIdToFetch && cart && cart.items.length > 0) {
                const firstServiceInCart = allServicesMap.get(cart.items[0].serviceId);
                if (firstServiceInCart) {
                    const subCat = allSubCategoriesMap.get(firstServiceInCart.subCategoryId);
                    if (subCat) {
                        categoryIdToFetch = subCat.parentId;
                    }
                }
            }

            if (!categoryIdToFetch) return '';
            
            // Check Cache
            if (categoryServicesCache.has(categoryIdToFetch)) return categoryServicesCache.get(categoryIdToFetch)!;

            const subCatsSnap = await db.collection("adminSubCategories").where("parentId", "==", categoryIdToFetch).get();
            const subCatIds = subCatsSnap.docs.map(doc => doc.id);
            let html = '';
            if (subCatIds.length > 0) {
                const categoryServicesSnap = await db.collection("adminServices").where("subCategoryId", "in", subCatIds).where("isActive", "==", true).orderBy("name", "asc").get();
                if (!categoryServicesSnap.empty) {
                    html = `<ul>${categoryServicesSnap.docs.map(doc => `<li><a href="${baseUrl}/service/${doc.data().slug}">${doc.data().name}</a></li>`).join('')}</ul>`;
                }
            }
            categoryServicesCache.set(categoryIdToFetch, html);
            return html;
        };

        let emailsSent = 0;
        const processedUserIds = new Set<string>();

        // We'll found a winner! Load content if not already done.
        // This is a helper to ensure we only load heavy content if there's someone to send to.
        const ensureContentLoaded = async () => {
            if (!contentLoaded) await loadContent();
        };

        // --- 2. Feature A: No Booking Reminder (Targeted Query) ---
        if (marketingConfig.noBookingReminderEnabled && marketingConfig.noBookingReminderDelay) {
            const delayMs = toMs(marketingConfig.noBookingReminderDelay);
            if (delayMs > 0) {
                const cutoff = Timestamp.fromMillis(now - delayMs);
                const snapshot = await db.collection('users')
                    .where('isActive', '==', true)
                    .where('hasBooking', '==', false)
                    .where('marketingStatus.bookingReminderSent', '==', false)
                    .where('createdAt', '<=', cutoff)
                    .orderBy('createdAt', 'asc')
                    .limit(50)
                    .get();

                for (const userDoc of snapshot.docs) {
                    if (processedUserIds.has(userDoc.id)) continue;
                    const user = { ...userDoc.data(), id: userDoc.id } as FirestoreUser;
                    if (!user.email) continue;

                    await ensureContentLoaded();
                    const userDocRef = userDoc.ref;
                    
                    // Get cart if exists for dynamic content
                    const cartDoc = await db.collection('userCarts').doc(user.id).get();
                    const userCart = cartDoc.exists ? cartDoc.data() as UserCart : null;
                    const cartContentHtml = userCart && userCart.items.length > 0
                        ? `<ul>${userCart.items.map(i => `<li>${allServicesMap.get(i.serviceId)?.name || 'Item'} (x${i.quantity})</li>`).join('')}</ul>`
                        : '';

                    const categoryServicesHtml = await getCategoryServicesHtml(marketingConfig.noBookingReminderCategoryId, userCart);
                    const body = replaceMergeTags(marketingConfig.noBookingReminderTemplate || "", user, appConfig, globalSettings, { popularServicesHtml, cartContentHtml, popularCategoriesHtml, allServicesHtml, allCategoriesHtml, categoryServicesHtml });
                    await sendMarketingEmail({ toEmail: user.email, subject: "A Reminder from " + (globalSettings.websiteName || "Yourbrand"), htmlBody: body.replace(/\n/g, '<br>'), smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail });
                    await userDocRef.update({ 'marketingStatus.bookingReminderSent': true });
                    emailsSent++;
                    processedUserIds.add(user.id);
                }
            }
        }

        // --- 3. Feature B: Abandoned Cart Reminder (Ultra-Targeted Query) ---
        if (marketingConfig.abandonedCartEnabled && marketingConfig.abandonedCartDelay) {
            const delayMs = toMs(marketingConfig.abandonedCartDelay);
            if (delayMs > 0) {
                const cutoff = Timestamp.fromMillis(now - delayMs);
                const cartSnapshot = await db.collection('userCarts')
                    .where('marketingStatus.reminderSent', '==', false) // Only "New Data"
                    .where('updatedAt', '<=', cutoff)
                    .orderBy('updatedAt', 'asc')
                    .limit(100)
                    .get();

                for (const cartDoc of cartSnapshot.docs) {
                    const userCart = { ...cartDoc.data(), id: cartDoc.id } as UserCart;
                    if (processedUserIds.has(userCart.userId)) continue;

                    const userDoc = await db.collection('users').doc(userCart.userId).get();
                    if (!userDoc.exists) continue;
                    const user = { ...userDoc.data(), id: userDoc.id } as FirestoreUser;
                    
                    if (user.isActive && user.email) {
                        await ensureContentLoaded();
                        const userDocRef = userDoc.ref;
                        const cartDocRef = cartDoc.ref;
                        const cartContentHtml = `<ul>${userCart.items.map(i => `<li>${allServicesMap.get(i.serviceId)?.name || 'Item'} (x${i.quantity})</li>`).join('')}</ul>`;

                        const categoryServicesHtml = await getCategoryServicesHtml(marketingConfig.abandonedCartCategoryId, userCart);
                        const body = replaceMergeTags(marketingConfig.abandonedCartTemplate || "", user, appConfig, globalSettings, { popularServicesHtml, cartContentHtml, popularCategoriesHtml, allServicesHtml, allCategoriesHtml, categoryServicesHtml });
                        await sendMarketingEmail({ toEmail: user.email, subject: "You left something in your cart!", htmlBody: body.replace(/\n/g, '<br>'), smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail });
                        
                        // Mark both the user AND the specific cart as reminded
                        await Promise.all([
                            userDocRef.update({ 'marketingStatus.cartReminderSent': true }),
                            cartDocRef.update({ 'marketingStatus.reminderSent': true })
                        ]);
                        emailsSent++;
                        processedUserIds.add(user.id);
                    }
                }
            }
        }

        // --- 4. Feature C: Recurring Engagement (Targeted Query) ---
        if (marketingConfig.recurringEngagementEnabled && marketingConfig.recurringEngagementDelay) {
            const repeatMs = toMs(marketingConfig.recurringEngagementDelay);
            if (repeatMs > 0) {
                const cutoff = Timestamp.fromMillis(now - repeatMs);
                
                // Query users who already had a recurring email and are due for next one
                const recurringSnapshot = await db.collection('users')
                    .where('isActive', '==', true)
                    .where('marketingStatus.lastRecurringSent', '<=', cutoff)
                    .orderBy('marketingStatus.lastRecurringSent', 'asc')
                    .limit(50)
                    .get();

                // Also query users who have NEVER had a recurring email but are old enough
                const neverRecurringSnapshot = await db.collection('users')
                    .where('isActive', '==', true)
                    .where('marketingStatus.lastRecurringSent', '==', null)
                    .where('createdAt', '<=', cutoff)
                    .orderBy('createdAt', 'asc')
                    .limit(50)
                    .get();

                const allRecurringDocs = [...recurringSnapshot.docs, ...neverRecurringSnapshot.docs];

                for (const userDoc of allRecurringDocs) {
                    if (processedUserIds.has(userDoc.id)) continue;
                    const user = { ...userDoc.data(), id: userDoc.id } as FirestoreUser;
                    if (!user.email) continue;

                    await ensureContentLoaded();
                    const userDocRef = userDoc.ref;

                    // Get cart if exists for dynamic content
                    const cartDoc = await db.collection('userCarts').doc(user.id).get();
                    const userCart = cartDoc.exists ? cartDoc.data() as UserCart : null;
                    const cartContentHtml = userCart && userCart.items.length > 0
                        ? `<ul>${userCart.items.map(i => `<li>${allServicesMap.get(i.serviceId)?.name || 'Item'} (x${i.quantity})</li>`).join('')}</ul>`
                        : '';

                    const categoryServicesHtml = await getCategoryServicesHtml(marketingConfig.recurringEngagementCategoryId, userCart);
                    const body = replaceMergeTags(marketingConfig.recurringEngagementTemplate || "", user, appConfig, globalSettings, { popularServicesHtml, cartContentHtml, popularCategoriesHtml, allServicesHtml, allCategoriesHtml, categoryServicesHtml });
                    await sendMarketingEmail({ toEmail: user.email, subject: "A message from " + (globalSettings.websiteName || "Yourbrand"), htmlBody: body.replace(/\n/g, '<br>'), smtpHost: appConfig.smtpHost, smtpPort: appConfig.smtpPort, smtpUser: appConfig.smtpUser, smtpPass: appConfig.smtpPass, senderEmail: appConfig.senderEmail });
                    await userDocRef.update({ 'marketingStatus.lastRecurringSent': Timestamp.fromMillis(now) });
                    emailsSent++;
                    processedUserIds.add(user.id);
                }
            }
        }

        
        console.log(`Marketing cron job finished. Sent ${emailsSent} emails.`);
        return NextResponse.json({ status: 'ok', sent: emailsSent });

    } catch (error) {
        console.error("Error in marketing cron job:", error);
        return NextResponse.json({ status: 'error', error: (error as Error).message }, { status: 500 });
    }
}

