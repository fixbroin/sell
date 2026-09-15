import { NextResponse } from 'next/server';
import { getCities, getAreas } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const [cities, areas] = await Promise.all([
      getCities(),
      getAreas()
    ]);
    return NextResponse.json({ cities, areas });
  } catch (error) {
    console.error("API Error in /api/locations:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
