// src/lib/config.ts

/**
 * Retrieves the base URL for the application.
 * It prioritizes NEXT_PUBLIC_BASE_URL, then NEXT_PUBLIC_VERCEL_URL (often set by Vercel),
 * and falls back to localhost for local development.
 * @returns The base URL string.
 */
export const getBaseUrl = (): string => {
  // For server-side contexts (like sitemap.ts or generateMetadata during build)
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_VERCEL_URL ||
      `http://localhost:${process.env.PORT || 9002}` // Use PORT from env if available, else default
    );
  }
  // For client-side contexts (though NEXT_PUBLIC_ vars are available, this is defensive)
  // In Next.js 13+ App Router, process.env should be available server-side.
  // Client-side usage of this function is less common for base URL construction.
  if (typeof window !== 'undefined') {
    // This part is tricky as client-side `process.env` isn't directly populated like in Node.
    // NEXT_PUBLIC_ prefixed variables are inlined at build time.
    // For robustness, if somehow called client-side and needed the dynamic Vercel URL,
    // it would need to be passed down or read from a global object.
    // However, for metadata and sitemap, server-side is key.
    // Fallback to window.location.origin if absolutely necessary client-side and no NEXT_PUBLIC_ var found.
    return window.location.origin;
  }
  
  // Ultimate fallback if neither process nor window is defined (e.g., some test environments)
  return 'http://localhost:9002';
};
