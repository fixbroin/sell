import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, Timestamp } from '@/lib/mysqlDb';
import type { FirestoreVisitorInfoLog } from '@/types/firestore';
import { headers } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    // 1. Check if visitor logging is disabled in settings
    try {
      const { executeDbGetDoc } = require('@/app/actions/dbActions');
      const configDoc = await executeDbGetDoc('webSettings', 'applicationConfig');
      if (configDoc && configDoc.exists && configDoc.data) {
        if (configDoc.data.enableVisitorLogging === false) {
          return NextResponse.json({ success: true, bypassed: true });
        }
      }
    } catch (dbErr) {
      console.warn("Could not check enableVisitorLogging in API:", dbErr);
    }

    const body = await req.json();
    const { pathname, userAgent } = body;

    if (!pathname || !userAgent) {
      return NextResponse.json({ success: false, error: 'Missing required fields.' }, { status: 400 });
    }

    // 1. Get Real IP from headers
    const headersList = await headers();
    const forwardedFor = headersList.get('x-forwarded-for');
    const realIp = headersList.get('x-real-ip');
    const userIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || 'unknown');

    // 2. Fetch Geo-data from Server side (More reliable)
    let geoData = {
        city: 'Unknown City',
        region: 'Unknown Region',
        country: 'Unknown Country',
        zip: 'Unknown Postal',
        isp: 'Unknown ISP'
    };

    if (userIp !== 'unknown' && userIp !== '127.0.0.1' && userIp !== '::1') {
        try {
            const geoRes = await fetch(`http://ip-api.com/json/${userIp}`);
            if (geoRes.ok) {
                const data = await geoRes.json();
                if (data.status === 'success') {
                    geoData = {
                        city: data.city || 'Unknown City',
                        region: data.regionName || 'Unknown Region',
                        country: data.country || 'Unknown Country',
                        zip: data.zip || 'Unknown Postal',
                        isp: data.isp || data.org || 'Unknown ISP'
                    };
                }
            }
        } catch (geoErr) {
            console.error("Geo lookup error on server:", geoErr);
        }
    }
    
    const visitorLog: Omit<FirestoreVisitorInfoLog, 'id' | 'timestamp'> = {
      ipAddress: userIp,
      city: geoData.city,
      region: geoData.region,
      countryName: geoData.country,
      postalCode: geoData.zip,
      ispOrganization: geoData.isp,
      pathname: pathname,
      userAgent: userAgent,
    };

    await addDoc(collection(db, 'visitorInfoLogs'), {
      ...visitorLog,
      timestamp: Timestamp.now(),
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error in /api/log-visitor-info:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
