"use client";

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  Loader2, Globe2, PackageSearch, AlertTriangle, 
  Trash2 as TrashIcon, TrendingUp, Users, MapPin, 
  MousePointer2, Search, Filter, Monitor, Smartphone, Layout
} from "lucide-react"; 
import type { FirestoreVisitorInfoLog } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { 
  collection, query, orderBy, Timestamp, limit, startAfter, 
  getDocs, writeBatch, type DocumentSnapshot 
} from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from 'date-fns';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getTimestampMillis, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import PermissionGuard from '@/components/admin/PermissionGuard';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';

const ITEMS_PER_PAGE = 50;

const formatLogTimestamp = (timestamp?: any): string => {
  const millis = getTimestampMillis(timestamp);
  if (!millis) return 'N/A';
  return formatDistanceToNow(new Date(millis), { addSuffix: true });
};

const formatDateForDisplay = (timestamp?: any, appConfig?: any): string => {
    const millis = getTimestampMillis(timestamp);
    if (!millis) return 'N/A';
    return `${formatDateInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata', appConfig?.dateFormat)} ${formatTimeInTimezone(new Date(millis), appConfig?.timezone || 'Asia/Kolkata')}`;
};


const getBrowserIcon = (ua: string) => {
    if (ua.includes('Chrome')) return <Monitor className="h-3 w-3 inline mr-1 text-blue-500" />;
    if (ua.includes('Firefox')) return <Monitor className="h-3 w-3 inline mr-1 text-orange-500" />;
    if (ua.includes('Safari') && !ua.includes('Chrome')) return <Monitor className="h-3 w-3 inline mr-1 text-blue-400" />;
    return <Monitor className="h-3 w-3 inline mr-1 text-gray-500" />;
};

const getDeviceIcon = (ua: string) => {
    if (/Mobile|Android|iPhone/i.test(ua)) return <Smartphone className="h-3 w-3 inline mr-1 text-green-500" />;
    return <Monitor className="h-3 w-3 inline mr-1 text-indigo-500" />;
};

export default function AdminVisitorInfoPage() {
  const { config: appConfig } = useApplicationConfig();
  const [visitorLogs, setVisitorLogs] = useState<FirestoreVisitorInfoLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'all' | 'unique'>('all');
  const { toast } = useToast();

  const fetchInitialLogs = async () => {
    setIsLoading(true);
    try {
      const logsCollectionRef = collection(db, "visitorInfoLogs");
      const q = query(logsCollectionRef, orderBy("timestamp", "desc"), limit(ITEMS_PER_PAGE));
      const querySnapshot = await getDocs(q);
      
      const fetchedLogs = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as FirestoreVisitorInfoLog));
      
      setVisitorLogs(fetchedLogs);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching initial visitor logs: ", error);
      toast({ title: "Error", description: "Could not fetch visitor logs.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    fetchInitialLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadMore = async () => {
    if (!lastVisible || !hasMore || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const logsCollectionRef = collection(db, "visitorInfoLogs");
      const q = query(
        logsCollectionRef,
        orderBy("timestamp", "desc"),
        startAfter(lastVisible),
        limit(ITEMS_PER_PAGE)
      );
      const querySnapshot = await getDocs(q);
      const newLogs = querySnapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
      } as FirestoreVisitorInfoLog));
      
      setVisitorLogs(prevLogs => [...prevLogs, ...newLogs]);
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1] || null);
      setHasMore(querySnapshot.docs.length === ITEMS_PER_PAGE);
    } catch (error) {
      console.error("Error fetching more visitor logs: ", error);
      toast({ title: "Error", description: "Could not fetch more logs.", variant: "destructive" });
    } finally {
      setIsFetchingMore(false);
    }
  };

  const handleClearAllLogs = async () => {
    setIsClearing(true);
    try {
      const logsCollectionRef = collection(db, "visitorInfoLogs");
      const querySnapshot = await getDocs(logsCollectionRef);
      
      if (querySnapshot.empty) {
        toast({ title: "No Logs", description: "There are no visitor logs to clear.", variant: "default" });
        setIsClearing(false);
        return;
      }

      const batchArray: ReturnType<typeof writeBatch>[] = [];
      batchArray.push(writeBatch(db));
      let operationCount = 0;
      let batchIndex = 0;

      querySnapshot.docs.forEach((doc) => {
        batchArray[batchIndex].delete(doc.ref);
        operationCount++;
        if (operationCount === 499) {
          batchArray.push(writeBatch(db));
          batchIndex++;
          operationCount = 0;
        }
      });

      if (operationCount > 0) {
        batchArray.push(writeBatch(db));
      }

      for (const batch of batchArray) {
        await batch.commit();
      }

      setVisitorLogs([]);
      setLastVisible(null);
      setHasMore(false);
      toast({ title: "Logs Cleared", description: "All visitor logs have been successfully deleted." });
    } catch (error) {
      console.error("Error clearing visitor logs: ", error);
      toast({ title: "Error Clearing Logs", description: (error as Error).message || "Could not clear visitor logs.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  // --- ANALYTICS CALCULATIONS ---
  const analytics = useMemo(() => {
      if (visitorLogs.length === 0) return null;

      const topCountries: Record<string, number> = {};
      const topCities: Record<string, number> = {};
      const topPaths: Record<string, number> = {};
      const trafficByDay: Record<string, number> = {};
      const uniqueIPs = new Set();

      visitorLogs.forEach(log => {
          if (log.countryName) topCountries[log.countryName] = (topCountries[log.countryName] || 0) + 1;
          if (log.city) topCities[log.city] = (topCities[log.city] || 0) + 1;
          if (log.pathname) topPaths[log.pathname] = (topPaths[log.pathname] || 0) + 1;
          if (log.ipAddress) uniqueIPs.add(log.ipAddress);
          
          if (log.timestamp) {
              const millis = getTimestampMillis(log.timestamp);
              if (millis) {
                const day = format(new Date(millis), 'MMM dd');
                trafficByDay[day] = (trafficByDay[day] || 0) + 1;
              }
          }
      });

      const countryData = Object.entries(topCountries)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

      const pathData = Object.entries(topPaths)
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

      const trendData = Object.entries(trafficByDay)
          .map(([name, value]) => ({ name, value }))
          .reverse();

      return {
          totalVisits: visitorLogs.length,
          uniqueVisitors: uniqueIPs.size,
          countryData,
          pathData,
          trendData,
          topCity: Object.entries(topCities).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A'
      };
  }, [visitorLogs]);

  const filteredLogs = useMemo(() => {
      if (!searchTerm) return visitorLogs;
      const lowerSearch = searchTerm.toLowerCase();
      return visitorLogs.filter(log => 
          log.ipAddress?.toLowerCase().includes(lowerSearch) ||
          log.city?.toLowerCase().includes(lowerSearch) ||
          log.countryName?.toLowerCase().includes(lowerSearch) ||
          log.pathname?.toLowerCase().includes(lowerSearch) ||
          log.ispOrganization?.toLowerCase().includes(lowerSearch)
      );
  }, [visitorLogs, searchTerm]);

  const uniqueVisitorLogs = useMemo(() => {
    const map = new Map<string, {
      ipAddress: string;
      city: string;
      countryName: string;
      pathname: string;
      ispOrganization: string;
      userAgent: string;
      timestamp: any;
      visitCount: number;
      paths: string[];
    }>();

    visitorLogs.forEach(log => {
      if (!log.ipAddress) return;
      const existing = map.get(log.ipAddress);
      if (existing) {
        existing.visitCount += 1;
        const currentMillis = getTimestampMillis(log.timestamp) || 0;
        const existingMillis = getTimestampMillis(existing.timestamp) || 0;
        if (currentMillis > existingMillis) {
          existing.timestamp = log.timestamp;
          existing.pathname = log.pathname || '/';
          existing.city = log.city || '';
          existing.countryName = log.countryName || '';
          existing.ispOrganization = log.ispOrganization || '';
          existing.userAgent = log.userAgent || '';
        }
        if (log.pathname && !existing.paths.includes(log.pathname)) {
          existing.paths.push(log.pathname);
        }
      } else {
        map.set(log.ipAddress, {
          ipAddress: log.ipAddress,
          city: log.city || '',
          countryName: log.countryName || '',
          pathname: log.pathname || '/',
          ispOrganization: log.ispOrganization || '',
          userAgent: log.userAgent || '',
          timestamp: log.timestamp,
          visitCount: 1,
          paths: [log.pathname || '/']
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const aMillis = getTimestampMillis(a.timestamp) || 0;
      const bMillis = getTimestampMillis(b.timestamp) || 0;
      return bMillis - aMillis;
    });
  }, [visitorLogs]);

  const filteredUniqueLogs = useMemo(() => {
    if (!searchTerm) return uniqueVisitorLogs;
    const lowerSearch = searchTerm.toLowerCase();
    return uniqueVisitorLogs.filter(log => 
        log.ipAddress?.toLowerCase().includes(lowerSearch) ||
        log.city?.toLowerCase().includes(lowerSearch) ||
        log.countryName?.toLowerCase().includes(lowerSearch) ||
        log.pathname?.toLowerCase().includes(lowerSearch) ||
        log.ispOrganization?.toLowerCase().includes(lowerSearch)
    );
  }, [uniqueVisitorLogs, searchTerm]);

  const currentDisplayLogs = viewMode === 'all' ? filteredLogs : filteredUniqueLogs;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const renderMobileCard = (log: FirestoreVisitorInfoLog) => (
    <Card key={log.id} className="mb-4 border-l-4 border-l-primary shadow-sm overflow-hidden">
      <CardContent className="p-4 space-y-3 text-sm">
         <div className="flex justify-between items-start">
             <div className="flex items-center gap-2">
                 <Badge variant="outline" className="bg-primary/5 text-[10px] py-0">{log.ipAddress}</Badge>
                 <span className="text-[10px] text-muted-foreground">{formatLogTimestamp(log.timestamp)}</span>
             </div>
             <div className="flex items-center gap-1">
                 {getDeviceIcon(log.userAgent)}
                 {getBrowserIcon(log.userAgent)}
             </div>
         </div>
         
         <div className="space-y-2">
             <div className="flex items-center gap-1.5 text-xs">
                 <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                 <span className="truncate">{log.city || 'N/A'}, {log.countryName || 'N/A'}</span>
             </div>
             <div className="bg-secondary/20 p-2 rounded-md border border-secondary/30">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground mb-1">
                    <Layout className="h-3 w-3" />
                    <span>Visited Path</span>
                </div>
                <div className="font-mono text-xs break-all text-primary font-medium leading-relaxed">
                    {log.pathname}
                </div>
             </div>
         </div>

         <Separator className="my-1 opacity-50" />
         
         <div className="text-[10px] text-muted-foreground italic truncate">
             ISP: {log.ispOrganization || 'N/A'}
         </div>
      </CardContent>
    </Card>
  );

  const renderMobileUniqueCard = (log: typeof uniqueVisitorLogs[number]) => (
    <Card key={log.ipAddress} className="mb-4 border-l-4 border-l-blue-500 shadow-sm overflow-hidden">
      <CardContent className="p-4 space-y-3 text-sm">
         <div className="flex justify-between items-start">
             <div className="flex items-center gap-2">
                 <Badge variant="outline" className="bg-primary/5 text-[10px] py-0">{log.ipAddress}</Badge>
                 <span className="text-[10px] text-muted-foreground">{formatLogTimestamp(log.timestamp)}</span>
             </div>
             <div className="flex items-center gap-1">
                 {getDeviceIcon(log.userAgent)}
                 {getBrowserIcon(log.userAgent)}
             </div>
         </div>
         
         <div className="space-y-2">
             <div className="flex justify-between items-center text-xs">
                 <div className="flex items-center gap-1.5">
                     <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                     <span className="truncate">{log.city || 'N/A'}, {log.countryName || 'N/A'}</span>
                 </div>
                 <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-none font-bold text-[10px] px-2 py-0.5">
                     {log.visitCount} visits
                 </Badge>
             </div>
             <div className="bg-secondary/20 p-2 rounded-md border border-secondary/30">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground mb-1">
                    <Layout className="h-3 w-3" />
                    <span>Last Path Visited</span>
                </div>
                <div className="font-mono text-xs break-all text-primary font-medium leading-relaxed">
                    {log.pathname}
                </div>
                {log.paths.length > 1 && (
                  <div className="text-[9px] text-muted-foreground mt-1 truncate">
                    Paths: {log.paths.join(', ')}
                  </div>
                )}
             </div>
         </div>

         <Separator className="my-1 opacity-50" />
         
         <div className="text-[10px] text-muted-foreground italic truncate">
             ISP: {log.ispOrganization || 'N/A'}
         </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="border-none bg-primary/5 shadow-none">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-primary p-2.5 rounded-lg text-primary-foreground shadow-md">
                 <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold tracking-tight">Visitor Insights</CardTitle>
                <CardDescription>Comprehensive analytics from your website traffic logs.</CardDescription>
              </div>
            </div>
            <div className="flex gap-2 w-full md:w-auto">
              <Button onClick={fetchInitialLogs} variant="outline" size="sm" disabled={isLoading || isClearing} className="flex-1 md:flex-none">
                  <Loader2 className={`mr-2 h-4 w-4 ${isLoading && !isFetchingMore ? 'animate-spin' : ''}`} /> Refresh
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={isLoading || isClearing || visitorLogs.length === 0} className="flex-1 md:flex-none">
                    <TrashIcon className="mr-2 h-4 w-4" /> Clear
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center"><AlertTriangle className="mr-2 h-5 w-5 text-destructive"/>Delete All Logs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently erase all historical visitor data. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearAllLogs} className="bg-destructive hover:bg-destructive/90">Confirm Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* KPI Stats */}
      {analytics && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-sm border-none bg-card hover:shadow-md transition-all">
                  <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-blue-100 text-blue-600"><Users className="h-4 w-4"/></div>
                      <div><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Visits</p><p className="text-lg font-bold">{analytics.totalVisits}</p></div>
                  </CardContent>
              </Card>
              <Card className="shadow-sm border-none bg-card hover:shadow-md transition-all">
                  <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-green-100 text-green-600"><Monitor className="h-4 w-4"/></div>
                      <div><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Unique IPs</p><p className="text-lg font-bold">{analytics.uniqueVisitors}</p></div>
                  </CardContent>
              </Card>
              <Card className="shadow-sm border-none bg-card hover:shadow-md transition-all">
                  <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-amber-100 text-amber-600"><MapPin className="h-4 w-4"/></div>
                      <div><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Top Location</p><p className="text-lg font-bold truncate max-w-[80px]">{analytics.topCity}</p></div>
                  </CardContent>
              </Card>
              <Card className="shadow-sm border-none bg-card hover:shadow-md transition-all">
                  <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-full bg-purple-100 text-purple-600"><MousePointer2 className="h-4 w-4"/></div>
                      <div><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Most Visited</p><p className="text-lg font-bold truncate max-w-[80px]">{analytics.pathData[0]?.name || '/'}</p></div>
                  </CardContent>
              </Card>
          </div>
      )}

      {/* Charts Section */}
      {analytics && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 shadow-sm border-none">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary"/>Traffic Trend (Last 50 Entries)</CardTitle></CardHeader>
                  <CardContent className="h-[250px] pt-4">
                      <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.trendData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                              <XAxis dataKey="name" fontSize={10} axisLine={false} tickLine={false} />
                              <YAxis fontSize={10} axisLine={false} tickLine={false} />
                              <Tooltip 
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                                cursor={{ fill: '#f3f4f6' }}
                              />
                              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={30} />
                          </BarChart>
                      </ResponsiveContainer>
                  </CardContent>
              </Card>

              <Card className="shadow-sm border-none">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-bold flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary"/>Visitor Geolocation</CardTitle></CardHeader>
                  <CardContent className="h-[250px] pt-4">
                       <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                              <Pie
                                  data={analytics.countryData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={5}
                                  dataKey="value"
                              >
                                  {analytics.countryData.map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                              </Pie>
                              <Tooltip />
                          </PieChart>
                      </ResponsiveContainer>
                      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                          {analytics.countryData.map((entry, index) => (
                              <div key={index} className="flex items-center gap-1">
                                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                  <span className="text-[10px] text-muted-foreground font-medium">{entry.name}</span>
                              </div>
                          ))}
                      </div>
                  </CardContent>
              </Card>
          </div>
      )}

      {/* Main Table Section */}
      <Card className="shadow-sm border-none">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <CardTitle className="text-lg font-bold">Activity Logs</CardTitle>
              
              {/* Tab Selector */}
              <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border border-border/60">
                <Button
                  variant={viewMode === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs font-semibold px-3"
                  onClick={() => setViewMode('all')}
                >
                  All Visits
                </Button>
                <Button
                  variant={viewMode === 'unique' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs font-semibold px-3"
                  onClick={() => setViewMode('unique')}
                >
                  Unique Visitors ({uniqueVisitorLogs.length})
                </Button>
              </div>
            </div>
            
            <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                    placeholder="Search by IP, city, path..." 
                    className="pl-9 h-9 bg-muted/30 border-none focus-visible:ring-primary"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && visitorLogs.length === 0 ? (
            <div className="flex flex-col justify-center items-center h-64 gap-3 text-muted-foreground">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="animate-pulse text-sm">Synchronizing logs...</p>
            </div>
          ) : currentDisplayLogs.length === 0 ? (
            <div className="text-center py-16">
              <PackageSearch className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">No results found for "{searchTerm}"</p>
              <Button variant="link" onClick={() => setSearchTerm("")} className="mt-2">Clear search</Button>
            </div>
          ) : (
            <>
              {/* Desktop View */}
              <div className="hidden lg:block">
                {viewMode === 'all' ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Visitor / Device</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Location</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Path</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Network (ISP)</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell>
                              <div className="flex flex-col">
                                  <span className="font-mono text-xs font-bold text-primary">{log.ipAddress}</span>
                                  <div className="flex items-center mt-1 text-[10px] text-muted-foreground">
                                      {getDeviceIcon(log.userAgent)}
                                      <span className="truncate max-w-[120px]" title={log.userAgent}>{log.userAgent.split(' ')[0]}...</span>
                                  </div>
                              </div>
                          </TableCell>
                          <TableCell>
                              <div className="flex flex-col">
                                  <span className="text-xs font-medium">{log.city || 'Unknown City'}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{log.countryName || 'Global'}</span>
                              </div>
                          </TableCell>
                          <TableCell>
                              <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0 bg-secondary/30">
                                  {log.pathname}
                              </Badge>
                          </TableCell>
                          <TableCell className="text-[10px] text-muted-foreground max-w-[140px] truncate" title={log.ispOrganization}>
                              {log.ispOrganization || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                               <div className="flex flex-col items-end">
                                  <span className="text-xs font-medium">{formatLogTimestamp(log.timestamp)}</span>
                                  <span className="text-[10px] text-muted-foreground opacity-60 font-mono">
                                      {(() => {
                                          const millis = getTimestampMillis(log.timestamp);
                                          return millis ? format(new Date(millis), 'HH:mm:ss') : '';
                                      })()}
                                  </span>
                              </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Visitor / Device</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Location</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Visits Count</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Last Path Visited</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider">Network (ISP)</TableHead>
                        <TableHead className="text-[11px] font-bold uppercase tracking-wider text-right">Last Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUniqueLogs.map((log) => (
                        <TableRow key={log.ipAddress} className="hover:bg-muted/10 transition-colors">
                          <TableCell>
                              <div className="flex flex-col">
                                  <span className="font-mono text-xs font-bold text-primary">{log.ipAddress}</span>
                                  <div className="flex items-center mt-1 text-[10px] text-muted-foreground">
                                      {getDeviceIcon(log.userAgent)}
                                      <span className="truncate max-w-[120px]" title={log.userAgent}>{log.userAgent.split(' ')[0]}...</span>
                                  </div>
                              </div>
                          </TableCell>
                          <TableCell>
                              <div className="flex flex-col">
                                  <span className="text-xs font-medium">{log.city || 'Unknown City'}</span>
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-tight">{log.countryName || 'Global'}</span>
                              </div>
                          </TableCell>
                          <TableCell>
                              <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-none font-bold text-[10px] px-2 py-0.5">
                                  {log.visitCount} visits
                              </Badge>
                          </TableCell>
                          <TableCell>
                              <div className="flex flex-col gap-1 items-start">
                                <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0 bg-secondary/30">
                                    {log.pathname}
                                </Badge>
                                {log.paths.length > 1 && (
                                  <span className="text-[9px] text-muted-foreground">
                                    +{log.paths.length - 1} other paths
                                  </span>
                                )}
                              </div>
                          </TableCell>
                          <TableCell className="text-[10px] text-muted-foreground max-w-[140px] truncate" title={log.ispOrganization}>
                              {log.ispOrganization || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                               <div className="flex flex-col items-end">
                                  <span className="text-xs font-medium">{formatLogTimestamp(log.timestamp)}</span>
                                  <span className="text-[10px] text-muted-foreground opacity-60 font-mono">
                                      {(() => {
                                          const millis = getTimestampMillis(log.timestamp);
                                          return millis ? format(new Date(millis), 'HH:mm:ss') : '';
                                      })()}
                                  </span>
                              </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Mobile View */}
              <div className="lg:hidden">
                {viewMode === 'all' 
                  ? filteredLogs.map(renderMobileCard)
                  : filteredUniqueLogs.map(renderMobileUniqueCard)
                }
              </div>
            </>
          )}
        </CardContent>
        {hasMore && (
            <CardFooter className="pt-4 justify-center border-t bg-muted/5">
                <Button variant="ghost" size="sm" onClick={handleLoadMore} disabled={isFetchingMore || isLoading} className="text-xs font-bold text-primary">
                    {isFetchingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <TrendingUp className="mr-2 h-4 w-4"/>}
                    {isFetchingMore ? 'Fetching more data...' : 'Analyze More History'}
                </Button>
            </CardFooter>
        )}
      </Card>
      
      {/* Footer Info */}
       <div className="bg-muted/30 rounded-xl p-4 flex items-start gap-3 border border-border/50">
          <InfoIcon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed text-muted-foreground">
             <strong>Privacy & Accuracy Note:</strong> IP-based geolocation provides approximate location data and is subject to provider (ipapi.co) accuracy. 
             Browsers and devices are identified via User-Agent strings. This dashboard is designed for high-level traffic analysis and 
             does not link specific actions to logged-in users. For individual user audit trails, refer to the 
             <Link href="/admin/activity-feed" className="text-primary hover:underline ml-1 font-bold">Security Activity Feed</Link>.
          </div>
       </div>
    </div>
  );
}

const InfoIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
    </svg>
);
