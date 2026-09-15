"use client";

import { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CalendarOff, 
  Calendar as CalendarIcon, 
  Clock, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  CalendarDays, 
  Sparkles, 
  ShieldCheck,
  RotateCcw,
  Zap
} from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, doc, deleteDoc, Timestamp, orderBy } from '@/lib/mysqlDb';
import type { LeaveRequest, ProviderApplication } from '@/types/firestore';
import { useAuth } from '@/hooks/useAuth';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { formatScheduledDate } from '@/lib/utils';

export default function ProviderLeavesPage() {
  const { user: providerUser } = useAuth();
  const { toast } = useToast();

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [providerProfile, setProviderProfile] = useState<ProviderApplication | null>(null);

  // Add Leave Dialog State
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveType, setLeaveType] = useState<'full_day' | 'partial_day'>('full_day');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [reason, setReason] = useState('');

  // Delete / Cancel Confirmation State
  const [leaveToCancel, setLeaveToCancel] = useState<LeaveRequest | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Today's date ISO
  const todayISO = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Tomorrow's date ISO
  const tomorrowISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Day after 3 days ISO
  const threeDaysEndISO = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2); // 3 days: today, tomorrow, dayAfter
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  // Load Provider Profile
  useEffect(() => {
    if (!providerUser?.uid) return;
    const fetchProfile = async () => {
      try {
        const pSnap = await getDocs(query(collection(db, "providerApplications"), where("__name__", "==", providerUser.uid)));
        if (!pSnap.empty) {
          setProviderProfile(pSnap.docs[0].data() as ProviderApplication);
        }
      } catch (err) {
        console.warn("Could not load provider profile:", err);
      }
    };
    fetchProfile();
  }, [providerUser?.uid]);

  // Load Leaves for this Provider
  const loadProviderLeaves = async () => {
    if (!providerUser?.uid) return;
    setIsLoading(true);
    try {
      const q = query(
        collection(db, "leaves"),
        where("providerId", "==", providerUser.uid),
        orderBy("startDate", "desc")
      );
      const snap = await getDocs(q);
      const list: LeaveRequest[] = snap.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as LeaveRequest));
      setLeaves(list);
    } catch (err) {
      console.error("Error loading provider leaves:", err);
      toast({
        title: "Error Loading Leaves",
        description: "Could not fetch your leaves. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadProviderLeaves();
  }, [providerUser?.uid]);

  // Split into Active/Upcoming and Past
  const { activeAndUpcomingLeaves, pastLeaves, isOnLeaveToday } = useMemo(() => {
    const activeAndUpcoming: LeaveRequest[] = [];
    const past: LeaveRequest[] = [];
    let onLeaveNow = false;

    leaves.forEach(leave => {
      if (leave.endDate >= todayISO) {
        activeAndUpcoming.push(leave);
        if (leave.startDate <= todayISO && leave.endDate >= todayISO) {
          onLeaveNow = true;
        }
      } else {
        past.push(leave);
      }
    });

    // Sort active and upcoming by startDate ascending
    activeAndUpcoming.sort((a, b) => a.startDate.localeCompare(b.startDate));

    return {
      activeAndUpcomingLeaves: activeAndUpcoming,
      pastLeaves: past,
      isOnLeaveToday: onLeaveNow
    };
  }, [leaves, todayISO]);

  // Quick Preset Handlers
  const handleQuickLeave = async (start: string, end: string, quickReason: string) => {
    if (!providerUser?.uid || isSaving) return;
    setIsSaving(true);
    try {
      const providerName = providerProfile?.fullName || providerUser.displayName || "Service Provider";
      const newLeave: Omit<LeaveRequest, 'id'> = {
        providerId: providerUser.uid,
        providerName: providerName,
        startDate: start,
        endDate: end,
        leaveType: 'full_day',
        reason: quickReason,
        createdAt: Timestamp.now()
      };

      await addDoc(collection(db, "leaves"), newLeave);

      toast({
        title: "Leave Scheduled Successfully!",
        description: start === end 
          ? `You are scheduled off for ${formatScheduledDate(start)}. Future dates will stay bookable!`
          : `You are scheduled off from ${formatScheduledDate(start)} to ${formatScheduledDate(end)}. Tomorrow/future dates after this leave will stay bookable!`,
      });

      await loadProviderLeaves();
    } catch (err: any) {
      console.error("Quick leave error:", err);
      toast({
        title: "Failed to Schedule Leave",
        description: err.message || "An error occurred.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Custom Leave Form
  const handleSaveCustomLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerUser?.uid || isSaving) return;

    if (!startDate) {
      toast({ title: "Start Date Required", description: "Please pick a start date.", variant: "destructive" });
      return;
    }
    const finalEndDate = endDate || startDate;
    if (finalEndDate < startDate) {
      toast({ title: "Invalid Date Range", description: "End date cannot be earlier than start date.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const providerName = providerProfile?.fullName || providerUser.displayName || "Service Provider";
      const leaveData: Omit<LeaveRequest, 'id'> = {
        providerId: providerUser.uid,
        providerName: providerName,
        startDate: startDate,
        endDate: finalEndDate,
        leaveType: leaveType,
        reason: reason.trim() || "Scheduled Personal Leave",
        createdAt: Timestamp.now()
      };

      if (leaveType === 'partial_day') {
        leaveData.startTime = startTime;
        leaveData.endTime = endTime;
      }

      await addDoc(collection(db, "leaves"), leaveData);

      toast({
        title: "Leave Scheduled!",
        description: "Your time off has been recorded. Dates outside this leave period remain open for customer bookings."
      });

      setIsAddDialogOpen(false);
      // Reset form
      setStartDate('');
      setEndDate('');
      setLeaveType('full_day');
      setStartTime('09:00');
      setEndTime('17:00');
      setReason('');

      await loadProviderLeaves();
    } catch (err: any) {
      console.error("Failed to add leave:", err);
      toast({
        title: "Failed to Save",
        description: err.message || "Could not schedule leave.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Cancel / Delete Leave Handler
  const handleCancelLeave = async () => {
    if (!leaveToCancel?.id || isCancelling) return;
    setIsCancelling(true);
    try {
      await deleteDoc(doc(db, "leaves", leaveToCancel.id));
      toast({
        title: "Leave Cancelled",
        description: "Your leave has been cancelled. Your slots are now available for booking again!"
      });
      setLeaveToCancel(null);
      await loadProviderLeaves();
    } catch (err: any) {
      console.error("Failed to delete leave:", err);
      toast({
        title: "Cancellation Error",
        description: err.message || "Could not cancel leave.",
        variant: "destructive"
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const commonReasons = [
    "Personal Time Off",
    "Family Emergency",
    "Health / Medical",
    "Vehicle Maintenance",
    "Holiday / Vacation",
    "Rest Day"
  ];

  return (
    <ProtectedRoute>
      <div className="space-y-6 max-w-5xl mx-auto pb-12">
        {/* Header Hero Banner */}
        <Card className="border-none shadow-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white overflow-hidden relative">
          <div className="absolute right-0 top-0 translate-x-6 -translate-y-6 opacity-10 pointer-events-none">
            <CalendarOff size={280} />
          </div>
          <CardHeader className="relative z-10 p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-white/20 text-white backdrop-blur-md border-none font-semibold">
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Schedule Flexibility
                  </Badge>
                  {isOnLeaveToday ? (
                    <Badge className="bg-amber-400 text-amber-950 font-bold border-none animate-pulse">
                      On Leave Today
                    </Badge>
                  ) : (
                    <Badge className="bg-emerald-400 text-emerald-950 font-bold border-none">
                      Active (Accepting Bookings)
                    </Badge>
                  )}
                </div>
                <CardTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  My Leaves & Time Off
                </CardTitle>
                <CardDescription className="text-emerald-100 text-sm max-w-2xl leading-relaxed">
                  Take a day off or schedule vacation time with peace of mind. Your slots on leave days will pause, while <strong>all future dates (tomorrow, next week, or after your leave) remain wide open for customer bookings!</strong>
                </CardDescription>
              </div>

              <Button
                onClick={() => {
                  setStartDate(todayISO);
                  setEndDate(todayISO);
                  setIsAddDialogOpen(true);
                }}
                className="bg-white text-emerald-900 hover:bg-emerald-50 font-bold shadow-lg shrink-0 rounded-xl"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Schedule Leave
              </Button>
            </div>
          </CardHeader>
        </Card>

        {/* Quick 1-Click Action Presets */}
        <Card className="border border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Quick Presets
            </CardTitle>
            <CardDescription className="text-xs">
              Quickly schedule time off with one click. You can cancel anytime if your schedule changes.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={() => handleQuickLeave(todayISO, todayISO, "Personal Day Off (Today)")}
              disabled={isSaving}
              className="h-auto py-3.5 px-4 flex flex-col items-start gap-1 border-border/80 hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 text-left transition-all"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-sm text-foreground">Take Today Off</span>
                <Badge variant="secondary" className="text-[10px]">1 Day</Badge>
              </div>
              <span className="text-xs text-muted-foreground">Off today ({formatScheduledDate(todayISO)}). Tomorrow stays open!</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => handleQuickLeave(tomorrowISO, tomorrowISO, "Scheduled Day Off (Tomorrow)")}
              disabled={isSaving}
              className="h-auto py-3.5 px-4 flex flex-col items-start gap-1 border-border/80 hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 text-left transition-all"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-sm text-foreground">Take Tomorrow Off</span>
                <Badge variant="secondary" className="text-[10px]">1 Day</Badge>
              </div>
              <span className="text-xs text-muted-foreground">Off tomorrow ({formatScheduledDate(tomorrowISO)}). Day after stays open!</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => handleQuickLeave(todayISO, threeDaysEndISO, "3-Day Break / Vacation")}
              disabled={isSaving}
              className="h-auto py-3.5 px-4 flex flex-col items-start gap-1 border-border/80 hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 text-left transition-all"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-bold text-sm text-foreground">Take Next 3 Days Off</span>
                <Badge variant="secondary" className="text-[10px]">3 Days</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{formatScheduledDate(todayISO)} to {formatScheduledDate(threeDaysEndISO)}. Resumes automatically!</span>
            </Button>
          </CardContent>
        </Card>

        {/* Leaves Content Tabs */}
        <Tabs defaultValue="active" className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <TabsList className="bg-muted/70 p-1 rounded-xl">
              <TabsTrigger value="active" className="text-xs py-1.5 px-3">
                Active & Upcoming ({activeAndUpcomingLeaves.length})
              </TabsTrigger>
              <TabsTrigger value="past" className="text-xs py-1.5 px-3">
                Past History ({pastLeaves.length})
              </TabsTrigger>
            </TabsList>

            <Button
              variant="ghost"
              size="sm"
              onClick={loadProviderLeaves}
              disabled={isLoading}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Active & Upcoming Leaves Tab */}
          <TabsContent value="active" className="space-y-4 mt-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center min-h-[200px] gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                <p className="text-xs text-muted-foreground">Loading your leaves schedule...</p>
              </div>
            ) : activeAndUpcomingLeaves.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
                <h3 className="font-bold text-base text-foreground">No Upcoming Leaves Scheduled</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 leading-relaxed">
                  You are currently available for all dates! When you need time off, click "Schedule Leave" or choose a quick preset above.
                </p>
                <Button 
                  onClick={() => {
                    setStartDate(todayISO);
                    setEndDate(todayISO);
                    setIsAddDialogOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                  className="mt-4 text-xs font-semibold"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Schedule First Leave
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeAndUpcomingLeaves.map(leave => {
                  const isActiveToday = leave.startDate <= todayISO && leave.endDate >= todayISO;
                  const isMultiDay = leave.startDate !== leave.endDate;

                  return (
                    <Card 
                      key={leave.id} 
                      className={`overflow-hidden border transition-all duration-200 ${
                        isActiveToday 
                          ? 'border-amber-500/40 bg-amber-500/5 dark:bg-amber-950/10 shadow-md' 
                          : 'border-border/70 hover:border-border shadow-sm'
                      }`}
                    >
                      <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isActiveToday ? (
                                <Badge className="bg-amber-500 text-white font-bold border-none text-[10px] animate-pulse">
                                  ● Active Today
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] font-semibold">
                                  Upcoming
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-[10px] capitalize">
                                {leave.leaveType === 'full_day' ? 'Full Day Off' : `Partial Hours (${leave.startTime} - ${leave.endTime})`}
                              </Badge>
                            </div>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setLeaveToCancel(leave)}
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 font-medium"
                              title="Cancel leave and resume bookings"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Cancel
                            </Button>
                          </div>

                          <div>
                            <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                              <CalendarIcon className="h-4 w-4 text-emerald-600 shrink-0" />
                              {isMultiDay ? (
                                <span>{formatScheduledDate(leave.startDate)} &rarr; {formatScheduledDate(leave.endDate)}</span>
                              ) : (
                                <span>{formatScheduledDate(leave.startDate)}</span>
                              )}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                              <span className="font-semibold text-foreground/80">Reason:</span>
                              <span>{leave.reason || "Personal Leave"}</span>
                            </p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {isMultiDay 
                              ? `Resumes after ${formatScheduledDate(leave.endDate)}` 
                              : `Tomorrow remains open`}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLeaveToCancel(leave)}
                            className="h-7 text-xs font-semibold text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800"
                          >
                            Resume Work Now
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Past Leaves Tab */}
          <TabsContent value="past" className="mt-0">
            {pastLeaves.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-xs text-muted-foreground">No past leaves on record.</p>
              </Card>
            ) : (
              <Card className="border border-border/70 overflow-hidden shadow-sm">
                <div className="divide-y divide-border/60">
                  {pastLeaves.map(leave => (
                    <div key={leave.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors">
                      <div className="space-y-1">
                        <p className="font-bold text-sm text-foreground flex items-center gap-2">
                          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {leave.startDate === leave.endDate ? (
                            formatScheduledDate(leave.startDate)
                          ) : (
                            `${formatScheduledDate(leave.startDate)} to ${formatScheduledDate(leave.endDate)}`
                          )}
                          <Badge variant="outline" className="text-[10px] font-normal">Completed</Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {leave.reason} &bull; {leave.leaveType === 'full_day' ? 'Full Day' : `${leave.startTime} - ${leave.endTime}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Add / Schedule Custom Leave Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarOff className="h-5 w-5 text-emerald-600" />
                Schedule Leave / Time Off
              </DialogTitle>
              <DialogDescription className="text-xs">
                Select the dates you will be unavailable. Dates outside this range will stay open and bookable for customers.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveCustomLeave} className="space-y-4 py-2">
              {/* Date Pickers */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start-date" className="text-xs font-semibold">Start Date *</Label>
                  <Input
                    id="start-date"
                    type="date"
                    min={todayISO}
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      if (!endDate || endDate < e.target.value) {
                        setEndDate(e.target.value);
                      }
                    }}
                    required
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end-date" className="text-xs font-semibold">End Date *</Label>
                  <Input
                    id="end-date"
                    type="date"
                    min={startDate || todayISO}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Leave Type: Full Day or Specific Hours */}
              <div className="space-y-2 pt-1">
                <Label className="text-xs font-semibold">Duration Type</Label>
                <RadioGroup 
                  value={leaveType} 
                  onValueChange={(val: 'full_day' | 'partial_day') => setLeaveType(val)}
                  className="grid grid-cols-2 gap-3"
                >
                  <div className={`flex items-center space-x-2 border rounded-xl p-3 cursor-pointer transition-colors ${leaveType === 'full_day' ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' : 'border-border'}`}>
                    <RadioGroupItem value="full_day" id="type-full-day" />
                    <Label htmlFor="type-full-day" className="text-xs font-semibold cursor-pointer flex-1">
                      Full Day Off
                    </Label>
                  </div>
                  <div className={`flex items-center space-x-2 border rounded-xl p-3 cursor-pointer transition-colors ${leaveType === 'partial_day' ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20' : 'border-border'}`}>
                    <RadioGroupItem value="partial_day" id="type-partial-day" />
                    <Label htmlFor="type-partial-day" className="text-xs font-semibold cursor-pointer flex-1">
                      Specific Hours
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Partial Day Hours */}
              {leaveType === 'partial_day' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-xl border border-border/60">
                  <div className="space-y-1.5">
                    <Label htmlFor="start-time" className="text-xs font-medium">From Time</Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="end-time" className="text-xs font-medium">To Time</Label>
                    <Input
                      id="end-time"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Quick Reason Suggestions */}
              <div className="space-y-2">
                <Label htmlFor="leave-reason" className="text-xs font-semibold">Reason for Leave</Label>
                <div className="flex flex-wrap gap-1.5">
                  {commonReasons.map((r) => (
                    <Badge
                      key={r}
                      variant="outline"
                      onClick={() => setReason(r)}
                      className="cursor-pointer text-[11px] py-1 px-2.5 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 dark:hover:bg-emerald-950/40 transition-colors"
                    >
                      {r}
                    </Badge>
                  ))}
                </div>
                <Input
                  id="leave-reason"
                  placeholder="e.g. Family function, medical visit, vehicle repair..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="text-xs"
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-3">
                <Button type="button" variant="ghost" onClick={() => setIsAddDialogOpen(false)} disabled={isSaving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                  Confirm & Schedule Leave
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Cancel Leave / Resume Work Confirmation Alert Dialog */}
        <AlertDialog open={!!leaveToCancel} onOpenChange={(open) => !open && setLeaveToCancel(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-emerald-600">
                <RotateCcw className="h-5 w-5" />
                Resume Bookings & Cancel Leave?
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 text-xs">
                <span>
                  Are you ready to resume accepting bookings for{" "}
                  <strong className="text-foreground">
                    {leaveToCancel?.startDate === leaveToCancel?.endDate
                      ? formatScheduledDate(leaveToCancel?.startDate)
                      : `${formatScheduledDate(leaveToCancel?.startDate)} to ${formatScheduledDate(leaveToCancel?.endDate)}`}
                  </strong>
                  ?
                </span>
                <span className="block text-muted-foreground">
                  Your slots on this date will immediately become bookable again for customers in your service area.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCancelling}>Keep On Leave</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleCancelLeave();
                }}
                disabled={isCancelling}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              >
                {isCancelling ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                Yes, Resume Work Now
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProtectedRoute>
  );
}
