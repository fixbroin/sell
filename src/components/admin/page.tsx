

"use client";

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { BarChart, DollarSign, ShoppingBag, Users, Loader2, AlertTriangle, UserPlus, TagIcon, History, HandCoins, Search } from "lucide-react";
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, where, Timestamp, orderBy, limit, getDocs } from '@/lib/mysqlDb';
import type { FirestoreBooking, FirestoreUser, UserActivity, FirestoreService } from '@/types/firestore';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import AppImage from '@/components/ui/AppImage';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { getTimestampMillis } from '@/lib/utils';

interface DashboardStats {
  completedRevenue: number;
  totalBookings: number;
  activeUsers: number;
  newSignups: number;
  earnedCommission: number;
}

interface ActivityItem {
  id: string;
  type: 'new_booking' | 'new_user_signup';
  timestamp: Timestamp;
  title: string;
  description: string;
  icon: React.ReactElement;
  href?: string;
}

interface AnalyticsData {
  topServices: (FirestoreService & { count: number })[];
  topSearchTerms: { term: string; count: number }[];
}

const calculateProviderFee = (bookingAmount: number, feeType?: 'fixed' | 'percentage', feeValue?: number): number => {
    if (!feeType || !feeValue || feeValue <= 0) {
        return 0;
    }
    if (feeType === 'fixed') {
        return feeValue;
    }
    if (feeType === 'percentage') {
        return (bookingAmount * feeValue) / 100;
    }
    return 0;
};

import { useAdminStats } from '@/hooks/useAdminStats';

export default function AdminDashboardPage() {
  const { stats: dbStats, isLoading: isStatsLoading, error: statsError } = useAdminStats();
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    topServices: [],
    topSearchTerms: [],
  });
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(true);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || "₹";


  useEffect(() => {
    if (isStatsLoading) return;
    setIsLoading(false);
    if (statsError) setError(statsError);
  }, [isStatsLoading, statsError]);

  useEffect(() => {
    setIsActivitiesLoading(true);
    setActivitiesError(null);

    const recentBookingsQuery = query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(5));
    const recentUsersQuery = query(collection(db, "users"), orderBy("createdAt", "desc"), limit(5));

    let fetchedBookingsActivities: ActivityItem[] = [];
    let fetchedUsersActivities: ActivityItem[] = [];

    const combineAndSetActivities = () => {
        const combined = [...fetchedBookingsActivities, ...fetchedUsersActivities];
        combined.sort((a, b) => getTimestampMillis(b.timestamp) - getTimestampMillis(a.timestamp));
        setRecentActivities(combined.slice(0, 7)); // Show top 7 overall recent activities
        setIsActivitiesLoading(false);
    };
    
    let bookingsLoaded = false;
    let usersLoaded = false;

    const unsubscribeRecentBookings = onSnapshot(recentBookingsQuery, (snapshot) => {
      fetchedBookingsActivities = snapshot.docs.map(docSnap => {
        const booking = docSnap.data() as FirestoreBooking;
        return {
          id: docSnap.id,
          type: 'new_booking',
          timestamp: booking.createdAt,
          title: 'New Booking',
          description: `Booking ID: ${booking.bookingId.substring(0,12)}... by ${booking.customerName}`,
          icon: <TagIcon className="h-5 w-5 text-primary" />,
          href: `/admin/bookings/edit/${docSnap.id}`,
        };
      });
      bookingsLoaded = true;
      if (usersLoaded) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent bookings:", err);
      setActivitiesError((prev) => prev ? `${prev} Failed to load recent bookings.` : "Failed to load recent bookings.");
      bookingsLoaded = true;
      if (usersLoaded) combineAndSetActivities();
    });

    const unsubscribeRecentUsers = onSnapshot(recentUsersQuery, (snapshot) => {
      fetchedUsersActivities = snapshot.docs.map(docSnap => {
        const user = docSnap.data() as FirestoreUser;
        return {
          id: docSnap.id,
          type: 'new_user_signup',
          timestamp: user.createdAt,
          title: 'New User Signup',
          description: `${user.displayName || user.email} just joined.`,
          icon: <UserPlus className="h-5 w-5 text-accent" />,
          href: `/admin/users`,
        };
      });
      usersLoaded = true;
      if (bookingsLoaded) combineAndSetActivities();
    }, (err) => {
      console.error("Error fetching recent users:", err);
      setActivitiesError((prev) => prev ? `${prev} Failed to load recent users.` : "Failed to load recent users.");
      usersLoaded = true;
      if (bookingsLoaded) combineAndSetActivities();
    });

    // Fetch Analytics Data (Optimized)
    const fetchAnalytics = async () => {
        setIsAnalyticsLoading(true);
        try {
            // Fetch all services first to get their details (small collection)
            const servicesSnapshot = await getDocs(collection(db, "adminServices"));
            const servicesDataMap = new Map(servicesSnapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService]));

            // Top Services - Limit to recent 200 bookings for trending data instead of ALL history
            const bookingsQuery = query(collection(db, "bookings"), orderBy("createdAt", "desc"), limit(200));
            const bookingsSnapshot = await getDocs(bookingsQuery);
            const serviceCounts: { [key: string]: number } = {};
            bookingsSnapshot.forEach(doc => {
                const booking = doc.data() as FirestoreBooking;
                if (booking.services) {
                    booking.services.forEach(service => {
                        serviceCounts[service.serviceId] = (serviceCounts[service.serviceId] || 0) + (service.quantity || 1);
                    });
                }
            });

            const topServices = Object.entries(serviceCounts)
                .map(([serviceId, count]) => {
                    const serviceDetails = servicesDataMap.get(serviceId);
                    return serviceDetails ? { ...serviceDetails, count } : null;
                })
                .filter((item): item is FirestoreService & { count: number } => item !== null)
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            // Top Search Terms (already limited to 500)
            const searchActivitiesSnapshot = await getDocs(query(collection(db, "userActivities"), where("eventType", "==", "search"), limit(500)));
            const searchCounts: { [key: string]: number } = {};
            searchActivitiesSnapshot.forEach(doc => {
                const activity = doc.data() as UserActivity;
                const term = activity.eventData?.searchQuery?.toLowerCase().trim();
                if (term) {
                    searchCounts[term] = (searchCounts[term] || 0) + 1;
                }
            });
            const topSearchTerms = Object.entries(searchCounts).sort(([, a], [, b]) => b - a).slice(0, 5).map(([term, count]) => ({ term, count }));

            setAnalytics({ topServices, topSearchTerms });

        } catch(e) {
             console.error("Error fetching analytics data:", e);
        } finally {
            setIsAnalyticsLoading(false);
        }
    };
    fetchAnalytics();

    return () => {
      unsubscribeRecentBookings();
      unsubscribeRecentUsers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  if (isLoading || isStatsLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium h-5 w-24 bg-muted rounded animate-pulse"></CardTitle>
                <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold h-8 w-32 bg-muted rounded animate-pulse"></div>
                <div className="text-xs text-muted-foreground h-4 w-20 bg-muted rounded mt-1 animate-pulse"></div>
              </CardContent>
            </Card>
          ))}
        </div>
         <Card>
          <CardHeader>
            <CardTitle className="text-xl flex items-center"><History className="mr-2 h-5 w-5 text-muted-foreground" />Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex justify-center items-center">
             <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Error Loading Dashboard Stats</h2>
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{symbol}{dbStats.completedRevenue.toLocaleString()}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Earned Commission</CardTitle>
            <HandCoins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{symbol}{dbStats.earnedCommission.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dbStats.totalBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dbStats.activeUsers}</div>
          </CardContent>
        </Card>
         <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">New Signups (Last 30d)</CardTitle>
            <BarChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{dbStats.newSignups30d}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
              <History className="mr-2 h-5 w-5 text-muted-foreground" />Recent Activity
            </CardTitle>
            <CardDescription>Latest bookings and user signups.</CardDescription>
          </CardHeader>
          <CardContent>
            {isActivitiesLoading ? (
              <div className="flex justify-center items-center h-48">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : activitiesError ? (
              <div className="text-center py-6 text-destructive">
                  <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
                  <p>Could not load recent activities: {activitiesError}</p>
              </div>
            ) : recentActivities.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">No recent activity to display.</p>
            ) : (
              <ul className="space-y-4">
                {recentActivities.map((activity) => (
                  <li key={activity.id} className="flex items-start space-x-3 p-3 border rounded-md shadow-sm hover:bg-muted/50 transition-colors">
                    <span className="flex-shrink-0 mt-1">{activity.icon}</span>
                    <div className="flex-grow">
                      <div className="flex justify-between items-center">
                          <p className="text-sm font-medium">{activity.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {(() => {
                                const millis = getTimestampMillis(activity.timestamp);
                                return millis ? formatDistanceToNow(new Date(millis), { addSuffix: true }) : 'N/A';
                            })()}
                          </p>
                      </div>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                      {activity.href && (
                        <Link href={activity.href} passHref>
                          <Button variant="link" size="sm" className="text-xs p-0 h-auto mt-1">View Details</Button>
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center"><ShoppingBag className="mr-2 h-5 text-primary"/>Top Trending Services</CardTitle>
            </CardHeader>
            <CardContent>
              {isAnalyticsLoading ? (
                <div className="h-40 flex items-center justify-center"><Loader2 className="animate-spin"/></div>
              ) : analytics.topServices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No booking data available.</p>
              ) : (
                <Carousel opts={{ align: "start", loop: analytics.topServices.length > 2 }} className="w-full">
                  <CarouselContent className="-ml-2">
                    {analytics.topServices.map(service => (
                      <CarouselItem key={service.id} className="pl-2 basis-1/2 md:basis-full lg:basis-1/2">
                          <Card className="h-full overflow-hidden">
                              <div className="relative w-full h-24 bg-muted">
                                <AppImage src={service.imageUrl || '/default-image.png'} alt={service.name} fill sizes="150px" className="object-cover" />
                              </div>
                              <div className="p-2">
                                <p className="font-medium text-xs line-clamp-2">{service.name}</p>
                                <p className="text-xs text-muted-foreground">{service.count} booked</p>
                              </div>
                          </Card>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                  {analytics.topServices.length > 2 && <CarouselPrevious className="absolute -left-3 top-1/2 -translate-y-1/2" />}
                  {analytics.topServices.length > 2 && <CarouselNext className="absolute -right-3 top-1/2 -translate-y-1/2" />}
                </Carousel>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center"><Search className="mr-2 h-5 text-primary"/>Keyword Search Analytics</CardTitle></CardHeader>
            <CardContent>
               {isAnalyticsLoading ? <div className="h-24 flex items-center justify-center"><Loader2 className="animate-spin"/></div> :
                analytics.topSearchTerms.length === 0 ? <p className="text-sm text-muted-foreground">No search data available.</p> :
                <ol className="space-y-2 text-sm list-decimal list-inside">
                  {analytics.topSearchTerms.map(s => (
                    <li key={s.term} className="flex justify-between">
                      <span className="truncate pr-2">"{s.term}"</span>
                      <span className="font-semibold whitespace-nowrap">{s.count} searches</span>
                    </li>
                  ))}
                </ol>
              }
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

