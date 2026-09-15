
"use client";

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart as BarChartIcon, DollarSign, ShoppingBag, CheckCircle, Clock, Loader2, PackageSearch, AlertTriangle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltipRecharts } from 'recharts'; // Renamed to avoid conflict with ShadCN Tooltip
import { ChartContainer, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { FirestoreBooking } from '@/types/firestore';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query, orderBy, limit } from '@/lib/mysqlDb';
import { useToast } from "@/hooks/use-toast";
import { useAdminStats } from "@/hooks/useAdminStats";
import { useAuth } from "@/hooks/useAuth";
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { formatCurrency } from '@/lib/utils';
import PermissionGuard from "@/components/admin/PermissionGuard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";



interface ReportData {
  totalRevenue: number;
  totalBookings: number;
  completedBookings: number;
  activeBookings: number; // Confirmed or Processing
  bookingsPerMonth: { monthYear: string; bookings: number; completedBookings: number; earnings: number }[];
}

const chartConfig = {
  bookings: {
    label: "Bookings",
    color: "hsl(var(--chart-1))",
  },
  earnings: {
    label: "Earnings",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig;

export default function AdminReportsPage() {
  const { config: appConfig } = useApplicationConfig();
  const symbol = appConfig?.currencySymbol || '₹';
  const decimals = appConfig?.currencyDecimalPoints !== undefined ? appConfig.currencyDecimalPoints : 2;
  const code = appConfig?.currencyCode || 'INR';
  const { stats: globalStats } = useAdminStats();
  const [allBookings, setAllBookings] = useState<FirestoreBooking[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    console.log("AdminReportsPage: useEffect started");
    setIsLoading(true);
    setError(null); 
    const bookingsCollectionRef = collection(db, "bookings");
    const q = query(bookingsCollectionRef, orderBy("createdAt", "desc"), limit(1000)); 

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      console.log("AdminReportsPage: onSnapshot received data, docs count:", querySnapshot.docs.length);

      const fetchedBookings = querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
      } as FirestoreBooking));

      if (querySnapshot.empty) {
        console.log("AdminReportsPage: No bookings found in snapshot.");
        setAllBookings([]);
        setIsLoading(false);
        return;
      }

      setAllBookings(fetchedBookings);
      setIsLoading(false);
    }, (err) => {
      console.error("AdminReportsPage: Error fetching booking data for reports: ", err);
      setError("Failed to load report data. Check console for details.");
      setIsLoading(false);
      toast({
        title: "Error Loading Reports",
        description: err.message,
        variant: "destructive"
      })
    });

    return () => {
      console.log("AdminReportsPage: useEffect cleanup, unsubscribing.");
      unsubscribe();
    };
  }, [toast]);


  // Dynamically extract all available years from booking data + current year
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([new Date().getFullYear()]);
    allBookings.forEach(booking => {
      if (booking.scheduledDate) {
        const date = new Date(booking.scheduledDate);
        if (!isNaN(date.getTime())) {
          yearsSet.add(date.getFullYear());
        }
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [allBookings]);

  // Aggregate stats for the selected year
  const statsForSelectedYear = useMemo(() => {
    let totalRevenue = 0;
    let totalBookings = 0;
    let completedBookings = 0;
    let activeBookings = 0;

    allBookings.forEach(booking => {
      if (!booking.scheduledDate) return;
      const date = new Date(booking.scheduledDate);
      if (isNaN(date.getTime())) return;

      if (date.getFullYear() === selectedYear) {
        totalBookings++;
        if (booking.status === "Completed") {
          totalRevenue += booking.totalAmount || 0;
          completedBookings++;
        }
        if (booking.status === "Confirmed" || booking.status === "Processing") {
          activeBookings++;
        }
      }
    });

    return { totalRevenue, totalBookings, completedBookings, activeBookings };
  }, [allBookings, selectedYear]);

  // Map bookings into 12 months (Jan to Dec) for the selected year
  const monthsOfSelectedYear = useMemo(() => {
    const monthlyData: { monthYear: string; bookings: number; completedBookings: number; earnings: number }[] = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = m.toString().padStart(2, '0');
      monthlyData.push({
        monthYear: `${selectedYear}-${monthStr}`,
        bookings: 0,
        completedBookings: 0,
        earnings: 0
      });
    }

    allBookings.forEach(booking => {
      if (!booking.scheduledDate) return;
      const date = new Date(booking.scheduledDate);
      if (isNaN(date.getTime())) return;

      if (date.getFullYear() === selectedYear) {
        const monthIndex = date.getMonth(); // 0 to 11
        monthlyData[monthIndex].bookings++;
        if (booking.status === "Completed") {
          monthlyData[monthIndex].completedBookings++;
          monthlyData[monthIndex].earnings += booking.totalAmount || 0;
        }
      }
    });

    return monthlyData;
  }, [allBookings, selectedYear]);

  const statsLifetime = useMemo(() => {
    let totalRevenue = 0;
    let completedBookings = 0;

    allBookings.forEach(booking => {
      if (booking.status === "Completed") {
        totalRevenue += booking.totalAmount || 0;
        completedBookings++;
      }
    });

    return { totalRevenue, completedBookings };
  }, [allBookings]);


  console.log("AdminReportsPage: Rendering component. isLoading:", isLoading, "error:", error, "allBookings.length:", allBookings.length);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Generating reports...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Reports</h2>
        <p className="text-destructive-foreground bg-destructive/10 p-3 rounded-md">{error}</p>
        <Button onClick={() => window.location.reload()} className="mt-6">Try Again</Button>
      </div>
    );
  }

  if (allBookings.length === 0 && !isLoading) {
    return (
      <div className="text-center py-10">
        <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Booking Data Available</h2>
        <p className="text-muted-foreground">Cannot generate reports as there are no bookings yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
       <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-2xl flex items-center">
              <BarChartIcon className="mr-2 h-6 w-6 text-primary" /> Reports Overview
            </CardTitle>
            <CardDescription className="mt-1">
              Summary of booking activities and revenue.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase">Filter by Year</span>
            <Select 
              value={String(selectedYear)} 
              onValueChange={(val) => {
                setSelectedYear(Number(val));
              }}
            >
              <SelectTrigger className="w-[120px] font-bold">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(statsForSelectedYear.totalRevenue, symbol, decimals, code)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bookings</CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsForSelectedYear.totalBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Bookings</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsForSelectedYear.completedBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Bookings</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statsForSelectedYear.activeBookings}</div>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Bookings Per Month</CardTitle>
          <CardDescription>Visual representation of bookings over time.</CardDescription>
        </CardHeader>
        <CardContent>
          {monthsOfSelectedYear.length > 0 ? (
            <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
              <BarChart accessibilityLayer data={monthsOfSelectedYear}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="monthYear"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (typeof value !== 'string' || !value.includes('-')) {
                      // console.warn("XAxis tickFormatter: unexpected value", value);
                      return String(value); // Fallback for unexpected values
                    }
                    try {
                      // value is "YYYY-MM"
                      const [year, month] = value.split('-');
                      // Create date as UTC to avoid timezone issues if only month/year is relevant
                      const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
                      if (isNaN(date.getTime())) {
                        // console.warn("XAxis tickFormatter: invalid date from value", value);
                        return value;
                      }
                      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
                    } catch {
                      return value; // Fallback
                    }
                  }}
                />
                <YAxis allowDecimals={false} />
                <ChartTooltipRecharts cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltipContent hideLabel />} />
                <Bar dataKey="bookings" fill="var(--color-bookings)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground text-center py-4">Not enough data to display monthly booking chart.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Earnings Per Month</CardTitle>
          <CardDescription>Visual representation of revenue over time (completed bookings only).</CardDescription>
        </CardHeader>
        <CardContent>
          {monthsOfSelectedYear.length > 0 ? (
            <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
              <BarChart accessibilityLayer data={monthsOfSelectedYear}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="monthYear"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tickFormatter={(value) => {
                    if (typeof value !== 'string' || !value.includes('-')) {
                      return String(value);
                    }
                    try {
                      const [year, month] = value.split('-');
                      const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1));
                      if (isNaN(date.getTime())) return value;
                      return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
                    } catch {
                      return value;
                    }
                  }}
                />
                <YAxis 
                  tickFormatter={(value) => formatCurrency(value, symbol, decimals, code)}
                />
                <ChartTooltipRecharts 
                  cursor={{ fill: 'hsl(var(--muted))' }} 
                  content={
                    <ChartTooltipContent 
                      hideLabel 
                      formatter={(value) => formatCurrency(Number(value), symbol, decimals, code)}
                    />
                  } 
                />
                <Bar dataKey="earnings" fill="var(--color-earnings)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-muted-foreground text-center py-4">Not enough data to display monthly earnings chart.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" /> Average Booking Value (ABV)
          </CardTitle>
          <CardDescription>
            Average value of completed bookings overall and broken down by month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {/* Stat Callout */}
            <div className="flex flex-col justify-center gap-6 p-6 bg-primary/5 border border-primary/10 rounded-2xl">
              {/* Yearly ABV */}
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Yearly ABV ({selectedYear})</span>
                <p className="text-3xl font-black text-primary">
                  {formatCurrency(statsForSelectedYear.completedBookings > 0 
                    ? (statsForSelectedYear.totalRevenue / statsForSelectedYear.completedBookings) 
                    : 0, symbol, decimals, code)}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Based on <strong className="text-foreground">{statsForSelectedYear.completedBookings}</strong> completed bookings totaling <strong className="text-foreground">{formatCurrency(statsForSelectedYear.totalRevenue, symbol, decimals, code)}</strong> in {selectedYear}.
                </p>
              </div>

              <div className="border-t border-primary/10 pt-4 space-y-1">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Lifetime ABV</span>
                <p className="text-2xl font-black text-foreground/80">
                  {formatCurrency(statsLifetime.completedBookings > 0 
                    ? (statsLifetime.totalRevenue / statsLifetime.completedBookings) 
                    : 0, symbol, decimals, code)}
                </p>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  Based on <strong className="text-foreground">{statsLifetime.completedBookings}</strong> completed bookings totaling <strong className="text-foreground">{formatCurrency(statsLifetime.totalRevenue, symbol, decimals, code)}</strong> overall.
                </p>
              </div>
            </div>

            {/* Monthly Breakdowns List/Table */}
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-foreground">Monthly ABV Breakdown</h3>
              
              {/* Desktop view: Table */}
              <div className="hidden md:block border rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="p-3">Month</th>
                      <th className="p-3 text-right">Completed Bookings</th>
                      <th className="p-3 text-right">Monthly Revenue</th>
                      <th className="p-3 text-right font-bold text-primary">Average Booking Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {monthsOfSelectedYear.map((month) => {
                      const monthlyCompleted = month.completedBookings || 0;
                      const monthlyAbv = monthlyCompleted > 0 ? (month.earnings / monthlyCompleted) : 0;
                      
                      const [year, monthNum] = month.monthYear.split('-');
                      const dateObj = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1));
                      const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

                      return (
                        <tr key={month.monthYear} className="hover:bg-muted/50 transition-colors">
                          <td className="p-3 font-medium">{monthLabel}</td>
                          <td className="p-3 text-right">{monthlyCompleted}</td>
                          <td className="p-3 text-right">{formatCurrency(month.earnings, symbol, decimals, code)}</td>
                          <td className="p-3 text-right font-bold text-primary">{formatCurrency(monthlyAbv, symbol, decimals, code)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile/Tablet view: Cards */}
              <div className="block md:hidden space-y-3">
                {monthsOfSelectedYear.map((month) => {
                  const monthlyCompleted = month.completedBookings || 0;
                  const monthlyAbv = monthlyCompleted > 0 ? (month.earnings / monthlyCompleted) : 0;
                  
                  const [year, monthNum] = month.monthYear.split('-');
                  const dateObj = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 1));
                  const monthLabel = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

                  return (
                    <Card key={month.monthYear} className="border border-muted p-4 space-y-2 bg-card">
                      <div className="flex justify-between items-center border-b pb-2">
                        <span className="font-bold text-foreground">{monthLabel}</span>
                        <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">
                          {monthlyCompleted} Bookings
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div>
                          <p className="text-muted-foreground">Monthly Revenue</p>
                          <p className="font-semibold text-foreground">{formatCurrency(month.earnings, symbol, decimals, code)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-muted-foreground font-semibold text-primary">Avg Booking Value</p>
                          <p className="font-bold text-primary text-sm">{formatCurrency(monthlyAbv, symbol, decimals, code)}</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

