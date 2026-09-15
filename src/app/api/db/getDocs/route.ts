import { NextResponse, type NextRequest } from 'next/server';
import { getPool, getDocsInternal } from '@/lib/mysql';
import { verifyRequest, validateAccess, isUserAdmin } from '@/lib/dbSecurity';

const queryCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL_MS = 3000;

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { path, constraints = [] } = await request.json();

    // Check Firestore-style access rules
    const isReadAllowed = validateAccess(user, path, 'read');
    if (!isReadAllowed) {
      return NextResponse.json({ success: false, error: `Forbidden: No read access to "${path}".` }, { status: 403 });
    }

    // Enforce ownership filters for non-admin requests to private tables
    if (!isUserAdmin(user)) {
      const privateTablesToFilter: Record<string, string> = {
        'bookings': 'userId',
        'userNotifications': 'userId',
        'withdrawalRequests': 'providerId',
        'quotations': 'providerId',
        'invoices': 'providerId',
        'referrals': 'referrerId',
        'userCarts': 'userId',
        'userActivities': 'userId',
        'visitorInfoLogs': 'userId',
        'leaves': 'providerId',
        'customServiceRequests': 'userId',
        'providerWalletTransactions': 'providerId',
        'providerComplaints': 'providerId'
      };

      const filterField = privateTablesToFilter[path];
      if (filterField) {
        let hasValidFilter = false;
        for (const c of constraints) {
          if (c && c.type === 'where' && c.op === '==') {
            if ((c.field === 'customerId' || c.field === 'providerId' || c.field === 'userId' || c.field === 'referrerId') && c.value === user.uid) {
              hasValidFilter = true;
              break;
            }
          }
        }

        if (!hasValidFilter) {
          const actualField = (path === 'bookings' && user.role === 'provider') ? 'providerId' : filterField;
          constraints.push({ type: 'where', field: actualField, op: '==', value: user.uid });
        }
      }

      if (path === 'providerApplications') {
        let hasApprovedFilter = false;
        for (const c of constraints) {
          if (c && c.type === 'where' && c.field === 'status' && c.value === 'approved') {
            hasApprovedFilter = true;
            break;
          }
        }
        if (!hasApprovedFilter) {
          constraints.push({ type: 'where', field: 'status', op: '==', value: 'approved' });
        }
      }

      if (path === 'users') {
        const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com";
        const isAdminQuery = constraints.some((c: any) => 
          (c && c.type === 'where' && c.field === 'email' && c.value === ADMIN_EMAIL) || 
          (c && c.type === 'where' && c.field === 'role' && (c.value === 'super_admin' || c.value === 'finance_admin'))
        );
        if (!isAdminQuery) {
          let hasSelfFilter = false;
          for (const c of constraints) {
            if (c && c.type === 'where' && c.op === '==' && c.field === 'uid' && c.value === user.uid) {
              hasSelfFilter = true;
              break;
            }
          }
          if (!hasSelfFilter) {
            constraints.push({ type: 'where', field: 'uid', op: '==', value: user.uid });
          }
        }
      }
    }

    const isCacheable = (path === 'adminCategories' || path === 'adminSubCategories' || path === 'adminServices' || path === 'adminSlideshows' || path === 'webSettings' || path === 'adminReviews' || path === 'blogPosts') && constraints.length === 0;
    const cacheKey = `${path}:${JSON.stringify(constraints)}`;

    if (isCacheable) {
      const cached = queryCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return NextResponse.json(cached.data);
      }
    }

    const pool = await getPool();
    const result = await getDocsInternal(pool, path, constraints);

    // Sanitize sensitive provider details for non-admin queries (e.g. checkout zone queries)
    if (path === 'providerApplications' && !isUserAdmin(user) && Array.isArray(result?.docs)) {
      result.docs = result.docs.map((d: any) => {
        if (!d?.data) return d;
        const {
          bankAccount,
          bankDetails,
          kycDocuments,
          aadhaarNumber,
          panNumber,
          adminReviewNotes,
          signatureUrl,
          ...safeData
        } = d.data;
        return {
          ...d,
          data: safeData
        };
      });
    }

    if (isCacheable) {
      queryCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { docs: [], size: 0, empty: true, error: error.message || 'Database query error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  queryCache.clear();
  return NextResponse.json({ success: true });
}
