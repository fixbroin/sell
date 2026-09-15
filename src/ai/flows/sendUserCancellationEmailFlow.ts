
'use server';
/**
 * @fileOverview A Genkit flow to send a booking cancellation email when a user cancels.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config';
import { getEmailTemplate } from '@/app/actions/emailSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

const UserCancellationEmailInputSchema = z.object({
  bookingId: z.string().describe("The unique ID of the booking."),
  customerName: z.string().describe("The name of the customer."),
  customerEmail: z.string().email().describe("The email address of the customer."),
  paymentMethod: z.string().describe("The payment method chosen by the customer."),
  paidAmount: z.number().optional().describe("Amount paid by user before cancellation."),
  cancellationFee: z.number().optional().describe("Cancellation fee charged."),
  refundableAmount: z.number().optional().describe("Calculated refundable amount."),
  cancellationPaymentId: z.string().optional().describe("Razorpay payment ID for the cancellation fee payment."),
  // SMTP Settings
  smtpHost: z.string().optional().describe("SMTP host for sending emails."),
  smtpPort: z.string().optional().describe("SMTP port (e.g., '587', '465')."),
  smtpUser: z.string().optional().describe("SMTP username."),
  smtpPass: z.string().optional().describe("SMTP password."),
  senderEmail: z.string().optional().describe("The email address to send from."),
  siteName: z.string().optional().default("Yourbrand"),
  logoUrl: z.string().optional(),
  currencySymbol: z.string().optional().describe("Currency symbol to use in email templates."),
});

export type UserCancellationEmailInput = z.infer<typeof UserCancellationEmailInputSchema>;

export async function sendUserCancellationEmail(input: UserCancellationEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    return await userCancellationEmailFlow(input);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("sendUserCancellationEmail: Error calling flow:", error);
    return { success: false, message: `Failed to process user cancellation email flow: ${errorMessage}` };
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


const userCancellationEmailFlow = ai.defineFlow(
  {
    name: 'userCancellationEmailFlow',
    inputSchema: UserCancellationEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (bookingDetails) => {
    try {
       const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail, siteName = "Yourbrand", logoUrl, currencySymbol = "₹",
        customerName, customerEmail, bookingId,
        paymentMethod, paidAmount, cancellationFee, refundableAmount, cancellationPaymentId,
      } = bookingDetails;
      
      const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;
      
      let paymentInfoHtml = '';
      if (paymentMethod === 'Online' && paidAmount !== undefined && cancellationFee !== undefined && refundableAmount !== undefined) {
          const isNoRefund = refundableAmount <= 0;
          paymentInfoHtml = `
            <div class="summary-box">
              <h3 style="margin-top: 0;">Refund Details</h3>
              <p>You paid: ${currencySymbol}${paidAmount.toFixed(2)}</p>
              <p>Cancellation fee: ${currencySymbol}${cancellationFee.toFixed(2)}</p>
              <p><strong>Refundable amount: ${currencySymbol}${refundableAmount.toFixed(2)}</strong></p>
              ${isNoRefund ? `
                <p style="color: #DC3545; font-weight: bold; margin-top: 10px;">
                  As you cancelled within the final restricted window close to the service start time, a 100% cancellation charge applies and no refund will be returned.
                </p>
              ` : `
                <p>Your refund of ${currencySymbol}${refundableAmount.toFixed(2)} will be processed within 7 working days to your original payment method.</p>
              `}
              ${cancellationPaymentId ? `<p style="font-size: 12px; color: #666; margin-top: 8px;">Cancellation Transaction ID: <strong>${cancellationPaymentId}</strong></p>` : ''}
            </div>
          `;
      } else if (paymentMethod !== 'Online' && cancellationFee !== undefined && cancellationFee > 0) {
          paymentInfoHtml = `
            <div class="summary-box">
              <h3 style="margin-top: 0;">Cancellation Fee Payment</h3>
              <p>Original Payment Option: Pay After Service / Cash on Delivery</p>
              <p><strong>Cancellation Fee (Paid Online): ${currencySymbol}${cancellationFee.toFixed(2)}</strong></p>
              ${cancellationPaymentId ? `<p style="font-size: 13px; color: #333; margin-top: 8px;">Payment Transaction ID: <strong>${cancellationPaymentId}</strong></p>` : ''}
              <p>Thank you. Your cancellation payment has been successfully received and the booking is now fully cancelled. If you have any concerns, please contact us.</p>
            </div>
          `;
      } else if (paymentMethod !== 'Online' && (cancellationFee === undefined || cancellationFee === 0)) {
          paymentInfoHtml = `
            <div class="summary-box">
              <h3 style="margin-top: 0;">Cancellation Summary</h3>
              <p>Original Payment Option: Pay After Service / Cash on Delivery</p>
              <p>As you cancelled within the free cancellation window, <strong>no cancellation fee or charge applies</strong>.</p>
              <p>Your service booking has been cancelled. Thank you. If you have any concerns, please contact us.</p>
            </div>
          `;
      }

      const custTemplate = await getEmailTemplate('user_cancellation_customer');
      const admTemplate = await getEmailTemplate('user_cancellation_admin');
      
      const sendCustomer = custTemplate.isEnabled;
      const sendAdmin = admTemplate.isEnabled;

      let customerEmailSubject = "";
      let customerEmailBody = "";
      if (sendCustomer) {
        const variables = { customerName, bookingId, paymentInfoHtml, siteName };
        customerEmailSubject = replacePlaceholders(custTemplate.subject, variables);
        customerEmailBody = createHtmlTemplate("Booking Cancelled", replacePlaceholders(custTemplate.body, variables), siteName, logoUrl);
      }

      let adminEmailSubject = "";
      let adminEmailBody = "";
      if (sendAdmin) {
        const variables = { bookingId, customerName };
        adminEmailSubject = replacePlaceholders(admTemplate.subject, variables);
        adminEmailBody = createHtmlTemplate("Admin Alert: User Cancellation", replacePlaceholders(admTemplate.body, variables), siteName, logoUrl);
      }

      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com"; 

      if (!canAttemptRealEmail) {
        console.warn("SMTP configuration incomplete. Simulating cancellation emails.");
        return { success: false, message: "SMTP configuration incomplete. Emails simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10);
      const transporter = nodemailer.createTransport({
        host: smtpHost, port: portNumber, secure: portNumber === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      const promises = [];
      if (sendCustomer && customerEmailSubject && customerEmailBody) {
        promises.push(transporter.sendMail({ from: `${siteName} <${senderEmail}>`, to: customerEmail, subject: customerEmailSubject, html: customerEmailBody }));
      }
      if (sendAdmin && adminEmailSubject && adminEmailBody) {
        promises.push(transporter.sendMail({ from: `${siteName} Admin <${senderEmail}>`, to: adminEmail, subject: adminEmailSubject, html: adminEmailBody }));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }
      
      return { success: true, message: "User cancellation emails sent successfully." };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("CRITICAL ERROR in userCancellationEmailFlow:", error);
      return { success: false, message: `Critical error in flow: ${errorMessage}` };
    }
  }
);

    
