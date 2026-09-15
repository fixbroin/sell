import { type NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function POST(req: NextRequest) {
  try {
    const { url, fileUrl } = await req.json();
    const targetUrl = fileUrl || url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'URL is required.' }, { status: 400 });
    }

    // Forward to /api/upload DELETE logic
    const origin = req.nextUrl.origin;
    const authHeader = req.headers.get('authorization');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const res = await fetch(`${origin}/api/upload`, {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ fileUrl: targetUrl })
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error: any) {
    console.error('Error in /api/delete-upload:', error);
    return NextResponse.json({ success: false, error: error.message || 'Failed to delete file.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
