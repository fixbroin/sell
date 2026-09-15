"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X, Share, PlusSquare, Smartphone } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname } from 'next/navigation';
import AppImage from '@/components/ui/AppImage';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// Extend Event type to include PWA-specific properties
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const PwaInstallButton = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showIosGuide, setShowIosInstruction] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const DISMISS_KEY = 'pwa_install_prompt_dismissed_v2';

  // Determine which app we are installing
  const appInfo = {
    name: "Yourbrand App",
    desc: "Faster booking & real-time updates"
  };

  if (pathname.startsWith('/admin')) {
    appInfo.name = "Yourbrand Admin";
    appInfo.desc = "Manage orders & providers";
  } else if (pathname.startsWith('/provider')) {
    appInfo.name = "Yourbrand Provider";
    appInfo.desc = "Manage your jobs & earnings";
  }

  // 1. Core initialization and event listener
  useEffect(() => {
    setIsMounted(true);
    
    // Check if dismissed before
    if (localStorage.getItem(DISMISS_KEY) === 'true') {
      setIsDismissed(true);
    }
    
    // Check standalone mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        (window.navigator as any).standalone === true;
    if (isStandalone) setIsAppInstalled(true);

    // Check iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    setIsIos(/iphone|ipad|ipod/.test(userAgent));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  // 2. Timer and Page visibility logic for the PWA prompt
  useEffect(() => {
    if (!isMounted || isAppInstalled || isDismissed) return;

    if (pathname === '/') {
      // Check if the home page banner was already shown in this session
      const bannerShownSession = sessionStorage.getItem('pwa_banner_shown_home');
      if (!bannerShownSession && (installPrompt || isIos)) {
        setIsMinimized(false);
        // Show for 3 to 4 seconds (3500ms), then minimize to floating button
        const timer = setTimeout(() => {
          setIsMinimized(true);
          sessionStorage.setItem('pwa_banner_shown_home', 'true');
        }, 3500);
        return () => clearTimeout(timer);
      } else {
        setIsMinimized(true);
      }
    } else {
      // On all other pages, directly keep it minimized (floating button)
      setIsMinimized(true);
    }
  }, [pathname, isMounted, isAppInstalled, isDismissed, installPrompt, isIos]);

  const handleInstallClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (isIos && !isAppInstalled) {
        setShowIosInstruction(true);
        return;
    }

    if (!installPrompt) return;

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsAppInstalled(true);
    }
    setInstallPrompt(null);
  };
  
  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDismissed(true);
    localStorage.setItem(DISMISS_KEY, 'true');
  };

  if (!isMounted || isAppInstalled || isDismissed) {
    return null;
  }

  // Only show if we have a prompt (Android/Chrome) OR if it's iOS (for manual guide)
  if (!installPrompt && !isIos) {
      return null;
  }

  // --- MOBILE UI (Banner -> Floating Badge) ---
  if (isMobile) {
      return (
        <>
            {/* LARGE BANNER (Initial State) */}
            <div 
                className={`fixed bottom-20 left-4 right-4 z-[100] transition-all duration-700 ease-in-out transform ${
                    isMinimized 
                    ? 'opacity-0 translate-y-20 pointer-events-none scale-50' 
                    : 'opacity-100 translate-y-0 scale-100'
                }`}
            >
                <div className="bg-card border-2 border-primary/20 shadow-2xl rounded-2xl p-4 flex items-center gap-4 relative">
                    <button 
                        onClick={handleDismiss}
                        className="absolute -top-2 -right-2 bg-muted text-muted-foreground rounded-full p-1 hover:bg-destructive hover:text-destructive-foreground transition-colors border"
                    >
                        <X size={14} />
                    </button>

                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 border">
                        <AppImage src="/pwa-192x192.png" alt="App Icon" width={40} height={40} className="rounded-lg shadow-sm" />
                    </div>

                    <div className="flex-grow min-w-0">
                        <h4 className="text-sm font-bold text-foreground">Install {appInfo.name}</h4>
                        <p className="text-[10px] text-muted-foreground line-clamp-1">{appInfo.desc}</p>
                    </div>

                    <Button size="sm" onClick={handleInstallClick} className="rounded-full px-5 font-bold shadow-lg shadow-primary/20">
                        {isIos ? "Setup" : "Install"}
                    </Button>
                </div>
            </div>

            {/* MINIMIZED SIDE BADGE (After 10 Seconds) */}
            <div 
                onClick={handleInstallClick}
                className={`fixed top-[40%] right-0 z-[100] transition-all duration-700 ease-in-out transform flex items-center bg-primary text-white shadow-2xl rounded-l-xl p-2 cursor-pointer ${
                    isMinimized 
                    ? 'opacity-100 translate-x-0' 
                    : 'opacity-0 translate-x-20 pointer-events-none'
                }`}
            >
                <div className="flex flex-col items-center gap-1">
                    <Download size={18} className="animate-bounce" />
                    <span className="text-[10px] font-bold uppercase tracking-tighter [writing-mode:vertical-lr] rotate-180">Install</span>
                </div>
                
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleDismiss(e);
                    }}
                    className="absolute -top-2 -left-2 bg-destructive text-white rounded-full p-0.5 border-2 border-white shadow-md"
                >
                    <X size={10} />
                </button>
            </div>

            {/* iOS Installation Guide */}
            <Dialog open={showIosGuide} onOpenChange={setShowIosInstruction}>
                <DialogContent className="max-w-[90vw] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Smartphone className="h-5 w-5 text-primary" />
                            Install on iPhone
                        </DialogTitle>
                        <DialogDescription className="text-left pt-2">
                            To install the Yourbrand app on your iPhone, follow these simple steps:
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg text-primary font-bold text-xs">1</div>
                            <p className="text-sm">Tap the <span className="font-bold inline-flex items-center bg-muted px-1.5 py-0.5 rounded gap-1"><Share size={14} /> Share</span> button in Safari footer.</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg text-primary font-bold text-xs">2</div>
                            <p className="text-sm">Scroll down and tap <span className="font-bold inline-flex items-center bg-muted px-1.5 py-0.5 rounded gap-1"><PlusSquare size={14} /> Add to Home Screen</span>.</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="bg-primary/10 p-2 rounded-lg text-primary font-bold text-xs">3</div>
                            <p className="text-sm">Tap <span className="text-primary font-bold">Add</span> in the top right corner.</p>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setShowIosInstruction(false)} className="w-full rounded-xl">Got it!</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
      );
  }

  // --- DESKTOP FLOATING TAB UI ---
  return (
    <div
      className="group fixed top-1/2 right-0 -translate-y-1/2 z-50 flex items-center bg-card border-y border-l border-primary/20 shadow-2xl rounded-l-2xl cursor-pointer transition-all duration-500 ease-out w-12 hover:w-48 h-16 overflow-hidden animate-pulse hover:animate-none"
      onClick={handleInstallClick}
    >
      <div className="flex items-center w-full h-full p-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30 group-hover:rotate-12 transition-transform">
            <Download className="h-5 w-5 text-white animate-bounce group-hover:animate-none" />
        </div>
        
        <div className="ml-3 transition-all duration-500 opacity-0 group-hover:opacity-100 whitespace-nowrap">
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Desktop App</p>
          <p className="text-xs font-bold text-foreground">Install Yourbrand</p>
        </div>
      </div>

      <button
          onClick={handleDismiss}
          className="absolute top-1 right-1 h-4 w-4 rounded-full bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-white flex items-center justify-center"
        >
          <X size={10} />
      </button>
    </div>
  );
};

export default PwaInstallButton;
