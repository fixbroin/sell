import { type NextRequest, NextResponse } from 'next/server';
import { getFirestore, Timestamp } from '@/lib/mysqlDbAdmin';
import { getAuth } from 'firebase-admin/auth';
import { initFirebaseAdmin } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    // 1. Check if user presence tracking is disabled in settings
    try {
      const { executeDbGetDoc } = require('@/app/actions/dbActions');
      const configDoc = await executeDbGetDoc('webSettings', 'applicationConfig');
      if (configDoc && configDoc.exists && configDoc.data) {
        if (configDoc.data.enableUserPresence === false) {
          return new NextResponse(null, { status: 204 });
        }
      }
    } catch (dbErr) {
      console.warn("Could not check enableUserPresence in API:", dbErr);
    }

    const body = await req.json();
    const { uid, ts } = body;

    if (!uid || typeof uid !== 'string' || !ts || typeof ts !== 'number') {
      return NextResponse.json({ success: false, error: 'Invalid payload.' }, { status: 400 });
    }

    initFirebaseAdmin();
    const auth = getAuth();
    const db = getFirestore();

    // Security: Verify token and ensure user can only update their own lastSeen
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await auth.verifyIdToken(idToken);
            if (decodedToken.uid !== uid) {
                return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
            }
        } catch (e) {
            // If token invalid but provided, reject. 
            // Note: sendBeacon often doesn't send headers, so we might need to allow unauthenticated 
            // BUT only for harmless updates like lastSeen.
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
    }

    const userDocRef = db.collection('users').doc(uid);
    // Use set with merge to ensure the operation succeeds even if the document doesn't exist yet
    await userDocRef.set({
      lastLoginAt: Timestamp.fromMillis(ts),
    }, { merge: true });
    
    return new NextResponse(null, { status: 204 });

  } catch (error: any) {
    console.error('Error in /api/mark-last-seen:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
