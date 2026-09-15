import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { NextRequest } from 'next/server';

// Strictly require configured internal secret with minimum 32 characters; NO fallback key
const rawSecret = process.env.INTERNAL_API_SECRET;
const INTERNAL_SECRET = (rawSecret && rawSecret.trim().length >= 32) ? rawSecret.trim() : null;

export interface RequestUser {
  uid: string;
  email?: string;
  role?: string;
  isInternal: boolean;
  isAdmin?: boolean;
  userId?: string;
  isInternalBypass?: boolean;
}

/**
 * Decodes Authorization header token or checks for x-internal-token.
 */
export async function verifyRequest(req: NextRequest | Request): Promise<RequestUser> {
  // 1. Check internal bypass header (for secure server-side routes with valid configured secret)
  const internalToken = req.headers.get('x-internal-token');
  if (INTERNAL_SECRET && internalToken && internalToken === INTERNAL_SECRET) {
    return { uid: 'server', role: 'super_admin', isInternal: true, isAdmin: true, userId: 'server', isInternalBypass: true };
  }

  const guestUser: RequestUser = { uid: 'guest', role: 'guest', isInternal: false, isAdmin: false, isInternalBypass: false };

  // 2. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return guestUser;
  }

  const token = authHeader.substring(7);
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const email = decodedToken.email;

    // Security Rule: Administrative roles MUST NEVER be read from the regular `users` collection!
    // Admin privileges are strictly derived from the dedicated `admins` collection.
    let role: string = 'customer';

    try {
      const adminDoc = await adminDb.collection('admins').doc(uid).get();
      if (adminDoc.exists) {
        const adminData = adminDoc.data();
        if (adminData?.status === 'active' && adminData?.role) {
          role = adminData.role;
        }
      } else {
        // Check if user has an approved provider application
        const providerDoc = await adminDb.collection('providerApplications').doc(uid).get();
        if (providerDoc.exists && providerDoc.data()?.status === 'approved') {
          role = 'provider';
        }
      }
    } catch (dbErr) {
      console.error("Error reading role verification from adminDb:", dbErr);
    }

    const tempUser: RequestUser = { uid, email, role, isInternal: false };
    const isAdmin = isUserAdmin(tempUser);
    return { uid, email, role, isInternal: false, isAdmin, userId: uid, isInternalBypass: false };
  } catch (error) {
    console.error("verifyRequest authentication error:", error);
    return guestUser;
  }
}

/**
 * Determines if the authenticated user has administrator privileges.
 */
export function isUserAdmin(user: RequestUser): boolean {
  if (user.isInternal) return true;
  if (!user.uid || user.uid === 'guest') return false;

  const ADMIN_EMAIL = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim();
  const userEmail = (user.email || '').toLowerCase().trim();

  const adminRoles = ['super_admin', 'superadmin', 'finance_admin', 'admin', 'staff'];
  const hasAdminRole = !!(user.role && adminRoles.includes(user.role));
  const isEnvAdminEmail = !!(ADMIN_EMAIL && userEmail && userEmail === ADMIN_EMAIL);

  return hasAdminRole || isEnvAdminEmail;
}

/**
 * Sanitizes configuration and settings objects by stripping sensitive credentials
 * such as payment gateway secret keys, webhooks secrets, SMTP passwords, and API tokens.
 */
export function sanitizeSettingsData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  // Sensitive keys that must NEVER be returned to non-admin callers
  const SENSITIVE_KEYS = new Set([
    'stripesecretkey',
    'stripewebhooksecret',
    'razorpaykeysecret',
    'razorpaywebhooksecret',
    'smtppass',
    'smtppassword',
    'smtpuser',
    'smtphost',
    'cronsecret',
    'jwtsecret',
    'internalapisecret',
    'whatsappapitoken',
    'whatsapptoken',
    'whatsappappsecret',
    'firebaseserviceaccount',
    'firebaseadminsdk',
    'adminsdkconfig',
    'privatekey',
    'private_key',
    'secretkey',
    'appsecret'
  ]);

  const sanitized: any = Array.isArray(data) ? [] : {};

  for (const [key, val] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.endsWith('secret') || lowerKey.endsWith('keysecret') || lowerKey.endsWith('pass') || lowerKey.endsWith('password')) {
      // Omit sensitive field
      continue;
    }

    if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
      sanitized[key] = sanitizeSettingsData(val);
    } else {
      sanitized[key] = val;
    }
  }

  return sanitized;
}

/**
 * Validates whether a given field can be mutated by a non-administrative user.
 * Prevents privilege escalation and tampering with account status or wallet balances.
 */
export function isFieldProtectedFromCustomerMutation(field: string): boolean {
  const PROTECTED_USER_FIELDS = new Set([
    'role',
    'isadmin',
    'isstaff',
    'issuperadmin',
    'status',
    'walletbalance',
    'commissionrate',
    'permissions',
    'referralcode',
    'totalearnings',
    'rating',
    'reviewcount'
  ]);
  return PROTECTED_USER_FIELDS.has(field.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

/**
 * Database security rules for reading and writing data.
 */
export function validateAccess(user: RequestUser, path: string, action: 'read' | 'write'): boolean {
  // 1. Admins and verified internal server requests have full access
  if (isUserAdmin(user)) {
    return true;
  }

  const parts = path.split('/').filter(Boolean);
  const table = parts[0];
  const docId = parts[1];

  const isAuthenticated: boolean = Boolean(user.uid && user.uid !== 'guest');
  const isOwner: boolean = Boolean(isAuthenticated && docId === user.uid);

  // 2. Financial & System-Critical Tables (NEVER directly writable by client mutations)
  // These tables can ONLY be written by authenticated server routes / admin tasks:
  const SERVER_ONLY_WRITE_TABLES = [
    'providerWalletTransactions',
    'invoices',
    'admins',
    'webSettings',
    'appConfiguration',
    'adminCategories',
    'adminSubCategories',
    'adminServices',
    'adminSlideshows',
    'contentPages',
    'adminFAQs',
    'taxes',
    'adminPopups',
    'cities',
    'areas',
    'pinCodeAreaMappings',
    'serviceZones',
    'adminPromoCodes',
    'adminCoupons',
    'providerControlOptions',
    'timeSlotCategoryLimits',
    'services',
    'seoSettings',
    'cityCategorySeoSettings',
    'areaCategorySeoSettings',
    'areaServiceSeoSettings',
    'adminTaxes'
  ];

  if (SERVER_ONLY_WRITE_TABLES.includes(table)) {
    if (action === 'write') return false; // Strictly blocked for non-admins
    // For read access: public static content is readable (sanitized at endpoint level)
    return true;
  }

  // 3. User Accounts (Owner can read/write their own; non-owner read requires authentication)
  if (table === 'users') {
    if (action === 'read') return isAuthenticated;
    return isOwner; // Fields sanitized in mutate endpoint
  }

  // 4. Provider Applications (Public read for directory/assignment; authenticated applicants can create/update their own)
  if (table === 'providerApplications') {
    if (action === 'read') return true; // Sanitized at endpoint level for non-admins
    return Boolean(isOwner || isAuthenticated);
  }

  // 5. Carts (Owner only)
  if (table === 'userCarts') {
    return isOwner;
  }

  // 6. Public Inquiries & Form Submissions (Write-allowed for visitors, read-only for admin)
  if ([
    'contactUsSubmissions',
    'popupSubmissions',
    'outOfZoneRequests',
    'visitorInfoLogs',
    'searchAnalytics',
    'customServiceRequests'
  ].includes(table)) {
    return action === 'write';
  }

  // 7. Chats & Chat Messages (Only authenticated users)
  if (table === 'chats' || table === 'chats_messages') {
    return isAuthenticated;
  }

  // 8. Bookings (Readable for tracking; writable for initial creation; status escalation guarded in mutate route)
  if (table === 'bookings') {
    if (action === 'read') return true;
    // Clients can create initial bookings with 'Pending Payment'; escalation to Confirmed/Completed is strictly blocked in /api/db/mutate
    return action === 'write';
  }

  // 9. User Notifications
  if (table === 'userNotifications') {
    return isAuthenticated;
  }

  // 10. Withdrawals, Quotations, Referrals, Leaves, Provider Complaints
  if ([
    'withdrawalRequests',
    'quotations',
    'referrals',
    'leaves',
    'providerComplaints'
  ].includes(table)) {
    return isAuthenticated;
  }

  // 11. Customer Reviews (Public read, public write submission)
  if (table === 'adminReviews') {
    if (action === 'read') return true;
    return action === 'write';
  }

  // Block everything else by default
  return false;
}
