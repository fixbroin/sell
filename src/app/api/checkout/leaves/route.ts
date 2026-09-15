import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const leavesSnap = await adminDb.collection("leaves").get();
        const leaves = leavesSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        return NextResponse.json(leaves);
    } catch (error) {
        console.error("Error fetching leaves in API:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
