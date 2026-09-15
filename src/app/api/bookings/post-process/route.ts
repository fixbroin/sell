// src/app/api/bookings/post-process/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { Timestamp } from '@/lib/mysqlDbAdmin';
import { incrementSystemStats } from '@/lib/systemStatsUtils';
import { sendBookingConfirmationEmail } from '@/ai/flows/sendBookingEmailFlow';
import { sendProviderBookingAssignmentEmail } from '@/ai/flows/sendProviderBookingAssignmentFlow';
import { getBaseUrl } from '@/lib/config';
import { generateInvoicePdf } from '@/lib/invoiceGenerator';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { getZonedDate, formatScheduledDate, isCashPayment } from '@/lib/utils';
import { getHaversineDistance } from '@/lib/locationUtils';

// Define ADMIN_EMAIL - should match your AuthContext
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com"; 

export async function POST(request: Request) {
  try {
    const { bookingDocId, cancelledBy } = await request.json();

    if (!bookingDocId) {
      return NextResponse.json({ error: 'Missing bookingDocId' }, { status: 400 });
    }

    // 1. Fetch the full booking data from server-side Firestore
    const bookingDoc = await adminDb.collection('bookings').doc(bookingDocId).get();
    if (!bookingDoc.exists) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    let booking = bookingDoc.data() as any;
    const userId = booking.userId;
    let currentStatus = booking.status;
    let isCompleted = currentStatus === 'Completed';
    let isCancelled = currentStatus === 'Cancelled';
    let isRescheduled = currentStatus === 'Rescheduled';

    // 2. Fetch App Settings for Email/WhatsApp/Dispatch
    const [appConfigDoc, marketingConfigDoc, seoSettingsDoc] = await Promise.all([
        adminDb.collection('webSettings').doc('applicationConfig').get(),
        adminDb.collection('webSettings').doc('marketingAutomation').get(),
        adminDb.collection('seoSettings').doc('global').get()
    ]);

    const appConfig = appConfigDoc.data() as any;
    const marketingConfig = marketingConfigDoc.data() as any;
    const seoSettings = seoSettingsDoc.data() as any;

    // --- SERVER-SIDE SMART TAGGING & AUTO-DISPATCH ---
    if (!booking.providerId && (booking.workCategoryId || (booking.services && booking.services.length > 0)) && booking.latitude && booking.longitude && currentStatus !== 'Cancelled' && !booking.autoDispatchBypassed) {
        try {
            const providersSnapshot = await adminDb.collection('providerApplications')
                .where('status', '==', 'approved')
                .get();

            const providersWithDistance = providersSnapshot.docs.map((doc: any) => {
                const pData = doc.data() as any;
                let distance = Infinity;
                if (pData.workAreaCenter && pData.workAreaRadiusKm) {
                    distance = getHaversineDistance(
                        booking.latitude,
                        booking.longitude,
                        pData.workAreaCenter.latitude,
                        pData.workAreaCenter.longitude
                    );
                }
                return { id: doc.id, ...pData, distance };
            }).filter(p => {
                // Availability check: Provider must be online
                if (p.isOnline === false) return false;

                // Distance check
                if (p.distance > (p.workAreaRadiusKm || 0)) return false;

                // Full booking coverage check: Provider must support every service in this booking
                if (!booking.services || booking.services.length === 0) return true;
                return booking.services.every((s: any) => {
                    const hasCategory = booking.workCategoryId && (
                        p.workCategoryId === booking.workCategoryId ||
                        (Array.isArray(p.allCategoryIds) && p.allCategoryIds.includes(booking.workCategoryId))
                    );
                    const hasSpecificService = (Array.isArray(p.additionalServiceIds) && p.additionalServiceIds.includes(s.serviceId)) ||
                                              (Array.isArray(p.additionalServices) && p.additionalServices.some((item: any) => item.id === s.serviceId));
                    return hasCategory || hasSpecificService;
                });
            });

            if (providersWithDistance.length > 0) {
                // Sort by distance
                providersWithDistance.sort((a, b) => a.distance - b.distance);
                const dispatchRadius = appConfig?.autoDispatchRadiusKm || 5;

                let autoAssignedProviderId = null;
                for (const closestProvider of providersWithDistance) {
                    if (closestProvider.distance <= dispatchRadius) {
                        // Check if provider is on leave on scheduledDate
                        const leaveSnapshot = await adminDb.collection('leaves')
                            .where('providerId', '==', closestProvider.id)
                            .where('startDate', '<=', booking.scheduledDate)
                            .get();

                        const isOnLeave = leaveSnapshot.docs.some(doc => {
                            const data = doc.data();
                            return data.endDate >= booking.scheduledDate;
                        });
                        if (isOnLeave) {
                            continue; // Skip provider on leave
                        }

                        // Check Overlaps
                        const overlapSnapshot = await adminDb.collection('bookings')
                            .where('providerId', '==', closestProvider.id)
                            .where('scheduledDate', '==', booking.scheduledDate)
                            .where('status', 'in', ['Confirmed', 'AssignedToProvider', 'ProviderAccepted', 'InProgressByProvider'])
                            .get();

                        const hasOverlap = overlapSnapshot.docs.some(doc => doc.data().scheduledTimeSlot === booking.scheduledTimeSlot);
                        if (!hasOverlap) {
                            autoAssignedProviderId = closestProvider.id;
                            break;
                        }
                    } else {
                        break;
                    }
                }

                const updates: any = {
                    coverageType: 'provider_match',
                    suggestedProviderIds: providersWithDistance.map(p => p.id),
                    updatedAt: Timestamp.now()
                };

                if (autoAssignedProviderId) {
                    updates.providerId = autoAssignedProviderId;
                    updates.autoAssigned = true;
                    updates.status = "AssignedToProvider";
                    
                    // Sync local variables for subsequent tasks in this request
                    booking = { ...booking, ...updates };
                    currentStatus = booking.status;
                    isCompleted = currentStatus === 'Completed';
                    isCancelled = currentStatus === 'Cancelled';
                    isRescheduled = currentStatus === 'Rescheduled';
                }

                await adminDb.collection('bookings').doc(bookingDocId).update(updates);
            } else {
                await adminDb.collection('bookings').doc(bookingDocId).update({
                    coverageType: 'admin_only',
                    updatedAt: Timestamp.now()
                });
            }
        } catch (dispatchErr) {
            console.error("Server-side auto-dispatch error:", dispatchErr);
        }
    }
    // --- END SMART TAGGING & AUTO-DISPATCH ---

    // Fetch provider details if providerId exists (either auto-assigned or manually assigned)
    let providerName = "";
    let providerPhone = "";
    if (booking.providerId) {
        try {
            const pAppDoc = await adminDb.collection('providerApplications').doc(booking.providerId).get();
            if (pAppDoc.exists) {
                const pData = pAppDoc.data() as any;
                providerName = pData.fullName || "";
                providerPhone = pData.phone || pData.mobileNumber || "";
            }
        } catch (err) {
            console.error("Error fetching provider details in post-process:", err);
        }
    }

    const tasks: Promise<any>[] = [];

    // --- Determine Email Type ---
    let emailType: 'booking_confirmation' | 'booking_completion' | 'booking_rescheduled' | 'booking_cancelled_by_admin' | 'booking_status_update' = 'booking_status_update';

    if (isCompleted) {
        emailType = 'booking_completion';
    } else if (isCancelled) {
        emailType = 'booking_cancelled_by_admin';
    } else if (isRescheduled) {
        emailType = 'booking_rescheduled';
    } else if (!booking.isConfirmationEmailSent) {
        // First time booking is processed, send confirmation
        emailType = 'booking_confirmation';
        // Synchronous update to prevent duplicate email triggers from aborted checkouts/concurrent requests
        try {
            await adminDb.collection('bookings').doc(bookingDocId).update({ isConfirmationEmailSent: true });
            booking.isConfirmationEmailSent = true;
        } catch (e) {
            console.error("Error setting isConfirmationEmailSent:", e);
        }
    } else {
        // Subsequent status updates
        emailType = 'booking_status_update';
    }

    // --- Track Total Bookings (First time only) ---
    if (!booking.isStatsTracked) {
        tasks.push(incrementSystemStats({ totalBookings: 1 }));
        tasks.push(adminDb.collection('bookings').doc(bookingDocId).update({ isStatsTracked: true }));
        
        // --- NEW: Log Promo Code Usage (Method B) ---
        if (booking.discountCode) {
            const usageId = `usage_${bookingDocId}`;
            tasks.push(adminDb.collection('promoCodeUsage').doc(usageId).set({
                bookingId: booking.bookingId || "N/A",
                customerName: booking.customerName || "Unknown",
                customerEmail: booking.customerEmail || "No Email",
                discountCode: String(booking.discountCode),
                discountAmount: Number(booking.discountAmount || 0),
                status: booking.status || "Pending",
                createdAt: booking.createdAt || Timestamp.now()
            }));
            tasks.push(incrementSystemStats({ totalDiscountGiven: Number(booking.discountAmount || 0) }));
            tasks.push(triggerRefresh('promo-usage'));
        }
    }

    // --- Sync Promo Code Usage Status on subsequent updates ---
    if (booking.discountCode && booking.isStatsTracked) {
        const usageId = `usage_${bookingDocId}`;
        tasks.push((async () => {
            try {
                const usageRef = adminDb.collection('promoCodeUsage').doc(usageId);
                const usageDoc = await usageRef.get();
                if (usageDoc.exists) {
                    await usageRef.update({
                        status: currentStatus
                    });
                } else {
                    await usageRef.set({
                        bookingId: booking.bookingId || "N/A",
                        customerName: booking.customerName || "Unknown",
                        customerEmail: booking.customerEmail || "No Email",
                        discountCode: String(booking.discountCode),
                        discountAmount: Number(booking.discountAmount || 0),
                        status: currentStatus,
                        createdAt: booking.createdAt || Timestamp.now()
                    });
                }
                await triggerRefresh('promo-usage');
            } catch (e) {
                console.error("Error syncing promo code usage status:", e);
            }
        })());
    }

    // --- NEW: Notify Assigned Provider ---
    if (booking.providerId && (currentStatus === 'AssignedToProvider' || currentStatus === 'Confirmed') && !booking.isProviderNotified) {
        const notifyProviderTask = (async () => {
            try {
                // 1. Fetch Provider Details
                const pAppDoc = await adminDb.collection('providerApplications').doc(booking.providerId).get();
                if (!pAppDoc.exists) {
                    console.warn(`Provider application not found for ID: ${booking.providerId}`);
                    return;
                }
                const pData = pAppDoc.data() as any;

                // 2. Add Dashboard Notification
                await adminDb.collection('userNotifications').add({
                    userId: booking.providerId,
                    title: "New Job Assigned!",
                    message: `You have been assigned to booking ${booking.bookingId} for ${booking.customerName}.`,
                    type: 'info',
                    href: `/provider/booking/${bookingDocId}`,
                    read: false,
                    createdAt: Timestamp.now()
                });

                // 3. Trigger Push
                try {
                    await fetch(`${getBaseUrl()}/api/send-push`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            userId: booking.providerId, 
                            title: "New Job Assigned!", 
                            body: `Booking ${booking.bookingId} is assigned to you. Check details now.`, 
                            href: `/provider/booking/${bookingDocId}`,
                            variables: {
                                bookingId: booking.bookingId || "",
                                providerName: pData.fullName || "Service Provider",
                                customerName: booking.customerName || "Customer",
                                siteName: seoSettings?.websiteName || "Yourbrand"
                            }
                        }),
                    });
                } catch (pushErr) {
                    console.error("Error triggering provider push notification:", pushErr);
                }

                // 4. Send Email
                try {
                    const servicesSummary = booking.services.map((s: any) => `${s.name} (x${s.quantity})`).join(', ');
                    await sendProviderBookingAssignmentEmail({
                        providerName: pData.fullName || "Service Provider",
                        providerEmail: pData.email,
                        bookingId: booking.bookingId,
                        bookingDocId: bookingDocId,
                        serviceName: servicesSummary,
                        scheduledDate: formatScheduledDate(booking.scheduledDate, appConfig.dateFormat || "DD/MM/YYYY"),
                        scheduledTimeSlot: booking.scheduledTimeSlot,
                        customerName: booking.customerName,
                        customerAddress: `${booking.addressLine1}, ${booking.addressLine2 ? booking.addressLine2 + ', ' : ''}${booking.city}`,
                        customerPhone: booking.customerPhone || "N/A",
                        smtpHost: appConfig.smtpHost,
                        smtpPort: appConfig.smtpPort,
                        smtpUser: appConfig.smtpUser,
                        smtpPass: appConfig.smtpPass,
                        senderEmail: appConfig.senderEmail,
                        siteName: seoSettings?.websiteName || "Yourbrand",
                        logoUrl: seoSettings?.logoUrl,
                    });
                } catch (emailErr) {
                    console.error("Error sending provider assignment email:", emailErr);
                }

                // 5. Mark as notified in Firestore
                await adminDb.collection('bookings').doc(bookingDocId).update({ isProviderNotified: true });

            } catch (err) {
                console.error("Critical error in notifyProviderTask:", err);
            }
        })();
        tasks.push(notifyProviderTask);
    }

    // A. Update User "hasBooking" status
    if (userId) {
        tasks.push(adminDb.collection('users').doc(userId).set({ hasBooking: true }, { merge: true }));
    }

    // --- NEW: Update Provider's withrawableBalance and System Stats on Completion ---
    if (isCompleted && booking.providerId) {
        const calculateProviderFee = (bookingAmount: number, feeType?: string, feeValue?: number): number => {
            if (!feeType || !feeValue || feeValue <= 0) return 0;
            if (feeType === 'fixed') return feeValue;
            if (feeType === 'percentage') return (bookingAmount * feeValue) / 100;
            return 0;
        };

        const commission = calculateProviderFee(booking.totalAmount, appConfig.providerFeeType, appConfig.providerFeeValue);

        // --- Increment System Stats ---
        if (!booking.isCompletionStatsTracked) {
            tasks.push(incrementSystemStats({ 
                completedBookings: 1, 
                totalRevenue: booking.totalAmount,
                earnedCommission: commission
            }));
            tasks.push(adminDb.collection('bookings').doc(bookingDocId).update({ isCompletionStatsTracked: true }));
        }

        const providerDocRef = adminDb.collection('users').doc(booking.providerId);
        tasks.push(adminDb.runTransaction(async (transaction) => {
            const providerDoc = await transaction.get(providerDocRef);
            const providerData = providerDoc.exists ? providerDoc.data() : {};
            const currentWithdrawableBalance = providerData?.withdrawableBalance || 0;
            const baseGross = (booking.subTotal || 0) + (booking.visitingCharge || 0) - (booking.discountAmount || 0);
            const extraCharges = (booking.additionalCharges || []).reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
            const totalBookingGross = baseGross + extraCharges;
            
            // Monthly Stats Logic using Configured Timezone
            const timezone = appConfig.timezone || 'Asia/Kolkata';
            const now = getZonedDate(new Date(), timezone);
            const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            let stats = providerData?.monthlyStats || { monthKey, gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0, cashNet: 0, onlineGross: 0, onlineCommission: 0, extraCharges: 0 };
            
            // Reset if it's a new month
            if (stats.monthKey !== monthKey) {
                stats = { monthKey, gross: 0, commission: 0, cashCollected: 0, withdrawals: 0, onlineNet: 0, cashCommission: 0, cashNet: 0, onlineGross: 0, onlineCommission: 0, extraCharges: 0 };
            }

            let balanceChange = 0;

            if (isCashPayment(booking.paymentMethod)) {
                const commission = calculateProviderFee(totalBookingGross, appConfig.providerFeeType, appConfig.providerFeeValue);
                const cashNet = totalBookingGross - commission;
                balanceChange = booking.commissionPaidFromWallet ? 0 : -commission;
                stats.gross += totalBookingGross;
                stats.commission += commission;
                stats.cashCollected += (booking.totalAmount || totalBookingGross);
                stats.cashCommission += commission;
                stats.cashNet = (stats.cashNet || 0) + cashNet;
                if (extraCharges > 0) {
                    stats.extraCharges = (stats.extraCharges || 0) + extraCharges;
                }
            } else {
                // Customer prepaid online for base service
                const onlineGross = baseGross;
                const onlineCommission = calculateProviderFee(onlineGross, appConfig.providerFeeType, appConfig.providerFeeValue);
                const onlineNet = onlineGross - onlineCommission;

                const extraCommission = extraCharges > 0 
                    ? (appConfig.providerFeeType === 'percentage' 
                        ? calculateProviderFee(extraCharges, appConfig.providerFeeType, appConfig.providerFeeValue) 
                        : (extraCharges * (appConfig.providerExtraFeePercentage || 0)) / 100)
                    : 0;

                // Withdrawable balance increases by provider's net share of the online payment
                balanceChange = onlineNet;

                // Monthly stats
                stats.gross += totalBookingGross;
                stats.commission += (onlineCommission + extraCommission);
                stats.onlineGross = (stats.onlineGross || 0) + onlineGross;
                stats.onlineCommission = (stats.onlineCommission || 0) + onlineCommission;
                stats.onlineNet += onlineNet;

                if (extraCharges > 0) {
                    stats.cashCollected += extraCharges;
                    stats.cashCommission += extraCommission;
                    stats.cashNet = (stats.cashNet || 0) + Math.max(0, extraCharges - extraCommission);
                    stats.extraCharges = (stats.extraCharges || 0) + extraCharges;
                }
            }
            
            transaction.set(providerDocRef, { 
                withdrawableBalance: currentWithdrawableBalance + balanceChange,
                monthlyStats: stats
            }, { merge: true });
        }));
    }

    // B. User Dashboard Notification
    if (userId) {
        let notificationTitle = isCompleted ? "Service Completed!" : "Booking Update";
        let notificationMessage = isCompleted 
            ? `Your booking ${booking.bookingId} has been successfully completed. Thank you!`
            : `Your booking ${booking.bookingId} is ${booking.status}.`;
        
        if (isRescheduled) {
            notificationTitle = "Booking Rescheduled!";
            notificationMessage = `Your booking ${booking.bookingId} has been rescheduled to ${formatScheduledDate(booking.scheduledDate)} at ${booking.scheduledTimeSlot}.`;
        }

        tasks.push(adminDb.collection('userNotifications').add({
            userId,
            title: notificationTitle,
            message: notificationMessage,
            type: isCompleted ? 'success' : 'info',
            href: `/my-bookings`,
            read: false,
            createdAt: Timestamp.now()
        }));
    }

    // D. Trigger Actual Push Notifications
    const triggerPush = async (pUserId: string, pTitle: string, pBody: string, pHref: string) => {
        try {
            await fetch(`${getBaseUrl()}/api/send-push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: pUserId, 
                    title: pTitle, 
                    body: pBody, 
                    href: pHref,
                    variables: {
                        bookingId: booking.bookingId || "",
                        customerName: booking.customerName || "Customer",
                        providerName: providerName || "Provider",
                        scheduledDate: booking.scheduledDate ? formatScheduledDate(booking.scheduledDate) : "",
                        scheduledTimeSlot: booking.scheduledTimeSlot || "",
                        totalAmount: String(booking.totalAmount || 0)
                    }
                }),
            });
        } catch (e) {
            console.error(`Error triggering push for ${pUserId}:`, e);
        }
    };

    // C. Admin Dashboard Notification (Notify all active admins)
    // Skip if it is a user cancellation, as the client handles sending user cancellation alerts to user & admin
    if (!(isCancelled && cancelledBy === 'user')) {
      try {
          const currencySymbol = appConfig?.currencySymbol || "₹";
          const adminsSnapshot = await adminDb.collection('admins').where('status', '==', 'active').get();
          if (!adminsSnapshot.empty) {
              let adminTitle = "Booking Update";
              let adminMessage = `ID: ${booking.bookingId} by ${booking.customerName} is ${booking.status}.`;
              let notificationType: 'info' | 'admin_alert' = 'info';

              if (isCompleted) {
                  adminTitle = "Job Completed!";
                  adminMessage = `Booking ${booking.bookingId} for ${booking.customerName} is now complete. Total: ${currencySymbol}${booking.totalAmount.toFixed(2)}.`;
              } else if (isCancelled) {
                  adminTitle = "Booking Cancelled";
                  adminMessage = `Booking ${booking.bookingId} by ${booking.customerName} has been cancelled.`;
                  notificationType = 'admin_alert';
              } else if (isRescheduled) {
                  adminTitle = "Booking Rescheduled";
                  adminMessage = `Booking ${booking.bookingId} has been rescheduled to ${formatScheduledDate(booking.scheduledDate)} at ${booking.scheduledTimeSlot}.`;
              } else if (emailType === 'booking_confirmation') {
                  adminTitle = "New Booking Received!";
                  if (booking.providerId) {
                      adminMessage = `A new booking ${booking.bookingId} by ${booking.customerName} has been placed and auto-assigned to ${providerName || 'a provider'}.`;
                  } else {
                      adminMessage = `A new booking ${booking.bookingId} has been placed by ${booking.customerName}.`;
                  }
                  notificationType = 'admin_alert';
              } else if (currentStatus === 'AssignedToProvider') {
                  adminTitle = "Provider Assigned";
                  adminMessage = `Booking ${booking.bookingId} has been assigned to provider ${providerName || 'N/A'}.`;
              }

              adminsSnapshot.forEach(adminDoc => {
                  const adminUid = adminDoc.id;
                  tasks.push(adminDb.collection('userNotifications').add({
                      userId: adminUid,
                      title: adminTitle,
                      message: adminMessage,
                      type: notificationType,
                      href: `/admin/bookings`,
                      read: false,
                      createdAt: Timestamp.now()
                  }));

                  // Trigger Push for each admin
                  tasks.push(triggerPush(
                      adminUid, 
                      emailType === 'booking_confirmation' ? "New Booking" : adminTitle, 
                      adminMessage, 
                      `/admin/bookings`
                  ));
              });
          }
      } catch (adminNotifyErr) {
          console.error("Error notifying admins:", adminNotifyErr);
      }
    }

    if (userId) {
        let customerTitle = "Booking Confirmed!";
        let customerMessage = `Your booking ${booking.bookingId} is confirmed.`;

        if (isCompleted) {
            customerTitle = "Service Completed!";
            customerMessage = `Your service ${booking.bookingId} is now complete.`;
        } else if (isCancelled) {
            customerTitle = "Booking Cancelled";
            customerMessage = `Your booking ${booking.bookingId} has been cancelled.`;
        } else if (isRescheduled) {
            customerTitle = "Booking Rescheduled!";
            customerMessage = `Your booking ${booking.bookingId} has been rescheduled to ${formatScheduledDate(booking.scheduledDate)} at ${booking.scheduledTimeSlot}.`;
        } else if (currentStatus === 'AssignedToProvider') {
            customerTitle = "Technician Assigned!";
            customerMessage = `Technician ${providerName || 'Professional'} has been assigned to your booking ${booking.bookingId}.`;
        }

        tasks.push(triggerPush(
            userId, 
            customerTitle, 
            customerMessage, 
            "/my-bookings"
        ));
    }

    // E. Promo Code Usage Update (Only on initial confirmation)
    if (booking.discountCode && !isCompleted) {
        const promoQuery = await adminDb.collection('adminPromoCodes').where('code', '==', booking.discountCode).limit(1).get();
        if (!promoQuery.empty) {
            tasks.push(promoQuery.docs[0].ref.update({ 
                usesCount: (promoQuery.docs[0].data().usesCount || 0) + 1 
            }));
        }
    }

    // F. Send Email (Genkit Flow)
    const servicesSummary = booking.services.map((s: any) => `${s.name} (x${s.quantity})`).join(', ');
    
    // GENERATE PDF FOR COMPLETION EMAIL
    let invoicePdfBase64 = "";
    if (isCompleted) {
        try {
            const companyDetails = {
                name: seoSettings?.websiteName || "Yourbrand",
                address: appConfig?.companyAddress || "123 Main Street, City, Country - 123456",
                contactEmail: appConfig?.companyEmail || 'support@yourdomain.com',
                contactMobile: appConfig?.companyPhone || '+91-7353113455',
                timezone: appConfig?.timezone || 'Asia/Kolkata',
                currencySymbol: appConfig?.currencySymbol || "₹",
                dateFormat: appConfig?.dateFormat || "DD/MM/YYYY",
            };
            const pdfDataUri = await generateInvoicePdf(booking, companyDetails);
            if (pdfDataUri && pdfDataUri.includes(',')) {
                invoicePdfBase64 = pdfDataUri.split(',')[1];
            }
        } catch (pdfErr) {
            console.error("Error generating invoice PDF for email:", pdfErr);
        }
    }

    const emailFlowInput = {
        emailType: emailType,
        bookingId: booking.bookingId,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        addressLine1: booking.addressLine1,
        addressLine2: booking.addressLine2,
        city: booking.city,
        state: booking.state,
        pincode: booking.pincode,
        latitude: booking.latitude,
        longitude: booking.longitude,
        scheduledDate: booking.scheduledDate,
        scheduledTimeSlot: booking.scheduledTimeSlot,
        previousScheduledDate: booking.previousScheduledDate,
        previousScheduledTimeSlot: booking.previousScheduledTimeSlot,
        services: booking.services,
        subTotal: booking.subTotal,
        visitingCharge: booking.visitingCharge || 0,
        discountAmount: booking.discountAmount || 0,
        discountCode: booking.discountCode,
        taxAmount: booking.taxAmount,
        totalAmount: booking.totalAmount,
        paymentMethod: booking.paymentMethod,
        status: booking.status,
        siteName: seoSettings?.websiteName || "Yourbrand",
        logoUrl: seoSettings?.logoUrl,
        currencySymbol: appConfig.currencySymbol || "Rs.",
        smtpHost: appConfig.smtpHost,
        smtpPort: appConfig.smtpPort,
        smtpUser: appConfig.smtpUser,
        smtpPass: appConfig.smtpPass,
        senderEmail: appConfig.senderEmail,
        dateFormat: appConfig.dateFormat || "DD/MM/YYYY",
        invoicePdfBase64: invoicePdfBase64 || undefined,
        additionalCharges: booking.additionalCharges,
        appliedPlatformFees: booking.appliedPlatformFees?.map((fee: any) => ({ 
            name: fee.name, 
            amount: fee.calculatedFeeAmount + fee.taxAmountOnFee 
        })),
        providerName: providerName || undefined,
        providerPhone: providerPhone || undefined,
    };

    // Only send if it's NOT a generic status update, OR if the toggle is enabled
    // Do not send booking_cancelled_by_admin if the user was the one who cancelled the booking
    const shouldSendEmail = (emailType !== 'booking_status_update' || appConfig.enableStatusUpdateEmails !== false) && 
                            !(isCancelled && cancelledBy === 'user');
    
    if (shouldSendEmail) {
        tasks.push(sendBookingConfirmationEmail(emailFlowInput));
    }

    // G. Send WhatsApp
    if (marketingConfig?.isWhatsAppEnabled) {
        if (isCompleted && marketingConfig.whatsAppOnBookingCompleted?.enabled) {
            tasks.push(fetch(`${getBaseUrl()}/api/whatsapp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: booking.customerPhone,
                    templateName: marketingConfig.whatsAppOnBookingCompleted.templateName,
                    parameters: [booking.bookingId],
                }),
            }).catch(e => console.error("WhatsApp Completion Error:", e)));
        } else if (!isCompleted && marketingConfig.whatsAppOnBookingConfirmed?.enabled) {
            tasks.push(fetch(`${getBaseUrl()}/api/whatsapp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: booking.customerPhone,
                    templateName: marketingConfig.whatsAppOnBookingConfirmed.templateName,
                    parameters: [booking.bookingId, servicesSummary, formatScheduledDate(booking.scheduledDate)],
                }),
            }).catch(e => console.error("WhatsApp Confirmation Error:", e)));
        } else if (isCancelled && marketingConfig.whatsAppOnBookingCancelled?.enabled) {
            tasks.push(fetch(`${getBaseUrl()}/api/whatsapp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: booking.customerPhone,
                    templateName: marketingConfig.whatsAppOnBookingCancelled.templateName,
                    parameters: [booking.bookingId],
                }),
            }).catch(e => console.error("WhatsApp Cancellation Error:", e)));
        }
    }

    // --- NEW: Referral Reward Logic on Completion ---
    if (isCompleted && userId) {
        let pushParams: any = null;
        const referralTask = adminDb.runTransaction(async (transaction) => {
            // 1. Check if this user was referred
            const referralQuery = await adminDb.collection('referrals')
                .where('referredUserId', '==', userId)
                .where('status', '==', 'pending')
                .limit(1)
                .get();

            if (referralQuery.empty) return;

            const referralDoc = referralQuery.docs[0];
            const referralData = referralDoc.data() as any;

            // 2. Check if this is the user's FIRST completed booking
            const completedBookingsQuery = await adminDb.collection('bookings')
                .where('userId', '==', userId)
                .where('status', '==', 'Completed')
                .get();
            
            // If count is > 1, it's not the first one (this one is already counted because we are in post-process)
            if (completedBookingsQuery.size > 1) return;

            // 3. Check minimum booking value requirement
            const referralSettingsDoc = await adminDb.collection('appConfiguration').doc('referral').get();
            const referralSettings = referralSettingsDoc.exists ? referralSettingsDoc.data() : null;
            
            if (!referralSettings?.isReferralSystemEnabled) return;
            
            const minVal = referralSettings.minBookingValueForBonus || 0;
            if (booking.totalAmount < minVal) return;

            // 4. Calculate Bonus
            let bonusAmount = referralData.referrerBonus || 0;
            if (referralSettings.bonusType === 'percentage') {
                bonusAmount = (booking.totalAmount * (referralSettings.referrerBonus || 0)) / 100;
            }

            // 5. Credit Referrer
            const referrerDocRef = adminDb.collection('users').doc(referralData.referrerId);
            const referrerDoc = await transaction.get(referrerDocRef);
            
            if (referrerDoc.exists) {
                const currentBalance = referrerDoc.data()?.walletBalance || 0;
                const newBalance = currentBalance + bonusAmount;
                
                // Optional: Check max earnings limit
                const maxEarnings = referralSettings.maxEarningsPerReferrer;
                if (!maxEarnings || newBalance <= maxEarnings) {
                    transaction.update(referrerDocRef, { walletBalance: newBalance });
                    
                    // 6. Update Referral Status
                    transaction.update(referralDoc.ref, { 
                        status: 'completed',
                        earnedAmount: bonusAmount,
                        completedAt: Timestamp.now(),
                        bookingId: booking.bookingId
                    });

                    // 7. Notify Referrer
                    const currencySymbol = appConfig?.currencySymbol || "₹";
                    const notification: any = {
                        userId: referralData.referrerId,
                        title: "Referral Bonus Credited!",
                        message: `Your friend ${booking.customerName} completed their first booking. ${currencySymbol}${bonusAmount.toFixed(2)} has been added to your wallet.`,
                        type: 'success',
                        href: '/referral?tab=wallet',
                        read: false,
                        createdAt: Timestamp.now()
                    };
                    transaction.set(adminDb.collection('userNotifications').doc(), notification);

                    pushParams = {
                        userId: referralData.referrerId,
                        title: "Referral Bonus Credited!",
                        body: `Your friend ${booking.customerName} completed their first booking. ${currencySymbol}${bonusAmount.toFixed(2)} has been added to your wallet.`,
                        href: '/referral?tab=wallet',
                        type: 'referral_reward_completed',
                        variables: {
                            friendName: booking.customerName,
                            amount: bonusAmount.toFixed(2),
                            currencySymbol
                        }
                    };
                }
            }
        }).then(() => {
            if (pushParams) {
                const baseUrl = getBaseUrl();
                fetch(`${baseUrl}/api/send-push`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(pushParams)
                }).catch(e => console.error("Error triggering referral completed push:", e));
            }
        });
        tasks.push(referralTask);
    }

    tasks.push(triggerRefresh('bookings'));

    // --- CRITICAL: Wait for all parallel tasks to finish ---
    await Promise.allSettled(tasks);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error in post-process API:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
