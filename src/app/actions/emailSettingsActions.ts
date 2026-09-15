'use server';

import { adminDb } from '@/lib/firebaseAdmin';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { triggerRefresh } from '@/lib/revalidateUtils';
import nodemailer from 'nodemailer';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';

export interface EmailTemplate {
  id: string;
  title: string;
  description: string;
  subject: string;
  body: string;
  isEnabled: boolean;
  placeholders: string[];
}

const DEFAULT_TEMPLATES: Record<string, Omit<EmailTemplate, 'id'>> = {
  welcome_email: {
    title: "Welcome Email (Customer)",
    description: "Sent to new customers when they successfully register.",
    subject: "Welcome to {siteName}, {userName}!",
    body: `<p>Hi {userName},</p>
<p>Welcome to {siteName}! We are thrilled to have you join our community.</p>
<p>You can now browse our wide range of home services, book appointments with trusted professionals, and manage everything from your personal dashboard.</p>
<p>To get started, why not explore our popular services?</p>
<p><a href="{categoriesUrl}" class="button" style="color: #ffffff !important;">Explore Services</a></p>
<p>If you have any questions, feel free to contact our support team.</p>
<p>Thanks,<br>The {siteName} Team</p>`,
    isEnabled: true,
    placeholders: ["userName", "siteName", "categoriesUrl"]
  },
  booking_confirmation_customer: {
    title: "Booking Confirmation (Customer)",
    description: "Sent to the customer when a new booking is confirmed.",
    subject: "Your {siteName} Booking Confirmed! (ID: {bookingId})",
    body: `<p>Hi {customerName},</p>
<p>Thank you for booking with {siteName}! Your service has been scheduled successfully.</p>
<div class="summary-box">
  <div class="section-title">Booking Details</div>
  <p style="margin: 5px 0;"><strong>Booking ID:</strong> {bookingId}</p>
  <p style="margin: 5px 0;"><strong>Scheduled:</strong> {scheduledDate} | {scheduledTimeSlot}</p>
  <p style="margin: 5px 0;"><strong>Address:</strong> {customerAddress}</p>
  
  <div class="section-title" style="margin-top: 25px;">Services</div>
  {servicesList}
  
  <div class="section-title" style="margin-top: 25px;">Payment Summary</div>
  {paymentSummary}
</div>
<p style="text-align: center;">
  <a href="{myBookingsUrl}" class="button" style="color: #ffffff !important;">Manage Your Booking</a>
</p>`,
    isEnabled: true,
    placeholders: ["customerName", "bookingId", "siteName", "scheduledDate", "scheduledTimeSlot", "customerAddress", "servicesList", "paymentSummary", "myBookingsUrl"]
  },
  booking_confirmation_admin: {
    title: "New Booking Alert (Admin)",
    description: "Sent to the admin when a new booking is placed.",
    subject: "New Booking Received (ID: {bookingId})",
    body: `<p>A new booking has been made on {siteName}. Here are the full details:</p>
<div class="summary-box">
  <div class="section-title">Customer & Schedule</div>
  <ul style="list-style: none; padding: 0; margin: 0; font-size: 14px;">
    <li style="margin-bottom: 5px;"><strong>Booking ID:</strong> {bookingId}</li>
    <li style="margin-bottom: 5px;"><strong>Customer:</strong> {customerName}</li>
    <li style="margin-bottom: 5px;"><strong>Email:</strong> {customerEmail}</li>
    <li style="margin-bottom: 5px;"><strong>Phone:</strong> {customerPhone}</li>
    <li style="margin-bottom: 5px;"><strong>Scheduled:</strong> {scheduledDate} at {scheduledTimeSlot}</li>
    {addressBlock}
    <li style="margin-bottom: 5px; margin-top: 10px;"><strong>Payment:</strong> {paymentMethod}</li>
    <li style="margin-bottom: 5px;"><strong>Status:</strong> {status}</li>
    {assignedProviderBlock}
  </ul>
  
  <div class="section-title" style="margin-top: 25px;">Services Requested</div>
  {servicesList}
  
  <div class="section-title" style="margin-top: 25px;">Payment Details</div>
  {paymentSummary}
</div>
<p style="text-align: center;">
  <a href="{adminBookingsUrl}" class="button" style="color: #ffffff !important;">Open Admin Panel</a>
</p>`,
    isEnabled: true,
    placeholders: ["bookingId", "siteName", "customerName", "customerEmail", "customerPhone", "scheduledDate", "scheduledTimeSlot", "addressBlock", "paymentMethod", "status", "assignedProviderBlock", "servicesList", "paymentSummary", "adminBookingsUrl"]
  },
  booking_cancellation_customer: {
    title: "Booking Cancelled by Admin (Customer)",
    description: "Sent to the customer when a booking is cancelled by an administrator.",
    subject: "Booking Cancelled - #{bookingId}",
    body: `<p>Dear {customerName},</p>
<p>We regret to inform you that your booking #{bookingId} has been cancelled.</p>
{cancellationReasonBlock}
<p>If you did not request this cancellation, please note that it may have been cancelled by our system or service provider due to technician unavailability or service coverage limitations in your area. We sincerely apologize for the inconvenience and will try our best to serve you again soon.</p>
<p>If you have paid online, your refund will be processed within 7 working days.</p>`,
    isEnabled: true,
    placeholders: ["customerName", "bookingId", "cancellationReasonBlock"]
  },
  booking_cancellation_admin: {
    title: "Booking Cancelled Alert (Admin)",
    description: "Sent to the admin when a booking is cancelled by an administrator.",
    subject: "Booking Cancelled by Admin (ID: {bookingId})",
    body: `<p>Booking ID <strong>{bookingId}</strong> for <strong>{customerName}</strong> was cancelled by an admin.</p>`,
    isEnabled: true,
    placeholders: ["bookingId", "customerName"]
  },
  booking_assigned_customer: {
    title: "Technician Assigned (Customer)",
    description: "Sent to the customer when a technician is assigned to their booking.",
    subject: "Technician Assigned to your Booking (ID: {bookingId})",
    body: `<p>Hi {customerName},</p>
<p>We have successfully assigned a service professional to your booking (ID: <strong>{bookingId}</strong>).</p>
<div class="summary-box">
  <div class="section-title">Technician Details</div>
  <p style="margin: 5px 0;"><strong>Name:</strong> {providerName}</p>
  <p style="margin: 5px 0; margin-top: 15px;"><strong>Scheduled Time:</strong> {scheduledDate} at {scheduledTimeSlot}</p>
</div>
<p style="text-align: center; margin-top: 30px;">
  <a href="{myBookingsUrl}" class="button" style="color: #ffffff !important;">View Booking Details</a>
</p>`,
    isEnabled: true,
    placeholders: ["customerName", "bookingId", "providerName", "scheduledDate", "scheduledTimeSlot", "myBookingsUrl"]
  },
  booking_assigned_admin: {
    title: "Provider Assigned Alert (Admin)",
    description: "Sent to the admin when a provider is assigned to a booking.",
    subject: "Provider Assigned to Booking (ID: {bookingId})",
    body: `<p>Booking ID <strong>{bookingId}</strong> has been successfully assigned to provider <strong>{providerName}</strong>.</p>
<p style="margin-top: 20px;">
  <a href="{adminBookingsUrl}" class="button" style="color: #ffffff !important;">Open Admin Panel</a>
</p>`,
    isEnabled: true,
    placeholders: ["bookingId", "providerName", "adminBookingsUrl"]
  },
  booking_status_update_customer: {
    title: "Booking Status Updated (Customer)",
    description: "Sent to the customer when their booking status changes.",
    subject: "Update on your {siteName} booking (ID: {bookingId})",
    body: `<p>Hi {customerName},</p>
<p>The status of your service booking (ID: <strong>{bookingId}</strong>) has been updated to: <strong>{status}</strong>.</p>
<p style="text-align: center; margin-top: 30px;">
  <a href="{myBookingsUrl}" class="button" style="color: #ffffff !important;">View Booking Status</a>
</p>`,
    isEnabled: true,
    placeholders: ["customerName", "siteName", "bookingId", "status", "myBookingsUrl"]
  },
  booking_status_update_admin: {
    title: "Booking Status Updated Alert (Admin)",
    description: "Sent to the admin when a booking status changes.",
    subject: "Booking Status Updated (ID: {bookingId})",
    body: `<p>Booking ID <strong>{bookingId}</strong> status changed to <strong>{status}</strong>.</p>`,
    isEnabled: true,
    placeholders: ["bookingId", "status"]
  },
  provider_assignment: {
    title: "New Job Assigned (Provider)",
    description: "Sent to a provider when a job is assigned to them.",
    subject: "New Job Assigned - #{bookingId}",
    body: `<p>Hi {providerName},</p>
<p>A new job has been successfully assigned to you on {siteName}. Here are the service details:</p>
<div class="summary-box">
  <div class="section-title">Schedule & Details</div>
  <p style="margin: 5px 0;"><strong>Booking ID:</strong> {bookingId}</p>
  <p style="margin: 5px 0;"><strong>Scheduled Date:</strong> {scheduledDate}</p>
  <p style="margin: 5px 0;"><strong>Scheduled Time:</strong> {scheduledTimeSlot}</p>
  
  <div class="section-title" style="margin-top: 20px;">Customer Contact & Address</div>
  <p style="margin: 5px 0;"><strong>Name:</strong> {customerName}</p>
  <p style="margin: 5px 0;"><strong>Phone:</strong> {customerPhone}</p>
  <p style="margin: 5px 0;"><strong>Address:</strong> {customerAddress}</p>
  
  <div class="section-title" style="margin-top: 20px;">Service Requested</div>
  <p style="margin: 5px 0;">{serviceName}</p>
</div>
<p style="text-align: center; margin-top: 30px;">
  <a href="{providerDashboardUrl}" class="button" style="color: #ffffff !important;">Open Provider Panel</a>
</p>`,
    isEnabled: true,
    placeholders: ["providerName", "siteName", "bookingId", "scheduledDate", "scheduledTimeSlot", "customerName", "customerPhone", "customerAddress", "serviceName", "providerDashboardUrl"]
  },
  user_cancellation_customer: {
    title: "User Booking Cancellation (Customer)",
    description: "Sent to the customer when they cancel their booking.",
    subject: "Booking Cancellation Confirmation #{bookingId}",
    body: `<p>Dear {customerName},</p>
<p>Your booking #{bookingId} has been cancelled as per your request.</p>
<p>If you have any questions, please contact our support team.</p>
{paymentInfoHtml}
<p>Regards,<br>The {siteName} Team</p>`,
    isEnabled: true,
    placeholders: ["customerName", "bookingId", "paymentInfoHtml", "siteName"]
  },
  user_cancellation_admin: {
    title: "User Booking Cancellation Alert (Admin)",
    description: "Sent to the admin when a customer cancels their booking.",
    subject: "Booking Cancelled by User (ID: {bookingId})",
    body: `<p>Booking ID <strong>{bookingId}</strong> for <strong>{customerName}</strong> was cancelled by the user.</p>
<p>The user has been notified with the relevant payment/refund details.</p>`,
    isEnabled: true,
    placeholders: ["bookingId", "customerName"]
  },
  inquiry_reply: {
    title: "Contact Inquiry Reply (Customer)",
    description: "Sent to a user when the admin replies to their contact message.",
    subject: "Re: {originalSubject}",
    body: `<p>Hi {userName},</p>
<p>{replyMessage}</p>
<div style="margin-top: 25px; padding: 15px; border-left: 3px solid #ccc; background: #f9f9f9; font-style: italic;">
  <p style="margin: 0; font-weight: bold; color: #555;">Original Message:</p>
  <p style="margin: 5px 0 0 0;">{originalMessage}</p>
</div>
<p>Regards,<br>The {siteName} Team</p>`,
    isEnabled: true,
    placeholders: ["userName", "replyMessage", "originalMessage", "originalSubject", "siteName"]
  },
  custom_service_request: {
    title: "Custom Service Request Received (Customer)",
    description: "Sent to the customer when they submit a custom service request.",
    subject: "Custom Service Request Received",
    body: `<p>Hi {userName},</p>
<p>Thank you for reaching out to {siteName}!</p>
<p>We have successfully received your custom service request details for <strong>{serviceName}</strong>. Our support team is currently reviewing your request and will contact you shortly with technician details and price quotations.</p>
<div class="summary-box">
  <div class="section-title">Request Summary</div>
  <p style="margin: 5px 0;"><strong>Category/Service:</strong> {serviceName}</p>
  <p style="margin: 5px 0;"><strong>Preferred Date:</strong> {preferredDate}</p>
  <p style="margin: 5px 0;"><strong>Preferred Time Slot:</strong> {preferredTimeSlot}</p>
</div>
<p>Regards,<br>The {siteName} Team</p>`,
    isEnabled: true,
    placeholders: ["userName", "siteName", "serviceName", "preferredDate", "preferredTimeSlot"]
  },
  provider_registration_admin: {
    title: "New Provider Application Notification (Admin)",
    description: "Sent to the admin when a new provider registers.",
    subject: "New Provider Application Submitted",
    body: `<p>Hello Admin,</p>
<p>A new provider has submitted an application to join the {siteName} platform.</p>
<div class="summary-box">
  <div class="section-title">Application Summary</div>
  <p style="margin: 5px 0;"><strong>Provider Name:</strong> {providerName}</p>
  <p style="margin: 5px 0;"><strong>Email Address:</strong> {providerEmail}</p>
  <p style="margin: 5px 0;"><strong>Category:</strong> {providerCategory}</p>
</div>
<p style="text-align: center; margin-top: 25px;">
  <a href="{applicationUrl}" class="button" style="color: #ffffff !important;">Review Application</a>
</p>`,
    isEnabled: true,
    placeholders: ["siteName", "providerName", "providerEmail", "providerCategory", "applicationUrl"]
  },
  provider_status_update: {
    title: "Provider Application Status Update (Provider)",
    description: "Sent to a provider when their application is approved or rejected.",
    subject: "Provider Application {status}",
    body: `<p>Hi {providerName},</p>
{statusContentBlock}
<p>If you have any questions or require support, please reply to this email or contact us.</p>
<p>Regards,<br>The {siteName} Team</p>`,
    isEnabled: true,
    placeholders: ["providerName", "statusContentBlock", "siteName", "status"]
  },
  new_review_admin: {
    title: "New Review Notification (Admin)",
    description: "Sent to the admin when a customer submits a new review.",
    subject: "New Review Submitted",
    body: `<p>Hello Admin,</p>
<p>A customer has submitted a new review for a booking. Details below:</p>
<div class="summary-box">
  <div class="section-title">Review Details</div>
  <p style="margin: 5px 0;"><strong>Customer Name:</strong> {userName}</p>
  <p style="margin: 5px 0;"><strong>Rating:</strong> {rating} Stars</p>
  <p style="margin: 5px 0;"><strong>Comments:</strong> {comment}</p>
</div>`,
    isEnabled: true,
    placeholders: ["userName", "rating", "comment"]
  },
  support_request: {
    title: "Human Support Requested Alert (Admin)",
    description: "Sent to the admin when a user requests human assistance in the AI chat.",
    subject: "🚨 Human Support Required: {userName}",
    body: `<p>A user has requested human assistance during an AI chat session on {siteName}.</p>
<div class="summary-box">
    <div class="section-title">User Details</div>
    <p><strong>Name:</strong> {userName}</p>
    <p><strong>Email:</strong> {userEmail}</p>
    <p><strong>User ID:</strong> {userId}</p>
</div>
<div class="summary-box">
    <div class="section-title">Last Message From User</div>
    <p style="font-style: italic; color: #555;">"{lastMessage}"</p>
</div>
<p>Please join the chat immediately to assist the user:</p>
<p style="text-align: center;"><a href="{chatUrl}" class="button" style="color: #ffffff !important;">Open Admin Chat</a></p>`,
    isEnabled: true,
    placeholders: ["userName", "userEmail", "userId", "lastMessage", "chatUrl", "siteName"]
  },
  account_disabled: {
    title: "Account Suspended (User)",
    description: "Sent to a user when their account is deactivated/blocked.",
    subject: "Account Suspended - {siteName}",
    body: `<p>Hi {userName},</p>
<p>We are writing to inform you that your account on <strong>{siteName}</strong> has been suspended/disabled by the administrator.</p>
<p>Consequently, you will not be able to log in or book services. If you believe this is a mistake or would like to request reactivation, please contact our support team at <a href="mailto:{supportEmail}">{supportEmail}</a>.</p>
<p>Regards,<br>The {siteName} Team</p>`,
    isEnabled: true,
    placeholders: ["userName", "siteName", "supportEmail"]
  },
  account_activated: {
    title: "Account Reactivated (User)",
    description: "Sent to a user when their account is unblocked/activated.",
    subject: "Account Reactivated - {siteName}",
    body: `<p>Hi {userName},</p>
<p>We are pleased to inform you that your account on <strong>{siteName}</strong> has been successfully activated/unblocked!</p>
<p>You can now log in, manage your bookings, and access all services on our platform.</p>
<p><a href="{loginUrl}" class="button" style="color: #ffffff !important;">Log In to Your Account</a></p>
<p>Regards,<br>The {siteName} Team</p>`,
    isEnabled: true,
    placeholders: ["userName", "siteName", "loginUrl"]
  }
};

export async function getEmailTemplatesAction(): Promise<EmailTemplate[]> {
  try {
    const list: EmailTemplate[] = [];
    const colRef = adminDb.collection('email_templates');
    const snap = await colRef.get();
    
    const dbTemplates = new Map<string, any>();
    snap.forEach(doc => {
      dbTemplates.set(doc.id, doc.data());
    });

    for (const key of Object.keys(DEFAULT_TEMPLATES)) {
      const def = DEFAULT_TEMPLATES[key];
      const dbVal = dbTemplates.get(key);
      
      list.push({
        id: key,
        title: dbVal?.title || def.title,
        description: dbVal?.description || def.description,
        subject: dbVal?.subject !== undefined ? dbVal.subject : def.subject,
        body: dbVal?.body !== undefined ? dbVal.body : def.body,
        isEnabled: dbVal?.isEnabled !== undefined ? dbVal.isEnabled : def.isEnabled,
        placeholders: def.placeholders
      });
    }

    return list;
  } catch (error) {
    console.error("Error fetching email templates:", error);
    return Object.keys(DEFAULT_TEMPLATES).map(key => ({
      id: key,
      ...DEFAULT_TEMPLATES[key]
    }));
  }
}

export async function updateEmailTemplateAction(id: string, isEnabled: boolean, subject: string, body: string): Promise<{ success: boolean; message: string }> {
  try {
    const def = DEFAULT_TEMPLATES[id];
    if (!def) {
      return { success: false, message: "Template not found." };
    }

    const docRef = adminDb.collection('email_templates').doc(id);
    await docRef.set({
      title: def.title,
      description: def.description,
      subject,
      body,
      isEnabled,
      updatedAt: new Date()
    }, { merge: true });

    triggerRefresh('/admin/email-settings');
    return { success: true, message: "Template updated successfully." };
  } catch (error: any) {
    console.error("Error updating email template:", error);
    return { success: false, message: error.message || "Failed to update template." };
  }
}

export async function resetEmailTemplateAction(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const def = DEFAULT_TEMPLATES[id];
    if (!def) {
      return { success: false, message: "Template not found." };
    }

    const docRef = adminDb.collection('email_templates').doc(id);
    await docRef.delete();

    triggerRefresh('/admin/email-settings');
    return { success: true, message: "Template reset to defaults." };
  } catch (error: any) {
    console.error("Error resetting email template:", error);
    return { success: false, message: error.message || "Failed to reset template." };
  }
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate> {
  const def = DEFAULT_TEMPLATES[id];
  if (!def) {
    throw new Error(`Template config for ${id} not found.`);
  }

  try {
    const docRef = adminDb.collection('email_templates').doc(id);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        id,
        title: data.title || def.title,
        description: data.description || def.description,
        subject: data.subject !== undefined ? data.subject : def.subject,
        body: data.body !== undefined ? data.body : def.body,
        isEnabled: data.isEnabled !== undefined ? data.isEnabled : def.isEnabled,
        placeholders: def.placeholders
      };
    }
  } catch (err) {
    console.error(`Error reading email template ${id}:`, err);
  }

  return {
    id,
    ...def
  };
}

export async function sendTestEmailAction(id: string, adminEmail: string): Promise<{ success: boolean; message: string }> {
  try {
    const template = await getEmailTemplate(id);
    const configSnap = await adminDb.collection('webSettings').doc('applicationConfig').get();
    const appConfig = configSnap.exists ? configSnap.data() as any : {};
    
    const smtpHost = appConfig.smtpHost;
    const smtpPort = appConfig.smtpPort;
    const smtpUser = appConfig.smtpUser;
    const smtpPass = appConfig.smtpPass;
    const senderEmail = appConfig.senderEmail;
    
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass || !senderEmail) {
      return { success: false, message: "SMTP configuration is incomplete in Web Settings." };
    }
    
    const portNumber = parseInt(smtpPort, 10);
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: portNumber,
      secure: portNumber === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });
    
    // Create dummy/test values for placeholders
    const testVariables: any = {
      providerName: "Test Provider Name",
      siteName: appConfig.siteName || "Yourbrand",
      bookingId: "FB-TEST12345",
      scheduledDate: "24/08/2026",
      scheduledTimeSlot: "10:00 AM",
      customerName: "Test Customer Name",
      customerAddress: "123 Test Street, Area Name, City Name",
      customerPhone: "+919876543210",
      serviceName: "Test Cleaning & Service (x1)",
      providerDashboardUrl: `${getBaseUrl()}/provider/booking/test-id`,
      userName: "Test User",
      categoriesUrl: `${getBaseUrl()}/categories`,
      supportTicketId: "SUP-998877",
      supportSubject: "Test Support Ticket Subject",
      supportMessage: "This is a test message to support.",
      replyContent: "This is a test reply from operations.",
      amount: "100.00",
      adminFee: "20.00"
    };
    
    // Replaces other potential placeholders in other email templates
    template.placeholders.forEach(p => {
      if (!testVariables[p]) {
        testVariables[p] = `[Test ${p}]`;
      }
    });

    const emailSubject = "[TEST EMAIL] " + replacePlaceholders(template.subject, testVariables);
    const emailBodyContent = replacePlaceholders(template.body, testVariables);
    
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; padding: 20px; background-color: #F8F9FA; font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 25px; border-radius: 10px; border: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <h2>${emailSubject}</h2>
        ${emailBodyContent}
    </div>
</body>
</html>
    `;
    
    await transporter.sendMail({
      from: `${appConfig.siteName || "Yourbrand"} Operations <${senderEmail}>`,
      to: adminEmail,
      subject: emailSubject,
      html: htmlBody
    });
    
    return { success: true, message: `Test email sent successfully to ${adminEmail}` };
  } catch (error: any) {
    console.error("Error sending test email:", error);
    return { success: false, message: error.message || "Failed to send test email." };
  }
}
