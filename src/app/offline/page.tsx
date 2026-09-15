import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { WifiOff, Home } from 'lucide-react';
import React from 'react';
import type { Metadata } from 'next';
import OfflineRetryButton from '@/components/shared/OfflineRetryButton';

export const metadata: Metadata = {
  title: 'Offline - No Internet Connection',
  robots: {
    index: false,
    follow: false,
  },
};

export default function OfflinePage() {
  return (
    <div className="container mx-auto px-4 py-20 text-center min-h-[calc(100vh-200px)] flex flex-col items-center justify-center">
      <div className="relative mb-8">
        <div className="bg-muted w-24 h-24 md:w-32 md:h-32 rounded-3xl flex items-center justify-center border border-border shadow-inner">
          <WifiOff className="h-12 w-12 md:h-16 md:w-16 text-muted-foreground drop-shadow-md" />
        </div>
        <div className="absolute -top-2 -right-2 bg-background border border-border px-2 py-1 rounded-full shadow-sm text-[10px] font-bold text-muted-foreground">
          OFFLINE
        </div>
      </div>
      
      <h1 className="text-3xl md:text-5xl font-headline font-black text-foreground mb-4 tracking-tighter">
        You're <span className="text-primary italic">Offline</span>
      </h1>
      
      <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed">
        It looks like you've lost your internet connection. Please check your network settings and try again.
      </p>
      
      <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-sm">
        {/* Client-side retry button */}
        <OfflineRetryButton />

        <Link href="/" passHref className="w-full sm:w-auto">
          <Button variant="outline" size="lg" className="w-full sm:w-auto px-8 rounded-full gap-2">
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
      
      <div className="mt-12 p-3 bg-primary/5 rounded-2xl border border-primary/10 max-w-sm">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>Tip:</strong> You can still browse some previously visited pages while offline, but booking and account features require an active connection.
        </p>
      </div>
    </div>
  );
}
