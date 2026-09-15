
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Clock, Loader2, CalendarDays, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import type { FirestoreBooking } from '@/types/firestore';
import { format } from 'date-fns';
import { formatScheduledDate, formatDateInTimezone } from '@/lib/utils';

interface RescheduleBookingDialogProps {
    isOpen: boolean;
    onClose: () => void;
    booking: FirestoreBooking;
    onRescheduleComplete: (newDate: string, newSlot: string, newEndTime: string) => void;
}

export default function RescheduleBookingDialog({ isOpen, onClose, booking, onRescheduleComplete }: RescheduleBookingDialogProps) {
    const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date(booking.scheduledDate));
    const [availableTimeSlots, setAvailableTimeSlots] = useState<{ slot: string; remainingCapacity: number; endDateTime: string }[]>([]);
    const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | undefined>(booking.scheduledTimeSlot);
    const [selectedEndDateTime, setSelectedEndDateTime] = useState<string | undefined>(booking.estimatedEndTime);
    const [isFetchingSlots, setIsFetchingSlots] = useState(false);
    const [isRescheduling, setIsRescheduling] = useState(false);
    const { toast } = useToast();

    const fetchAvailableSlots = useCallback(async (date: Date) => {
        setIsFetchingSlots(true);
        try {
            const cartEntries = booking.services.map(s => ({
                serviceId: s.serviceId,
                quantity: s.quantity
            }));

            const response = await fetch('/api/checkout/available-slots', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedDate: date.toISOString(),
                    cartEntries: cartEntries,
                    latitude: booking.latitude,
                    longitude: booking.longitude
                })
            });

            if (!response.ok) throw new Error('Failed to fetch slots');

            const data = await response.json();
            setAvailableTimeSlots(data.availableTimeSlots);
        } catch (error) {
            console.error("Error fetching available slots:", error);
            toast({ title: "Error", description: "Could not load available slots.", variant: "destructive" });
        } finally {
            setIsFetchingSlots(false);
        }
    }, [booking.services, booking.latitude, booking.longitude, toast]);

    useEffect(() => {
        if (isOpen && selectedDate) {
            fetchAvailableSlots(selectedDate);
        }
    }, [isOpen, selectedDate, fetchAvailableSlots]);

    const handleDateSelect = (date: Date | undefined) => {
        if (!date) return;
        setSelectedDate(date);
        setSelectedTimeSlot(undefined);
    };

    const handleConfirm = async () => {
        if (!selectedDate || !selectedTimeSlot || !selectedEndDateTime) return;
        
        setIsRescheduling(true);
        try {
            const newDateStr = format(selectedDate, 'yyyy-MM-dd');
            await onRescheduleComplete(newDateStr, selectedTimeSlot, selectedEndDateTime);
            onClose();
        } catch (error) {
            console.error("Reschedule failed:", error);
            toast({ title: "Error", description: "Failed to reschedule booking.", variant: "destructive" });
        } finally {
            setIsRescheduling(false);
        }
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl sm:max-w-[700px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-3 border-b bg-muted/20">
                    <DialogTitle className="text-2xl flex items-center gap-2">
                        <CalendarDays className="h-6 w-6 text-primary" />
                        Reschedule Booking
                    </DialogTitle>
                    <DialogDescription>
                        Select a new date and time for booking #{booking.bookingId}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-grow overflow-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2">
                        {/* Calendar Section */}
                        <div className="p-3 border-b md:border-b-0 md:border-r bg-muted/5">
                            <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground">1. Select Date</h3>
                            <div className="flex justify-center bg-background p-2 rounded-xl shadow-sm border">
                                <Calendar
                                    mode="single"
                                    selected={selectedDate}
                                    onSelect={handleDateSelect}
                                    disabled={(date) => date < today}
                                    className="rounded-md"
                                />
                            </div>
                            
                            <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
                                <p className="text-xs font-bold text-primary uppercase mb-1">Current Schedule</p>
                                <p className="text-sm font-medium">{formatScheduledDate(booking.scheduledDate)} at {booking.scheduledTimeSlot}</p>
                            </div>
                        </div>

                        {/* Slots Section */}
                        <div className="p-3 flex flex-col">
                            <h3 className="text-sm font-semibold mb-4 uppercase tracking-wider text-muted-foreground flex justify-between items-center">
                                2. Select Time Slot
                                {selectedDate && (
                                    <Badge variant="outline" className="text-[10px] py-0 px-2">
                                        {formatDateInTimezone(selectedDate)}
                                    </Badge>
                                )}
                            </h3>

                            <ScrollArea className="flex-grow h-[300px] pr-4">
                                {isFetchingSlots ? (
                                    <div className="flex flex-col items-center justify-center h-full py-12">
                                        <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                                        <p className="text-xs text-muted-foreground">Finding available slots...</p>
                                    </div>
                                ) : availableTimeSlots.length > 0 ? (
                                    <RadioGroup
                                        value={selectedTimeSlot}
                                        onValueChange={(val) => {
                                            setSelectedTimeSlot(val);
                                            const slotData = availableTimeSlots.find(s => s.slot === val);
                                            if (slotData) setSelectedEndDateTime(slotData.endDateTime);
                                        }}
                                        className="grid grid-cols-2 gap-3"
                                    >
                                        {availableTimeSlots.map(({ slot, remainingCapacity }) => (
                                            <div key={slot}>
                                                <RadioGroupItem value={slot} id={`reschedule-slot-${slot}`} className="sr-only" />
                                                <Label
                                                    htmlFor={`reschedule-slot-${slot}`}
                                                    className={`flex flex-col items-center justify-center border-2 rounded-xl p-3 cursor-pointer transition-all
                                                        ${selectedTimeSlot === slot 
                                                            ? 'bg-primary border-primary text-primary-foreground shadow-sm scale-[1.02]' 
                                                            : 'bg-background border-muted hover:bg-muted/30'}`}
                                                >
                                                    <Clock className={`h-3 w-3 mb-1 ${selectedTimeSlot === slot ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                                                    <span className="font-bold text-xs">{slot}</span>
                                                    {remainingCapacity > 1 && (
                                                        <span className={`text-[9px] mt-1 ${selectedTimeSlot === slot ? 'text-primary-foreground/80' : 'text-green-600'}`}>
                                                            {remainingCapacity} left
                                                        </span>
                                                    )}
                                                </Label>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full py-12 px-6 text-center border-2 border-dashed rounded-xl bg-muted/5">
                                        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3 opacity-50" />
                                        <p className="text-sm font-semibold mb-1">No slots available</p>
                                        <p className="text-xs text-muted-foreground">Please try a different date.</p>
                                    </div>
                                )}
                            </ScrollArea>

                            {selectedTimeSlot && selectedDate && (
                                <div className="mt-4 p-3 rounded-lg bg-green-500/5 border border-green-500/10 flex items-center gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                                    <div>
                                        <p className="text-[10px] font-bold text-green-700 uppercase">New Schedule Selected</p>
                                        <p className="text-xs font-bold">{formatDateInTimezone(selectedDate)} | {selectedTimeSlot}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="p-3 border-t bg-muted/20 gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isRescheduling}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleConfirm} 
                        disabled={!selectedDate || !selectedTimeSlot || isRescheduling || (format(selectedDate, 'yyyy-MM-dd') === booking.scheduledDate && selectedTimeSlot === booking.scheduledTimeSlot)}
                        className="min-w-[140px]"
                    >
                        {isRescheduling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
                        Confirm Reschedule
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
