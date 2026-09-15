
import { type NextRequest, NextResponse } from 'next/server';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user || !isUserAdmin(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { tag } = await req.json();

    if (!tag) {
      return NextResponse.json({ error: 'Tag is required' }, { status: 400 });
    }

    // 2. Revalidate the requested tag using our smart trigger
    // This will also bump the global cache version in Firestore
    const tagToRefresh = tag === 'all' ? 'global' : tag;
    
    await triggerRefresh(tagToRefresh);

    console.log(`[Cache] Full system refresh triggered (Tag: ${tagToRefresh}) by admin ${user.uid}`);

    return NextResponse.json({ 
      success: true, 
      message: `Cache for tag "${tagToRefresh}" has been cleared.` 
    });

  } catch (error: any) {
    console.error('Error clearing cache:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
