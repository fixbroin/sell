'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin Error Boundary caught an error:', error);

    // Check if the error is due to a ChunkLoadError (common during redeployments)
    const isChunkLoadError = 
      error.name === 'ChunkLoadError' || 
      error.message?.includes('ChunkLoadError') || 
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to load resource') ||
      error.message?.includes('Cannot read properties of undefined (reading \'call\')');
      
    if (isChunkLoadError) {
      console.log('Chunk load error detected in admin. Automatically reloading page to fetch latest version...');
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-destructive/10 p-4 rounded-full mb-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold mb-2">Something went wrong!</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        An error occurred while loading this section of the admin panel.
      </p>
      <Button 
        onClick={() => {
          reset();
          if (typeof window !== 'undefined') window.location.reload();
        }} 
        className="gap-2"
      >
        <RefreshCw className="h-4 w-4" />
        Reload & Try Again
      </Button>
    </div>
  );
}
