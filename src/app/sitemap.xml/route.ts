// src/app/sitemap.xml/route.ts
import { NextResponse } from 'next/server';
import { getCachedSitemapEntries } from '../sitemap-helper';
import { getBaseUrl } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') || requestUrl.host;
    const proto = request.headers.get('x-forwarded-proto') || (requestUrl.protocol === 'https:' ? 'https' : 'http');
    const baseUrl = `${proto}://${host}`;

    const entries = await getCachedSitemapEntries();
    const prodBaseUrl = getBaseUrl();
    
    const CHUNK_SIZE = 45000;
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    
    if (entries.length <= CHUNK_SIZE) {
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      entries.forEach(entry => {
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
    } else {
      const numSitemaps = Math.ceil(entries.length / CHUNK_SIZE);
      xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
      for (let i = 0; i < numSitemaps; i++) {
        xml += `  <sitemap>\n`;
        xml += `    <loc>${baseUrl}/sitemaps/chunk-${i}.xml</loc>\n`;
        xml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
        xml += `  </sitemap>\n`;
      }
      xml += `</sitemapindex>\n`;
    }
    
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=600, stale-while-revalidate',
      },
    });
  } catch (error) {
    console.error("Error generating master sitemap index:", error);
    // Simple fallback if critical error occurs
    const requestUrl = new URL(request.url);
    const host = request.headers.get('host') || requestUrl.host;
    const proto = request.headers.get('x-forwarded-proto') || (requestUrl.protocol === 'https:' ? 'https' : 'http');
    const baseUrl = `${proto}://${host}`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
    xml += `  <sitemap>\n`;
    xml += `    <loc>${baseUrl}/sitemaps/chunk-0.xml</loc>\n`;
    xml += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;
    xml += `  </sitemap>\n`;
    xml += `</sitemapindex>\n`;
    return new NextResponse(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
    });
  }
}
