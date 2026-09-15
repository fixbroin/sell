'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service (optional)
    console.error('Global Error Boundary caught an error:', error);

    // Check if the error is due to a ChunkLoadError (common during redeployments)
    const isChunkLoadError = 
      error.name === 'ChunkLoadError' || 
      error.message?.includes('ChunkLoadError') || 
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to load resource') ||
      error.message?.includes('Cannot read properties of undefined (reading \'call\')');
      
    if (isChunkLoadError) {
      console.log('Chunk load error detected. Automatically reloading page to fetch latest version...');
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-4 text-center">
      <div className="relative mb-8">
        <div className="bg-destructive/10 w-24 h-24 md:w-32 md:h-32 rounded-3xl flex items-center justify-center border border-destructive/20 shadow-inner -rotate-3 hover:rotate-0 transition-transform duration-500">
          <AlertCircle className="h-12 w-12 md:h-16 md:w-16 text-destructive drop-shadow-md rotate-3 hover:rotate-0 transition-transform duration-500" />
        </div>
        <div className="absolute -top-2 -right-2 bg-background border border-border px-3 py-1 rounded-full shadow-sm text-[10px] font-black text-destructive animate-pulse">
          ERROR OCCURRED
        </div>
      </div>

      <h1 className="text-3xl md:text-5xl font-headline font-black text-foreground mb-4 tracking-tight">
        Something went <span className="text-destructive">wrong!</span>
      </h1>

      <p className="text-lg text-muted-foreground mb-10 max-w-md mx-auto leading-relaxed">
        An unexpected error occurred while processing your request. Don't worry, our team has been notified.
      </p>

      {/* Error Digest (if available) - helpful for debugging */}
      {error.digest && (
        <div className="mb-8 px-4 py-2 bg-muted rounded-full text-[10px] font-mono text-muted-foreground border border-border">
          Error ID: <span className="font-bold">{error.digest}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-sm mx-auto">
        <Button 
          onClick={() => reset()} 
          size="lg" 
          className="w-full gap-2 rounded-full shadow-lg shadow-primary/20"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
        <Link href="/" passHref className="w-full">
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full gap-2 rounded-full"
          >
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>

      <div className="mt-12 text-xs text-muted-foreground flex flex-col items-center gap-2">
        <p>If the problem persists, please contact our support.</p>
        <div className="flex items-center gap-4 opacity-50">
           <span>Yourbrand Support</span>
           <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
           <span>Help Center</span>
        </div>
      </div>
    </div>
  );
}
