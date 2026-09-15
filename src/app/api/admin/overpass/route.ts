import { NextResponse } from 'next/server';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

import { NextRequest } from 'next/server';
import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user || !isUserAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { query } = await request.json();
    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    let lastError = null;

    // Try endpoints in order
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'YourbrandApp/1.0 (sup@yourbrand.in)'
          },
          body: `data=${encodeURIComponent(query)}`,
          next: { revalidate: 0 } // disable next.js caching
        });

        if (response.ok) {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return NextResponse.json(data);
          } else {
            const text = await response.text();
            if (text.includes('Error') || text.includes('error')) {
              throw new Error(`Overpass XML error: ${text.substring(0, 300)}`);
            }
            throw new Error('Overpass responded with non-JSON content');
          }
        } else {
          const errText = await response.text();
          throw new Error(`Status ${response.status}: ${errText.substring(0, 200)}`);
        }
      } catch (err: any) {
        console.warn(`Overpass proxy failed for ${endpoint}:`, err.message);
        lastError = err;
      }
    }

    return NextResponse.json({ 
      error: 'All Overpass endpoints failed', 
      details: lastError?.message 
    }, { status: 502 });

  } catch (error: any) {
    console.error('Error in Overpass proxy API:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
