import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';
// src/app/api/admin/images/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);

    let baseDir = process.cwd();
    if (baseDir.includes(path.join('.next', 'standalone')) || baseDir.endsWith('standalone')) {
      baseDir = path.join(baseDir, '..', '..');
    }
    const uploadsDir = path.join(baseDir, 'public', 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Extract all files to public/uploads, overwriting existing ones
    zip.extractAllTo(uploadsDir, true);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Images restore failed:", error);
    return NextResponse.json({ error: error.message || 'Restore failed' }, { status: 500 });
  }
}
