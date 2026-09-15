import { NextResponse } from 'next/server';
import { getCachedSitemapEntries } from '../../sitemap-helper';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: any }
) {
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') || requestUrl.host;
    const proto = request.headers.get('x-forwarded-proto') || (requestUrl.protocol === 'https:' ? 'https' : 'http');
    const baseUrl = `${proto}://${host}`;
    const prodBaseUrl = getBaseUrl();

    const resolvedParams = await params;
    const filename = resolvedParams.filename;
    
    // Match "chunk-{id}.xml"
    const match = filename.match(/^chunk-(\d+)\.xml$/);
    if (!match) {
      return new NextResponse("Not Found", { status: 404 });
    }
    
    const chunkId = parseInt(match[1], 10);
    const entries = await getCachedSitemapEntries();
    
    const CHUNK_SIZE = 45000;
    const start = chunkId * CHUNK_SIZE;
    const end = start + CHUNK_SIZE;
    const chunkEntries = entries.slice(start, end);
    
    if (chunkEntries.length === 0 && chunkId > 0) {
      return new NextResponse("Not Found", { status: 404 });
    }
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    
    chunkEntries.forEach(entry => {
      const url = entry.url.replace(prodBaseUrl, baseUrl);
      xml += `  <url>\n`;
      xml += `    <loc>${url}</loc>\n`;
      if (entry.lastModified) {
        xml += `    <lastmod>${entry.lastModified}</lastmod>\n`;
      }
      if (entry.changeFrequency) {
        xml += `    <changefreq>${entry.changeFrequency}</changefreq>\n`;
      }
      if (entry.priority !== undefined) {
        xml += `    <priority>${entry.priority.toFixed(1)}</priority>\n`;
      }
      xml += `  </url>\n`;
    });
    
    xml += `</urlset>\n`;
    
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate',
      },
    });
  } catch (error) {
    console.error("Error generating sitemap chunk:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
