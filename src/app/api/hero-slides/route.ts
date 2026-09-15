import { NextResponse } from 'next/server';
import { getHeroSlidesServer } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const data = await getHeroSlidesServer();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error in /api/hero-slides:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
