"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Persists and restores scroll position based on URL.
 * Optimized to be lightweight and prevent jitter.
 */
export default function ScrollMemory() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollPositions = useRef<Record<string, number>>({});
  const isRestoring = useRef(false);

  const currentKey = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  // 1. Save scroll position
  useEffect(() => {
    const handleScroll = () => {
      if (!isRestoring.current) {
        scrollPositions.current[currentKey] = window.scrollY;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [currentKey]);

  // 2. Restore scroll position
  useEffect(() => {
    const savedPosition = scrollPositions.current[currentKey];

    if (savedPosition !== undefined && savedPosition > 0) {
      isRestoring.current = true;
      
      // Attempt restoration across a few frames to handle layout shifts
      // but without the heavy recursive loop
      const timer = setTimeout(() => {
        window.scrollTo({
            top: savedPosition,
            behavior: 'instant' // Instant is better for memory restoration
        });
        isRestoring.current = false;
      }, 100);

      return () => clearTimeout(timer);
    } else {
      window.scrollTo(0, 0);
      isRestoring.current = false;
    }
  }, [currentKey]);

  return null;
}
