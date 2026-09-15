"use client";

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import ChatWindow from "@/components/chat/ChatWindow";
import Breadcrumbs from "@/components/shared/Breadcrumbs";
import type { BreadcrumbItem } from "@/types/ui";
import { Button } from "@/components/ui/button";
import { Home as HomeIcon, ArrowLeft } from "lucide-react";
import { useLoading } from '@/contexts/LoadingContext';

export default function FullPageChat() {
  const router = useRouter();
  const { showLoading } = useLoading();

  const handleCloseChatWindow = () => {
    showLoading();
    router.push('/'); // Or router.back() if preferred
  };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/" },
    { label: "Support Chat" },
  ];

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 sm:py-10 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div className="space-y-1">
              <Breadcrumbs items={breadcrumbItems} />
              <h1 className="text-3xl sm:text-4xl font-headline font-bold text-foreground tracking-tight">
                Support Chat
              </h1>
              <p className="text-muted-foreground text-sm">We usually respond within a few minutes.</p>
            </div>
            
            {/* High-contrast button: Dark in Light mode, Light in Dark mode with primary hover */}
            <div className="hidden sm:block">
              <Link href="/" passHref>
                   <Button
  variant="default"
  size="sm"
  onClick={() => showLoading()}
  className="rounded-full px-6 transition-all duration-300 shadow-lg active:scale-95 font-medium group"
>
  <ArrowLeft className="mr-2 h-4 w-4 transition-transform duration-300 group-hover:-translate-x-1" />
  Back to Home
</Button>
              </Link>
            </div>
          </div>
          
          <div className="h-[calc(100vh-10rem)] sm:h-[calc(100vh-18rem)] relative">
            <ChatWindow onClose={handleCloseChatWindow} />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
