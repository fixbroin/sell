import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initFirebaseAdmin } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ exists: false, error: 'Email is required' }, { status: 400 });
    }

    initFirebaseAdmin();

    const auth = getAuth();
    try {
      await auth.getUserByEmail(email);
      return NextResponse.json({ exists: true });
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        return NextResponse.json({ exists: false });
      }
      return NextResponse.json({ exists: false, error: authError.message });
    }
  } catch (error: any) {
    console.error('Error checking email existence:', error);
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
  }
}
