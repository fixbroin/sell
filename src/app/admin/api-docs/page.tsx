"use client";

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_ENDPOINTS, getBaseUrl } from '@/config/apiEndpoints';
import { Globe, Copy, Check, Code, Server, Smartphone, ExternalLink } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from "@/components/admin/PermissionGuard";

export default function ApiDocsPage() {
  const [copiedEndpoint, setCopiedEndpoint] = useState<string | null>(null);
  const { toast } = useToast();
  const baseUrl = getBaseUrl();

  const handleCopy = (path: string) => {
    const fullUrl = `${baseUrl}${path}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedEndpoint(path);
    toast({ title: "Copied!", description: `URL copied: ${fullUrl}` });
    setTimeout(() => setCopiedEndpoint(null), 2000);
  };

  const apiList = Object.entries(API_ENDPOINTS).map(([key, path]) => ({
    name: key,
    path,
    fullUrl: `${baseUrl}${path}`,
    method: path.includes('mutate') || path.includes('batch') || path.includes('getDoc') || path.includes('getDocs') ? 'POST' : 'GET'
  }));

  return (
    <PermissionGuard moduleId="settings" action="read">
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Code className="h-8 w-8 text-primary" />
              REST API Catalog & Flutter Integration
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Central catalog of all application REST APIs for Next.js Web Frontend & Flutter Mobile App.
            </p>
          </div>

          <Badge variant="outline" className="px-4 py-2 text-sm font-mono bg-primary/5 text-primary border-primary/20 rounded-full w-fit">
            Active Domain: {baseUrl}
          </Badge>
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl shadow-md border-none bg-primary/5">
            <div className="flex items-center gap-3">
              <Server className="h-6 w-6 text-primary" />
              <div>
                <h3 className="font-bold text-sm">Single Base Domain</h3>
                <p className="text-xs text-muted-foreground">Change domain once in config to update all web & mobile APIs.</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl shadow-md border-none bg-emerald-500/5">
            <div className="flex items-center gap-3">
              <Smartphone className="h-6 w-6 text-emerald-600" />
              <div>
                <h3 className="font-bold text-sm">Flutter App Ready</h3>
                <p className="text-xs text-muted-foreground">Standard JSON REST endpoints for iOS & Android app calls.</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 rounded-2xl shadow-md border-none bg-cyan-500/5">
            <div className="flex items-center gap-3">
              <Globe className="h-6 w-6 text-cyan-600" />
              <div>
                <h3 className="font-bold text-sm">1-Click Fast Web Navigation</h3>
                <p className="text-xs text-muted-foreground">Edge cached REST endpoints eliminate router transition delays.</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Endpoint List Table */}
        <Card className="border border-border shadow-xl rounded-3xl overflow-hidden bg-card">
          <CardHeader className="bg-muted/40 border-b border-border/40">
            <CardTitle className="text-lg font-bold">All Available REST Endpoints ({apiList.length})</CardTitle>
            <CardDescription className="text-xs">Click any URL to copy the full endpoint for Flutter or API testing.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {apiList.map((item) => (
                <div key={item.name} className="p-4 hover:bg-muted/20 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={item.method === 'POST' ? "secondary" : "default"} className="text-[10px] font-mono font-bold uppercase">
                        {item.method}
                      </Badge>
                      <span className="font-bold text-sm font-mono text-foreground">{item.name}</span>
                    </div>
                    <p className="text-xs font-mono text-muted-foreground break-all">{item.fullUrl}</p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopy(item.path)}
                    className="rounded-full text-xs font-bold gap-2 shrink-0 self-start md:self-auto"
                  >
                    {copiedEndpoint === item.path ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedEndpoint === item.path ? "Copied URL" : "Copy Endpoint"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}
