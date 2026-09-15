"use client";

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * In Next.js App Router, the <link rel="manifest"> is usually static in layout.tsx.
 * To support multiple manifests (Admin, Provider, User), we need to dynamically
 * swap the link tag in the head.
 */
const DynamicManifest = () => {
  const pathname = usePathname();

  useEffect(() => {
    // Determine which manifest to use based on the URL path
    let manifestPath = '/manifest.json'; // Default
    
    if (pathname.startsWith('/admin')) {
      manifestPath = '/manifest-admin.json';
    } else if (pathname.startsWith('/provider')) {
      manifestPath = '/manifest-provider.json';
    }

    // Find the existing manifest link
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement;

    if (manifestLink) {
      // If the path is already correct, do nothing
      if (manifestLink.getAttribute('href') === manifestPath) return;
      
      // Update the existing link
      manifestLink.setAttribute('href', manifestPath);
    } else {
      // If for some reason it doesn't exist, create it
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = manifestPath;
      document.head.appendChild(link);
    }
    
    console.log(`PWA: Manifest switched to ${manifestPath} for path ${pathname}`);
  }, [pathname]);

  return null; // This component doesn't render anything
};

export default DynamicManifest;
