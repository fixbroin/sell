import { NextResponse, type NextRequest } from 'next/server';
import { getPool, addDocInternal, setDocInternal, updateDocInternal, deleteDocInternal } from '@/lib/mysql';
import { verifyRequest, validateAccess } from '@/lib/dbSecurity';

export async function POST(request: NextRequest) {
  try {
    const user = await verifyRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { action, path, id, docId, data, options } = await request.json();

    // Reconstruct the full document path to validate access properly
    const targetId = id || docId;
    const fullPath = targetId ? `${path}/${targetId}` : path;

    // Check Firestore-style access rules
    const isWriteAllowed = validateAccess(user, fullPath, 'write');
    if (!isWriteAllowed) {
      return NextResponse.json({ success: false, error: `Forbidden: No write access to "${fullPath}".` }, { status: 403 });
    }

    const pool = await getPool();

    if (action === 'addDoc') {
      const result = await addDocInternal(pool, path, data);
      return NextResponse.json(result);
    }

    if (action === 'setDoc') {
      const targetId = id || docId;
      await setDocInternal(pool, path, targetId, data, options);
      return NextResponse.json({ success: true, id: targetId });
    }

    if (action === 'updateDoc') {
      const targetId = id || docId;
      await updateDocInternal(pool, path, targetId, data);
      return NextResponse.json({ success: true, id: targetId });
    }

    if (action === 'deleteDoc') {
      const targetId = id || docId;
      await deleteDocInternal(pool, path, targetId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Database mutation error' },
      { status: 500 }
    );
  }
}
