
"use client";

import { useLoading } from '@/contexts/LoadingContext';
import AppLoader from './AppLoader';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

interface GlobalActionLoaderProps {
  initialLoaderType?: string;
}

const GlobalActionLoader: React.FC<GlobalActionLoaderProps> = ({ initialLoaderType }) => {
  const { isLoading, hideLoading } = useLoading();
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [progress, setProgress] = useState(0);

  // Smooth percentage progress animation (0% -> 30% -> 70% -> 90% -> 100%)
  useEffect(() => {
    if (isLoading) {
      setProgress(15);
      const timer1 = setTimeout(() => setProgress(45), 150);
      const timer2 = setTimeout(() => setProgress(75), 400);
      const timer3 = setTimeout(() => setProgress(90), 800);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    } else {
      setProgress(100);
      const timer = setTimeout(() => setProgress(0), 200);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // 1. Hide loader ONLY AFTER the new page pathname has officially changed and painted
  useEffect(() => {
    if (isLoading && pathname !== previousPathnameRef.current) {
      previousPathnameRef.current = pathname;
      setProgress(100);
      const timer = setTimeout(() => {
        hideLoading();
      }, 150);
      return () => clearTimeout(timer);
    }
    previousPathnameRef.current = pathname;
  }, [pathname, isLoading, hideLoading]);

  // 2. Safety Limit: Ensure loader never blocks forever if navigation fails
  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        hideLoading();
      }, 10000); // 10s max
    } else if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isLoading, hideLoading]);

  if (!isLoading && progress === 0) {
    return null;
  }

  return (
    <>
      {/* Dynamic Top Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1.5 z-[999999] bg-muted/30 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-teal-500 via-primary to-emerald-400 transition-all duration-300 ease-out shadow-lg shadow-primary/50"
          style={{ width: `${progress}%` }}
        />
      </div>
      
      {/* Non-blocking loader overlay */}
      {isLoading && (
        <div className="pointer-events-auto">
          <AppLoader text={`Loading ${progress}% ...`} initialLoaderType={initialLoaderType} />
        </div>
      )}
    </>
  );
};

export default GlobalActionLoader;
