// src/app/admin/database-tools/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Database, UploadCloud, Download, Loader2, AlertTriangle, Image as ImageIcon, CheckCircle, Info, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { triggerRefresh } from '@/lib/revalidateUtils';
import { executeGetNextCacheStatus, executeClearNextCache } from '@/app/actions/dbActions';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { auth } from '@/lib/firebase';

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers = {
    ...(init?.headers || {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
  return fetch(url, { ...init, headers });
}

export default function DatabaseToolsPage() {
  const { toast } = useToast();
  const showToast = toast;
  
  const [isExportingDb, setIsExportingDb] = useState(false);
  const [isImportingDb, setIsImportingDb] = useState(false);
  const [dbFile, setDbFile] = useState<File | null>(null);

  const [isExportingImages, setIsExportingImages] = useState(false);
  const [isImportingImages, setIsImportingImages] = useState(false);
  const [imagesFile, setImagesFile] = useState<File | null>(null);

  const [cacheStatus, setCacheStatus] = useState<{ size: number; count: number; exists: boolean; path: string } | null>(null);
  const [isLoadingCacheStatus, setIsLoadingCacheStatus] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const fetchCacheStatus = async () => {
    setIsLoadingCacheStatus(true);
    try {
      const res = await executeGetNextCacheStatus();
      if (res.success) {
        setCacheStatus({
          size: res.size || 0,
          count: res.count || 0,
          exists: res.exists || false,
          path: res.path || '',
        });
      }
    } catch (err) {
      console.error("Failed to load cache status", err);
    } finally {
      setIsLoadingCacheStatus(false);
    }
  };

  const handleClearCache = async () => {
    setIsClearingCache(true);
    showToast({ title: "Clearing Disk Cache", description: "Deleting Next.js fetch-cache files..." });
    try {
      const res = await executeClearNextCache();
      if (res.success) {
        showToast({ title: "Success", description: "Next.js disk fetch cache cleared." });
        await fetchCacheStatus();
      } else {
        throw new Error(res.error || "Failed to clear cache");
      }
    } catch (err: any) {
      showToast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsClearingCache(false);
    }
  };

  useEffect(() => {
    fetchCacheStatus();
  }, []);

  const handleExportDb = async () => {
    setIsExportingDb(true);
    showToast({ title: "Exporting Database", description: "Generating your backup file..." });

    try {
      const response = await authFetch('/api/admin/database/export');
      if (!response.ok) throw new Error("Database export failed");
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `database-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast({ title: "Export Successful", description: "Database backup downloaded successfully." });
    } catch (error) {
      console.error(error);
      showToast({ title: "Export Failed", description: (error as Error).message || "Could not export database.", variant: "destructive" });
    } finally {
      setIsExportingDb(false);
    }
  };

  const handleImportDb = async () => {
    if (!dbFile) return;
    setIsImportingDb(true);
    showToast({ title: "Importing Database", description: "Wiping existing tables and restoring data..." });

    try {
      const formData = new FormData();
      formData.append('file', dbFile);

      const response = await authFetch('/api/admin/database/import', {
        method: 'POST',
        body: formData
      });

      const resText = await response.text();
      let resJson: any = {};
      try {
        resJson = JSON.parse(resText);
      } catch {
        if (resText.includes('413') || resText.toLowerCase().includes('too large')) {
          throw new Error("File too large for Nginx (max 1MB). Increase client_max_body_size in Nginx.");
        }
        throw new Error("Server returned HTML error page instead of JSON.");
      }

      if (!response.ok || !resJson.success) {
        throw new Error(resJson.error || "Database import failed");
      }

      await triggerRefresh('global-cache');
      showToast({ title: "Import Successful", description: `Restored ${resJson.count || 0} table records successfully.` });
      setDbFile(null);
      const fileInput = document.getElementById('db-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error(error);
      showToast({ title: "Import Failed", description: (error as Error).message || "Could not import database.", variant: "destructive" });
    } finally {
      setIsImportingDb(false);
    }
  };

  const handleExportImages = async () => {
    setIsExportingImages(true);
    showToast({ title: "Backing Up Images", description: "Compressing public/uploads folder into a ZIP..." });

    try {
      const response = await authFetch('/api/admin/images/export');
      if (!response.ok) throw new Error("Images backup failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `images-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast({ title: "Backup Successful", description: "Images zip backup downloaded successfully." });
    } catch (error) {
      console.error(error);
      showToast({ title: "Backup Failed", description: (error as Error).message || "Could not backup images.", variant: "destructive" });
    } finally {
      setIsExportingImages(false);
    }
  };

  const handleImportImages = async () => {
    if (!imagesFile) return;
    setIsImportingImages(true);
    showToast({ title: "Restoring Images", description: "Extracting ZIP archive and restoring directories..." });

    try {
      const formData = new FormData();
      formData.append('file', imagesFile);

      const response = await authFetch('/api/admin/images/import', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Images import failed");
      }

      showToast({ title: "Restore Successful", description: "All images and folder structures restored successfully." });
      setImagesFile(null);
      const fileInput = document.getElementById('images-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error(error);
      showToast({ title: "Restore Failed", description: (error as Error).message || "Could not restore images.", variant: "destructive" });
    } finally {
      setIsImportingImages(false);
    }
  };

  const [isMigratingFirebase, setIsMigratingFirebase] = useState(false);

  const handleMigrateFirebase = async () => {
    setIsMigratingFirebase(true);
    showToast({ title: "Migrating Data", description: "Fetching documents from Firebase Firestore and merging into MySQL..." });

    try {
      const res = await authFetch('/api/admin/database/migrate-firebase-to-mysql', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Migration failed");
      }

      await triggerRefresh('global-cache');
      showToast({ title: "Migration Complete!", description: data.message || "All Firebase data merged into MySQL!" });
    } catch (err) {
      console.error(err);
      showToast({ title: "Migration Failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIsMigratingFirebase(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" /> Database & Images Management Tools
        </h1>
        <p className="text-muted-foreground text-sm">
          Export, import, merge, and backup your MySQL database, images archive, and Firebase data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* FIREBASE MIGRATION CARD */}
        

        {/* DATABASE EXPORT & IMPORT CARD */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <Database className="mr-2 h-5 w-5 text-primary" /> Database Export & Restore
            </CardTitle>
            <CardDescription>
              Export your MySQL tables to a JSON backup or restore from a previously exported backup file.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4 flex-grow">
            <Alert className="bg-primary/5 border-primary/20">
              <Info className="h-4 w-4 text-primary" />
              <AlertTitle>JSON Backup File</AlertTitle>
              <AlertDescription>
                Exports all MySQL tables and JSON records into a single structured backup file.
              </AlertDescription>
            </Alert>

            <div className="p-4 border border-dashed rounded-lg flex flex-col items-center justify-center space-y-3 bg-muted/20">
              <Database className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center">Export complete MySQL database snapshot.</p>
              <Button onClick={handleExportDb} disabled={isExportingDb} variant="secondary" size="sm" className="w-full">
                {isExportingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {isExportingDb ? "Exporting..." : "Download Database Backup (.json)"}
              </Button>
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Restore Database</Label>
              <Alert className="py-2 bg-yellow-50 border-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-900/50 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="text-xs">
                  Restoring will overwrite matching table records with data from the uploaded file.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Input 
                  id="db-file-input" 
                  type="file" 
                  accept=".json" 
                  onChange={(e) => setDbFile(e.target.files?.[0] || null)} 
                  disabled={isImportingDb}
                  className="cursor-pointer"
                />
              </div>
              <PermissionGuard moduleId="database_tools" action="write">
                <Button 
                  onClick={handleImportDb} 
                  disabled={isImportingDb || !dbFile} 
                  variant="destructive"
                  className="w-full"
                >
                  {isImportingDb ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {isImportingDb ? "Restoring..." : "Restore Database"}
                </Button>
              </PermissionGuard>
            </div>
          </CardContent>
        </Card>

        {/* IMAGES BACKUP CARD */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center text-lg">
              <ImageIcon className="mr-2 h-5 w-5 text-emerald-500" /> Images Backup & Restore
            </CardTitle>
            <CardDescription>
              Backup your uploaded media assets folder or extract a restore file.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4 flex-grow">
            <Alert className="bg-emerald-50/50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/50">
              <Info className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle className="text-emerald-800 dark:text-emerald-300">ZIP File Restoration</AlertTitle>
              <AlertDescription className="text-emerald-700/80 dark:text-emerald-400/80">
                Packs/extracts files under <code className="text-[11px] font-mono bg-emerald-100/50 px-1 py-0.5 rounded dark:bg-emerald-900/50">public/uploads</code>. Recreates matching subdirectory paths.
              </AlertDescription>
            </Alert>

            <div className="p-4 border border-dashed rounded-lg flex flex-col items-center justify-center space-y-3 bg-muted/20">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center">Export public/uploads folder structure.</p>
              <Button onClick={handleExportImages} disabled={isExportingImages} variant="secondary" size="sm" className="w-full">
                {isExportingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                {isExportingImages ? "Creating Zip..." : "Download Images Backup (.zip)"}
              </Button>
            </div>

            <div className="space-y-3 pt-2">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Restore from Archive</Label>
              <Alert className="py-2 bg-yellow-50 border-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:border-yellow-900/50 dark:text-yellow-400">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
                <AlertDescription className="text-xs">
                  Existing images with matching filenames will be overwritten.
                </AlertDescription>
              </Alert>
              <div className="space-y-2">
                <Input 
                  id="images-file-input" 
                  type="file" 
                  accept=".zip" 
                  onChange={(e) => setImagesFile(e.target.files?.[0] || null)} 
                  disabled={isImportingImages}
                  className="cursor-pointer"
                />
              </div>
              <PermissionGuard moduleId="database_tools" action="write">
                <Button 
                  onClick={handleImportImages} 
                  disabled={isImportingImages || !imagesFile}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isImportingImages ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                  {isImportingImages ? "Uploading & Restoring..." : "Restore Images Archive"}
                </Button>
              </PermissionGuard>
            </div>
          </CardContent>
        </Card>

        {/* NEXT.JS FETCH CACHE MANAGEMENT CARD */}
        <Card className="flex flex-col md:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center text-lg">
                  <RefreshCw className="mr-2 h-5 w-5 text-amber-500 animate-pulse" /> Next.js Disk Cache Management
                </CardTitle>
                <CardDescription>
                  Reclaim server disk space by cleaning up expired Next.js pre-rendered HTML and JSON fetch-cache files.
                </CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchCacheStatus} 
                disabled={isLoadingCacheStatus}
              >
                {isLoadingCacheStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Refresh Status</span>
              </Button>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <Alert className="bg-amber-50/50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/50">
              <Info className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-amber-800 dark:text-amber-300">About Next.js Data Cache</AlertTitle>
              <AlertDescription className="text-amber-700/80 dark:text-amber-400/80 text-xs">
                To maximize loading speeds, Next.js caches database fetch requests directly on the server's local disk inside <code className="text-[11px] font-mono bg-amber-100/50 px-1 py-0.5 rounded dark:bg-amber-900/50">.next/cache/fetch-cache</code>. If you have thousands of dynamic SEO URLs, this directory can grow to multiple gigabytes. Clearing this cache is 100% safe; Next.js will rebuild it on demand when pages are accessed.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg bg-muted/20">
                <div className="text-xs text-muted-foreground font-medium">Cache Directory</div>
                <div className="text-xs font-mono truncate mt-1 text-primary" title={cacheStatus?.path}>
                  {cacheStatus?.path ? cacheStatus.path : "Checking..."}
                </div>
              </div>
              <div className="p-3 border rounded-lg bg-muted/20">
                <div className="text-xs text-muted-foreground font-medium">Total Files Cached</div>
                <div className="text-lg font-bold mt-1 text-primary">
                  {cacheStatus ? cacheStatus.count.toLocaleString() : "..."}
                </div>
              </div>
              <div className="p-3 border rounded-lg bg-muted/20">
                <div className="text-xs text-muted-foreground font-medium">Accumulated Disk Space</div>
                <div className="text-lg font-bold mt-1 text-primary">
                  {cacheStatus ? (
                    cacheStatus.size === 0 
                      ? "0 Bytes" 
                      : cacheStatus.size > 1024 * 1024 * 1024
                        ? `${(cacheStatus.size / (1024 * 1024 * 1024)).toFixed(2)} GB`
                        : `${(cacheStatus.size / (1024 * 1024)).toFixed(2)} MB`
                  ) : "..."}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <PermissionGuard moduleId="database_tools" action="write">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive"
                      disabled={isClearingCache || !cacheStatus?.exists || cacheStatus.count === 0}
                      className="w-full flex items-center justify-center"
                    >
                      {isClearingCache ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                      Clear Next.js Disk Cache (Purge fetch-cache)
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center text-destructive">
                        <AlertTriangle className="mr-2 h-5 w-5 text-destructive" /> Clear Next.js Disk Cache?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will delete all cached database query results and pre-rendered fetch responses from the server's disk. Next.js will automatically rebuild the cache as visitors request pages.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleClearCache} className="bg-destructive hover:bg-destructive/90 text-white">
                        Yes, Purge Disk Cache
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </PermissionGuard>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
