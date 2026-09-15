
'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to a provider
 * when their application status is updated by an admin.
 *
 * - sendProviderApplicationStatusEmail - Sends an email to the provider.
 * - ProviderApplicationStatusEmailInput - The input type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import type { ProviderApplicationStatus } from '@/types/firestore'; // Import status type
import { getBaseUrl } from '@/lib/config';
import { getEmailTemplate } from '@/app/actions/emailSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

const ProviderApplicationStatusEmailInputSchema = z.object({
  providerName: z.string().describe("The name of the provider."),
  providerEmail: z.string().email().describe("The email of the provider."),
  applicationStatus: z.custom<ProviderApplicationStatus>().describe("The new status of the application (e.g., 'approved', 'rejected', 'needs_update')."),
  adminReviewNotes: z.string().optional().describe("Admin notes, especially if rejected or needs update."),
  applicationUrl: z.string().describe("Direct URL for the provider to view/update their application if needed."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().optional().describe("The email address to send from."),
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type ProviderApplicationStatusEmailInput = z.infer<typeof ProviderApplicationStatusEmailInputSchema>;

export async function sendProviderApplicationStatusEmail(input: ProviderApplicationStatusEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await providerApplicationStatusEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process provider status email flow: ${errorMessage}` };
  }
}

const createHtmlTemplate = (title: string, bodyContent: string, siteName: string, logoUrl?: string) => {
    let finalLogoUrl = logoUrl || `${getBaseUrl()}/default-image.png`;
    if (finalLogoUrl.startsWith('/')) {
        finalLogoUrl = getBaseUrl() + finalLogoUrl;
    }
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { margin: 0; padding: 0; background-color: #F8F9FA; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .inner-container { padding: 25px; }
        .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #f0f0f0; }
        .header img { max-width: 140px; height: auto; }
        .content { padding: 25px 0; color: #333333; line-height: 1.6; }
        .content h2 { color: #111111; font-size: 22px; margin-bottom: 15px; }
        .footer { text-align: center; font-size: 12px; color: #999999; padding: 25px; border-top: 1px solid #eeeeee; }
        .summary-box { background-color: #fcfcfc; border: 1px solid #eeeeee; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .section-title { font-size: 16px; font-weight: bold; border-bottom: 1px solid #f0f0f0; padding-bottom: 8px; margin-bottom: 12px; color: #111111; text-transform: uppercase; letter-spacing: 0.5px; }
        .notes { background-color: #f9f9f9; border-left: 3px solid #0B5ED7; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }
        
        .button {
            display: inline-block; padding: 14px 28px; background-color: #0B5ED7; color: #ffffff !important;
            text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 20px;
        }
        @media only screen and (max-width: 600px) {
            .inner-container { padding: 15px !important; }
            .container { width: 100% !important; }
        }
    </style>
</head>
<body>
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8F9FA;">
        <tr>
            <td align="center">
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px 0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                    <tr>
                        <td class="inner-container">
                            <div class="header">
                                <a href="${getBaseUrl()}" target="_blank">
                                    <img src="${finalLogoUrl}" alt="${siteName} Logo">
                                </a>
                            </div>
                            <div class="content">
                                <h2>${title}</h2>
                                ${bodyContent}
                            </div>
                            <div class="footer">
                                <p>&copy; ${new Date().getFullYear()} ${siteName}. All rights reserved.</p>
                                <p>This is an automated email. Please do not reply directly.</p>
                            </div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;
};


const providerApplicationStatusEmailFlow = ai.defineFlow(
  {
    name: 'providerApplicationStatusEmailFlow',
    inputSchema: ProviderApplicationStatusEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        providerName, providerEmail, applicationStatus, adminReviewNotes, applicationUrl,
        siteName = "Yourbrand", logoUrl,
      } = details;
      
      const template = await getEmailTemplate('provider_status_update');
      if (!template.isEnabled) {
        console.log("Provider status update email is disabled in settings. Skipping sending.");
        return { success: true, message: "Provider status update email is disabled. Skipping." };
      }

      let statusContentBlock = '';
      const adminReviewNotesBlock = adminReviewNotes ? `<div class="notes"><p><strong>Reason/Feedback:</strong><br>${adminReviewNotes}</p></div>` : '';
      
      if (applicationStatus === 'approved') {
        const dashboardUrl = applicationUrl.replace('provider-registration', 'provider');
        statusContentBlock = `
          <p>Congratulations! We are pleased to inform you that your provider application with ${siteName} has been approved.</p>
          <p>You can now access your provider dashboard and start managing your services and jobs.</p>
          <p><a href="${dashboardUrl}" class="button" style="color: #ffffff !important;">Access Dashboard</a></p>
          <p>Welcome aboard!</p>
        `;
      } else if (applicationStatus === 'rejected') {
        statusContentBlock = `
          <p>Thank you for your interest in becoming a provider with ${siteName}.</p>
          <p>After careful review, we regret to inform you that your application was not approved at this time.</p>
          ${adminReviewNotesBlock}
        `;
      } else if (applicationStatus === 'needs_update') {
        statusContentBlock = `
          <p>We have reviewed your provider application for ${siteName} and require some additional information or corrections.</p>
          ${adminReviewNotesBlock}
          <p>Please log in to your application to make the necessary updates:</p>
          <p><a href="${applicationUrl}" class="button" style="color: #ffffff !important;">Update Application</a></p>
          <p>Once updated, your application will be re-reviewed.</p>
        `;
      } else {
        return { success: true, message: "No email template for this status." };
      }

      const statusLabel = applicationStatus.replace(/_/g, ' ');
      const variables = {
        providerName,
        statusContentBlock,
        siteName,
        status: statusLabel
      };

      const emailSubject = replacePlaceholders(template.subject, variables);
      const emailBodyContent = replacePlaceholders(template.body, variables);
      const htmlBody = createHtmlTemplate(`Application Status: ${statusLabel}`, emailBodyContent, siteName, logoUrl);

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating provider status email.");
        return { success: false, message: "SMTP config incomplete. Email simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      if (isNaN(portNumber)) {
        return { success: false, message: "Invalid SMTP port." };
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      
      await transporter.sendMail({
        from: `${siteName} Team <${senderEmail}>`, to: providerEmail, subject: emailSubject, html: htmlBody,
      });

      return { success: true, message: "Provider status email sent successfully." };

    } catch (error: any) {
      console.error("Error in providerApplicationStatusEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown error'}.` };
    }
  }
);

    
