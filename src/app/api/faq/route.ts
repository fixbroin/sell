import { NextResponse } from 'next/server';
import { getFaqsServer } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const faqs = await getFaqsServer();
    return NextResponse.json(faqs);
  } catch (error) {
    console.error("API Error in /api/faq:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
