"use client"

import Image from "next/image"
import { useState, useEffect, useRef, useLayoutEffect } from "react"
import { cn } from "@/lib/utils"

// Global session-level cache to track URLs that have been successfully loaded
const globalSeenImages = new Set<string>();

interface AppImageProps {
  src?: string | null
  alt: string
  fill?: boolean
  width?: number
  height?: number
  sizes?: string
  priority?: boolean
  className?: string
  objectPosition?: "top" | "center" | "bottom" | "left" | "right" | string
  "data-ai-hint"?: string
  aiHint?: string
  fallbackSrc?: string
  loading?: "eager" | "lazy"
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void
  onError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void
  unoptimized?: boolean
}

export default function AppImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  priority = false,
  className,
  objectPosition = "center",
  "data-ai-hint": aiHintData,
  aiHint,
  fallbackSrc,
  loading,
  onLoad,
  onError,
  unoptimized
}: AppImageProps) {

  const imgRef = useRef<HTMLImageElement>(null)
  
  // 1. Memory Check: Have we seen this URL in this session?
  const isSeenBefore = !!src && globalSeenImages.has(src);
  
  // 2. Initialize 'loaded' based on session memory. 
  // If we've seen it, start as TRUE to skip the placeholder/pulse immediately.
  const [loaded, setLoaded] = useState(isSeenBefore)
  const [error, setError] = useState(false)

  const isDefaultImage = !src || error
  const imageSrc = isDefaultImage ? (fallbackSrc || "/default-image.png") : src

  // Success Handler
  const handleLoad = (e?: React.SyntheticEvent<HTMLImageElement, Event>) => {
    if (src) globalSeenImages.add(src);
    setLoaded(true);
    if (onLoad && e) onLoad(e);
  };

  const handleOnError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setError(true);
    if (onError) onError(e);
  };

  // 3. Sync state with src changes (important for carousel/lists)
  useEffect(() => {
    const seenBefore = !!src && globalSeenImages.has(src);
    setLoaded(seenBefore);
    setError(false);
  }, [src]);

  // 4. Synchronous Cache Check: If browser has it, show it INSTANTLY before paint.
  useLayoutEffect(() => {
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
        handleLoad();
    }
  }, [src]);

  const shouldBypassPlaceholder = priority || isSeenBefore;
  const isLoaded = loaded || shouldBypassPlaceholder;

  return (
    <div className={cn("relative overflow-hidden", fill ? "w-full h-full" : "inline-block", className)}>

      {/* 
          SMOOTH PLACEHOLDER (Logo + Pulse):
          Only pulses if NEVER seen before. 
          If seen before or has priority, skip placeholder overlay entirely to prevent LCP metric delays.
      */}
      {!shouldBypassPlaceholder && (
        <div 
          className={cn(
              "absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-[2px] transition-opacity duration-300",
              loaded ? "opacity-0 pointer-events-none" : "opacity-100"
          )}
        >
            <img
              src="/default-image.png"
              alt="loading..."
              className={cn(
                  "w-full h-full object-contain p-4",
                  !isSeenBefore && "animate-pulse"
              )}
            />
        </div>
      )}

      {/* ACTUAL IMAGE (Next.js Powered) */}
      <Image
        ref={imgRef}
        src={imageSrc}
        alt={alt}
        fill={fill}
        width={!fill ? width : undefined}
        height={!fill ? height : undefined}
        sizes={
          sizes ||
          (fill
            ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            : undefined)
        }
        // Use priority for images we've seen before or critical images
        priority={priority || isSeenBefore}
        loading={(priority || isSeenBefore) ? undefined : (loading || "lazy")}
        onLoad={handleLoad}
        onError={handleOnError}
        data-ai-hint={aiHint || aiHintData}
        unoptimized={unoptimized}
        className={cn(
          "transition-opacity duration-300 ease-in-out",
          isDefaultImage ? "object-contain bg-muted" : "object-cover",
          isLoaded ? "opacity-100" : "opacity-0"
        )}
        style={{ 
          objectPosition,
          zIndex: isLoaded ? 20 : 0 
        }}
      />
    </div>
  )
}
