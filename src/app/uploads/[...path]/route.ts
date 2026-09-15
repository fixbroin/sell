import { type NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ path: string[] }> }
) {
  try {
    const resolvedParams = await props.params;
    const fileSubPath = resolvedParams.path.join('/');
    
    // Determine the absolute path to the file
    // 1. Try local dev path: process.cwd()/public/uploads/...
    let filePath = path.join(process.cwd(), 'public', 'uploads', fileSubPath);
    
    try {
      await fs.access(filePath);
    } catch {
      // 2. Try standalone production path: process.cwd()/../../public/uploads/...
      filePath = path.join(process.cwd(), '..', '..', 'public', 'uploads', fileSubPath);
    }

    // Read file contents
    const fileBuffer = await fs.readFile(filePath);
    
    // Determine Mime Type
    const contentType = getMimeType(filePath);

    // Return file response
    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return new Response('File not found', { status: 404 });
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    case '.pdf': return 'application/pdf';
    case '.json': return 'application/json';
    case '.mp3': return 'audio/mpeg';
    case '.mp4': return 'video/mp4';
    default: return 'application/octet-stream';
  }
}
