'use server';

import { adminDb } from '@/lib/firebaseAdmin';
import { getGlobalAppSettings } from '@/lib/webServerUtils';
import { triggerRefresh } from '@/lib/revalidateUtils';
import nodemailer from 'nodemailer';
import * as admin from 'firebase-admin';
import { getAccountDisabledEmailHtml, getAccountActivatedEmailHtml, createHtmlTemplate } from '@/lib/accountStatusEmailTemplates';
import { getEmailTemplate } from '@/app/actions/emailSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getBaseUrl } from '@/lib/config';

interface ActionResponse {
  success: boolean;
  message: string;
}

export async function toggleUserStatusAction(userId: string, currentStatus: boolean): Promise<ActionResponse> {
  if (!userId) {
    return { success: false, message: "User ID is required." };
  }

  const newStatus = !currentStatus;

  try {
    // 1. Fetch user data from DB
    const userDocRef = adminDb.collection('users').doc(userId);
    const userDocSnap = await userDocRef.get();

    if (!userDocSnap.exists) {
      return { success: false, message: "User not found." };
    }

    const userData = userDocSnap.data() || {};
    const userName = userData.displayName || "User";
    const userEmail = userData.email;

    // 2. Update user status in database
    await userDocRef.update({ isActive: newStatus });
    await triggerRefresh('users');

    // 3. Load global settings configuration
    const appConfig = await getGlobalAppSettings();

    const siteName = appConfig?.websiteName || process.env.NEXT_PUBLIC_WEBSITE_NAME || "Yourbrand";
    const logoUrl = appConfig?.logoUrl;
    const contactEmail = appConfig?.contactEmail || appConfig?.senderEmail;

    // 4. Handle Disabling Flow
    if (newStatus === false) {
      // A. Create In-App Notification document
      const notificationTitle = "Account Disabled";
      const notificationMessage = "Your account has been disabled. Please contact support for assistance.";
      
      await adminDb.collection('userNotifications').add({
        userId: userId,
        title: notificationTitle,
        message: notificationMessage,
        type: "alert",
        href: "/auth/login",
        read: false,
        createdAt: new Date()
      });

      // B. Send Firebase Push Notification
      const fcmTokensObj = userData.fcmTokens || {};
      const tokens = Object.keys(fcmTokensObj);

      if (tokens.length > 0) {
        try {
          const messaging = admin.messaging();
          const messagePayload = {
            notification: {
              title: notificationTitle,
              body: notificationMessage,
            },
            data: {
              click_action: '/auth/login',
              icon: logoUrl || '/android-chrome-192x192.png',
              sound: 'default',
            },
            webpush: {
              notification: {
                title: notificationTitle,
                body: notificationMessage,
                icon: logoUrl || '/android-chrome-192x192.png',
                data: {
                  url: '/auth/login',
                  sound: 'default',
                }
              }
            }
          };

          const sendPromises = tokens.map(token => 
            messaging.send({
              ...messagePayload,
              token,
            }).catch(async (err: any) => {
              console.error(`Failed to send account disabled push to token ${token}:`, err);
              const isDeadToken = 
                  err.code === 'messaging/registration-token-not-registered' || 
                  err.code === 'messaging/invalid-argument' ||
                  err.message?.includes('unregistered') ||
                  err.message?.includes('registration-token-not-registered') ||
                  err.message?.includes('invalid-argument') ||
                  err.errorInfo?.code === 'messaging/registration-token-not-registered';

              if (isDeadToken) {
                  try {
                      await userDocRef.update({
                          [`fcmTokens.${token}`]: admin.firestore.FieldValue.delete()
                      });
                  } catch (deleteErr) {
                      console.error(`Failed to delete dead FCM token ${token}:`, deleteErr);
                  }
              }
              return null;
            })
          );

          await Promise.all(sendPromises);
        } catch (pushError) {
          console.error("Firebase admin messaging error:", pushError);
        }
      }

      // C. Send SMTP Email (If enabled in settings)
      const template = await getEmailTemplate('account_disabled');
      if (template.isEnabled && userEmail) {
        const smtpHost = appConfig?.smtpHost;
        const smtpPort = appConfig?.smtpPort;
        const smtpUser = appConfig?.smtpUser;
        const smtpPass = appConfig?.smtpPass;
        const senderEmail = appConfig?.senderEmail;

        const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

        if (canAttemptRealEmail) {
          const portNumber = parseInt(smtpPort, 10);
          if (!isNaN(portNumber)) {
            try {
              const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: portNumber,
                secure: portNumber === 465,
                auth: { user: smtpUser, pass: smtpPass },
              });

              const variables = {
                userName,
                siteName,
                supportEmail: contactEmail || "support@yourdomain.com"
              };

              const emailSubject = replacePlaceholders(template.subject, variables);
              const emailBodyContent = replacePlaceholders(template.body, variables);
              const emailHtml = createHtmlTemplate("Account Disabled", emailBodyContent, siteName, logoUrl);

              await transporter.sendMail({
                from: `${siteName} <${senderEmail}>`,
                to: userEmail,
                subject: emailSubject,
                html: emailHtml,
              });
            } catch (emailError) {
              console.error("Failed to send account disabled email:", emailError);
            }
          }
        } else {
          console.warn("SMTP settings are incomplete. Could not send account disabled email.");
        }
      }
    }

    // 5. Handle Activation Flow
    if (newStatus === true) {
      // Send SMTP Email (If enabled in settings)
      const template = await getEmailTemplate('account_activated');
      if (template.isEnabled && userEmail) {
        const smtpHost = appConfig?.smtpHost;
        const smtpPort = appConfig?.smtpPort;
        const smtpUser = appConfig?.smtpUser;
        const smtpPass = appConfig?.smtpPass;
        const senderEmail = appConfig?.senderEmail;

        const canAttemptRealEmail = smtpHost && smtpPort && smtpUser && smtpPass && senderEmail;

        if (canAttemptRealEmail) {
          const portNumber = parseInt(smtpPort, 10);
          if (!isNaN(portNumber)) {
            try {
              const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: portNumber,
                secure: portNumber === 465,
                auth: { user: smtpUser, pass: smtpPass },
              });

              const loginUrl = `${getBaseUrl()}/auth/login`;
              const variables = {
                userName,
                siteName,
                loginUrl
              };

              const emailSubject = replacePlaceholders(template.subject, variables);
              const emailBodyContent = replacePlaceholders(template.body, variables);
              const emailHtml = createHtmlTemplate("Account Activated", emailBodyContent, siteName, logoUrl);

              await transporter.sendMail({
                from: `${siteName} <${senderEmail}>`,
                to: userEmail,
                subject: emailSubject,
                html: emailHtml,
              });
            } catch (emailError) {
              console.error("Failed to send account activated email:", emailError);
            }
          }
        } else {
          console.warn("SMTP settings are incomplete. Could not send account activated email.");
        }
      }
    }

    return { success: true, message: `User account is now ${newStatus ? 'Active' : 'Disabled'}.` };

  } catch (error: any) {
    console.error("Error toggling user status in action:", error);
    return { success: false, message: error.message || "Failed to update user status." };
  }
}
