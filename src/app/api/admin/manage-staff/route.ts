import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { Timestamp, FieldValue } from '@/lib/mysqlDbAdmin';
import { SUPER_ADMIN_PERMISSIONS } from '@/config/rbac';

export async function POST(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    // 1. Verify Requestor is a Super Admin
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const requestorUid = decodedToken.uid;

    const requestorDoc = await adminDb.collection('admins').doc(requestorUid).get();
    if (!requestorDoc.exists || requestorDoc.data()?.role !== 'super_admin') {
      return NextResponse.json({ error: 'Only Super Admins can manage staff' }, { status: 403 });
    }

    // 2. Parse Body
    const { email, password, name, role, permissions } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 3. Create or Update Firebase Auth Account
    let userRecord;
    try {
      userRecord = await adminAuth.getUserByEmail(email);
      // If user exists, we don't change their password unless specifically requested (keeping it simple for now)
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'auth/user-not-found') {
        userRecord = await adminAuth.createUser({
          email,
          password,
          displayName: name,
        });
      } else {
        throw error;
      }
    }

    const uid = userRecord.uid;

    // 4. Create record in 'users' collection if it doesn't exist
    const userDocRef = adminDb.collection('users').doc(uid);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
        // Need a sequential user number
        const statsRef = adminDb.collection('appConfiguration').doc('stats');
        const statsDoc = await statsRef.get();
        let nextNumber = 1000;
        if (statsDoc.exists) {
            nextNumber = (statsDoc.data()?.totalUsers || 0) + 1001;
        }

        await userDocRef.set({
            uid,
            email,
            displayName: name,
            userNumber: nextNumber,
            isActive: true,
            createdAt: Timestamp.now(),
            lastLoginAt: Timestamp.now(),
            walletBalance: 0,
        }, { merge: true });
        
        await statsRef.set({ totalUsers: FieldValue.increment(1) }, { merge: true });
    }

    // 5. Create record in 'admins' collection
    await adminDb.collection('admins').doc(uid).set({
      email: email.toLowerCase(),
      name: name,
      role: role || 'staff_admin',
      permissions: role === 'super_admin' ? SUPER_ADMIN_PERMISSIONS : permissions,
      status: 'active',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return NextResponse.json({ success: true, uid });

  } catch (error: unknown) {
    console.error('Error in manage-staff API:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

    try {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      
      const requestorDoc = await adminDb.collection('admins').doc(decodedToken.uid).get();
      if (!requestorDoc.exists || requestorDoc.data()?.role !== 'super_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
  
      const { uid } = await request.json();
      if (!uid) return NextResponse.json({ error: 'Missing UID' }, { status: 400 });
  
      // FETCH TARGET ADMIN DATA
      const adminToDeleteDoc = await adminDb.collection('admins').doc(uid).get();
      if (!adminToDeleteDoc.exists) return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
      
      const adminToDeleteData = adminToDeleteDoc.data();
      const targetEmail = adminToDeleteData?.email;
      const targetRole = adminToDeleteData?.role;

      // 1. PROTECT MAIN SUPER ADMIN FROM DELETION (Cannot be deleted via API by anyone)
      const primaryAdminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com";
      if (targetEmail === primaryAdminEmail) {
        return NextResponse.json({ error: 'The primary super admin cannot be removed.' }, { status: 403 });
      }

      // 2. PROTECT OTHER SUPER ADMINS (Only the Main Admin can delete other Super Admins)
      if (targetRole === 'super_admin' && decodedToken.email !== primaryAdminEmail) {
        return NextResponse.json({ error: 'Only the Primary Admin can remove other Super Admins.' }, { status: 403 });
      }

      await adminDb.collection('admins').doc(uid).delete();
      // We don't delete from 'users' or Firebase Auth for safety, just revoke admin
  
      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      return NextResponse.json({ error: message }, { status: 500 });
    }
}
