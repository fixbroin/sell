
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PackageSearch, ArrowLeft } from 'lucide-react';
import React, { Suspense } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 - Page Not Found',
  robots: {
    index: false,
    follow: false,
  },
};

function NotFoundContent() {
  return (
    <div className="container mx-auto px-4 py-20 text-center min-h-[calc(100vh-200px)] flex flex-col items-center justify-center">
      <div className="relative mb-8">
        <div className="bg-primary/10 w-24 h-24 md:w-32 md:h-32 rounded-3xl flex items-center justify-center border border-primary/20 shadow-inner rotate-3 hover:rotate-0 transition-transform duration-500">
          <PackageSearch className="h-12 w-12 md:h-16 md:w-16 text-primary drop-shadow-md -rotate-3 hover:rotate-0 transition-transform duration-500" />
        </div>
        <div className="absolute -top-2 -right-2 bg-background border border-border px-2 py-1 rounded-full shadow-sm text-[10px] font-bold text-primary animate-bounce">
          LOST?
        </div>
      </div>
      
      <h1 className="text-6xl md:text-8xl font-headline font-black text-foreground mb-2 tracking-tighter">
        4<span className="text-primary italic">0</span>4
      </h1>
      
      <h2 className="text-2xl md:text-3xl font-semibold text-foreground/90 mb-6">
        Oops! Page not found
      </h2>
      
      <p className="text-lg text-muted-foreground mb-10 max-w-lg mx-auto leading-relaxed">
        The page you are looking for might have been removed, had its name changed, or is temporarily unavailable. Let's get you back on track.
      </p>
      
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Link href="/" passHref className="w-full sm:w-auto">
          <Button size="lg" className="w-full sm:w-auto px-8 rounded-full shadow-lg shadow-primary/20">
            Go to Homepage
          </Button>
        </Link>
        <Link href="/categories" passHref className="w-full sm:w-auto">
          <Button variant="outline" size="lg" className="w-full sm:w-auto px-8 rounded-full">
            Browse Services
          </Button>
        </Link>
      </div>
      
      <Link href="/" passHref className="mt-8 hidden md:block group text-muted-foreground hover:text-primary transition-colors">
        <span className="flex items-center gap-2 text-sm font-medium">
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /> Back to Safety
        </span>
      </Link>
    </div>
  );
}

export default function NotFoundPage() {
  // The Suspense boundary here helps Next.js handle the dynamic parts
  // (potentially from AuthProvider using useSearchParams) during build.
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-16 text-center min-h-[calc(100vh-200px)] flex flex-col items-center justify-center">
        <PackageSearch className="mx-auto h-24 w-24 text-muted-foreground opacity-50 mb-6" />
        <h1 className="text-4xl font-bold text-destructive/50 mb-4">Loading Status...</h1>
      </div>
    }>
      <NotFoundContent />
    </Suspense>
  );
}
