import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ isAdmin: false, error: 'Email is required' }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();
    const primaryAdminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@yourdomain.com').toLowerCase();

    if (emailLower === primaryAdminEmail) {
      return NextResponse.json({ isAdmin: true });
    }

    // Query admins collection by email
    const snapshot = await adminDb
      .collection('admins')
      .where('email', '==', emailLower)
      .get();

    if (!snapshot.empty) {
      const activeAdmin = snapshot.docs.find(doc => {
        const d = doc.data();
        return d?.status === 'active' || d?.isActive === true;
      });
      if (activeAdmin) {
        return NextResponse.json({ isAdmin: true });
      }
    }

    return NextResponse.json({ isAdmin: false });
  } catch (error) {
    console.error('Error verifying admin email:', error);
    return NextResponse.json({ isAdmin: false, error: 'Internal server error' }, { status: 500 });
  }
}
