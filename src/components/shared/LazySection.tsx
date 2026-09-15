"use client";

import { useState, useEffect, useRef, ReactNode, forwardRef, useImperativeHandle } from 'react';

interface LazySectionProps {
  children: ReactNode;
  fallback?: ReactNode;
  rootMargin?: string;
  threshold?: number | number[];
  className?: string;
  style?: React.CSSProperties;
  forceVisible?: boolean;
}

/**
 * A wrapper component that only renders its children when they come into the viewport.
 * Now supports forwardRef so parent can scroll to it even if content isn't loaded.
 */
export const LazySection = forwardRef<HTMLDivElement, LazySectionProps>(({ 
  children, 
  fallback, 
  rootMargin = '200px', 
  threshold = 0.01,
  className,
  style,
  forceVisible = false
}, ref) => {
  const [isVisible, setIsVisible] = useState(forceVisible);
  const internalRef = useRef<HTMLDivElement>(null);

  // Expose the internal div to the forwarded ref
  useImperativeHandle(ref, () => internalRef.current!);

  useEffect(() => {
    if (forceVisible) {
        setIsVisible(true);
    }
  }, [forceVisible]);

  useEffect(() => {
    if (isVisible) return; 

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); 
        }
      },
      { rootMargin, threshold }
    );

    const currentRef = internalRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
      observer.disconnect();
    };
  }, [isVisible, rootMargin, threshold]);

  return (
    <div ref={internalRef} className={className} style={style}>
      {isVisible ? children : (fallback || <div className="min-h-[500px] w-full bg-muted/5 animate-pulse rounded-xl" />)}
    </div>
  );
});

LazySection.displayName = 'LazySection';
