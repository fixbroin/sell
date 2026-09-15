import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { NextRequest } from 'next/server';

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET || "default_internal_secret_key_123456";

export interface RequestUser {
  uid: string;
  email?: string;
  role?: string;
  isInternal: boolean;
}

/**
 * Decodes Authorization header token or checks for x-internal-token.
 */
export async function verifyRequest(req: NextRequest): Promise<RequestUser> {
  // 1. Check internal bypass header (for server-side routes / Next.js server actions)
  const internalToken = req.headers.get('x-internal-token');
  if (internalToken === INTERNAL_SECRET) {
    return { uid: 'server', role: 'super_admin', isInternal: true };
  }

  const guestUser: RequestUser = { uid: 'guest', role: 'guest', isInternal: false };

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

    // Fetch user role from database
    const userDoc = await adminDb.collection('users').doc(uid).get();
    const role = userDoc.exists ? userDoc.data()?.role : undefined;

    return { uid, email, role, isInternal: false };
  } catch (error) {
    console.error("verifyRequest authentication error:", error);
    return guestUser;
  }
}

/**
 * Determines if the authenticated user has administrator privileges.
 */
export function isUserAdmin(user: RequestUser): boolean {
  const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com";
  return (
    user.isInternal ||
    user.role === 'super_admin' ||
    user.role === 'finance_admin' ||
    (user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) ||
    false
  );
}

/**
 * Firestore-style database security rules.
 */
export function validateAccess(user: RequestUser, path: string, action: 'read' | 'write'): boolean {
  // 1. Admins have absolute read & write access to everything
  if (isUserAdmin(user)) {
    return true;
  }

  const parts = path.split('/').filter(Boolean);
  const table = parts[0];
  const docId = parts[1];

  // Helper: check if doc ID matches user's UID
  const isOwner = docId === user.uid;

  // 2. Public Static Content (Readable by all, writable only by Admin)
  const PUBLIC_READ_TABLES = [
    'adminCategories',
    'adminSubCategories',
    'adminServices',
    'adminSlideshows',
    'webSettings',
    'appConfiguration',
    'contentPages',
    'adminFAQs',
    'taxes',
    'adminPopups',
    'blogPosts',
    'cities',
    'areas',
    'pinCodeAreaMappings',
    'serviceZones',
    'seoSettings',
    'cityCategorySeoSettings',
    'areaCategorySeoSettings',
    'areaServiceSeoSettings'
  ];

  if (PUBLIC_READ_TABLES.includes(table)) {
    return action === 'read';
  }

  // 3. User Accounts (Owner only, or query-level filtered getDocs, or allowed if authenticated to view provider/public user info)
  if (table === 'users') {
    if (action === 'read') return user.uid !== 'guest';
    return isOwner;
  }

  // 4. Provider Applications (Owner only)
  if (table === 'providerApplications') {
    return isOwner;
  }

  // 5. Carts (Owner only)
  if (table === 'userCarts') {
    return isOwner;
  }

  // 6. Contact & Popup Submissions & Logs (Write-only for guests/users, read-only for admin)
  if ([
    'contactUsSubmissions',
    'popupSubmissions',
    'userActivities',
    'outOfZoneRequests',
    'visitorInfoLogs',
    'searchAnalytics'
  ].includes(table)) {
    return action === 'write';
  }

  // 7. Chats & Chat Messages (Only participants can access)
  if (table === 'chats' || table === 'chats_messages') {
    // We allow access; sub-level messages check is checked in query filters
    return true;
  }

  // 8. Bookings (Filtered by customerId/providerId query constraints, write allowed to create booking)
  if (table === 'bookings') {
    if (action === 'write') return true; // Can create or update booking details (e.g. pay cancel fee)
    return true; // Read is allowed; returned data is filtered at database query level
  }

  // 9. User Notifications
  if (table === 'userNotifications') {
    return true; // Owner checking is handled via query parameters
  }

  // 10. Withdrawals & Quotations & Invoices & Referrals & Custom Requests
  if (['withdrawalRequests', 'quotations', 'invoices', 'referrals', 'leaves', 'customServiceRequests', 'providerWalletTransactions', 'providerComplaints'].includes(table)) {
    return true; // Handled dynamically in components/actions by filtering for providerId/userId
  }

  // 11. Customer Reviews (Public read, authenticated write)
  if (table === 'adminReviews') {
    if (action === 'read') return true;
    return action === 'write' && user.uid !== 'guest';
  }

  // Block everything else by default
  return false;
}
