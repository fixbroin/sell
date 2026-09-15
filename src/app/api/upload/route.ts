// src/app/api/upload/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';
import { executeDbGetDoc } from '@/app/actions/dbActions';
import { verifyRequest } from '@/lib/dbSecurity';

export async function POST(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user || user.uid === 'guest') {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const uploadPath = (formData.get('uploadPath') as string) || 'general';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    // Validate size (5MB max)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'File size exceeds limit of 5MB.' }, { status: 400 });
    }

    // Validate extension
    const ext = path.extname(file.name).toLowerCase();
    const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp3', '.wav', '.pdf'];
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ success: false, error: `Invalid file extension "${ext}". Allowed: jpg, jpeg, png, gif, webp, mp3, wav, pdf.` }, { status: 400 });
    }

    // 1. Check Media Storage Configuration
    let driver = process.env.STORAGE_DRIVER || 'local';
    let remoteUploadUrl = process.env.REMOTE_UPLOAD_URL || '';
    let remoteSecretKey = process.env.REMOTE_SECRET_KEY || '';

    try {
      const storageDoc = await executeDbGetDoc('webSettings', 'storageConfiguration');
      if (storageDoc && storageDoc.exists && storageDoc.data) {
        if (storageDoc.data.driver) driver = storageDoc.data.driver;
        if (storageDoc.data.remoteUploadUrl) remoteUploadUrl = storageDoc.data.remoteUploadUrl;
        if (storageDoc.data.remoteSecretKey) remoteSecretKey = storageDoc.data.remoteSecretKey;
      }
    } catch (dbErr) {
      console.warn("Could not load storageConfiguration from DB, using fallback defaults:", dbErr);
    }

    // 2. REMOTE SHARED HOSTING / OTHER SERVER STORAGE
    if (driver === 'remote' && remoteUploadUrl && remoteUploadUrl.trim() !== '') {
      try {
        const remoteFormData = new FormData();
        remoteFormData.append('file', file);
        remoteFormData.append('uploadPath', uploadPath);

        const remoteRes = await fetch(remoteUploadUrl.trim(), {
          method: 'POST',
          headers: {
            'x-api-secret': remoteSecretKey
          },
          body: remoteFormData
        });

        const remoteData = await remoteRes.json();
        if (remoteRes.ok && remoteData.success && remoteData.url) {
          return NextResponse.json({
            success: true,
            url: remoteData.url,
            fileName: remoteData.fileName || file.name,
            path: remoteData.url,
            driver: 'remote'
          });
        } else {
          console.error("Remote storage upload failed, falling back to local:", remoteData?.error);
        }
      } catch (remoteErr) {
        console.error("Error connecting to remote storage server, falling back to local:", remoteErr);
      }
    }

    // 3. LOCAL VPS STORAGE (Fallback / Default)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Clean destination subfolder under public/uploads/
    const cleanSubfolder = uploadPath.replace(/^[/\\]+|[/\\]+$/g, '').replace(/[/\\]+/g, '/');
    
    // Resolve base directory, handling standalone mode to write to persistent root directory
    let baseDir = process.cwd();
    if (baseDir.includes(path.join('.next', 'standalone')) || baseDir.endsWith('standalone')) {
      baseDir = path.join(baseDir, '..', '..');
    }
    const isSoundsFolder = cleanSubfolder === 'sounds';
    const targetDir = isSoundsFolder
      ? path.join(baseDir, 'public', 'sounds')
      : path.join(baseDir, 'public', 'uploads', cleanSubfolder);

    await fs.mkdir(targetDir, { recursive: true });

    // Generate readable sequential filename preserving original extension
    const fileExt = ext || '.jpg';
    
    // Map folder name to singular label (e.g. services -> service)
    const segment = cleanSubfolder.split('/').pop()?.toLowerCase() || 'media';
    const folderLabelMap: Record<string, string> = {
      'services': 'service',
      'slideshows': 'slideshow',
      'categories': 'category',
      'banners': 'banner',
      'popups': 'popup',
      'blogs': 'blog',
      'general': 'general'
    };
    const label = folderLabelMap[segment] || segment;
    
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const prefix = `${dateStr}-${label}-yourbrand-`;
    
    let counter = 1;
    try {
      const files = await fs.readdir(targetDir);
      const matchingFiles = files.filter(f => f.startsWith(prefix));
      counter = matchingFiles.length + 1;
    } catch {}

    let filename = `${prefix}${counter}${fileExt}`;
    let fullPath = path.join(targetDir, filename);

    // Ensure no collisions by checking file access
    try {
      while (true) {
        await fs.access(fullPath);
        counter++;
        filename = `${prefix}${counter}${fileExt}`;
        fullPath = path.join(targetDir, filename);
      }
    } catch {
      // File does not exist, safe to write!
    }

    await fs.writeFile(fullPath, buffer);

    // Build public URL
    const publicUrl = isSoundsFolder 
      ? `/sounds/${filename}` 
      : `/uploads/${cleanSubfolder ? cleanSubfolder + '/' : ''}${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: filename,
      path: publicUrl,
      driver: 'local'
    });
  } catch (error: any) {
    console.error("Upload handler error:", error);
    return NextResponse.json({ success: false, error: error.message || 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await verifyRequest(req);
    if (!user || user.uid === 'guest') {
      return NextResponse.json({ success: false, error: 'Unauthorized.' }, { status: 401 });
    }

    const { fileUrl } = await req.json();
    if (!fileUrl || typeof fileUrl !== 'string') {
      return NextResponse.json({ success: false, error: 'No fileUrl provided' }, { status: 400 });
    }

    // 1. Local VPS Disk Deletion
    if (fileUrl.startsWith('/uploads/') || fileUrl.startsWith('uploads/')) {
      const cleanPath = path.normalize(fileUrl.replace(/^\/?uploads\//, '')).replace(/^(\.\.(\/|\\|$))+/, '');
      let baseDir = process.cwd();
      if (baseDir.includes(path.join('.next', 'standalone')) || baseDir.endsWith('standalone')) {
        baseDir = path.join(baseDir, '..', '..');
      }
      
      const targetDir = path.join(baseDir, 'public', 'uploads');
      const filePath = path.resolve(targetDir, cleanPath);
      
      // Directory traversal prevention
      if (!filePath.startsWith(targetDir)) {
        return NextResponse.json({ success: false, error: 'Access denied: Directory traversal detected.' }, { status: 403 });
      }

      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn("Local file unlink note:", filePath, err);
      }
    } else if (fileUrl.startsWith('/sounds/') || fileUrl.startsWith('sounds/')) {
      const cleanPath = path.normalize(fileUrl.replace(/^\/?sounds\//, '')).replace(/^(\.\.(\/|\\|$))+/, '');
      let baseDir = process.cwd();
      if (baseDir.includes(path.join('.next', 'standalone')) || baseDir.endsWith('standalone')) {
        baseDir = path.join(baseDir, '..', '..');
      }
      
      const targetDir = path.join(baseDir, 'public', 'sounds');
      const filePath = path.resolve(targetDir, cleanPath);
      
      // Directory traversal prevention
      if (!filePath.startsWith(targetDir)) {
        return NextResponse.json({ success: false, error: 'Access denied: Directory traversal detected.' }, { status: 403 });
      }

      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn("Local file unlink note:", filePath, err);
      }
    }

    // 2. Remote Shared Hosting Server Deletion
    let driver = process.env.STORAGE_DRIVER || 'local';
    let remoteUploadUrl = process.env.REMOTE_UPLOAD_URL || '';
    let remoteSecretKey = process.env.REMOTE_SECRET_KEY || '';

    try {
      const storageDoc = await executeDbGetDoc('webSettings', 'storageConfiguration');
      if (storageDoc && storageDoc.exists && storageDoc.data) {
        if (storageDoc.data.driver) driver = storageDoc.data.driver;
        if (storageDoc.data.remoteUploadUrl) remoteUploadUrl = storageDoc.data.remoteUploadUrl;
        if (storageDoc.data.remoteSecretKey) remoteSecretKey = storageDoc.data.remoteSecretKey;
      }
    } catch (dbErr) {
      console.warn("Could not load storageConfiguration from DB:", dbErr);
    }

    if (remoteUploadUrl && remoteUploadUrl.trim() !== '') {
      try {
        const remoteFormData = new FormData();
        remoteFormData.append('action', 'delete');
        remoteFormData.append('fileUrl', fileUrl);

        await fetch(remoteUploadUrl.trim(), {
          method: 'POST',
          headers: {
            'x-api-secret': remoteSecretKey
          },
          body: remoteFormData
        });
      } catch (remoteErr) {
        console.error("Remote file deletion warning:", remoteErr);
      }
    }

    return NextResponse.json({ success: true, message: 'File deletion processed' });
  } catch (error: any) {
    console.error("Delete handler error:", error);
    return NextResponse.json({ success: false, error: error.message || 'Delete failed' }, { status: 500 });
  }
}
