
"use client";

import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertTriangle, Info } from 'lucide-react'; // Use appropriate icons
import { useGlobalSettings } from '@/hooks/useGlobalSettings';
import type { GlobalAdminPopup as GlobalAdminPopupType } from '@/types/firestore';
import { getTimestampMillis } from '@/lib/utils';

export default function GlobalAdminPopup() {
  const { settings: globalSettings, isLoading: isLoadingSettings } = useGlobalSettings();
  const [currentPopupData, setCurrentPopupData] = useState<GlobalAdminPopupType | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastDisplayedPopupSentAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (isLoadingSettings || !globalSettings?.globalAdminPopup) {
      return;
    }

    const { globalAdminPopup } = globalSettings;

    if (globalAdminPopup.isActive && globalAdminPopup.message) {
      const popupSentTime = getTimestampMillis(globalAdminPopup.sentAt);
      
      // Only show if it's a new message or if it's configured to always show (not yet a feature)
      if (popupSentTime && popupSentTime !== lastDisplayedPopupSentAtRef.current) {
        setCurrentPopupData(globalAdminPopup);
        setIsVisible(true);
        lastDisplayedPopupSentAtRef.current = popupSentTime;

        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        const duration = (globalAdminPopup.durationSeconds || 10) * 1000; // Default 10s
        timerRef.current = setTimeout(() => {
          setIsVisible(false);
          setCurrentPopupData(null); 
        }, duration);
      } else if (!globalAdminPopup.isActive && isVisible) {
        // If an active popup was just deactivated by admin
        setIsVisible(false);
        setCurrentPopupData(null);
        if (timerRef.current) clearTimeout(timerRef.current);
      }
    } else if (!globalAdminPopup.isActive && isVisible) {
      // If popup is no longer active (e.g. admin disabled it)
      setIsVisible(false);
      setCurrentPopupData(null);
      if (timerRef.current) clearTimeout(timerRef.current);
    }

  }, [globalSettings, isLoadingSettings, isVisible]);

  useEffect(() => {
    // Cleanup timer on unmount
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);
  
  if (!isVisible || !currentPopupData || !currentPopupData.message) {
    return null;
  }

  // For now, all popups are non-dismissible by user, they auto-hide.
  // No DialogClose button.
  return (
    <Dialog open={isVisible} onOpenChange={(open) => { if (!open) setIsVisible(false); /* No user close */ }}>
      <DialogContent 
        className="sm:max-w-md md:max-w-lg p-3 shadow-2xl rounded-xl fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        onPointerDownOutside={(e) => e.preventDefault()} // Prevent closing by clicking outside
        onEscapeKeyDown={(e) => e.preventDefault()} // Prevent closing with Escape key
      >
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-3">
            <AlertTriangle className="h-8 w-8 text-destructive" /> 
          </div>
          <DialogTitle className="text-xl font-headline text-destructive">
            Important Message
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-center text-muted-foreground text-base py-3 whitespace-pre-line">
          {currentPopupData.message}
        </DialogDescription>
        <p className="text-xs text-center text-muted-foreground/70 mt-3">
          This message will disappear automatically.
        </p>
      </DialogContent>
    </Dialog>
  );
}
