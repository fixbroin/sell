'use server';
/**
 * @fileOverview A Genkit flow to send an email notification to the admin
 * when a user requests human support in the AI chat.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config';
import { getEmailTemplate } from '@/app/actions/emailSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

const HumanSupportRequestEmailInputSchema = z.object({
  userName: z.string().describe("The name of the user requesting support."),
  userEmail: z.string().describe("The email of the user."),
  userId: z.string().describe("The UID of the user."),
  lastMessage: z.string().describe("The last message sent by the user."),
  chatUrl: z.string().describe("Direct URL to the chat in the admin panel."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().optional().describe("The email address to send from."),
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type HumanSupportRequestEmailInput = z.infer<typeof HumanSupportRequestEmailInputSchema>;

export async function sendHumanSupportRequestEmail(input: HumanSupportRequestEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await humanSupportRequestEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process human support notification email flow: ${errorMessage}` };
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
        
        .button {
            display: inline-block; padding: 14px 28px; background-color: #DC3545; color: #ffffff !important;
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
                                <p>This is an automated email sent because a user needs help.</p>
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

const humanSupportRequestEmailFlow = ai.defineFlow(
  {
    name: 'humanSupportRequestEmailFlow',
    inputSchema: HumanSupportRequestEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    try {
      const { smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, siteName = "Yourbrand", logoUrl, ...requestDetails } = details;

      // Primary Admin Email
      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com"; 
      const template = await getEmailTemplate('support_request');
      if (!template.isEnabled) {
        console.log("Human support request notification email is disabled in settings. Skipping sending.");
        return { success: true, message: "Human support request email is disabled. Skipping." };
      }

      const variables = {
        userName: requestDetails.userName,
        userEmail: requestDetails.userEmail,
        userId: requestDetails.userId,
        lastMessage: requestDetails.lastMessage,
        chatUrl: requestDetails.chatUrl,
        siteName
      };

      let customTitle = "Human Support Requested";
      let emailSubject = replacePlaceholders(template.subject, variables);

      if (requestDetails.lastMessage.includes('[PAYMENT DISCREPANCY ALERT]')) {
        emailSubject = `🚨 URGENT: Payment Deducted but Booking Missing - ${requestDetails.userName}`;
        customTitle = "🚨 Urgent Payment Discrepancy Alert";
      } else if (requestDetails.lastMessage.includes('[USER INQUIRY ALERT]')) {
        emailSubject = `📩 New Customer Question in Chat from ${requestDetails.userName}`;
        customTitle = "Customer Question Received";
      }

      const emailBodyContent = replacePlaceholders(template.body, variables);
      const htmlBody = createHtmlTemplate(customTitle, emailBodyContent, siteName, logoUrl);

      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete for support email. Simulating email.");
        return { success: false, message: "SMTP config incomplete. Email simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
      });
      
      await transporter.sendMail({
        from: `Yourbrand Support <${senderEmail}>`,
        to: adminEmail,
        subject: emailSubject,
        html: htmlBody,
      });
      
      return { success: true, message: "Human support notification email sent." };

    } catch (error: any) {
      console.error("Error in humanSupportRequestEmailFlow:", error);
      return { success: false, message: `Email failed: ${error.message}` };
    }
  }
);
