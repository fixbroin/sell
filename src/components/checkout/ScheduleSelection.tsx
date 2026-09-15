
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Clock, Loader2, AlertTriangle, CalendarDays, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useApplicationConfig } from '@/hooks/useApplicationConfig';
import { getZonedDate, formatZonedDateToISO, formatDateInTimezone, formatTimeInTimezone } from '@/lib/utils';
import { getActiveCheckoutEntries } from '@/lib/cartManager';
import { Badge } from '@/components/ui/badge';
import { motion, AnimatePresence } from 'framer-motion';
import { Separator } from '@/components/ui/separator';
import type { AppSettings, LeaveRequest } from '@/types/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const period = timeMatch[3].toUpperCase();
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

const getDayName = (date: Date, timeZone: string = 'Asia/Kolkata'): keyof AppSettings['timeSlotSettings']['weeklyAvailability'] => {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(date).toLowerCase() as any;
};

interface ScheduleSelectionProps {
  onSelect: (date: Date, slot: string, endTime: string, interveningBreaks: any[], dailyTimeline?: any[]) => void;
  initialDate?: Date;
  initialSlot?: string;
  latitude?: number;
  longitude?: number;
}

export default function ScheduleSelection({ onSelect, initialDate, initialSlot, latitude, longitude }: ScheduleSelectionProps) {
  const slotsSectionRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLDivElement>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(initialDate);
  const [displayMonth, setDisplayMonth] = useState<Date>(initialDate || new Date());
  const [availableTimeSlots, setAvailableTimeSlots] = useState<{ slot: string; remainingCapacity: number; endDateTime: string; dailyTimeline?: { dateLabel: string; startTime: string; endTime: string }[] }[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | undefined>(initialSlot);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSearchingForNextDay, setIsSearchingForNextDay] = useState(false);
  const [dataFetchError, setDataFetchError] = useState<string | null>(null);
  const [totalCartDuration, setTotalCartDuration] = useState(0);
  const [leavesList, setLeavesList] = useState<any[]>([]);
  const [leaveReason, setLeaveReason] = useState<string | null>(null);
  const [isDateLeave, setIsDateLeave] = useState<boolean>(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { toast } = useToast();
  const { config: appConfig, isLoading: isLoadingAppSettings } = useApplicationConfig();
  const [datesWithNoSlots, setDatesWithNoSlots] = useState<string[]>([]);
  const shouldAutoRedirect = useRef(true);

  useEffect(() => {
    const fetchLeaves = async () => {
      try {
        const res = await fetch("/api/checkout/leaves");
        if (!res.ok) throw new Error("Failed to fetch leaves");
        const fetched = await res.json();
        setLeavesList(fetched);
      } catch (e) {
        console.error("Failed to fetch leaves in checkout scheduler", e);
      }
    };
    fetchLeaves();
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let dragDistance = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDown = true;
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
      dragDistance = 0;
      setIsDragging(false);
    };

    const handleMouseLeave = () => {
      isDown = false;
    };

    const handleMouseUp = () => {
      // Small timeout to allow mouseup click prevention to register
      setTimeout(() => {
        setIsDragging(false);
      }, 50);
      isDown = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.5;
      dragDistance = Math.abs(x - startX);
      if (dragDistance > 5) {
        setIsDragging(true);
      }
      el.scrollLeft = scrollLeft - walk;
    };

    el.addEventListener('mousedown', handleMouseDown);
    el.addEventListener('mouseleave', handleMouseLeave);
    el.addEventListener('mouseup', handleMouseUp);
    el.addEventListener('mousemove', handleMouseMove);

    return () => {
      el.removeEventListener('mousedown', handleMouseDown);
      el.removeEventListener('mouseleave', handleMouseLeave);
      el.removeEventListener('mouseup', handleMouseUp);
      el.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useEffect(() => {
    if (!selectedDate || !scrollRef.current) return;
    
    // Find the button representing the selected date ISO
    const selectedISO = formatZonedDateToISO(selectedDate, appConfig?.timezone || 'Asia/Kolkata');
    const activeBtn = scrollRef.current.querySelector(`[data-date-iso="${selectedISO}"]`);
    
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [selectedDate, appConfig?.timezone]);

  const leaveModifiers = useMemo(() => {
    return {
      holiday: (date: Date) => {
        const dateISO = formatZonedDateToISO(date, appConfig?.timezone);
        return leavesList.some(leave => leave.startDate <= dateISO && leave.endDate >= dateISO && leave.leaveType === 'full_day');
      },
      partialLeave: (date: Date) => {
        const dateISO = formatZonedDateToISO(date, appConfig?.timezone);
        return leavesList.some(leave => leave.startDate <= dateISO && leave.endDate >= dateISO && leave.leaveType === 'partial_day');
      }
    };
  }, [leavesList, appConfig?.timezone]);

  const leaveModifiersStyles = {
    holiday: {
      color: '#ef4444',
      backgroundColor: '#fef2f2',
      fontWeight: 'bold' as const,
      border: '1px dashed #fca5a5',
      borderRadius: '8px'
    },
    partialLeave: {
      color: '#f59e0b',
      backgroundColor: '#fffbeb',
      fontWeight: 'bold' as const,
      border: '1px dashed #fde68a',
      borderRadius: '8px'
    }
  };

  const selectedSlotData = useMemo(() => {
    return availableTimeSlots.find(s => s.slot === selectedTimeSlot);
  }, [availableTimeSlots, selectedTimeSlot]);

  const interveningBreaksAndHolidays = useMemo(() => {
    if (!selectedDate || !selectedTimeSlot || !selectedSlotData) return [];
    
    const start = new Date(selectedDate);
    const startMin = parseTimeToMinutes(selectedTimeSlot);
    start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
    
    const end = new Date(selectedSlotData.endDateTime);
    
    const list: { type: 'holiday' | 'partial' | 'gap', dateLabel: string, timeLabel?: string, reason?: string }[] = [];
    
    const temp = new Date(start);
    temp.setHours(12, 0, 0, 0);
    
    const endTemp = new Date(end);
    endTemp.setHours(12, 0, 0, 0);
    
    while (temp <= endTemp) {
      const dateISO = formatZonedDateToISO(temp, appConfig?.timezone);
      const displayDateStr = temp.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      
      const dayLeaves = leavesList.filter(l => l.startDate <= dateISO && l.endDate >= dateISO);
      
      let isFullDayHoliday = false;
      for (const leave of dayLeaves) {
        if (leave.leaveType === 'full_day') {
          list.push({
            type: 'holiday',
            dateLabel: displayDateStr,
            reason: (leave.reason && leave.reason.trim() !== '') ? leave.reason : "Provider Leave / Holiday"
          });
          isFullDayHoliday = true;
          break;
        } else if (leave.leaveType === 'partial_day') {
          list.push({
            type: 'partial',
            dateLabel: displayDateStr,
            timeLabel: `${leave.startTime} - ${leave.endTime}`,
            reason: (leave.reason && leave.reason.trim() !== '') ? leave.reason : "Provider on Leave / Custom Gaps"
          });
        }
      }
      
      if (!isFullDayHoliday) {
        const dayName = getDayName(temp, appConfig?.timezone);
        const dayAvail = (appConfig?.timeSlotSettings?.weeklyAvailability as any)?.[dayName];
        if (dayAvail && dayAvail.isEnabled && dayAvail.intervals && dayAvail.intervals.length > 1) {
          const sorted = [...dayAvail.intervals].sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentEnd = sorted[i].endTime;
            const nextStart = sorted[i + 1].startTime;
            list.push({
              type: 'gap',
              dateLabel: displayDateStr,
              timeLabel: `${currentEnd} - ${nextStart}`,
              reason: "Scheduled Provider Break"
            });
          }
        }
      }
      
      temp.setDate(temp.getDate() + 1);
    }
    
    return list;
  }, [selectedDate, selectedTimeSlot, selectedSlotData, leavesList, appConfig]);

  const fetchAvailableSlots = useCallback(async (date: Date) => {
    try {
        const cartEntries = getActiveCheckoutEntries();
        const response = await fetch('/api/checkout/available-slots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                selectedDate: formatZonedDateToISO(date, appConfig?.timezone),
                cartEntries: cartEntries,
                latitude,
                longitude
            })
        });

        if (!response.ok) {
            throw new Error('Failed to fetch slots');
        }

        const data = await response.json();
        setTotalCartDuration(data.totalCartDuration);
        if (data.isLeave) {
            setIsDateLeave(true);
            setLeaveReason(data.leaveReason);
            return { slots: [], isLeave: true, leaveReason: data.leaveReason };
        } else {
            setIsDateLeave(false);
            setLeaveReason(null);
            return { slots: data.availableTimeSlots, isLeave: false, leaveReason: null };
        }
    } catch (error) {
        console.error("Error fetching available slots from API:", error);
        throw error;
    }
  }, [appConfig?.timezone, latitude, longitude]);

  useEffect(() => {
    if (!selectedDate || isLoadingAppSettings) return;
    
    let isCurrent = true;
    
    const runSlotCalculation = async () => {
        setIsLoadingSlots(true);
        try {
            const res = await fetchAvailableSlots(selectedDate);
            if (!isCurrent) return;
            
            setAvailableTimeSlots(res.slots);

            const dateISO = formatZonedDateToISO(selectedDate, appConfig?.timezone || 'Asia/Kolkata');
            if (res.slots.length === 0 && !res.isLeave) {
                setDatesWithNoSlots(prev => prev.includes(dateISO) ? prev : [...prev, dateISO]);

                toast({
                    variant: "destructive",
                    title: "No Slots Available",
                    description: `Sorry, there are no slots available for ${formatDateInTimezone(selectedDate, appConfig?.timezone || 'Asia/Kolkata')}.`,
                });

                if (shouldAutoRedirect.current && !isSearchingForNextDay) {
                    if (!isCurrent) return;
                    setIsSearchingForNextDay(true);
                    const searchDaysCount = 7;
                    const fetchPromises = [];

                    for (let i = 1; i <= searchDaysCount; i++) {
                        const targetDay = new Date(selectedDate);
                        targetDay.setDate(targetDay.getDate() + i);
                        
                        fetchPromises.push((async () => {
                            try {
                                const res = await fetchAvailableSlots(targetDay);
                                return { date: targetDay, res };
                            } catch {
                                return { date: targetDay, res: { slots: [], isLeave: false } };
                            }
                        })());
                    }

                    const results = await Promise.all(fetchPromises);
                    
                    if (!isCurrent) {
                      setIsSearchingForNextDay(false);
                      return;
                    }

                    results.forEach(item => {
                      if (item.res.slots.length === 0 && !item.res.isLeave) {
                        const itemISO = formatZonedDateToISO(item.date, appConfig?.timezone || 'Asia/Kolkata');
                        setDatesWithNoSlots(prev => prev.includes(itemISO) ? prev : [...prev, itemISO]);
                      }
                    });

                    const sortedResults = results.sort((a, b) => a.date.getTime() - b.date.getTime());
                    const foundDay = sortedResults.find(item => item.res.slots.length > 0 && !item.res.isLeave);

                    if (foundDay) {
                        const nextAvailableDate = new Date(foundDay.date);
                        setSelectedDate(nextAvailableDate);
                        setDisplayMonth(nextAvailableDate); 
                        setAvailableTimeSlots(foundDay.res.slots);
                        
                        toast({
                            variant: "success" as any,
                            title: "Available Slots Found!",
                            description: `We found slots for you on ${formatDateInTimezone(foundDay.date, appConfig?.timezone || 'Asia/Kolkata')}.`,
                        });
                    } else {
                        toast({
                            variant: "destructive",
                            title: "No Upcoming Slots",
                            description: `Could not find any available slots in the next ${searchDaysCount} days.`,
                        });
                    }
                    
                    if (isCurrent) {
                      setIsSearchingForNextDay(false);
                    }
                }
            }
        } catch (error) {
            if (isCurrent) {
              setDataFetchError("Failed to load available slots. Please try again.");
            }
        } finally {
            if (isCurrent) {
              setIsLoadingSlots(false);
            }
        }
    };
    runSlotCalculation();

    return () => {
      isCurrent = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, fetchAvailableSlots, toast, isLoadingAppSettings]);

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    shouldAutoRedirect.current = false; // Disable auto-redirect on manual date selection
    setSelectedDate(date);
    setDisplayMonth(date);
    setSelectedTimeSlot(undefined);

    // Scroll to slots section on mobile
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        slotsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const handleTimeSlotSelect = (slot: string) => {
    setSelectedTimeSlot(slot);

    // Scroll to confirm button on mobile
    if (window.innerWidth < 1024) {
      setTimeout(() => {
        confirmButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 150);
    }
  };

  const handleConfirm = () => {
    if (selectedDate && selectedTimeSlot && selectedSlotData) {
      onSelect(selectedDate, selectedTimeSlot, selectedSlotData.endDateTime, interveningBreaksAndHolidays, selectedSlotData.dailyTimeline);
    }
  };

  const today = useMemo(() => {
    const d = getZonedDate(new Date(), appConfig.timezone);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [appConfig.timezone]);

  const dateList = useMemo(() => {
    const list = [];
    let startDate = today;

    if (selectedDate) {
      const daysDiff = Math.ceil((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 14) {
        startDate = selectedDate;
      }
    }

    for (let i = 0; i < 15; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      list.push(d);
    }
    return list;
  }, [today, selectedDate]);

  const isPivotedToFuture = useMemo(() => {
    if (!selectedDate) return false;
    const daysDiff = Math.ceil((selectedDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff > 14;
  }, [selectedDate, today]);

  useEffect(() => {
    if (!selectedDate && !isLoadingAppSettings) {
      setSelectedDate(today);
      setDisplayMonth(today);
    }
  }, [isLoadingAppSettings, today, selectedDate]);

  const formatDateForDisplay = (date: Date | undefined): string => {
    if (!date) return "";
    return formatDateInTimezone(date, appConfig?.timezone || 'Asia/Kolkata');
  };

  if (isLoadingAppSettings) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 w-full min-w-0">
      <div className="flex flex-col gap-6 w-full min-w-0">
        {/* Calendar Selection */}
        <div className="space-y-4 w-full min-w-0">
          <div className="flex items-center gap-2">
             <div className="h-6 w-1 bg-primary rounded-full" />
             <h3 className="text-lg font-bold">Pick a Date</h3>
          </div>
          
          <div className="w-full overflow-hidden">
            <div ref={scrollRef} className="flex overflow-x-auto gap-2.5 pb-2 pt-1 scrollbar-none select-none w-full cursor-grab active:cursor-grabbing">
              {isPivotedToFuture && (
                <button
                  type="button"
                  onClick={() => handleDateSelect(today)}
                  className="flex flex-col items-center justify-center p-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 min-w-[64px] h-[80px] text-primary transition-all shrink-0"
                >
                  <Clock className="h-5 w-5 mb-1" />
                  <span className="text-[10px] font-bold">Back to</span>
                  <span className="text-[8px] font-semibold opacity-85">Today</span>
                </button>
              )}
              
              {dateList.map((date) => {
                const dateISO = formatZonedDateToISO(date, appConfig?.timezone);
                const selectedDateISO = selectedDate ? formatZonedDateToISO(selectedDate, appConfig?.timezone) : '';
                const isSelected = dateISO === selectedDateISO;
                const isHoliday = leaveModifiers.holiday(date);
                const isPartial = leaveModifiers.partialLeave(date);
                const isFull = datesWithNoSlots.includes(dateISO);

                return (
                  <button
                    key={dateISO}
                    data-date-iso={dateISO}
                    type="button"
                    onClick={() => {
                      if (isDragging) return;
                      handleDateSelect(date);
                    }}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border min-w-[64px] h-[80px] transition-all shrink-0
                      ${isSelected 
                        ? 'bg-primary border-primary text-primary-foreground shadow-md font-bold' 
                        : isFull
                          ? 'border-red-100 bg-red-50/30 text-red-500 hover:bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10 dark:text-red-400'
                          : 'bg-background hover:bg-muted/30 border-muted text-foreground'
                      }
                      ${isHoliday ? 'border-dashed border-red-300 bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400' : ''}
                      ${isPartial ? 'border-dashed border-amber-300 bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400' : ''}
                    `}
                  >
                    <span className="text-[9px] uppercase font-bold tracking-wider opacity-85">
                      {date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span className="text-xl font-extrabold leading-none mt-1">
                      {date.getDate()}
                    </span>
                    <span className="text-[9px] font-semibold mt-1 opacity-75">
                      {date.toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setIsCalendarOpen(true)}
                className="flex flex-col items-center justify-center p-2 rounded-xl border border-dashed border-primary/50 bg-primary/5 hover:bg-primary/10 min-w-[64px] h-[80px] text-primary transition-all shrink-0"
              >
                <CalendarDays className="h-5 w-5 mb-1" />
                <span className="text-[10px] font-bold">More</span>
                <span className="text-[8px] font-semibold opacity-85">Dates</span>
              </button>
            </div>
          </div>

          <Dialog open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <DialogContent className="max-w-[95vw] sm:max-w-md bg-background border rounded-2xl shadow-lg p-0">
              <DialogHeader className="p-4 border-b">
                <DialogTitle>Select Date</DialogTitle>
              </DialogHeader>
              <div className="p-4 flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    handleDateSelect(date);
                    setIsCalendarOpen(false);
                  }}
                  month={displayMonth}
                  onMonthChange={setDisplayMonth}
                  disabled={(date) => date < today}
                  modifiers={leaveModifiers}
                  modifiersStyles={leaveModifiersStyles}
                  className="rounded-md"
                />
              </div>
            </DialogContent>
          </Dialog>
          
          <div className="bg-primary/5 p-3 rounded-xl flex items-center gap-3 w-fit">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <p className="text-sm font-medium">Estimated Service Duration: <span className="text-primary font-bold">{totalCartDuration} mins</span></p>
          </div>
        </div>

        {/* Time Slot Selection */}
        <div className="space-y-4 pt-6 border-t" ref={slotsSectionRef}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-6 w-1 bg-primary rounded-full" />
              <h3 className="text-lg font-bold">Available Slots</h3>
            </div>
            {selectedDate && (
              <Badge variant="outline" className="bg-primary text-white border-primary/20 px-3 py-1 text-lg font-semibold">
                {formatDateForDisplay(selectedDate)}
              </Badge>
            )}
          </div>

          <div className="min-h-[200px]">
            {selectedDate ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedDate.toISOString()}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {isSearchingForNextDay || isLoadingSlots ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                       <Loader2 className="h-10 w-10 text-primary animate-spin" />
                       <p className="text-muted-foreground font-medium">
                         {isSearchingForNextDay ? "Finding the next available day..." : "Checking available slots..."}
                       </p>
                    </div>
                  ) : availableTimeSlots.length > 0 ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-primary/[0.03] dark:bg-muted/10 border border-primary/10 rounded-2xl">
                        <RadioGroup
                          value={selectedTimeSlot}
                          onValueChange={handleTimeSlotSelect}
                          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
                        >
                          {availableTimeSlots.map(({ slot, remainingCapacity }) => (
                            <div key={slot}>
                              <RadioGroupItem 
                                value={slot} 
                                id={`slot-${slot}`} 
                                className="sr-only" 
                              />
                              <Label
                                htmlFor={`slot-${slot}`}
                                className={`group relative flex flex-col items-center justify-center border-2 rounded-xl p-3 cursor-pointer transition-all duration-200 hover:border-primary/50
                                  ${selectedTimeSlot === slot 
                                    ? 'bg-primary border-primary text-primary-foreground shadow-md font-bold' 
                                    : 'bg-background border-muted hover:bg-muted/30'}`}
                              >
                                <Clock className={`h-4 w-4 mb-1 ${selectedTimeSlot === slot ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                                <span className="font-bold text-sm">{slot}</span>
                                
                                {remainingCapacity > 1 && (
                                    <Badge 
                                      variant="default" 
                                      className={`absolute -top-2 -right-1 text-[9px] px-1.5 py-0 bg-green-500
                                        ${selectedTimeSlot === slot ? 'bg-white text-green-600 font-bold' : ''}`}
                                    >
                                      {remainingCapacity} left
                                    </Badge>
                                )}
                              </Label>
                            </div>
                          ))}
                        </RadioGroup>
                      </div>
                      
                      {selectedTimeSlot && (
                         <motion.div 
                           initial={{ opacity: 0, scale: 0.95 }}
                           animate={{ opacity: 1, scale: 1 }}
                           className="mt-4 p-4 rounded-xl bg-primary/5 border border-primary/10 flex flex-col gap-3"
                         >
                           <div className="flex items-center justify-between">
                             <div className="flex items-center gap-3">
                               <CheckCircle2 className="h-5 w-5 text-primary" />
                               <div>
                                 <p className="text-xs text-muted-foreground uppercase font-bold">Start Schedule</p>
                                 <p className="text-sm font-bold">{formatDateForDisplay(selectedDate)} at {selectedTimeSlot}</p>
                               </div>
                             </div>
                           </div>

                           <Separator className="bg-primary/10" />

                           <div className="flex items-center gap-3">
                              <Clock className="h-5 w-5 text-green-500" />
                              <div>
                                <p className="text-xs text-muted-foreground uppercase font-bold">Estimated Completion</p>
                                <p className="text-sm font-bold">
                                  {selectedSlotData && (
                                  `Ends on ${formatDateInTimezone(new Date(selectedSlotData.endDateTime), appConfig?.timezone || 'Asia/Kolkata')} at ${formatTimeInTimezone(new Date(selectedSlotData.endDateTime), appConfig?.timezone || 'Asia/Kolkata')}`
                                  )}
                                </p>
                              </div>
                            </div>

                             {selectedSlotData && selectedSlotData.dailyTimeline && selectedSlotData.dailyTimeline.length > 1 && (
                               <>
                                 <Separator className="bg-primary/10" />
                                 <div className="space-y-2.5 pt-1">
                                   <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1.5">
                                     <Clock className="h-3.5 w-3.5 text-blue-500" />
                                     Day-by-Day Work Schedule
                                   </p>
                                   <div className="space-y-1.5 pl-1">
                                     {selectedSlotData.dailyTimeline.map((item, idx) => (
                                       <div key={idx} className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap text-sm py-1.5 border-b border-border/20 last:border-0">
                                         <span className="font-semibold text-foreground/85">{item.dateLabel}</span>
                                         <span className="font-semibold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full text-xs whitespace-nowrap">
                                           {item.startTime} - {item.endTime}
                                         </span>
                                       </div>
                                     ))}
                                   </div>
                                 </div>
                               </>
                             )}

                            {interveningBreaksAndHolidays.length > 0 && (
                              <>
                                <Separator className="bg-primary/10" />
                                <div className="space-y-2 pt-1">
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold flex items-center gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    Includes Gaps / Holidays
                                  </p>
                                  <div className="space-y-1 pl-1">
                                    {interveningBreaksAndHolidays.map((item, idx) => (
                                      <div key={idx} className="flex items-start gap-2 text-xs">
                                        <div className={`mt-1.5 h-1.5 w-1.5 rounded-full ${item.type === 'holiday' ? 'bg-red-500' : item.type === 'partial' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                        <div className="text-muted-foreground">
                                          <span className="font-semibold text-foreground/80">{item.dateLabel}</span>
                                          {item.timeLabel && <span className="ml-1">({item.timeLabel})</span>}
                                          <span className="ml-1.5 font-medium text-muted-foreground/80">— {item.reason}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
                         </motion.div>
                      )}
                    </div>
                  ) : isDateLeave ? (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-red-500/5 border-red-500/20">
                      <CalendarDays className="h-10 w-10 text-destructive mb-4" />
                      <h4 className="font-bold text-lg mb-1 text-destructive">Holiday / Provider Leave</h4>
                      <p className="text-muted-foreground text-sm max-w-xs font-medium">
                        {leaveReason || "Provider Leave / Holiday. Please select another date."}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 px-6 text-center border-2 border-dashed rounded-2xl bg-red-500/[0.02] border-red-500/20 dark:bg-red-950/[0.02] dark:border-red-900/20">
                      <AlertTriangle className="h-10 w-10 text-red-500 dark:text-red-400 mb-4" />
                      <h4 className="font-bold text-lg mb-1 text-red-600 dark:text-red-400">No slots available</h4>
                      <p className="text-muted-foreground text-sm max-w-xs">
                        This date is fully booked. Please select another date.
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-2xl opacity-60">
                <CalendarDays className="h-10 w-10 text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-medium">
                  Please select a date <span className="hidden sm:inline">on the left</span><span className="inline sm:hidden">above</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div ref={confirmButtonRef} className="sticky bottom-0 left-0 right-0 bg-background pt-4 pb-2 mt-auto border-t sm:border-none flex justify-end">
        <Button 
          disabled={!selectedDate || !selectedTimeSlot} 
          onClick={handleConfirm}
          className="w-full sm:w-auto px-10 py-6 sm:py-2 text-lg sm:text-base font-bold sm:font-medium shadow-lg sm:shadow-none"
        >
          Confirm Schedule
        </Button>
      </div>
    </div>
  );
}
