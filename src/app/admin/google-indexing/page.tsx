// src/app/admin/google-indexing/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle, Play, Globe2, ListCollapse } from "lucide-react";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { getIndexingStatus, triggerBulkIndexingBatch, updateIndexingConfig } from '@/lib/googleIndexing';

interface SubmissionRecord {
  url: string;
  success: boolean;
  submittedAt: string | null;
  error: string | null;
}

export default function GoogleIndexingDashboard() {
  const { config: appConfig } = useApplicationConfig();
  const [isMounted, setIsMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Dashboard states
  const [totalUrls, setTotalUrls] = useState(0);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [isBulkIndexingComplete, setIsBulkIndexingComplete] = useState(false);
  const [recentSubmissions, setRecentSubmissions] = useState<SubmissionRecord[]>([]);

  const { toast } = useToast();

  const fetchStats = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await getIndexingStatus();
      if (res.success) {
        setTotalUrls(res.totalUrls || 0);
        setSubmittedCount(res.submittedCount || 0);
        setPendingCount(res.pendingCount || 0);
        setIsBulkIndexingComplete(res.isBulkIndexingComplete || false);
        setRecentSubmissions(res.recentSubmissions || []);
      } else {
        toast({ title: "Error", description: res.error || "Failed to load indexing stats.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to fetch stats.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
    fetchStats();
  }, []);

  const handleToggleCron = async (checked: boolean) => {
    // Note: In Firestore we store 'isBulkIndexingComplete' (cron turns off if true).
    // So if the switch "Enable Daily Cron Job" is CHECKED, then 'isBulkIndexingComplete' must be set to FALSE.
    // If the switch is UNCHECKED, then 'isBulkIndexingComplete' must be set to TRUE (which terminates/stops the cron).
    const targetStatus = !checked; 
    
    setIsSubmitting(true);
    try {
      const res = await updateIndexingConfig(targetStatus);
      if (res.success) {
        setIsBulkIndexingComplete(targetStatus);
        toast({
          title: "Configuration Saved",
          description: checked 
            ? "Daily VPS cron job has been enabled." 
            : "Daily VPS cron job is now disabled (marked complete).",
        });
      } else {
        toast({ title: "Error", description: res.error || "Failed to save configuration.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to update configuration.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerBatch = async () => {
    setIsSubmitting(true);
    toast({
      title: "Triggering Indexing Batch",
      description: "Compiling URLs and contacting Google API. Please wait...",
    });
    try {
      const res = await triggerBulkIndexingBatch();
      if (res.success) {
        if (res.submittedCount === 0) {
          toast({ title: "Done", description: res.message || "All pages are already indexed!" });
        } else {
          toast({
            title: "Success",
            description: `Successfully submitted ${res.successCount}/${res.submittedCount} URLs. Remaining: ${res.remainingPending}.`,
          });
        }
        await fetchStats(true); // Silent refresh
      } else {
        toast({ title: "API Error", description: res.error || "Google Indexing API call failed.", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to execute indexing trigger.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted) return null;

  const completionRate = totalUrls > 0 ? Math.round((submittedCount / totalUrls) * 100) : 0;

  return (
    <PermissionGuard moduleId="seo_overrides" action="read">
      <div className="flex-1 space-y-4 p-1 pt-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Google Indexing API Dashboard</h2>
          <div className="flex items-center">
            <Button variant="outline" size="sm" onClick={() => fetchStats()} disabled={isLoading || isSubmitting} className="w-full md:w-auto justify-center">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Refresh Data
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Site URLs</CardTitle>
                  <Globe2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalUrls}</div>
                  <p className="text-xs text-muted-foreground">Unique pages compiled from DB</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Submitted to Google</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{submittedCount}</div>
                  <p className="text-xs text-muted-foreground">{completionRate}% of pages indexed</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Balance Pending</CardTitle>
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pendingCount}</div>
                  <p className="text-xs text-muted-foreground">Awaiting indexing submissions</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">VPS Cron Active</CardTitle>
                  <Switch
                    checked={!isBulkIndexingComplete}
                    onCheckedChange={handleToggleCron}
                    disabled={isSubmitting}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {!isBulkIndexingComplete ? "Running" : "Stopped"}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {!isBulkIndexingComplete 
                      ? "Cron triggers daily batch submissions" 
                      : "Bulk cron is disabled (marked complete)"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Progress bar */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between text-sm font-medium mb-2">
                  <span>Indexing Progress</span>
                  <span>{completionRate}% Complete</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-4 overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-500" 
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Control & Trigger panel */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Manual Batch Execution</CardTitle>
                  <CardDescription>
                    Trigger a manual submission batch of **180 pending URLs** to Google Indexing API right now.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center space-x-4">
                  <Button 
                    onClick={handleTriggerBatch} 
                    disabled={isSubmitting || pendingCount === 0}
                    className="w-full md:w-auto"
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4 fill-current" />
                    )}
                    Run Batch Now
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Leaves 20 requests buffer for real-time admin edits.
                  </span>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Dashboard Instructions</CardTitle>
                  <CardDescription>
                    How to manage automated Google Search indexing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm space-y-2 text-muted-foreground">
                  <p>
                    1. **Instant Indexing:** Whenever you add or edit services, categories, localities, or SEO overrides, Google is notified immediately in real-time.
                  </p>
                  <p>
                    2. **Bulk Indexing:** The VPS cron job processes the remaining pages daily. Once **Balance Pending** reaches 0, the switch will automatically turn off.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recent Submissions Table */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Submissions</CardTitle>
                <CardDescription>
                  List of the last 20 URLs processed by the Indexing API.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recentSubmissions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No submissions recorded yet.
                  </div>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>URL</TableHead>
                            <TableHead className="w-[100px]">Status</TableHead>
                            <TableHead className="w-[200px]">Processed Date</TableHead>
                            <TableHead>Details/Errors</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentSubmissions.map((record, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-mono text-xs break-all max-w-[400px]">
                                {record.url}
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                  record.success 
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
                                    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                }`}>
                                  {record.success ? "Success" : "Failed"}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                 {record.submittedAt ? `${formatDateInTimezone(new Date(record.submittedAt), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)} ${formatTimeInTimezone(new Date(record.submittedAt), appConfig?.timezone || 'Asia/Kolkata')}` : 'N/A'}
                              </TableCell>
                              <TableCell className="text-xs text-red-500 font-mono">
                                {record.error || "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Card List View */}
                    <div className="block md:hidden space-y-4">
                      {recentSubmissions.map((record, index) => (
                        <div key={index} className="rounded-lg border p-4 space-y-3 bg-card text-card-foreground shadow-sm">
                          <div className="flex flex-col gap-2">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold w-fit ${
                              record.success 
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
                                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                            }`}>
                              {record.success ? "Success" : "Failed"}
                            </span>
                            <div className="font-mono text-xs break-all text-slate-800 dark:text-slate-200 leading-relaxed font-semibold">
                              {record.url}
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-1.5 text-xs border-t pt-2 mt-2 text-muted-foreground">
                            <div className="flex justify-between">
                              <span className="font-medium">Processed Date:</span>
                               <span>{record.submittedAt ? `${formatDateInTimezone(new Date(record.submittedAt), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)} ${formatTimeInTimezone(new Date(record.submittedAt), appConfig?.timezone || 'Asia/Kolkata')}` : 'N/A'}</span>
                            </div>
                            {!record.success && record.error && (
                              <div className="mt-2 p-2.5 rounded bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-950/30 text-red-600 dark:text-red-400 font-mono text-[11px] leading-relaxed break-all">
                                {record.error}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
