
import { NextResponse } from 'next/server';

export async function GET() {
  // This route serves the public Firebase configuration to the service worker.
  // It's secure because it only uses NEXT_PUBLIC_ prefixed environment variables,
  // which are already exposed to the client-side.
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
  };

  const responseBody = `const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`;

  return new NextResponse(responseBody, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache for a year
    },
  });
}
