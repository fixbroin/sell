
"use client";

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, Settings, Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import ChatSettingsForm from '@/components/admin/ChatSettingsForm';
import AdminGlobalMessageForm from '@/components/admin/AdminGlobalMessageForm';
import { useAuth } from '@/hooks/useAuth';
import { hasActionPermission } from '@/config/rbac';
import PermissionGuard from '@/components/admin/PermissionGuard';

export default function AdminChatPage() {
  const { adminPermissions } = useAuth();
  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-10 px-2 sm:px-4">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b pb-6">
        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <MessageSquare className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Communication Hub</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Chat Management</h1>
          <p className="text-muted-foreground text-sm max-w-3xl">
            Configure your real-time support channels, AI assistant behavior, and broadcast global announcements to all active users.
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-primary/5 px-4 py-2 rounded-2xl border border-primary/10">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-[10px] font-bold uppercase">System Active</span>
        </div>
      </header>

      <Tabs defaultValue="settings" className="w-full">
        <div className="flex justify-center mb-8">
          <TabsList className="grid w-full max-w-lg grid-cols-2 p-1 bg-muted/50 rounded-2xl h-14 border shadow-inner">
            <TabsTrigger 
              value="settings" 
              className={cn(
                "rounded-xl transition-all duration-300 font-bold text-xs uppercase tracking-wider",
                "data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg",
                "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-background/40"
              )}
            >
              <div className="flex items-center justify-center py-1">
                <Settings className="mr-2 h-4 w-4 shrink-0"/> 
                <span>System Settings</span>
              </div>
            </TabsTrigger>
            <TabsTrigger 
              value="global_popup" 
              className={cn(
                "rounded-xl transition-all duration-300 font-bold text-xs uppercase tracking-wider",
                "data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-lg",
                "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-background/40"
              )}
            >
              <div className="flex items-center justify-center py-1">
                <Send className="mr-2 h-4 w-4 shrink-0"/> 
                <span>Global Broadcast</span>
              </div>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="settings" className="focus-visible:outline-none focus-visible:ring-0">
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ChatSettingsForm />
          </div>
        </TabsContent>

        <TabsContent value="global_popup" className="focus-visible:outline-none focus-visible:ring-0">
          <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <PermissionGuard moduleId="chat" action="write" fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to send global broadcasts.</div>}>
              <AdminGlobalMessageForm />
            </PermissionGuard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
