// src/app/api/send-push/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

import { getPushTemplate } from '@/app/actions/pushSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';

// Initialize messaging only once
let messaging: admin.messaging.Messaging;
try {
    messaging = admin.messaging();
} catch (e) {
    // If not already initialized, the adminDb import should have handled app init.
    // If somehow it's not ready, we can't send.
}

function determinePushType(title: string): string {
  const lowerTitle = (title || "").toLowerCase();
  if (lowerTitle.includes('message') || lowerTitle.includes('chat')) {
    return 'chat_message';
  } else if (lowerTitle.includes('completed')) {
    return 'booking_completed';
  } else if (lowerTitle.includes('confirmed') || lowerTitle.includes('received')) {
    return 'booking_created';
  } else if (lowerTitle.includes('assigned')) {
    return 'provider_assigned';
  } else if (lowerTitle.includes('cancelled')) {
    return 'booking_cancelled';
  } else if (lowerTitle.includes('withdrawal')) {
    return 'withdrawal_status';
  } else if (lowerTitle.includes('review')) {
    return 'new_review';
  } else if (lowerTitle.includes('inquiry') || lowerTitle.includes('contact')) {
    return 'new_inquiry';
  } else if (lowerTitle.includes('custom')) {
    return 'custom_request';
  }
  return 'other';
}

export async function POST(request: Request) {
  try {
    const { userId, title, body, href, icon, sound, type: customType, variables } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let finalTitle = title;
    let finalBody = body;

    // Check if push notification category is enabled
    const pushType = customType || determinePushType(title);
    if (pushType !== 'other') {
      const template = await getPushTemplate(pushType);
      if (!template.isEnabled) {
        console.log(`Push notification type "${pushType}" is disabled in settings. Skipping dispatch.`);
        return NextResponse.json({ success: true, message: 'Push notification is disabled in settings.' });
      }

      // If database has override templates, replace placeholders
      if (template.subject && template.body) {
        const mergedVariables = {
          title,
          body,
          ...(variables || {})
        };
        finalTitle = replacePlaceholders(template.subject, mergedVariables);
        finalBody = replacePlaceholders(template.body, mergedVariables);
      }
    }

    // 1. Get user's FCM tokens from Firestore
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data();
    const fcmTokensObj = userData?.fcmTokens || {};
    const tokens = Object.keys(fcmTokensObj);

    if (tokens.length === 0) {
      return NextResponse.json({ error: 'No FCM tokens found for this user' }, { status: 200 });
    }

    // 2. Prepare the message
    const messagePayload = {
      notification: {
        title: finalTitle,
        body: finalBody,
      },
      data: {
        click_action: href || '/',
        icon: icon || '/android-chrome-192x192.png',
        sound: sound || 'default', // Pass internal sound identifier
      },
      // Essential for background handling in modern browsers
      webpush: {
        notification: {
          title: finalTitle,
          body: finalBody,
          icon: icon || '/android-chrome-192x192.png',
          data: {
            url: href || '/',
            sound: sound || 'default',
          }
        }
      }
    };

    // 3. Send to all registered tokens for this user
    const sendPromises = tokens.map(token => 
      messaging.send({
        ...messagePayload,
        token,
      }).catch(async (err: any) => {
        console.error(`Failed to send push to token ${token}:`, err);
        
        // Handle dead or invalid tokens
        const isDeadToken = 
            err.code === 'messaging/registration-token-not-registered' || 
            err.code === 'messaging/invalid-argument' ||
            err.message?.includes('unregistered') ||
            err.message?.includes('registration-token-not-registered') ||
            err.message?.includes('invalid-argument') ||
            err.errorInfo?.code === 'messaging/registration-token-not-registered';

        if (isDeadToken) {
            console.log(`Token ${token} is no longer valid. Deleting from Firestore for user ${userId}...`);
            try {
                await adminDb.collection('users').doc(userId).update({
                    [`fcmTokens.${token}`]: admin.firestore.FieldValue.delete()
                });
                console.log(`Successfully removed dead token ${token} for user ${userId}`);
            } catch (deleteErr) {
                console.error(`Failed to delete dead token ${token} from Firestore:`, deleteErr);
            }
        }
        return null;
      })
    );

    await Promise.all(sendPromises);

    return NextResponse.json({ success: true, message: `Push sent to ${tokens.length} devices.` });

  } catch (error: any) {
    console.error('Error in send-push API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
