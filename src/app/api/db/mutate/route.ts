import { NextResponse, type NextRequest } from 'next/server';
import { getPool, addDocInternal, setDocInternal, updateDocInternal, deleteDocInternal, getDocInternal } from '@/lib/mysql';
import { verifyRequest, validateAccess, isUserAdmin, isFieldProtectedFromCustomerMutation } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { action, path, id, docId, data, options } = await request.json();

    // Reconstruct the full document path to validate access properly
    const targetId = id || docId;
    const fullPath = targetId ? `${path}/${targetId}` : path;
    const isAdmin = isUserAdmin(user);

    // 1. Check Firestore-style access rules
    const isWriteAllowed = validateAccess(user, fullPath, 'write');
    if (!isWriteAllowed) {
      return NextResponse.json({ success: false, error: `Forbidden: No write access to "${fullPath}".` }, { status: 403 });
    }

    const cleanData = data && typeof data === 'object' ? { ...data } : data;

    // 2. Privilege Escalation Prevention (Issue 3):
    // Non-admin users cannot modify privileged fields (role, isAdmin, status, walletBalance, etc.)
    if (!isAdmin && (path === 'users' || fullPath.startsWith('users/'))) {
      if (cleanData && typeof cleanData === 'object') {
        for (const key of Object.keys(cleanData)) {
          if (isFieldProtectedFromCustomerMutation(key)) {
            delete cleanData[key];
          }
        }
      }
    }

    // 3. Financial & Booking Security Rules (Issue 4):
    // Direct client cannot delete bookings or elevate booking status to Confirmed/Completed
    if (!isAdmin && path === 'bookings') {
      if (action === 'deleteDoc') {
        return NextResponse.json({ success: false, error: 'Forbidden: Bookings cannot be deleted directly by clients.' }, { status: 403 });
      }

      if (cleanData && typeof cleanData === 'object') {
        // Prevent client from setting status to Confirmed without server payment verification
        if (cleanData.status === 'Confirmed' || cleanData.status === 'Completed') {
          return NextResponse.json({ 
            success: false, 
            error: 'Forbidden: Confirmed and Completed booking states must be processed via authoritative payment verification endpoints.' 
          }, { status: 403 });
        }
      }
    }

    // 4. Withdrawal Request Integrity:
    // Non-admins cannot approve or modify the status of withdrawal requests
    if (!isAdmin && path === 'withdrawalRequests') {
      if (action === 'deleteDoc') {
        return NextResponse.json({ success: false, error: 'Forbidden: Withdrawal requests cannot be deleted.' }, { status: 403 });
      }
      if (action === 'updateDoc' || action === 'setDoc') {
        if (cleanData?.status && cleanData.status !== 'pending') {
          return NextResponse.json({ success: false, error: 'Forbidden: Only administrators can update withdrawal status.' }, { status: 403 });
        }
      }
      if (action === 'addDoc') {
        if (cleanData && cleanData.providerId !== user.uid) {
          return NextResponse.json({ success: false, error: 'Forbidden: Cannot create withdrawal request for another provider.' }, { status: 403 });
        }
        cleanData.status = 'pending';
      }
    }

    const pool = await getPool();

    if (action === 'addDoc') {
      const result = await addDocInternal(pool, path, cleanData);
      return NextResponse.json(result);
    }

    if (action === 'setDoc') {
      const targetId = id || docId;
      await setDocInternal(pool, path, targetId, cleanData, options);
      return NextResponse.json({ success: true, id: targetId });
    }

    if (action === 'updateDoc') {
      const targetId = id || docId;
      await updateDocInternal(pool, path, targetId, cleanData);
      return NextResponse.json({ success: true, id: targetId });
    }

    if (action === 'deleteDoc') {
      const targetId = id || docId;
      await deleteDocInternal(pool, path, targetId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Database mutation error' },
      { status: 500 }
    );
  }
}
