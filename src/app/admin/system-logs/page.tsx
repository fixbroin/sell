"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Terminal, RefreshCw, AlertTriangle, CheckCircle2, ShieldCheck, 
  Search, Copy, Check, Filter, Trash2, Download, Pause, Play
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from "@/components/admin/PermissionGuard";
import { motion } from "framer-motion";
import { auth } from '@/lib/firebase';

interface LogEntry {
  id: number;
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  message: string;
}

export default function SystemLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [rawLogs, setRawLogs] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [isAutoRefresh, setIsAutoRefresh] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/system-logs', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setRawLogs(data.rawOutput || '');
      } else {
        toast({ title: "Error", description: data.error || "Failed to fetch logs", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to connect to log server", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Only auto-refresh if explicitly turned ON and tab is visible
  useEffect(() => {
    if (!isAutoRefresh) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchLogs();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isAutoRefresh, fetchLogs]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(rawLogs);
    setCopied(true);
    toast({ title: "Copied!", description: "Logs copied to clipboard." });
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter(log => {
    const matchesLevel = filterLevel === 'all' || log.level === filterLevel;
    const matchesSearch = !searchTerm || log.message.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesLevel && matchesSearch;
  });

  const errorCount = logs.filter(l => l.level === 'error').length;
  const warnCount = logs.filter(l => l.level === 'warn').length;

  return (
    <PermissionGuard moduleId="system_logs" action="read">
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Terminal className="h-8 w-8 text-primary" />
              Live System & PM2 Logs
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              View live VPS server logs, errors, and system events directly without SSH access.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={isAutoRefresh ? "default" : "outline"}
              size="sm"
              onClick={() => setIsAutoRefresh(!isAutoRefresh)}
              className="gap-2 rounded-full text-xs font-bold"
            >
              {isAutoRefresh ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isAutoRefresh ? "Auto-Refresh (5s)" : "Paused"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchLogs}
              disabled={isLoading}
              className="gap-2 rounded-full text-xs font-bold"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyLogs}
              className="gap-2 rounded-full text-xs font-bold"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy Logs"}
            </Button>
          </div>
        </div>

        {/* Stat Pills */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center justify-between border-none shadow-md rounded-2xl bg-card">
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase">Total Log Lines</p>
              <p className="text-2xl font-black">{logs.length}</p>
            </div>
            <Terminal className="h-8 w-8 text-primary/40" />
          </Card>

          <Card className="p-4 flex items-center justify-between border-none shadow-md rounded-2xl bg-destructive/10 border-destructive/20">
            <div>
              <p className="text-xs font-bold text-destructive uppercase">Errors Detected</p>
              <p className="text-2xl font-black text-destructive">{errorCount}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-destructive/50" />
          </Card>

          <Card className="p-4 flex items-center justify-between border-none shadow-md rounded-2xl bg-amber-500/10 border-amber-500/20">
            <div>
              <p className="text-xs font-bold text-amber-600 uppercase">Warnings</p>
              <p className="text-2xl font-black text-amber-600">{warnCount}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-500/50" />
          </Card>

          <Card className="p-4 flex items-center justify-between border-none shadow-md rounded-2xl bg-emerald-500/10 border-emerald-500/20">
            <div>
              <p className="text-xs font-bold text-emerald-600 uppercase">Server Status</p>
              <p className="text-sm font-black text-emerald-600">ONLINE 🟢</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
          </Card>
        </div>

        {/* Filter Controls */}
        <Card className="p-4 border-none shadow-lg rounded-2xl bg-card">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search log output (e.g. MySQL, 404, error)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 rounded-full text-xs font-medium"
              />
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <Button
                variant={filterLevel === 'all' ? "default" : "outline"}
                size="sm"
                onClick={() => setFilterLevel('all')}
                className="rounded-full text-xs"
              >
                All ({logs.length})
              </Button>

              <Button
                variant={filterLevel === 'error' ? "destructive" : "outline"}
                size="sm"
                onClick={() => setFilterLevel('error')}
                className="rounded-full text-xs"
              >
                Errors ({errorCount})
              </Button>

              <Button
                variant={filterLevel === 'warn' ? "secondary" : "outline"}
                size="sm"
                onClick={() => setFilterLevel('warn')}
                className="rounded-full text-xs"
              >
                Warnings ({warnCount})
              </Button>
            </div>
          </div>
        </Card>

        {/* Live Terminal Output Window */}
        <Card className="border border-border shadow-2xl rounded-3xl overflow-hidden bg-[#0d1117] text-[#e6edf3]">
          <div className="bg-[#161b22] px-4 py-3 border-b border-[#30363d] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
              <span className="ml-2 font-mono text-xs text-slate-400">me.yourbrand.in (~/pm2/logs)</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Showing {filteredLogs.length} lines</span>
          </div>

          <div className="p-4 font-mono text-xs overflow-x-auto max-h-[600px] overflow-y-auto space-y-1">
            {isLoading && logs.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="h-5 w-5 animate-spin" /> Loading VPS server logs...
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                No log lines match your search criteria.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`py-1 px-2 rounded font-mono leading-relaxed transition-colors flex items-start gap-2 border-b border-[#21262d]/50 hover:bg-[#161b22] ${
                    log.level === 'error' ? 'text-red-400 bg-red-950/20' :
                    log.level === 'warn' ? 'text-yellow-400 bg-yellow-950/10' :
                    'text-slate-300'
                  }`}
                >
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider shrink-0 ${
                    log.level === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/40' :
                    log.level === 'warn' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {log.level}
                  </span>
                  <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </PermissionGuard>
  );
}
