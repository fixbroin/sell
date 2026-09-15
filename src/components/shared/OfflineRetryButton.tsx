'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function OfflineRetryButton() {
  return (
    <Button 
      size="lg" 
      className="w-full sm:w-auto px-8 rounded-full shadow-lg shadow-primary/20 gap-2"
      variant="default"
      onClick={() => window.location.reload()}
    >
      <RefreshCw className="h-4 w-4" />
      Retry Connection
    </Button>
  );
}
