import { NextResponse } from 'next/server';
import { getPublishedPostsServer } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const posts = await getPublishedPostsServer();
    return NextResponse.json(posts);
  } catch (error) {
    console.error("API Error in /api/blog:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
