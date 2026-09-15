// src/app/api/send-push/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';

import { getPushTemplate } from '@/app/actions/pushSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
import { verifyRequest } from '@/lib/dbSecurity';

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
  } else if (lowerTitle.includes('confirmed') || lowerTitle.includes('received') || lowerTitle.includes('booking placed')) {
    return 'booking_created';
  } else if (lowerTitle.includes('assigned') || lowerTitle.includes('technician')) {
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
  } else if (lowerTitle.includes('referral') || lowerTitle.includes('welcome reward')) {
    return 'referral_reward_completed';
  } else if (lowerTitle.includes('deposit') || lowerTitle.includes('top-up')) {
    return 'provider_wallet_deposit';
  } else if (lowerTitle.includes('refund') || lowerTitle.includes('adjusted')) {
    return 'provider_wallet_refund';
  } else if (lowerTitle.includes('dispute') || lowerTitle.includes('complaint')) {
    return 'admin_wallet_complaint_alert';
  }
  return 'other';
}

export async function POST(request: Request) {
  try {
    // 1. Rate Limiting
    const rl = checkRateLimit(request, { max: 30, windowMs: 60 * 1000, keyPrefix: 'send-push' });
    if (!rl.allowed) {
      return rateLimitResponse(rl.resetTime);
    }

    // 2. Caller Authentication Verification
    const verification = await verifyRequest(request);
    if (!verification.isInternalBypass && !verification.isAdmin && !verification.userId) {
      return NextResponse.json({ error: 'Unauthorized: Authentication required to dispatch push notifications.' }, { status: 401 });
    }

    const { userId, title, body, href, icon, sound, type: customType, variables } = await request.json();

    if (!userId || !title || !body) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let finalTitle = title;
    let finalBody = body;

    // Infer smart defaults so templates always have values even if caller didn't pass variables
    const inferredSender = title.replace(/^(?:New )?(?:Chat )?Message from /i, '').trim();
    const inferredCustomer = body.match(/From\s+([^(\n]+)/i)?.[1]?.trim() || '';
    const inferredServiceName = body.match(/for:\s*([^\n]+)/i)?.[1]?.trim() || '';
    const inferredBookingId = (body.match(/#?([A-Z0-9-]{4,15})/i)?.[1]) || '';

    const smartVariables: Record<string, string> = {
      title,
      body,
      siteName: process.env.NEXT_PUBLIC_APP_NAME || 'Yourbrand',
      senderName: inferredSender || 'Support',
      customerName: inferredCustomer || 'Customer',
      name: inferredCustomer || inferredSender || 'Customer',
      messageText: body,
      message: body,
      subject: title,
      serviceName: inferredServiceName || 'Requested Service',
      bookingId: inferredBookingId || '',
      ...(variables || {})
    };

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
        const templatedTitle = replacePlaceholders(template.subject, smartVariables);
        const templatedBody = replacePlaceholders(template.body, smartVariables);

        // If template produced unreplaced placeholders (e.g. {unknownVar}), fall back to original title/body
        finalTitle = (templatedTitle && !/\{[a-zA-Z0-9_]+\}/.test(templatedTitle)) ? templatedTitle : title;
        finalBody = (templatedBody && !/\{[a-zA-Z0-9_]+\}/.test(templatedBody)) ? templatedBody : body;
      }
    }

    // Safety clean: ensure NO leftover {placeholder} braces are ever sent to user screens
    finalTitle = finalTitle.replace(/\{[a-zA-Z0-9_]+\}/g, '').trim() || title;
    finalBody = finalBody.replace(/\{[a-zA-Z0-9_]+\}/g, '').trim() || body;

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
