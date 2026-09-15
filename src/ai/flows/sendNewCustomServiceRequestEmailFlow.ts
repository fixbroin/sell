
'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to the admin
 * when a new custom service request is submitted.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { ADMIN_EMAIL } from '@/contexts/AuthContext';
import { getBaseUrl } from '@/lib/config';
import { getEmailTemplate } from '@/app/actions/emailSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

const NewCustomServiceRequestEmailInputSchema = z.object({
  requestId: z.string().describe("The ID of the submitted request."),
  serviceTitle: z.string().describe("The title of the requested service."),
  userName: z.string().describe("The name of the user who submitted the request."),
  userEmail: z.string().email().describe("The email of the user."),
  userMobile: z.string().optional().describe("The mobile number of the user."),
  description: z.string().describe("The user's description of the service needed."),
  category: z.string().describe("The category (pre-defined or custom) selected by the user."),
  minBudget: z.number().optional().nullable().describe("The minimum budget for the service."),
  maxBudget: z.number().optional().nullable().describe("The maximum budget for the service."),
  adminUrl: z.string().describe("Direct URL to view the request in the admin panel."),
  addressText: z.string().optional().describe("Formatted address of service location."),
  latitude: z.number().optional().nullable().describe("Address latitude coordinate."),
  longitude: z.number().optional().nullable().describe("Address longitude coordinate."),
  preferredStartDateText: z.string().optional().describe("Formatted preferred start date."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().optional().describe("The email address to send from."),
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
  currencySymbol: z.string().optional().describe("Currency symbol to use in email templates."),
});

export type NewCustomServiceRequestEmailInput = z.infer<typeof NewCustomServiceRequestEmailInputSchema>;

export async function sendNewCustomServiceRequestEmail(input: NewCustomServiceRequestEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await newCustomServiceRequestEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process custom request notification email flow: ${errorMessage}` };
  }
}

const createHtmlTemplate = (title: string, bodyContent: string, siteName: string, logoUrl?: string) => {
    const rawLogoUrl = logoUrl || `${getBaseUrl()}/android-chrome-512x512.png`;
    const finalLogoUrl = rawLogoUrl.startsWith('http') ? rawLogoUrl : `${getBaseUrl()}${rawLogoUrl.startsWith('/') ? '' : '/'}${rawLogoUrl}`;
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

const newCustomServiceRequestEmailFlow = ai.defineFlow(
  {
    name: 'newCustomServiceRequestEmailFlow',
    inputSchema: NewCustomServiceRequestEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const { smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, siteName = "Yourbrand", logoUrl, currencySymbol = "₹", ...requestDetails } = details;

      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com"; 

      const template = await getEmailTemplate('custom_service_request');
      if (!template.isEnabled) {
        console.log("Custom service request email is disabled in settings. Skipping sending.");
        return { success: true, message: "Custom service request email is disabled. Skipping." };
      }

      let mapButtonHtml = '';
      if (requestDetails.latitude && requestDetails.longitude) {
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${requestDetails.latitude},${requestDetails.longitude}`;
        mapButtonHtml = `<a href="${mapUrl}" class="button" style="background-color: #198754; margin-left: 10px; color: #ffffff !important;">View Location on Google Maps</a>`;
      } else if (requestDetails.addressText) {
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(requestDetails.addressText)}`;
        mapButtonHtml = `<a href="${mapUrl}" class="button" style="background-color: #198754; margin-left: 10px; color: #ffffff !important;">View Location on Google Maps</a>`;
      }

      const variables = {
        userName: requestDetails.userName,
        siteName,
        serviceName: requestDetails.serviceTitle,
        preferredDate: requestDetails.preferredStartDateText || 'N/A',
        preferredTimeSlot: 'N/A', 
        requestId: requestDetails.requestId,
        customerEmail: requestDetails.userEmail,
        customerMobile: requestDetails.userMobile || 'N/A',
        category: requestDetails.category,
        minBudget: String(requestDetails.minBudget || 'N/A'),
        maxBudget: String(requestDetails.maxBudget || 'N/A'),
        addressText: requestDetails.addressText || 'N/A',
        description: requestDetails.description,
        adminUrl: requestDetails.adminUrl,
        mapButtonHtml
      };

      const emailSubject = replacePlaceholders(template.subject, variables);
      const emailBodyContent = replacePlaceholders(template.body, variables);
      const htmlBody = createHtmlTemplate(emailSubject, emailBodyContent, siteName, logoUrl);

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating admin notification email.");
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
        from: `${siteName} Admin <${senderEmail}>`,
        to: adminEmail,
        subject: emailSubject,
        html: htmlBody,
      });
      
      return { success: true, message: "Admin notification email sent successfully." };

    } catch (error: any) {
      console.error("Error in newCustomServiceRequestEmailFlow:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}.` };
    }
  }
);
