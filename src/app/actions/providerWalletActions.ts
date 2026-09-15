'use server';

import { adminDb } from '@/lib/firebaseAdmin';
import * as admin from 'firebase-admin';
import { revalidatePath } from 'next/cache';
import { getPushTemplate } from '@/app/actions/pushSettingsActions';
import { replacePlaceholders } from '@/lib/seoUtils';
import { getTimestampMillis } from '@/lib/utils';

// MySQL database imports
import { db } from '@/lib/mysqlDb';
import { doc, getDoc, getDocs, updateDoc, addDoc, collection, query, where, orderBy, limit, Timestamp, deleteDoc } from '@/lib/mysqlDb';

export interface WalletProviderSettings {
  minDepositAmount: number;
  maxDepositAmount: number;
  depositBonusPercentage: number;
  minBalanceForJobs: number;
}

export interface WalletTransaction {
  id: string;
  providerId: string;
  amount: number;
  type: 'deposit' | 'commission_deduction' | 'commission_refund' | 'manual_adjustment';
  bookingId?: string | null;
  description: string;
  timestamp: number;
  bonusAmount?: number;
  razorpayPaymentId?: string | null;
  razorpayOrderId?: string | null;
  stripeSessionId?: string | null;
  stripePaymentIntent?: string | null;
}

const DEFAULT_SETTINGS: WalletProviderSettings = {
  minDepositAmount: 500,
  maxDepositAmount: 10000,
  depositBonusPercentage: 0,
  minBalanceForJobs: 100,
};

// 1. Fetch wallet settings (MySQL)
export async function getProviderWalletSettingsAction(): Promise<WalletProviderSettings> {
  try {
    const settingsDoc = await getDoc(doc(db, 'appConfiguration', 'wallet_provider'));
    if (settingsDoc.exists()) {
      return { ...DEFAULT_SETTINGS, ...settingsDoc.data() } as WalletProviderSettings;
    }
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("Error fetching wallet settings:", error);
    return DEFAULT_SETTINGS;
  }
}

// 2. Save wallet settings (MySQL)
export async function saveProviderWalletSettingsAction(settings: WalletProviderSettings) {
  try {
    const docRef = doc(db, 'appConfiguration', 'wallet_provider');
    // Set settings
    const exists = (await getDoc(docRef)).exists();
    if (exists) {
      await updateDoc(docRef, {
        ...settings,
        updatedAt: Timestamp.now()
      });
    } else {
      // Use addDoc or setDoc structure
      await updateDoc(docRef, {
        ...settings,
        updatedAt: Timestamp.now()
      });
    }
    return { success: true, message: "Wallet settings saved successfully." };
  } catch (error: any) {
    console.error("Error saving wallet settings:", error);
    return { success: false, message: error.message || "Failed to save settings." };
  }
}

// 3. Get provider wallet details (MySQL)
export async function getProviderWalletDetailsAction(providerId: string) {
  try {
    const userDoc = await getDoc(doc(db, 'users', providerId));
    const balance = userDoc.exists() ? (userDoc.data()?.providerWalletBalance || 0) : 0;

    const txSnap = await getDocs(
      query(
        collection(db, 'providerWalletTransactions'),
        where('providerId', '==', providerId),
        orderBy('timestamp', 'desc'),
        limit(50)
      )
    );

    const transactions: WalletTransaction[] = [];
    txSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      transactions.push({
        id: docSnap.id,
        providerId: data.providerId,
        amount: data.amount,
        type: data.type,
        bookingId: data.bookingId || null,
        description: data.description,
        timestamp: getTimestampMillis(data.timestamp) || Date.now(),
        bonusAmount: data.bonusAmount,
        razorpayPaymentId: data.razorpay_payment_id || null,
        razorpayOrderId: data.razorpay_order_id || null,
        stripeSessionId: data.stripe_session_id || null,
        stripePaymentIntent: data.stripe_payment_intent || null,
      });
    });

    return { balance, transactions };
  } catch (error) {
    console.error("Error fetching provider wallet details:", error);
    return { balance: 0, transactions: [] };
  }
}

// 4. Deposit funds via verified Razorpay checkout (MySQL)
export async function depositProviderWalletAction(
  providerId: string,
  amount: number,
  paymentDetails: { 
    razorpay_order_id?: string; 
    razorpay_payment_id?: string;
    stripe_session_id?: string;
    stripe_payment_intent?: string;
    payment_method?: string;
  }
) {
  try {
    // Idempotency check: prevent duplicate credits
    if (paymentDetails.stripe_session_id) {
      const q = query(
        collection(db, 'providerWalletTransactions'),
        where('stripe_session_id', '==', paymentDetails.stripe_session_id)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { success: true, message: "This transaction has already been credited." };
      }
    }
    if (paymentDetails.razorpay_payment_id) {
      const q = query(
        collection(db, 'providerWalletTransactions'),
        where('razorpay_payment_id', '==', paymentDetails.razorpay_payment_id)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { success: true, message: "This transaction has already been credited." };
      }
    }

    const settings = await getProviderWalletSettingsAction();
    const bonusPercentage = settings.depositBonusPercentage || 0;
    const bonusAmount = bonusPercentage > 0 ? (amount * bonusPercentage) / 100 : 0;
    const finalCredit = amount + bonusAmount;

    // Retrieve active currency symbol
    const appConfigSnap = await getDoc(doc(db, 'webSettings', 'applicationConfig'));
    const appConfig = appConfigSnap.exists() ? appConfigSnap.data() as any : null;
    const symbol = appConfig?.currencySymbol || "₹";

    // Fetch user details from MySQL
    const userDocRef = doc(db, 'users', providerId);
    const userSnap = await getDoc(userDocRef);
    const currentBalance = userSnap.exists() ? (userSnap.data()?.providerWalletBalance || 0) : 0;
    const providerName = userSnap.exists() ? (userSnap.data()?.displayName || 'Provider') : 'Provider';
    const finalBalance = currentBalance + finalCredit;

    // Update MySQL user balance
    await updateDoc(userDocRef, {
      providerWalletBalance: finalBalance,
    });

    const isStripe = paymentDetails.payment_method?.toLowerCase() === 'stripe' || !!paymentDetails.stripe_session_id;
    const methodLabel = isStripe ? 'Stripe' : 'Razorpay';

    // Write ledger in MySQL
    await addDoc(collection(db, 'providerWalletTransactions'), {
      providerId,
      amount,
      type: 'deposit',
      description: `Prepaid wallet deposit via ${methodLabel}${bonusPercentage > 0 ? ` (+${bonusPercentage}% bonus)` : ''}`,
      timestamp: Timestamp.now(),
      bonusAmount: bonusAmount || null,
      razorpay_order_id: paymentDetails.razorpay_order_id || null,
      razorpay_payment_id: paymentDetails.razorpay_payment_id || null,
      stripe_session_id: paymentDetails.stripe_session_id || null,
      stripe_payment_intent: paymentDetails.stripe_payment_intent || null,
    });

    // Dispatch push to Provider
    await sendServerPushNotification({
      userId: providerId,
      title: "Wallet Deposited!",
      body: `Successfully added ${symbol}${finalCredit.toFixed(2)} to your prepaid wallet.`,
      href: '/provider/wallet',
      type: 'provider_wallet_deposit',
      variables: {
        amount: finalCredit.toFixed(2),
        balance: finalBalance.toFixed(2),
        currencySymbol: symbol
      }
    }).catch(e => console.error("Error sending provider deposit push:", e));

    // Dispatch push to Admins
    try {
      const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com";
      const adminIds = new Set<string>();

      // Get super_admin and finance_admin roles
      const adminsSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('role', 'in', ['super_admin', 'finance_admin'])
        )
      );
      adminsSnap.forEach(adminDoc => {
        adminIds.add(adminDoc.id);
      });

      // Explicitly fetch the primary admin email user
      const primaryAdminQuery = query(collection(db, 'users'), where('email', '==', ADMIN_EMAIL), limit(1));
      const primaryAdminSnap = await getDocs(primaryAdminQuery);
      if (!primaryAdminSnap.empty) {
        adminIds.add(primaryAdminSnap.docs[0].id);
      }

      if (adminIds.size > 0) {
        const promises = Array.from(adminIds).map(async (adminUid) => {
          // Write userNotification in database for admin panel inbox
          const adminNotificationData = {
            userId: adminUid,
            title: "Provider Wallet Deposit",
            message: `Provider ${providerName} added ${symbol}${finalCredit.toFixed(2)} to their wallet.`,
            type: 'info',
            href: '/admin/provider-withdrawals?tab=wallet_complaints',
            read: false,
            createdAt: Timestamp.now(),
          };
          await addDoc(collection(db, "userNotifications"), adminNotificationData);

          // Dispatch FCM push alert
          return sendServerPushNotification({
            userId: adminUid,
            title: "Provider Wallet Deposit",
            body: `Provider ${providerName} added ${symbol}${finalCredit.toFixed(2)} to their wallet.`,
            href: '/admin/provider-withdrawals?tab=wallet_complaints',
            type: 'admin_provider_deposit_alert',
            variables: {
              providerName,
              amount: finalCredit.toFixed(2),
              balance: finalBalance.toFixed(2),
              currencySymbol: symbol
            }
          });
        });
        await Promise.allSettled(promises);
      }
    } catch (e) {
      console.error("Error sending admin deposit alert push:", e);
    }

    revalidatePath('/provider/wallet');
    return { success: true, message: `Successfully deposited ${symbol}${finalCredit.toFixed(2)} to your wallet.` };
  } catch (error: any) {
    console.error("Error depositing to provider wallet:", error);
    return { success: false, message: error.message || "Deposit transaction failed." };
  }
}

// 5. Manual wallet adjustment / refund (Admin) (MySQL)
export async function adjustProviderWalletAction(
  providerId: string,
  amount: number,
  type: 'deposit' | 'commission_deduction' | 'commission_refund' | 'manual_adjustment',
  description: string,
  bookingId?: string
) {
  try {
    const userDocRef = doc(db, 'users', providerId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
      throw new Error("Provider user profile not found.");
    }
    
    const currentBalance = userSnap.data()?.providerWalletBalance || 0;
    const newBalance = currentBalance + amount;

    // Update MySQL user balance
    await updateDoc(userDocRef, { providerWalletBalance: newBalance });

    // Write ledger to MySQL
    await addDoc(collection(db, 'providerWalletTransactions'), {
      providerId,
      amount,
      type,
      bookingId: bookingId || null,
      description,
      timestamp: Timestamp.now(),
    });

    // Write in-app notification to MySQL
    await addDoc(collection(db, 'userNotifications'), {
      userId: providerId,
      title: amount >= 0 ? "Prepaid Wallet Credited" : "Prepaid Wallet Debited",
      message: `Your prepaid wallet has been adjusted by ${amount >= 0 ? '+' : ''}₹${amount.toFixed(2)}. Description: ${description}`,
      type: amount >= 0 ? 'success' : 'info',
      href: '/provider/wallet',
      read: false,
      createdAt: Timestamp.now(),
    });

    // Send push notification to the provider
    await sendServerPushNotification({
      userId: providerId,
      title: amount >= 0 ? "Wallet Adjusted!" : "Wallet Adjusted!",
      body: `Your prepaid wallet has been adjusted by ₹${amount.toFixed(2)}.`,
      href: '/provider/wallet',
      type: 'provider_wallet_refund',
      variables: {
        amount: amount.toFixed(2),
        reason: description,
        currencySymbol: '₹'
      }
    }).catch(e => console.error("Error sending manual adjustment push alert:", e));

    revalidatePath('/provider/wallet');
    return { success: true, message: "Wallet adjusted successfully." };
  } catch (error: any) {
    console.error("Error in adjustProviderWalletAction:", error);
    return { success: false, message: error.message || "Failed to adjust wallet." };
  }
}

// Helper to calculate provider commission fee
const calculateProviderFee = (bookingAmount: number, feeType?: string, feeValue?: number): number => {
  if (!feeType || !feeValue || feeValue <= 0) return 0;
  if (feeType === 'fixed') return feeValue;
  if (feeType === 'percentage') return (bookingAmount * feeValue) / 100;
  return 0;
};

// Check if payment method is cash
const isCashPayment = (method?: string): boolean => {
  const m = (method || '').toLowerCase();
  return m === 'pay after service';
};

// 6. Central server action to handle provider status updates with wallet validation (MySQL)
export async function updateBookingStatusByProviderAction(
  bookingId: string,
  providerId: string,
  newStatus: string,
  additionalCharges?: { name: string; amount: number }[],
  finalizedPaymentMethod?: string
) {
  try {
    const bookingDocRef = doc(db, 'bookings', bookingId);
    const providerUserRef = doc(db, 'users', providerId);

    const bookingSnap = await getDoc(bookingDocRef);
    if (!bookingSnap.exists()) {
      throw new Error("Booking not found.");
    }
    const bookingData = bookingSnap.data() as any;

    const providerSnap = await getDoc(providerUserRef);
    if (!providerSnap.exists()) {
      throw new Error("Provider user document not found.");
    }
    const providerData = providerSnap.data() || {};

    const currentStatus = bookingData.status;
    const updateData: any = { 
      status: newStatus,
      updatedAt: Timestamp.now(),
    };

    // 1. Acceptance Checks & Wallet Deductions
    if (newStatus === 'ProviderAccepted') {
      const paymentMethod = finalizedPaymentMethod || bookingData.paymentMethod || 'Cash';
      
      if (isCashPayment(paymentMethod)) {
        // Load settings and config
        const settings = await getProviderWalletSettingsAction();
        const configSnap = await getDoc(doc(db, 'webSettings', 'applicationConfig'));
        const appConfig = configSnap.exists() ? configSnap.data() as any : {};
        const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;
        const symbol = appConfig?.currencySymbol || "₹";

        const currentWalletBalance = providerData.providerWalletBalance || 0;

        if (currentWalletBalance < settings.minBalanceForJobs) {
          throw new Error(`Insufficient wallet balance. You must maintain at least ${symbol}${settings.minBalanceForJobs.toFixed(decimals)} in your prepaid wallet to accept cash jobs. Please top up your wallet.`);
        }

        // Calculate commission (exclude platform fee and tax fee from commission base)
        const commissionBase = (bookingData.subTotal || 0) + (bookingData.visitingCharge || 0) - (bookingData.discountAmount || 0);
        const commission = calculateProviderFee(commissionBase, appConfig.providerFeeType, appConfig.providerFeeValue);
        const platformFeeVal = bookingData.platformFeeTotal || 0;
        const taxFeeVal = bookingData.taxAmount || 0;
        const totalDeduction = commission + platformFeeVal + taxFeeVal;

        if (totalDeduction > 0) {
          // Deduct from wallet in MySQL
          await updateDoc(providerUserRef, { 
            providerWalletBalance: currentWalletBalance - totalDeduction 
          });

          // Write deduction ledger log in MySQL
          await addDoc(collection(db, 'providerWalletTransactions'), {
            providerId,
            amount: -totalDeduction,
            type: 'commission_deduction',
            bookingId,
            description: `Commission (${symbol}${commission.toFixed(decimals)}) + Platform Fee (${symbol}${platformFeeVal.toFixed(decimals)}) + Tax Fee (${symbol}${taxFeeVal.toFixed(decimals)}) auto-deducted for Cash Booking #${bookingData.bookingId}`,
            timestamp: Timestamp.now(),
          });

          updateData.commissionPaidFromWallet = true;
          updateData.walletCommissionAmount = totalDeduction;
        }
      }
    }

    // 2. Service completion payload enrichment
    if (newStatus === "Completed") {
      if (currentStatus !== "Completed") {
        updateData.isReviewedByCustomer = false;
      }
      if (additionalCharges && additionalCharges.length > 0) {
        updateData.additionalCharges = additionalCharges;
        const totalCharges = additionalCharges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
        updateData.totalAmount = (bookingData.totalAmount || 0) + totalCharges;

        // Calculate and deduct commission for additional charges
        const configSnap = await getDoc(doc(db, 'webSettings', 'applicationConfig'));
        const appConfig = configSnap.exists() ? configSnap.data() as any : {};
        const extraCommission = appConfig.providerFeeType === 'percentage' 
          ? calculateProviderFee(totalCharges, appConfig.providerFeeType, appConfig.providerFeeValue) 
          : (totalCharges * (appConfig.providerExtraFeePercentage || 0)) / 100;

        if (extraCommission > 0) {
          const currentWalletBalance = providerData.providerWalletBalance || 0;
          await updateDoc(providerUserRef, { 
            providerWalletBalance: currentWalletBalance - extraCommission 
          });

          await addDoc(collection(db, 'providerWalletTransactions'), {
            providerId,
            amount: -extraCommission,
            type: 'commission_deduction',
            bookingId,
            description: `Commission auto-deducted for extra work/charges on booking (ID: ${bookingData.bookingId || bookingId})`,
            timestamp: Timestamp.now(),
          });
        }
      }
      if (finalizedPaymentMethod) {
        updateData.paymentMethod = finalizedPaymentMethod;
      }
    }

    await updateDoc(bookingDocRef, updateData);
    return { success: true };
  } catch (error: any) {
    console.error("Error in updateBookingStatusByProviderAction:", error);
    return { success: false, message: error.message || "Failed to update booking status." };
  }
}

export interface WalletComplaint {
  id: string;
  complaintId?: string | null;
  providerId: string;
  providerName: string;
  bookingId?: string | null;
  bookingHumanId?: string | null;
  transactionId?: string | null;
  message: string;
  amount: number;
  status: 'pending' | 'accepted' | 'rejected' | 'processed' | 'solved';
  createdAt: number;
  resolvedAt?: number;
  resolutionNotes?: string;
}

// 7. Submit a new wallet complaint (Provider) (MySQL)
export async function submitWalletComplaintAction(
  providerId: string,
  message: string,
  amount: number,
  transactionId: string,
  bookingId?: string | null
) {
  try {
    const configSnap = await getDoc(doc(db, 'webSettings', 'applicationConfig'));
    const appConfig = configSnap.exists() ? configSnap.data() as any : {};
    const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;
    const symbol = appConfig?.currencySymbol || "₹";

    const providerSnap = await getDoc(doc(db, 'users', providerId));
    const providerName = providerSnap.exists() ? (providerSnap.data()?.displayName || 'Provider') : 'Provider';

    let bookingHumanId = '';
    if (bookingId) {
      const bookingSnap = await getDoc(doc(db, 'bookings', bookingId));
      bookingHumanId = bookingSnap.exists() ? (bookingSnap.data()?.bookingId || bookingId) : bookingId;
    }

    // Check if complaint already exists for this transaction ID in MySQL
    const existing = await getDocs(
      query(
        collection(db, 'providerComplaints'),
        where('providerId', '==', providerId),
        where('transactionId', '==', transactionId),
        limit(1)
      )
    );

    if (!existing.empty) {
      return { success: false, message: "A complaint has already been submitted for this transaction." };
    }

    const complaintId = String(Math.floor(100000 + Math.random() * 900000));

    // Add complaint document to MySQL
    await addDoc(collection(db, 'providerComplaints'), {
      complaintId,
      providerId,
      providerName,
      bookingId: bookingId || null,
      bookingHumanId: bookingHumanId || null,
      transactionId,
      message,
      amount,
      status: 'pending',
      createdAt: Timestamp.now(),
    });

    // Notify Admins in MySQL
    const adminsSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
    if (!adminsSnapshot.empty) {
      const promises = adminsSnapshot.docs.map(async (adminDoc) => {
        // Write notification to MySQL
        await addDoc(collection(db, 'userNotifications'), {
          userId: adminDoc.id,
          title: "New Wallet Complaint",
          message: `Provider ${providerName} submitted a dispute for transaction ${transactionId}${bookingHumanId ? ` (Booking #${bookingHumanId})` : ''}.`,
          type: 'admin_alert',
          href: '/admin/provider-withdrawals?tab=wallet_complaints',
          read: false,
          createdAt: Timestamp.now(),
        });
      });
      await Promise.allSettled(promises);

      // Trigger push alerts to admins asynchronously
      try {
        const pushPromises = adminsSnapshot.docs.map(adminDoc => 
          sendServerPushNotification({
            userId: adminDoc.id,
            title: "New Wallet Dispute Filed",
            body: `Provider ${providerName} filed a dispute for transaction ${transactionId}${bookingHumanId ? ` (Booking #${bookingHumanId})` : ''}.`,
            href: '/admin/provider-withdrawals?tab=wallet_complaints',
            type: 'admin_wallet_complaint_alert',
            variables: {
              providerName,
              bookingHumanId: bookingHumanId || 'None',
              amount: amount.toFixed(decimals),
              currencySymbol: symbol
            }
          })
        );
        await Promise.allSettled(pushPromises);
      } catch (err) {
        console.error("Error triggering admin dispute push notification:", err);
      }
    }

    return { success: true, message: "Complaint submitted successfully to admin." };
  } catch (error: any) {
    console.error("Error submitting wallet complaint:", error);
    return { success: false, message: error.message || "Failed to submit complaint." };
  }
}

// 8. Fetch pending wallet complaints (Admin) (MySQL)
export async function getPendingWalletComplaintsAction(): Promise<WalletComplaint[]> {
  try {
    const snap = await getDocs(query(collection(db, 'providerComplaints'), orderBy('createdAt', 'desc')));

    const complaints: WalletComplaint[] = [];
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      complaints.push({
        id: docSnap.id,
        complaintId: data.complaintId || docSnap.id,
        providerId: data.providerId,
        providerName: data.providerName,
        bookingId: data.bookingId,
        bookingHumanId: data.bookingHumanId || data.bookingId,
        transactionId: data.transactionId || null,
        message: data.message,
        amount: data.amount || 0,
        status: data.status || 'pending',
        createdAt: getTimestampMillis(data.createdAt) || Date.now(),
        resolvedAt: data.resolvedAt ? getTimestampMillis(data.resolvedAt) : undefined,
        resolutionNotes: data.resolutionNotes,
      });
    });

    return complaints;
  } catch (error) {
    console.error("Error loading wallet complaints:", error);
    return [];
  }
}

// 8b. Fetch wallet complaints for a specific provider (MySQL)
export async function getProviderWalletComplaintsAction(providerId: string): Promise<WalletComplaint[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'providerComplaints'),
        where('providerId', '==', providerId),
        orderBy('createdAt', 'desc')
      )
    );

    const complaints: WalletComplaint[] = [];
    snap.docs.forEach(docSnap => {
      const data = docSnap.data();
      complaints.push({
        id: docSnap.id,
        complaintId: data.complaintId || docSnap.id,
        providerId: data.providerId,
        providerName: data.providerName,
        bookingId: data.bookingId,
        bookingHumanId: data.bookingHumanId || data.bookingId,
        transactionId: data.transactionId || null,
        message: data.message,
        amount: data.amount || 0,
        status: data.status || 'pending',
        createdAt: getTimestampMillis(data.createdAt) || Date.now(),
        resolvedAt: data.resolvedAt ? getTimestampMillis(data.resolvedAt) : undefined,
        resolutionNotes: data.resolutionNotes,
      });
    });

    return complaints;
  } catch (error) {
    console.error("Error loading provider complaints:", error);
    return [];
  }
}

// 9. Resolve wallet complaint (Admin manually refunds or dismisses) (MySQL)
export async function resolveWalletComplaintAction(
  complaintId: string,
  resolutionStatus: 'accepted' | 'rejected' | 'processed' | 'solved',
  refundAmount: number,
  resolutionNotes: string
) {
  try {
    const configSnap = await getDoc(doc(db, 'webSettings', 'applicationConfig'));
    const appConfig = configSnap.exists() ? configSnap.data() as any : {};
    const decimals = appConfig?.currencyDecimalPoints !== undefined ? Number(appConfig.currencyDecimalPoints) : 2;
    const symbol = appConfig?.currencySymbol || "₹";

    const complaintRef = doc(db, 'providerComplaints', complaintId);
    const compSnap = await getDoc(complaintRef);
    if (!compSnap.exists()) {
      throw new Error("Complaint record not found.");
    }
    const compData = compSnap.data() as any;
    if (compData.status !== 'pending') {
      throw new Error("This complaint has already been resolved.");
    }

    const providerId = compData.providerId;
    const providerUserRef = doc(db, 'users', providerId);

    const shouldRefund = (resolutionStatus === 'accepted' || resolutionStatus === 'solved');

    if (shouldRefund && refundAmount > 0) {
      const pSnap = await getDoc(providerUserRef);
      if (!pSnap.exists()) {
        throw new Error("Provider profile not found.");
      }
      
      const currentWalletBalance = pSnap.data()?.providerWalletBalance || 0;
      const newBalance = currentWalletBalance + refundAmount;
      
      // 1. Credit provider wallet in MySQL
      await updateDoc(providerUserRef, { providerWalletBalance: newBalance });

      // 2. Add refund ledger item in MySQL
      await addDoc(collection(db, 'providerWalletTransactions'), {
        providerId,
        amount: refundAmount,
        type: 'commission_refund',
        bookingId: compData.bookingId || null,
        description: `Dispute Refund (${resolutionStatus}): ${resolutionNotes}`,
        timestamp: Timestamp.now(),
      });

      // 3. Mark booking as refunded in MySQL if bookingId exists
      if (compData.bookingId) {
        const bookingRef = doc(db, 'bookings', compData.bookingId);
        await updateDoc(bookingRef, { commissionRefunded: true });
      }

      // 4. Send approval notification in MySQL
      await addDoc(collection(db, 'userNotifications'), {
        userId: providerId,
        title: `Dispute ${resolutionStatus === 'accepted' ? 'Accepted' : 'Solved'}`,
        message: `Your dispute (ID: ${compData.complaintId || compSnap.id}) was marked as ${resolutionStatus}. ${symbol}${refundAmount.toFixed(decimals)} refunded. Notes: ${resolutionNotes}`,
        type: 'success',
        href: '/provider/wallet',
        read: false,
        createdAt: Timestamp.now(),
      });
    } else {
      // Send notification in MySQL for rejected or processed without refund
      await addDoc(collection(db, 'userNotifications'), {
        userId: compData.providerId,
        title: `Dispute ${resolutionStatus === 'rejected' ? 'Rejected' : 'Processed'}`,
        message: `Your dispute (ID: ${compData.complaintId || compSnap.id}) was marked as ${resolutionStatus}. Notes: ${resolutionNotes}`,
        type: 'info',
        href: '/provider/wallet',
        read: false,
        createdAt: Timestamp.now(),
      });
    }

    // Mark complaint status in MySQL
    await updateDoc(complaintRef, {
      status: resolutionStatus,
      resolutionNotes,
      resolvedAt: Timestamp.now(),
    });

    // Send push notification to the provider
    try {
      if (shouldRefund && refundAmount > 0) {
        await sendServerPushNotification({
          userId: providerId,
          title: `Dispute ${resolutionStatus === 'accepted' ? 'Accepted' : 'Solved'}!`,
          body: `Your prepaid wallet has been credited with ${symbol}${refundAmount.toFixed(decimals)}. Status: ${resolutionStatus}`,
          href: '/provider/wallet',
          type: 'provider_wallet_refund',
          variables: {
            amount: refundAmount.toFixed(decimals),
            reason: `Dispute ${resolutionStatus}: ${resolutionNotes}`,
            currencySymbol: symbol
          }
        });
      } else {
        await sendServerPushNotification({
          userId: providerId,
          title: `Dispute Update`,
          body: `Your dispute was marked as ${resolutionStatus}. Notes: ${resolutionNotes}`,
          href: '/provider/wallet',
          type: 'withdrawal_status',
          variables: {
            status: resolutionStatus,
            amount: refundAmount.toFixed(decimals)
          }
        });
      }
    } catch (pushErr) {
      console.error("Error triggering resolve dispute push alert:", pushErr);
    }

    revalidatePath('/provider/wallet');
    revalidatePath('/admin/provider-withdrawals');
    return { success: true, message: `Dispute marked as ${resolutionStatus} successfully.` };
  } catch (error: any) {
    console.error("Error resolving wallet complaint:", error);
    return { success: false, message: error.message || "Failed to resolve complaint." };
  }
}

// 10. Server-side helper to send push notifications directly via admin.messaging()
export async function sendServerPushNotification(params: {
  userId: string;
  title: string;
  body: string;
  href?: string;
  icon?: string;
  sound?: string;
  type?: string;
  variables?: Record<string, string | number | undefined>;
}) {
  try {
    const { userId, title, body, href, icon, sound, type: customType, variables } = params;

    let finalTitle = title;
    let finalBody = body;

    // Check if push notification category is enabled
    const pushType = customType || 'other';
    if (pushType !== 'other') {
      const template = await getPushTemplate(pushType);
      if (!template.isEnabled) {
        console.log(`Push notification type "${pushType}" is disabled in settings. Skipping dispatch.`);
        return { success: true, message: 'Push notification is disabled.' };
      }

      // Replace placeholders
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

    // Get user's FCM tokens from Firestore (which has tokens)
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { error: 'User not found' };
    }

    const userData = userDoc.data();
    const fcmTokensObj = userData?.fcmTokens || {};
    const tokens = Object.keys(fcmTokensObj);

    if (tokens.length === 0) {
      return { error: 'No FCM tokens found' };
    }

    // Send push
    const messaging = admin.messaging();
    const messagePayload = {
      notification: {
        title: finalTitle,
        body: finalBody,
      },
      data: {
        click_action: href || '/',
        icon: icon || '/android-chrome-192x192.png',
        sound: sound || 'default',
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title: finalTitle,
          body: finalBody,
          icon: icon || '/android-chrome-192x192.png',
          click_action: href || '/',
          requireInteraction: sound === 'order',
        }
      }
    };

    const response = await messaging.sendEachForMulticast({
      tokens,
      ...messagePayload,
    });

    return { success: true, response };
  } catch (error) {
    console.error("sendServerPushNotification error:", error);
    return { error };
  }
}

// 11. Delete wallet complaint (Admin only) (MySQL)
export async function deleteWalletComplaintAction(complaintId: string) {
  try {
    const complaintRef = doc(db, 'providerComplaints', complaintId);
    await deleteDoc(complaintRef);
    revalidatePath('/admin/provider-withdrawals');
    return { success: true, message: "Dispute complaint deleted successfully." };
  } catch (error: any) {
    console.error("Error deleting wallet complaint:", error);
    return { success: false, message: error.message || "Failed to delete complaint." };
  }
}
