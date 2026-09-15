
'use server';
/**
 * @fileOverview A Genkit flow to send a welcome email to a new user.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config'; // Import the base URL helper
import { getEmailTemplate } from '@/app/actions/emailSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

// Input schema for the welcome email flow
const WelcomeEmailInputSchema = z.object({
  userName: z.string().describe("The name of the new user."),
  userEmail: z.string().email().describe("The email address of the new user."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().optional().describe("The email address to send from."),
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
});

export type WelcomeEmailInput = z.infer<typeof WelcomeEmailInputSchema>;

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await welcomeEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, message: `Failed to process welcome email flow: ${errorMessage}` };
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


const welcomeEmailFlow = ai.defineFlow(
  {
    name: 'welcomeEmailFlow',
    inputSchema: WelcomeEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (details) => {
    const { smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, userName, userEmail, siteName = "Yourbrand", logoUrl } = details;
    
    const template = await getEmailTemplate('welcome_email');
    if (!template.isEnabled) {
      console.log("Welcome email is disabled in settings. Skipping sending.");
      return { success: true, message: "Welcome email is disabled in settings. Skipping sending." };
    }

    const categoriesUrl = `${getBaseUrl()}/categories`;
    const variables = { userName, siteName, categoriesUrl };
    const emailSubject = replacePlaceholders(template.subject, variables);
    const emailBodyContent = replacePlaceholders(template.body, variables);
    const htmlBody = createHtmlTemplate(`Welcome to ${siteName}!`, emailBodyContent, siteName, logoUrl);

    const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

    if (!canAttemptRealEmail) {
      console.warn("SMTP configuration incomplete. Simulating welcome email.");
      return { success: false, message: "SMTP config incomplete. Email simulated." };
    }

    const portNumber = parseInt(smtpPort!, 10);
    if (isNaN(portNumber)) {
        return { success: false, message: "Invalid SMTP port." };
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass },
    });
    
    try {
      await transporter.sendMail({
        from: `${siteName} <${senderEmail}>`,
        to: userEmail,
        subject: emailSubject,
        html: htmlBody,
      });
      return { success: true, message: "Welcome email sent successfully." };
    } catch (error: any) {
      console.error("Error sending welcome email:", error);
      return { success: false, message: `Email sending failed: ${error.message || 'Unknown nodemailer error'}.` };
    }
  }
);

    
