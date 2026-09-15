
"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, FileText, Beaker, Copy, CheckCircle2, Globe } from "lucide-react";
import WhatsAppTemplateManagementTab from '@/components/admin/whatsapp/WhatsAppTemplateManagementTab';
import WhatsAppTestSenderTab from '@/components/admin/whatsapp/WhatsAppTestSenderTab';
import { getBaseUrl } from '@/lib/config';
import { Button } from '@/components/ui/button';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';


export default function WhatsAppSettingsPage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${getBaseUrl()}/api/whatsapp/webhook`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast({ title: "Copied!", description: "Webhook URL copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <MessageSquare className="mr-2 h-6 w-6 text-primary" /> WhatsApp Settings &amp; Testing
          </CardTitle>
          <CardDescription>
            Manage and test your approved WhatsApp message templates.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center text-sm font-bold text-primary uppercase tracking-wider">
                <Globe className="mr-2 h-4 w-4" /> Webhook Callback URL
              </div>
              <p className="text-xs text-muted-foreground">
                Copy this URL to your Meta Developer Portal under WhatsApp &gt; Configuration.
              </p>
              <code className="block mt-2 p-2 bg-background border rounded text-xs font-mono break-all">
                {webhookUrl}
              </code>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="shrink-0 font-bold border-primary/30 hover:bg-primary/10"
              onClick={copyToClipboard}
            >
              {copied ? <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copied" : "Copy URL"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <PermissionGuard moduleId="whatsapp_settings" action="write" fallback={<div className="p-8 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed">You do not have permission to modify WhatsApp settings or send test messages.</div>}>
        <Tabs defaultValue="templates" className="w-full">
          <div className="relative mb-6">
            <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
              <TabsTrigger 
                value="templates"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <FileText className="mr-2 h-4 w-4"/>Manage Templates
              </TabsTrigger>
              <TabsTrigger 
                value="test_sender"
                className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
              >
                <Beaker className="mr-2 h-4 w-4"/>Test Sender
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="templates" className="mt-0 focus-visible:outline-none">
              <WhatsAppTemplateManagementTab />
          </TabsContent>
          <TabsContent value="test_sender">
              <WhatsAppTestSenderTab />
          </TabsContent>
        </Tabs>
      </PermissionGuard>
    </div>
  );
}
