// src/app/api/google-product-feed/route.ts
import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { getBaseUrl } from '@/lib/config';
import { unstable_cache } from 'next/cache';
import type { FirestoreService } from '@/types/firestore';

export const dynamic = 'force-static';
export const revalidate = false;

const getFeedServices = unstable_cache(
  async () => {
    try {
      const snapshot = await adminDb.collection('adminServices')
        .where('isActive', '==', true)
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreService));
    } catch (error) {
      console.error('Error fetching services for feed:', error);
      return [];
    }
  },
  ['google-product-feed-services'],
  { revalidate: false, tags: ['services', 'global-cache'] }
);

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export async function GET() {
  const baseUrl = getBaseUrl();
  const services = await getFeedServices();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">\n';
  xml += '  <channel>\n';
  xml += '    <title>Yourbrand Home Services Feed</title>\n';
  xml += `    <link>${baseUrl}</link>\n`;
  xml += '    <description>Verified carpenter, plumber, electrician, and home repair services in Bangalore</description>\n';

  services.forEach(service => {
    if (!service.slug) return;

    const serviceUrl = `${baseUrl}/service/${service.slug}`;
    const rawImage = service.imageUrl || '/android-chrome-512x512.png';
    const imageUrl = rawImage.startsWith('http') ? rawImage : `${baseUrl}${rawImage.startsWith('/') ? '' : '/'}${rawImage}`;
    
    // Use price or fallback to 0
    const price = service.discountedPrice || service.price || 0;
    const desc = service.seo_description || service.description || `Professional ${service.name} services in Bangalore.`;

    xml += '    <item>\n';
    xml += `      <g:id>${escapeXml(service.id)}</g:id>\n`;
    xml += `      <title>${escapeXml(service.name)}</title>\n`;
    xml += `      <description>${escapeXml(desc)}</description>\n`;
    xml += `      <link>${escapeXml(serviceUrl)}</link>\n`;
    xml += `      <g:image_link>${escapeXml(imageUrl)}</g:image_link>\n`;
    xml += '      <g:availability>in_stock</g:availability>\n';
    xml += `      <g:price>${price} INR</g:price>\n`;
    xml += '      <g:brand>Yourbrand</g:brand>\n';
    xml += '      <g:condition>new</g:condition>\n';
    xml += '      <g:google_product_category>Home &amp; Garden &gt; Household Services &gt; General Handyman Services</g:google_product_category>\n';
    xml += '    </item>\n';
  });

  xml += '  </channel>\n';
  xml += '</rss>';

  return new NextResponse(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate',
    },
  });
}
