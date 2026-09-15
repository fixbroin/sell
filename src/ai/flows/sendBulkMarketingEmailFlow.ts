
'use server';
/**
 * @fileOverview A Genkit flow to send a marketing email to multiple users,
 * replacing merge tags with user-specific data.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { getFirestore, Timestamp } from '@/lib/mysqlDbAdmin';
import { initFirebaseAdmin } from '@/lib/firebase-admin';
import type { FirestoreUser, AppSettings, GlobalWebSettings, FirestoreService, FirestoreCategory } from '@/types/firestore';
import { sendMarketingEmail } from './sendMarketingEmailFlow';
import { getBaseUrl } from '@/lib/config';
import { formatDateInTimezone } from '@/lib/utils';

// Helper to safely get nested properties
const get = (obj: any, path: string, defaultValue: any = ''): any => {
    const keys = path.split('.');
    let result = obj;
    for (const key of keys) {
        if (result && typeof result === 'object' && key in result) {
            result = result[key];
        } else {
            return defaultValue;
        }
    }
    return result;
};

// Input schema for the bulk marketing email flow
const BulkMarketingEmailInputSchema = z.object({
  targetUserIds: z.union([z.literal('all'), z.array(z.string())]).describe("Either 'all' to send to all users, or an array of specific user IDs."),
  subject: z.string().describe("The subject line of the email."),
  body: z.string().describe("The HTML content of the email body, with merge tags like {{name}}."),
  categoryIdForServices: z.string().optional(), // New field for category-specific services
});

export type BulkMarketingEmailInput = z.infer<typeof BulkMarketingEmailInputSchema>;

// Exported function that calls the flow
export async function sendBulkMarketingEmail(input: BulkMarketingEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await bulkMarketingEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("sendBulkMarketingEmail: Error calling flow:", error);
    return { success: false, message: `Failed to process bulk email flow.` };
  }
}

// The main flow definition
const bulkMarketingEmailFlow = ai.defineFlow(
  {
    name: 'bulkMarketingEmailFlow',
    inputSchema: BulkMarketingEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (input) => {
    try {
      console.log("====== BULK MARKETING EMAIL FLOW START ======");
      initFirebaseAdmin();
      const db = getFirestore();

      // 1. Fetch settings (SMTP, company details)
      const appConfigSnap = await db.collection('webSettings').doc('applicationConfig').get();
      const globalSettingsSnap = await db.collection('webSettings').doc('global').get();
      
      if (!appConfigSnap.exists || !globalSettingsSnap.exists) {
        throw new Error("SMTP or Global settings not configured in Firestore.");
      }
      const appConfig = appConfigSnap.data() as AppSettings;
      const globalSettings = globalSettingsSnap.data() as GlobalWebSettings;
      
      if (!appConfig.smtpHost || !appConfig.senderEmail) {
        throw new Error("SMTP settings are incomplete. Cannot send emails.");
      }

      // Fetch dynamic content for merge tags
      const baseUrl = getBaseUrl();
      
      // STYLING FOR LISTS (Matching new design standards)
      const listStyle = 'list-style: none; padding: 0; margin: 10px 0;';
      const itemStyle = 'padding: 8px 0; border-bottom: 1px solid #f0f0f0;';
      const linkStyle = 'color: #0B5ED7; text-decoration: none; font-weight: 500;';

      // Popular Content
      const popularServicesSnap = await db.collection("adminServices").where("isActive", "==", true).orderBy("rating", "desc").limit(5).get();
      const popularServicesHtml = `<ul style="${listStyle}">${popularServicesSnap.docs.map(doc => `<li style="${itemStyle}"><a href="${baseUrl}/service/${doc.data().slug}" style="${linkStyle}">${doc.data().name}</a></li>`).join('')}</ul>`;

      const popularCategoriesSnap = await db.collection("adminCategories").orderBy("order", "asc").limit(5).get();
      const popularCategoriesHtml = `<ul style="${listStyle}">${popularCategoriesSnap.docs.map(doc => `<li style="${itemStyle}"><a href="${baseUrl}/category/${doc.data().slug}" style="${linkStyle}">${doc.data().name}</a></li>`).join('')}</ul>`;

      // All Content
      const allServicesSnap = await db.collection("adminServices").where("isActive", "==", true).orderBy("name", "asc").get();
      const allServicesHtml = `<ul style="${listStyle}">${allServicesSnap.docs.map(doc => `<li style="${itemStyle}"><a href="${baseUrl}/service/${doc.data().slug}" style="${linkStyle}">${doc.data().name}</a></li>`).join('')}</ul>`;

      const allCategoriesSnap = await db.collection("adminCategories").orderBy("order", "asc").get();
      const allCategoriesHtml = `<ul style="${listStyle}">${allCategoriesSnap.docs.map(doc => `<li style="${itemStyle}"><a href="${baseUrl}/category/${doc.data().slug}" style="${linkStyle}">${doc.data().name}</a></li>`).join('')}</ul>`;

      // New: Category-specific services
      let categoryServicesHtml = '';
      if (input.categoryIdForServices) {
        const subCatsSnap = await db.collection("adminSubCategories").where("parentId", "==", input.categoryIdForServices).get();
        const subCatIds = subCatsSnap.docs.map(doc => doc.id);
        if (subCatIds.length > 0) {
            const categoryServicesSnap = await db.collection("adminServices").where("subCategoryId", "in", subCatIds).where("isActive", "==", true).orderBy("name", "asc").get();
            categoryServicesHtml = `<ul style="${listStyle}">${categoryServicesSnap.docs.map(doc => `<li style="${itemStyle}"><a href="${baseUrl}/service/${doc.data().slug}" style="${linkStyle}">${doc.data().name}</a></li>`).join('')}</ul>`;
        }
      }

      // 2. Fetch target users
      let users: FirestoreUser[] = [];
      if (input.targetUserIds === 'all') {
        const usersSnapshot = await db.collection('users').get();
        users = usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser));
      } else if (Array.isArray(input.targetUserIds) && input.targetUserIds.length > 0) {
        const userIds = input.targetUserIds;
        for (let i = 0; i < userIds.length; i += 30) {
            const chunk = userIds.slice(i, i + 30);
            if (chunk.length > 0) {
              const usersSnapshot = await db.collection('users').where('__name__', 'in', chunk).get();
              users.push(...usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as FirestoreUser)));
            }
        }
      }

      if (users.length === 0) {
        return { success: true, message: "No target users found." };
      }

      // 3. Iterate, replace tags, and send emails
      let successfulSends = 0;
      let failedSends = 0;

      const appDetails = {
        websiteName: globalSettings.websiteName || 'Yourbrand',
        websiteUrl: getBaseUrl(),
        supportEmail: globalSettings.contactEmail || 'support@yourdomain.com',
        companyAddress: globalSettings.address || '',
        logoUrl: globalSettings.logoUrl || '',
      };
      
      for (const user of users) {
        if (!user.email) continue;

        let emailBody = input.body;
        let emailSubject = input.subject;

        const mergeData = {
          name: user.displayName || 'Valued Customer',
          email: user.email,
          mobile: user.mobileNumber || '',
          signupDate: user.createdAt?.toDate() ? formatDateInTimezone(user.createdAt.toDate(), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat) : '',
          websiteName: appDetails.websiteName,
          websiteUrl: appDetails.websiteUrl,
          supportEmail: appDetails.supportEmail,
          companyAddress: appDetails.companyAddress,
          popular_services: popularServicesHtml,
          popular_categories: popularCategoriesHtml,
          all_services: allServicesHtml,
          all_categories: allCategoriesHtml,
          category_services: categoryServicesHtml,
        };

        // Replace tags
        for (const [key, value] of Object.entries(mergeData)) {
            const tag = new RegExp(`{{${key}}}`, 'g');
            emailBody = emailBody.replace(tag, value || '');
            emailSubject = emailSubject.replace(tag, value || '');
        }

        // Send email via the single marketing email flow (which already uses the new design)
        const result = await sendMarketingEmail({
          toEmail: user.email,
          subject: emailSubject,
          htmlBody: emailBody,
          smtpHost: appConfig.smtpHost,
          smtpPort: appConfig.smtpPort,
          smtpUser: appConfig.smtpUser,
          smtpPass: appConfig.smtpPass,
          senderEmail: appConfig.senderEmail,
          siteName: appDetails.websiteName,
          logoUrl: appDetails.logoUrl,
        });

        if (result.success) {
          successfulSends++;
        } else {
          failedSends++;
        }
      }

      return { success: true, message: `Email campaign finished. Sent: ${successfulSends}. Failed: ${failedSends}.` };

    } catch (error) {
      console.error("CRITICAL ERROR in bulkMarketingEmailFlow:", error);
      return { success: false, message: `Bulk flow failed.` };
    }
  }
);
