'use server';

import { adminDb } from '@/lib/firebaseAdmin';
import { triggerRefresh } from '@/lib/revalidateUtils';
import * as admin from 'firebase-admin';
import { getBaseUrl } from '@/lib/config';
import { replacePlaceholders } from '@/lib/seoUtils';

export interface PushTemplate {
  id: string;
  title: string;
  description: string;
  subject: string;
  body: string;
  isEnabled: boolean;
  placeholders: string[];
}

const DEFAULT_PUSH_TEMPLATES: Record<string, Omit<PushTemplate, 'id'>> = {
  booking_created: {
    title: "Booking Created",
    description: "New booking alerts triggered when a service is scheduled (User & Admin).",
    subject: "Booking Confirmed! (ID: {bookingId})",
    body: "Your booking (ID: {bookingId}) has been successfully received.",
    isEnabled: true,
    placeholders: ["bookingId", "customerName", "siteName"]
  },
  booking_cancelled: {
    title: "Booking Cancelled",
    description: "Booking cancellation alerts (User & Admin).",
    subject: "Booking Cancelled - #{bookingId}",
    body: "We regret to inform you that your booking #{bookingId} has been cancelled.",
    isEnabled: true,
    placeholders: ["bookingId", "customerName", "siteName"]
  },
  provider_assigned: {
    title: "Technician Assigned",
    description: "Technician assignment notifications (User & Provider).",
    subject: "Technician Assigned (ID: {bookingId})",
    body: "Technician {providerName} has been assigned to your booking.",
    isEnabled: true,
    placeholders: ["bookingId", "providerName", "customerName", "siteName"]
  },
  booking_completed: {
    title: "Service Completed",
    description: "Service completion alerts (User & Admin).",
    subject: "Your Service Completed! (ID: {bookingId})",
    body: "We're pleased to inform you that your service booking has been completed.",
    isEnabled: true,
    placeholders: ["bookingId", "customerName", "siteName"]
  },
  chat_message: {
    title: "Real-time Chat",
    description: "Real-time chat message alerts (User, Admin & Provider).",
    subject: "New Message from {senderName}",
    body: "{messageText}",
    isEnabled: true,
    placeholders: ["senderName", "messageText", "siteName"]
  },
  new_review: {
    title: "Customer Review",
    description: "New customer review alerts (Admin).",
    subject: "New Review Submitted!",
    body: "A review was submitted by {customerName} for {serviceName}.",
    isEnabled: true,
    placeholders: ["customerName", "serviceName", "rating", "comment"]
  },
  new_inquiry: {
    title: "Contact Inquiry",
    description: "Contact form inquiry alerts (Admin).",
    subject: "New Inquiry: {subject}",
    body: "A new inquiry was received from {name}.",
    isEnabled: true,
    placeholders: ["name", "email", "subject", "message"]
  },
  custom_request: {
    title: "Custom Service Request",
    description: "Custom service request submissions (Admin).",
    subject: "New Custom Request Received",
    body: "Customer {customerName} has requested a custom service.",
    isEnabled: true,
    placeholders: ["customerName", "serviceName", "preferredDate"]
  },
  withdrawal_status: {
    title: "Provider Withdrawal",
    description: "Provider withdrawal request and status updates (Admin & Provider).",
    subject: "Withdrawal {status}",
    body: "Your withdrawal request for amount {amount} has been {status}.",
    isEnabled: true,
    placeholders: ["providerName", "amount", "status"]
  },
  referral_signup_bonus: {
    title: "Referral Signup Welcome Bonus",
    description: "Push alert sent to a user when they sign up with a referral code and earn welcome credit.",
    subject: "Welcome Reward!",
    body: "You received a {amount} welcome bonus in your wallet!",
    isEnabled: true,
    placeholders: ["amount", "siteName"]
  },
  referral_reward_completed: {
    title: "Referral Reward Credited",
    description: "Push alert sent to the referrer when their referred friend completes their first service booking.",
    subject: "Referral Bonus Credited!",
    body: "Your friend {friendName} completed their first booking. {currencySymbol}{amount} has been added to your wallet.",
    isEnabled: true,
    placeholders: ["friendName", "amount", "currencySymbol"]
  },
  provider_wallet_deposit: {
    title: "Provider Wallet Top-up",
    description: "Push notification sent to provider when they successfully top up their prepaid wallet.",
    subject: "Wallet Deposited!",
    body: "Successfully added {currencySymbol}{amount} to your prepaid wallet. New balance: {currencySymbol}{balance}.",
    isEnabled: true,
    placeholders: ["amount", "balance", "currencySymbol"]
  },
  admin_provider_deposit_alert: {
    title: "Admin: Provider Wallet Deposit Alert",
    description: "Push notification alert sent to admins when a provider successfully tops up their wallet.",
    subject: "Provider Wallet Deposit",
    body: "Provider {providerName} added {currencySymbol}{amount} to their wallet. New balance: {currencySymbol}{balance}.",
    isEnabled: true,
    placeholders: ["providerName", "amount", "balance", "currencySymbol"]
  },
  provider_wallet_refund: {
    title: "Provider Wallet Refund/Adjustment",
    description: "Push notification sent to provider when the admin manually adjusts or refunds their prepaid wallet.",
    subject: "Wallet Adjusted!",
    body: "Your prepaid wallet has been adjusted by {currencySymbol}{amount}. Reason: {reason}.",
    isEnabled: true,
    placeholders: ["amount", "reason", "currencySymbol"]
  },
  admin_wallet_complaint_alert: {
    title: "Admin: Provider Wallet Dispute Alert",
    description: "Push notification alert sent to admins when a provider submits a wallet refund/dispute complaint.",
    subject: "New Wallet Dispute Filed",
    body: "Provider {providerName} filed a dispute for booking #{bookingHumanId} (Amount: {currencySymbol}{amount}).",
    isEnabled: true,
    placeholders: ["providerName", "bookingHumanId", "amount", "currencySymbol"]
  }
};

export async function getPushTemplatesAction(): Promise<PushTemplate[]> {
  try {
    const colRef = adminDb.collection('push_templates');
    const snap = await colRef.get();
    
    const dbTemplates = new Map<string, any>();
    snap.forEach(doc => {
      dbTemplates.set(doc.id, doc.data());
    });

    const templatesList: PushTemplate[] = [];
    for (const [id, def] of Object.entries(DEFAULT_PUSH_TEMPLATES)) {
      if (!dbTemplates.has(id)) {
        await colRef.doc(id).set({
          title: def.title,
          description: def.description,
          subject: def.subject,
          body: def.body,
          isEnabled: def.isEnabled
        });
        templatesList.push({ id, ...def });
      } else {
        const data = dbTemplates.get(id);
        templatesList.push({
          id,
          title: data.title || def.title,
          description: data.description || def.description,
          subject: data.subject !== undefined ? data.subject : def.subject,
          body: data.body !== undefined ? data.body : def.body,
          isEnabled: data.isEnabled !== false,
          placeholders: def.placeholders
        });
      }
    }

    return templatesList;
  } catch (err) {
    console.error("Failed to load push templates:", err);
    return Object.entries(DEFAULT_PUSH_TEMPLATES).map(([id, def]) => ({
      id,
      ...def
    }));
  }
}

export async function togglePushTemplateAction(id: string, isEnabled: boolean): Promise<{ success: boolean; message: string }> {
  try {
    const docRef = adminDb.collection('push_templates').doc(id);
    await docRef.update({ isEnabled });
    triggerRefresh('/admin/push-settings');
    return { success: true, message: `Notification settings updated.` };
  } catch (err: any) {
    console.error(`Failed to update push template ${id}:`, err);
    return { success: false, message: err.message || "Failed to update notification settings." };
  }
}

export async function updatePushTemplateAction(
  id: string,
  isEnabled: boolean,
  subject: string,
  body: string
): Promise<{ success: boolean; message: string }> {
  try {
    const docRef = adminDb.collection('push_templates').doc(id);
    await docRef.update({
      isEnabled,
      subject,
      body
    });
    triggerRefresh('/admin/push-settings');
    return { success: true, message: "Template updated successfully." };
  } catch (error: any) {
    console.error("Error updating push template:", error);
    return { success: false, message: error.message || "Failed to update template." };
  }
}

export async function resetPushTemplateAction(id: string): Promise<{ success: boolean; message: string }> {
  try {
    const def = DEFAULT_PUSH_TEMPLATES[id];
    if (!def) {
      return { success: false, message: "Template not found." };
    }

    const docRef = adminDb.collection('push_templates').doc(id);
    await docRef.update({
      subject: def.subject,
      body: def.body,
      isEnabled: def.isEnabled
    });

    triggerRefresh('/admin/push-settings');
    return { success: true, message: "Template reset to defaults." };
  } catch (error: any) {
    console.error("Error resetting push template:", error);
    return { success: false, message: error.message || "Failed to reset template." };
  }
}

export async function getPushTemplate(id: string): Promise<PushTemplate> {
  const def = DEFAULT_PUSH_TEMPLATES[id];
  if (!def) {
    return { id, title: id, description: '', subject: '', body: '', isEnabled: true, placeholders: [] };
  }

  try {
    const docRef = adminDb.collection('push_templates').doc(id);
    const snap = await docRef.get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        id,
        title: data.title || def.title,
        description: data.description || def.description,
        subject: data.subject !== undefined ? data.subject : def.subject,
        body: data.body !== undefined ? data.body : def.body,
        isEnabled: data.isEnabled !== false,
        placeholders: def.placeholders
      };
    }
  } catch (err) {
    console.error(`Error reading push template ${id}:`, err);
  }

  return {
    id,
    ...def
  };
}

export interface MarketingUser {
  uid: string;
  name: string;
  email: string;
  role: string;
  hasToken: boolean;
}

export async function getMarketingUsersAction(): Promise<MarketingUser[]> {
  try {
    const snap = await adminDb.collection('users').get();
    const list: MarketingUser[] = [];
    snap.forEach(doc => {
      const data = doc.data();
      const fcmTokens = data.fcmTokens || {};
      const tokensCount = Object.keys(fcmTokens).length;
      if (tokensCount > 0) {
        list.push({
          uid: doc.id,
          name: data.displayName || data.name || "Unnamed User",
          email: data.email || "",
          role: data.role || "user",
          hasToken: true
        });
      }
    });
    return list;
  } catch (err) {
    console.error("Failed to fetch marketing users:", err);
    return [];
  }
}

export async function sendBulkPushNotificationAction(params: {
  target: 'all_users' | 'all_providers' | 'specific';
  selectedUids?: string[];
  title: string;
  body: string;
  href?: string;
  imageUrl?: string;
}): Promise<{ success: boolean; message: string; count: number }> {
  try {
    const { target, selectedUids, title, body, href, imageUrl } = params;
    
    // 1. Determine target uids
    let targetUids: string[] = [];
    
    if (target === 'specific') {
      targetUids = selectedUids || [];
    } else {
      const usersSnap = await adminDb.collection('users').get();
      usersSnap.forEach(doc => {
        const data = doc.data();
        const fcmTokens = data.fcmTokens || {};
        if (Object.keys(fcmTokens).length > 0) {
          const role = data.role || 'user';
          if (target === 'all_users') {
            targetUids.push(doc.id);
          } else if (target === 'all_providers' && (role === 'provider' || role === 'technician' || role === 'staff')) {
            targetUids.push(doc.id);
          }
        }
      });
    }

    if (targetUids.length === 0) {
      return { success: false, message: "No active target users with registered devices found.", count: 0 };
    }

    // 2. Fetch FCM tokens for all target UIDs
    const allTokens: string[] = [];
    const userDocs = await Promise.all(targetUids.map(uid => adminDb.collection('users').doc(uid).get()));
    
    const deadTokensToDelete: { uid: string; token: string }[] = [];
    
    userDocs.forEach(doc => {
      if (doc.exists) {
        const data = doc.data();
        const fcmTokensObj = data?.fcmTokens || {};
        Object.keys(fcmTokensObj).forEach(token => {
          allTokens.push(token);
        });
      }
    });

    if (allTokens.length === 0) {
      return { success: false, message: "No notification tokens found for selected users.", count: 0 };
    }

    // 3. Construct Message Payload
    const messagePayload = {
      notification: {
        title,
        body,
        image: imageUrl || undefined
      },
      data: {
        click_action: href || '/',
        icon: '/android-chrome-192x192.png',
      },
      webpush: {
        notification: {
          title,
          body,
          icon: '/android-chrome-192x192.png',
          image: imageUrl || undefined,
          data: {
            url: href || '/',
          }
        }
      }
    };

    // 4. Send notifications
    const messaging = admin.messaging();
    let successCount = 0;
    
    const sendPromises = allTokens.map(token => 
      messaging.send({
        ...messagePayload,
        token
      }).then(() => {
        successCount++;
      }).catch((err: any) => {
        console.error(`Failed to send push to token ${token}:`, err);
        const isDeadToken = 
            err.code === 'messaging/registration-token-not-registered' || 
            err.code === 'messaging/invalid-argument' ||
            err.message?.includes('unregistered') ||
            err.message?.includes('registration-token-not-registered') ||
            err.message?.includes('invalid-argument') ||
            err.errorInfo?.code === 'messaging/registration-token-not-registered';
        if (isDeadToken) {
          const ownerDoc = userDocs.find(doc => {
            const fcmTokensObj = doc.data()?.fcmTokens || {};
            return !!fcmTokensObj[token];
          });
          if (ownerDoc) {
            deadTokensToDelete.push({ uid: ownerDoc.id, token });
          }
        }
      })
    );

    await Promise.all(sendPromises);

    // 5. Cleanup dead tokens
    if (deadTokensToDelete.length > 0) {
      await Promise.all(deadTokensToDelete.map(item => 
        adminDb.collection('users').doc(item.uid).update({
          [`fcmTokens.${item.token}`]: admin.firestore.FieldValue.delete()
        }).catch(err => console.error("Failed to delete dead token:", err))
      ));
    }

    return { 
      success: true, 
      message: `Successfully sent push notifications to ${successCount} devices!`, 
      count: successCount 
    };

  } catch (err: any) {
    console.error("Bulk push failed:", err);
    return { success: false, message: err.message || "Failed to send notifications.", count: 0 };
  }
}

export async function sendTestPushAction(id: string, adminUid: string): Promise<{ success: boolean; message: string }> {
  try {
    const template = await getPushTemplate(id);
    
    const testVariables: any = {
      bookingId: "FB-TEST12345",
      customerName: "Test Customer Name",
      providerName: "Test Provider Name",
      scheduledDate: "24/08/2026",
      scheduledTimeSlot: "10:00 AM",
      totalAmount: "100.00",
      amount: "100.00",
      bonusAmount: "10.00",
      description: "Test wallet topup/bonus",
      complaintId: "CMP-776655",
      status: "resolved"
    };
    
    template.placeholders.forEach(p => {
      if (!testVariables[p]) {
        testVariables[p] = `[Test ${p}]`;
      }
    });

    const finalTitle = replacePlaceholders(template.subject, testVariables);
    const finalBody = replacePlaceholders(template.body, testVariables);

    const response = await fetch(`${getBaseUrl()}/api/send-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: adminUid,
        title: finalTitle,
        body: finalBody,
        href: '/admin/bookings',
        customType: id,
        variables: testVariables
      }),
    });

    const result = await response.json();
    if (result.error) {
      return { success: false, message: result.error };
    }
    
    return { success: true, message: `Test push sent successfully to admin user ID: ${adminUid}` };
  } catch (error: any) {
    console.error("Error sending test push:", error);
    return { success: false, message: error.message || "Failed to send test push notification." };
  }
}
