
'use server';
/**
 * @fileOverview A Genkit flow to send booking confirmation and completion emails.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import nodemailer from 'nodemailer';
import { getBaseUrl } from '@/lib/config';
import { formatScheduledDate as utilsFormatScheduledDate } from '@/lib/utils';
import { getEmailTemplate } from '@/app/actions/emailSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

// Define Zod schema for individual service items
const EmailBookingServiceItemSchema = z.object({
  serviceId: z.string(),
  name: z.string(),
  quantity: z.number(),
  pricePerUnit: z.number(),
  discountedPricePerUnit: z.number().optional(),
  imageUrl: z.string().optional().nullable(),
  total: z.number().optional(),
});

// Define Zod schema for applied platform fees
const EmailPlatformFeeItemSchema = z.object({
  name: z.string(),
  amount: z.number(), 
});

// Define Zod schema for the input
const BookingConfirmationEmailInputSchema = z.object({
  bookingId: z.string(),
  customerName: z.string(),
  customerEmail: z.string().email(),
  customerPhone: z.string(),
  addressLine1: z.string(),
  addressLine2: z.string().optional(),
  city: z.string(),
  state: z.string(),
  pincode: z.string(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  scheduledDate: z.string(),
  scheduledTimeSlot: z.string(),
  services: z.array(EmailBookingServiceItemSchema),
  subTotal: z.number(), 
  visitingCharge: z.number().optional(),
  discountAmount: z.number().optional(),
  discountCode: z.string().optional(),
  appliedPlatformFees: z.array(EmailPlatformFeeItemSchema).optional(),
  additionalCharges: z.array(z.object({ name: z.string(), amount: z.number() })).optional(),
  taxAmount: z.number(),
  totalAmount: z.number(),
  paymentMethod: z.string(),
  status: z.string(),
  smtpHost: z.string().optional(),
  smtpPort: z.string().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  senderEmail: z.string().optional(),
  emailType: z.enum(['booking_confirmation', 'booking_completion', 'booking_rescheduled', 'booking_cancelled_by_admin', 'booking_cancelled_by_user', 'booking_status_update']).optional().default('booking_confirmation'),
  invoicePdfBase64: z.string().optional(),
  previousScheduledDate: z.string().optional(),
  previousScheduledTimeSlot: z.string().optional(),
  cancellationReason: z.string().optional(),
  siteName: z.string().optional(),
  logoUrl: z.string().optional(),
  currencySymbol: z.string().optional().describe("Currency symbol to use in email templates."),
  providerName: z.string().optional(),
  providerPhone: z.string().optional(),
  dateFormat: z.string().optional(),
});

export type BookingConfirmationEmailInput = z.infer<typeof BookingConfirmationEmailInputSchema>;

export async function sendBookingConfirmationEmail(input: BookingConfirmationEmailInput): Promise<{ success: boolean; message: string }> {
  try {
    const result = await bookingEmailFlow(input);
    return result;
  } catch (error) {
    console.error("sendBookingConfirmationEmail Error:", error);
    return { success: false, message: `Failed to process email flow.` };
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
        
        .service-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        .service-row { border-bottom: 1px solid #f5f5f5; }
        .service-img-cell { width: 70px; padding: 12px 0; vertical-align: top; }
        .service-img-cell img { width: 60px; height: 60px; object-fit: cover; border-radius: 8px; display: block; background-color: #f0f0f0; }
        .service-info-cell { padding: 12px 0 12px 15px; vertical-align: top; }
        .service-name { font-weight: 600; color: #222222; font-size: 15px; margin-bottom: 3px; }
        .service-meta { color: #888888; font-size: 13px; margin-bottom: 2px; }
        .service-price { font-weight: 600; color: #0B5ED7; font-size: 14px; }
        
        .button {
            display: inline-block; padding: 14px 28px; background-color: #0B5ED7; color: #ffffff !important;
            text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin-top: 20px;
        }
        .button-secondary {
            display: inline-block; padding: 8px 16px; background-color: #ffffff; color: #0B5ED7 !important;
            text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; border: 1px solid #0B5ED7; margin-top: 10px;
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
                <table class="container" width="600" border="0" cellspacing="0" cellpadding="0" style="background-color: #ffffff; margin: 20px 0; border-radius: 12px; overflow: hidden;">
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


const bookingEmailFlow = ai.defineFlow(
  {
    name: 'bookingEmailFlow',
    inputSchema: BookingConfirmationEmailInputSchema,
    outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  },
  async (bookingDetails) => {
    try { 
      const {
        smtpHost, smtpPort, smtpUser, smtpPass, senderEmail,
        emailType = 'booking_confirmation', 
        invoicePdfBase64,
        previousScheduledDate,
        previousScheduledTimeSlot,
        siteName = "Yourbrand",
        cancellationReason,
        logoUrl,
        currencySymbol = "Rs.",
        providerName,
        dateFormat,
      } = bookingDetails;

      const formatScheduledDate = (dStr: string | undefined) => utilsFormatScheduledDate(dStr, dateFormat);

      const paymentSummaryHtml = `
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-family: 'Roboto', sans-serif; line-height: 1.6; font-size: 14px; color: #444444;">
          <tr><td style="padding: 4px 0;">Items Total:</td><td align="right" style="padding: 4px 0;">${currencySymbol} ${bookingDetails.subTotal.toFixed(2)}</td></tr>
          ${bookingDetails.discountAmount && bookingDetails.discountAmount > 0 ? `<tr><td style="padding: 4px 0; color: #198754;">Discount (${bookingDetails.discountCode || 'Applied'}):</td><td align="right" style="padding: 4px 0; color: #198754;">- ${currencySymbol} ${bookingDetails.discountAmount.toFixed(2)}</td></tr>` : ''}
          ${bookingDetails.visitingCharge && bookingDetails.visitingCharge > 0 ? `<tr><td style="padding: 4px 0;">Visiting Charge:</td><td align="right">+ ${currencySymbol} ${bookingDetails.visitingCharge.toFixed(2)}</td></tr>` : ''}
          
          ${bookingDetails.appliedPlatformFees && bookingDetails.appliedPlatformFees.length > 0 ? bookingDetails.appliedPlatformFees.map(fee => `<tr><td style="padding: 4px 0;">${fee.name}:</td><td align="right">+ ${currencySymbol} ${fee.amount.toFixed(2)}</td></tr>`).join('') : ''}
          
          ${bookingDetails.additionalCharges && bookingDetails.additionalCharges.length > 0 ? `
            <tr><td colspan="2" style="padding: 10px 0 5px 0; font-size: 12px; color: #888888; text-transform: uppercase; font-weight: bold;">Additional Service Charges:</td></tr>
            ${bookingDetails.additionalCharges.map(charge => `
              <tr><td style="padding: 2px 0;">${charge.name}:</td><td align="right">+ ${currencySymbol} ${charge.amount.toFixed(2)}</td></tr>
            `).join('')}
          ` : ''}

          ${bookingDetails.taxAmount && bookingDetails.taxAmount > 0 ? `<tr><td style="padding: 4px 0;">Total Tax:</td><td align="right">+ ${currencySymbol} ${bookingDetails.taxAmount.toFixed(2)}</td></tr>` : ''}
          <tr><td colspan="2" style="border-top: 1px solid #eeeeee; padding-top: 10px; margin-top: 10px;"></td></tr>
          <tr style="font-size: 18px; font-weight: bold; color: #111111;">
            <td style="padding: 5px 0;">Total Amount:</td>
            <td align="right" style="padding: 5px 0;">${currencySymbol} ${bookingDetails.totalAmount.toFixed(2)}</td>
          </tr>
        </table>
      `;
      
      const servicesHtml = `
        <table class="service-table">
          ${bookingDetails.services.map(s => {
            const itemTotal = (typeof s.total === 'number') ? s.total : (s.pricePerUnit * s.quantity);
            const avgPrice = s.quantity > 0 ? itemTotal / s.quantity : 0;
            let absoluteImgUrl = s.imageUrl || '/default-image.png';
            if (absoluteImgUrl.startsWith('/')) {
              absoluteImgUrl = getBaseUrl() + absoluteImgUrl;
            }
            return `
            <tr class="service-row">
              <td class="service-img-cell">
                <img src="${absoluteImgUrl}" alt="${s.name}">
              </td>
              <td class="service-info-cell">
                <div class="service-name">${s.name} (x${s.quantity})</div>
                <div class="service-meta">Avg: ${currencySymbol} ${avgPrice.toFixed(2)}</div>
                <div class="service-price">Total: ${currencySymbol} ${itemTotal.toFixed(2)}</div>
              </td>
            </tr>
            `;
          }).join('')}
        </table>
      `;


      let customerEmailSubject = "";
      let customerEmailBody = "";
      const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com"; 
      let adminEmailSubject = "";
      let adminEmailBody = "";
      let sendCustomer = true;
      let sendAdmin = true;
      const attachments: any[] = [];

      if (emailType === 'booking_completion') {
        customerEmailSubject = `Your ${siteName} Service Completed! (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Service Completed!', `
          <p>Hi ${bookingDetails.customerName},</p>
          <p>We're pleased to inform you that your service booking (ID: <strong>${bookingDetails.bookingId}</strong>) has been successfully completed!</p>
          <div class="summary-box">
            <div class="section-title">Booking Details</div>
            <p style="margin: 5px 0;"><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
            <p style="margin: 5px 0;"><strong>Scheduled:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} at ${bookingDetails.scheduledTimeSlot}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> Completed</p>
            
            <div class="section-title" style="margin-top: 25px;">Final Payment Summary</div>
            ${paymentSummaryHtml}
          </div>
          <p style="text-align: center; margin-top: 30px;">
            <a href="${getBaseUrl()}/my-bookings" class="button">Manage Your Booking</a>
          </p>
          <p>Thank you for choosing ${siteName}!</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Completed (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Completed', `<p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> has been marked as COMPLETED.</p><p>Total: ${currencySymbol} ${bookingDetails.totalAmount.toFixed(2)}.</p>`, siteName, logoUrl);
        if (invoicePdfBase64) attachments.push({ filename: `invoice-${bookingDetails.bookingId}.pdf`, content: invoicePdfBase64, encoding: 'base64', contentType: 'application/pdf' });
      } else if (emailType === 'booking_rescheduled') {
        customerEmailSubject = `Your ${siteName} Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        customerEmailBody = createHtmlTemplate('Booking Rescheduled', `
            <p>Hi ${bookingDetails.customerName},</p>
            <p>Your service booking (ID: <strong>${bookingDetails.bookingId}</strong>) has been rescheduled.</p>
            <div class="summary-box">
              <div class="section-title">Reschedule Info</div>
              <p style="margin: 5px 0;"><strong>Previous Schedule:</strong> ${formatScheduledDate(previousScheduledDate)} at ${previousScheduledTimeSlot || 'N/A'}</p>
              <p style="margin: 5px 0;"><strong>New Schedule:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} at ${bookingDetails.scheduledTimeSlot}</p>
            </div>
            <p>If you have any questions, please contact us.</p>
        `, siteName, logoUrl);
        adminEmailSubject = `Booking Rescheduled (ID: ${bookingDetails.bookingId})`;
        adminEmailBody = createHtmlTemplate('Admin Alert: Booking Rescheduled', `
            <p>Booking ID <strong>${bookingDetails.bookingId}</strong> for <strong>${bookingDetails.customerName}</strong> has been RESCHEDULED.</p>
            <p><strong>Previous Schedule:</strong> ${formatScheduledDate(previousScheduledDate)} at ${previousScheduledTimeSlot || 'N/A'}</p>
            <p><strong>New Schedule:</strong> ${formatScheduledDate(bookingDetails.scheduledDate)} at ${bookingDetails.scheduledTimeSlot}</p>
            <p style="margin-top: 20px;">
              <a href="${getBaseUrl()}/admin/bookings" class="button">View in Admin Panel</a>
            </p>
        `, siteName, logoUrl);
      } else if (emailType === 'booking_cancelled_by_admin') {
        const custTemplate = await getEmailTemplate('booking_cancellation_customer');
        const admTemplate = await getEmailTemplate('booking_cancellation_admin');
        
        sendCustomer = custTemplate.isEnabled;
        sendAdmin = admTemplate.isEnabled;

        if (sendCustomer) {
          const reasonBlock = cancellationReason ? `<p><strong>Reason:</strong> ${cancellationReason}</p>` : '';
          const variables = { customerName: bookingDetails.customerName, bookingId: bookingDetails.bookingId, cancellationReasonBlock: reasonBlock };
          customerEmailSubject = replacePlaceholders(custTemplate.subject, variables);
          customerEmailBody = createHtmlTemplate('Booking Cancelled', replacePlaceholders(custTemplate.body, variables), siteName, logoUrl);
        }

        if (sendAdmin) {
          const variables = { bookingId: bookingDetails.bookingId, customerName: bookingDetails.customerName };
          adminEmailSubject = replacePlaceholders(admTemplate.subject, variables);
          adminEmailBody = createHtmlTemplate('Admin Alert: Booking Cancelled', replacePlaceholders(admTemplate.body, variables), siteName, logoUrl);
        }
      } else if (emailType === 'booking_status_update') {
        if (bookingDetails.status === 'AssignedToProvider') {
          const custTemplate = await getEmailTemplate('booking_assigned_customer');
          const admTemplate = await getEmailTemplate('booking_assigned_admin');
          
          sendCustomer = custTemplate.isEnabled;
          sendAdmin = admTemplate.isEnabled;

          if (sendCustomer) {
            const variables = { customerName: bookingDetails.customerName, bookingId: bookingDetails.bookingId, providerName: providerName || 'N/A', scheduledDate: formatScheduledDate(bookingDetails.scheduledDate), scheduledTimeSlot: bookingDetails.scheduledTimeSlot, myBookingsUrl: `${getBaseUrl()}/my-bookings` };
            customerEmailSubject = replacePlaceholders(custTemplate.subject, variables);
            customerEmailBody = createHtmlTemplate('Technician Assigned', replacePlaceholders(custTemplate.body, variables), siteName, logoUrl);
          }

          if (sendAdmin) {
            const variables = { bookingId: bookingDetails.bookingId, providerName: providerName || 'N/A', adminBookingsUrl: `${getBaseUrl()}/admin/bookings` };
            adminEmailSubject = replacePlaceholders(admTemplate.subject, variables);
            adminEmailBody = createHtmlTemplate('Admin Alert: Provider Assigned', replacePlaceholders(admTemplate.body, variables), siteName, logoUrl);
          }
        } else {
          const custTemplate = await getEmailTemplate('booking_status_update_customer');
          const admTemplate = await getEmailTemplate('booking_status_update_admin');
          
          sendCustomer = custTemplate.isEnabled;
          sendAdmin = admTemplate.isEnabled;

          if (sendCustomer) {
            const variables = { customerName: bookingDetails.customerName, siteName, bookingId: bookingDetails.bookingId, status: bookingDetails.status, myBookingsUrl: `${getBaseUrl()}/my-bookings` };
            customerEmailSubject = replacePlaceholders(custTemplate.subject, variables);
            customerEmailBody = createHtmlTemplate('Booking Status Updated', replacePlaceholders(custTemplate.body, variables), siteName, logoUrl);
          }

          if (sendAdmin) {
            const variables = { bookingId: bookingDetails.bookingId, status: bookingDetails.status };
            adminEmailSubject = replacePlaceholders(admTemplate.subject, variables);
            adminEmailBody = createHtmlTemplate('Admin Alert: Status Updated', replacePlaceholders(admTemplate.body, variables), siteName, logoUrl);
          }
        }
      } else { // booking_confirmation (default)
        const custTemplate = await getEmailTemplate('booking_confirmation_customer');
        const admTemplate = await getEmailTemplate('booking_confirmation_admin');
        
        sendCustomer = custTemplate.isEnabled;
        sendAdmin = admTemplate.isEnabled;

        if (sendCustomer) {
          const variables = { 
            customerName: bookingDetails.customerName, 
            siteName, 
            bookingId: bookingDetails.bookingId, 
            scheduledDate: formatScheduledDate(bookingDetails.scheduledDate), 
            scheduledTimeSlot: bookingDetails.scheduledTimeSlot, 
            customerAddress: `${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}`, 
            servicesList: servicesHtml, 
            paymentSummary: paymentSummaryHtml, 
            myBookingsUrl: `${getBaseUrl()}/my-bookings` 
          };
          customerEmailSubject = replacePlaceholders(custTemplate.subject, variables);
          customerEmailBody = createHtmlTemplate('Booking Confirmed!', replacePlaceholders(custTemplate.body, variables), siteName, logoUrl);
        }

        if (sendAdmin) {
          let addressBlock = `<li><strong>Address:</strong> ${bookingDetails.addressLine1}${bookingDetails.addressLine2 ? ', ' + bookingDetails.addressLine2 : ''}, ${bookingDetails.city}, ${bookingDetails.state} - ${bookingDetails.pincode}</li>`;
          if (bookingDetails.latitude && bookingDetails.longitude) {
              const mapsUrl = `https://www.google.com/maps?q=${bookingDetails.latitude},${bookingDetails.longitude}`;
              addressBlock += `<li style="margin-top: 10px;"><a href="${mapsUrl}" target="_blank" class="button-secondary">📍 View on Google Maps</a></li>`;
          }

          const variables = { 
            bookingId: bookingDetails.bookingId, 
            siteName, 
            customerName: bookingDetails.customerName, 
            customerEmail: bookingDetails.customerEmail, 
            customerPhone: bookingDetails.customerPhone, 
            scheduledDate: formatScheduledDate(bookingDetails.scheduledDate), 
            scheduledTimeSlot: bookingDetails.scheduledTimeSlot, 
            addressBlock, 
            paymentMethod: bookingDetails.paymentMethod, 
            status: bookingDetails.status, 
            assignedProviderBlock: providerName ? `<li style="margin-bottom: 5px; margin-top: 10px; color: #0B5ED7;"><strong>Auto-Assigned Provider:</strong> ${providerName}</li>` : '', 
            servicesList: servicesHtml, 
            paymentSummary: paymentSummaryHtml, 
            adminBookingsUrl: `${getBaseUrl()}/admin/bookings` 
          };
          adminEmailSubject = replacePlaceholders(admTemplate.subject, variables);
          adminEmailBody = createHtmlTemplate('Admin Alert: New Booking', replacePlaceholders(admTemplate.body, variables), siteName, logoUrl);
        }
      }

      if (!smtpHost || !smtpUser || !smtpPass || !senderEmail) {
        return { success: false, message: "SMTP configuration incomplete. Email sending simulated." };
      }

      const portNumber = parseInt(smtpPort!, 10) || 587;
      const transporter = nodemailer.createTransport({ host: smtpHost, port: portNumber, secure: portNumber === 465, auth: { user: smtpUser, pass: smtpPass }});
      
      const promises = [];
      if (sendCustomer && customerEmailSubject && customerEmailBody) {
        const customerMailOptions = { from: `${siteName} <${senderEmail}>`, to: bookingDetails.customerEmail, subject: customerEmailSubject, html: customerEmailBody, attachments };
        promises.push(transporter.sendMail(customerMailOptions));
      }
      if (sendAdmin && adminEmailSubject && adminEmailBody) {
        promises.push(transporter.sendMail({ from: `${siteName} Admin <${senderEmail}>`, to: adminEmail, subject: adminEmailSubject, html: adminEmailBody }));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }
      
      return { success: true, message: "Booking emails sent successfully." };

    } catch (flowError) { 
      console.error("Error in email flow:", flowError);
      return { success: false, message: `Error in email flow.` };
    }
  }
);
