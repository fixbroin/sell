// src/lib/rateLimit.ts
import { type NextRequest, NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
}

export function getClientIp(req: NextRequest | Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }
  return '127.0.0.1';
}

export interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds (default: 60,000 = 1 min)
  max?: number;      // Max allowed requests in the window (default: 60)
  keyPrefix?: string;
}

export function checkRateLimit(
  req: NextRequest | Request,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; resetTime: number } {
  const windowMs = options.windowMs || 60 * 1000;
  const max = options.max || 60;
  const prefix = options.keyPrefix || 'global';
  const ip = getClientIp(req);
  const key = `${prefix}:${ip}`;

  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: max - 1, resetTime: now + windowMs };
  }

  entry.count += 1;
  if (entry.count > max) {
    return { allowed: false, remaining: 0, resetTime: entry.resetTime };
  }

  return { allowed: true, remaining: max - entry.count, resetTime: entry.resetTime };
}

export function rateLimitResponse(resetTime: number) {
  const retryAfterSec = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
  return NextResponse.json(
    {
      success: false,
      error: 'Too many requests. Please slow down and try again later.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': retryAfterSec.toString(),
      },
    }
  );
}
