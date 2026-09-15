
// src/app/ads.txt/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc } from '@/lib/mysqlDb';
import type { MarketingSettings } from '@/types/firestore';

const MARKETING_CONFIG_COLLECTION = "webSettings";
const MARKETING_CONFIG_DOC_ID = "marketingConfiguration";

export const dynamic = 'force-dynamic'; // Ensure this route is always dynamically rendered

export async function GET() {
  try {
    const settingsDocRef = doc(db, MARKETING_CONFIG_COLLECTION, MARKETING_CONFIG_DOC_ID);
    const docSnap = await getDoc(settingsDocRef);

    let adsTxtContent = "";
    if (docSnap.exists()) {
      const settings = docSnap.data() as MarketingSettings;
      adsTxtContent = settings.adsTxtContent || "";
    }

    return new NextResponse(adsTxtContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400', // Cache for 1 day
      },
    });
  } catch (error) {
    console.error("Error fetching ads.txt content:", error);
    return new NextResponse("Error fetching ads.txt content.", {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}

    