import { verifyRequest, isUserAdmin } from '@/lib/dbSecurity';
// src/app/api/admin/images/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  const user = await verifyRequest(request);
  if (!user || !isUserAdmin(user)) {
    return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    let baseDir = process.cwd();
    if (baseDir.includes(path.join('.next', 'standalone')) || baseDir.endsWith('standalone')) {
      baseDir = path.join(baseDir, '..', '..');
    }
    const uploadsDir = path.join(baseDir, 'public', 'uploads');
    const zip = new AdmZip();

    if (fs.existsSync(uploadsDir)) {
      zip.addLocalFolder(uploadsDir);
    } else {
      fs.mkdirSync(uploadsDir, { recursive: true });
      zip.addLocalFolder(uploadsDir);
    }

    const buffer = zip.toBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="images-backup-${new Date().toISOString().slice(0, 10)}.zip"`
      }
    });
  } catch (error: any) {
    console.error("Images backup failed:", error);
    return NextResponse.json({ error: error.message || 'Backup failed' }, { status: 500 });
  }
}
