
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { AppSettings, FirestoreService, FirestoreSubCategory, TimeSlotCategoryLimit, FirestoreBooking, LeaveRequest } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';
import { getZonedDate, formatZonedDateToISO, convertWallClockToUTC } from '@/lib/utils';
import { getHaversineDistance } from '@/lib/locationUtils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface CartEntry {
  serviceId: string;
  quantity: number;
}

const DEFAULT_SLOT_INTERVAL_MINUTES = defaultAppSettings.timeSlotSettings.slotIntervalMinutes;
const DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS = defaultAppSettings.enableLimitLateBookings;
const DEFAULT_HOURS_WHEN_LIMIT_ENABLED = defaultAppSettings.limitLateBookingHours;

// --- Performance Cache ---
// Module-level cache for schedule simulation results
// Keyed by date range, bookings hash, and limits hash
const BUSY_MAP_CACHE = new Map<string, any>();
const MAX_CACHE_SIZE = 100;

// Config caching to prevent fetching settings on every click (2s TTL for instant admin reflection)
let CACHED_APP_CONFIG: AppSettings | null = null;
let CACHED_APP_CONFIG_TIME = 0;
const CACHE_TTL_MS = 2000; // 2 seconds for real-time updates

// --- Helper Functions ---

const getServiceDurationInMinutes = (service: FirestoreService | any): number => {
    if (!service.taskTimeValue || !service.taskTimeUnit) return 0;
    if (service.taskTimeUnit === 'hours') {
        return service.taskTimeValue * 60;
    }
    return service.taskTimeValue;
};

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

const formatTimeFromMinutes = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours >= 12 && hours < 24 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
};

const getDayName = (date: Date, timeZone: string = 'Asia/Kolkata'): keyof AppSettings['timeSlotSettings']['weeklyAvailability'] => {
    // Robust way to get weekday name in a specific timezone
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(date).toLowerCase() as any;
};

const getSlotKey = (dateISO: string, minutes: number) => `${dateISO}:${minutes}`;

interface Interval {
  startMin: number;
  endMin: number;
}

function subtractInterval(work: Interval[], leave: Interval): Interval[] {
  const result: Interval[] = [];
  for (const w of work) {
    if (leave.startMin >= w.endMin || leave.endMin <= w.startMin) {
      result.push(w);
    } else {
      if (leave.startMin > w.startMin) {
        result.push({ startMin: w.startMin, endMin: leave.startMin });
      }
      if (leave.endMin < w.endMin) {
        result.push({ startMin: leave.endMin, endMin: w.endMin });
      }
    }
  }
  return result;
}

function getDayActiveIntervals(
  dateISO: string,
  appConfig: AppSettings,
  leaves: LeaveRequest[]
): Interval[] {
  const timezone = appConfig.timezone || 'Asia/Kolkata';
  const [y, m, d] = dateISO.split('-').map(Number);
  const currentDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = getDayName(currentDate, timezone);
  
  const dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];
  if (!dayAvailability || !dayAvailability.isEnabled) {
    return [];
  }
  
  let workingIntervals: Interval[] = [];
  if (dayAvailability.intervals && Array.isArray(dayAvailability.intervals) && dayAvailability.intervals.length > 0) {
    workingIntervals = dayAvailability.intervals.map(i => ({
      startMin: parseTimeToMinutes(i.startTime),
      endMin: parseTimeToMinutes(i.endTime)
    }));
  } else {
    workingIntervals = [{
      startMin: parseTimeToMinutes(dayAvailability.startTime),
      endMin: parseTimeToMinutes(dayAvailability.endTime)
    }];
  }
  
  const activeLeaves = leaves.filter(leave => leave.startDate <= dateISO && leave.endDate >= dateISO);
  for (const leave of activeLeaves) {
    if (leave.leaveType === 'full_day') {
      return [];
    } else if (leave.leaveType === 'partial_day') {
      const leaveStart = parseTimeToMinutes(leave.startTime || "09:00");
      const leaveEnd = parseTimeToMinutes(leave.endTime || "17:00");
      workingIntervals = subtractInterval(workingIntervals, { startMin: leaveStart, endMin: leaveEnd });
    }
  }
  
  return workingIntervals
    .filter(i => i.endMin > i.startMin)
    .sort((a, b) => a.startMin - b.startMin);
}

/**
 * Calculates the EXACT end date and time for a booking,
 * respecting working hours and multi-day spillovers.
 */
function calculateEndDateTime(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    bufferDuration: number,
    appConfig: AppSettings,
    leaves: LeaveRequest[]
): string {
    const timezone = appConfig.timezone || 'Asia/Kolkata';
    let remainingMinutes = workDuration + bufferDuration;
    let currentMinutes = startMinutes;
    
    const [y, m, d] = startDateISO.split('-').map(Number);
    const currentDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); 
    
    let daysSearched = 0;
    while (remainingMinutes > 0 && daysSearched < 30) {
        const dateISO = currentDate.toISOString().split('T')[0];
        const intervals = getDayActiveIntervals(dateISO, appConfig, leaves);

        if (intervals.length === 0) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        const interval = intervals.find(i => i.endMin > currentMinutes);

        if (!interval) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        if (currentMinutes < interval.startMin) {
            currentMinutes = interval.startMin;
        }

        const minutesAvailable = interval.endMin - currentMinutes;

        if (remainingMinutes <= minutesAvailable) {
            currentMinutes += remainingMinutes;
            remainingMinutes = 0;
        } else {
            remainingMinutes -= minutesAvailable;
            currentMinutes = interval.endMin;
        }
    }
    
    // Construct final result by combining the date components and the final minutes
    const finalDateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const finalHours = Math.floor(currentMinutes / 60);
    const finalMins = currentMinutes % 60;
    
    // Create a date string that represents the wall-clock time in the target timezone
    // "YYYY-MM-DDTHH:mm:ss" - then we'll convert it to absolute UTC
    const wallClockDate = new Date(`${finalDateStr}T${String(finalHours).padStart(2, '0')}:${String(finalMins).padStart(2, '0')}:00`);
    return convertWallClockToUTC(wallClockDate, timezone).toISOString();
}

interface DailyTimelineItem {
    dateLabel: string;
    startTime: string;
    endTime: string;
}

function calculateDailyTimeline(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    appConfig: AppSettings,
    leaves: LeaveRequest[]
): DailyTimelineItem[] {
    let remainingMinutes = workDuration;
    let currentMinutes = startMinutes;
    
    const [y, m, d] = startDateISO.split('-').map(Number);
    const currentDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); 
    
    const timeline: DailyTimelineItem[] = [];
    let daysSearched = 0;
    
    while (remainingMinutes > 0 && daysSearched < 30) {
        const dateISO = currentDate.toISOString().split('T')[0];
        const intervals = getDayActiveIntervals(dateISO, appConfig, leaves);

        if (intervals.length === 0) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        const activeIntervals = intervals.filter(i => i.endMin > currentMinutes);
        if (activeIntervals.length === 0) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        let dayWorkStart: number | null = null;
        let dayWorkEnd: number | null = null;

        for (const interval of activeIntervals) {
            if (remainingMinutes <= 0) break;
            
            const start = Math.max(currentMinutes, interval.startMin);
            if (dayWorkStart === null) dayWorkStart = start;
            
            const minutesAvailableInInterval = interval.endMin - start;
            
            if (remainingMinutes <= minutesAvailableInInterval) {
                dayWorkEnd = start + remainingMinutes;
                currentMinutes = start + remainingMinutes;
                remainingMinutes = 0;
            } else {
                dayWorkEnd = interval.endMin;
                remainingMinutes -= minutesAvailableInInterval;
                currentMinutes = interval.endMin;
            }
        }

        if (dayWorkStart !== null && dayWorkEnd !== null) {
            const displayDateStr = currentDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
            timeline.push({
                dateLabel: displayDateStr,
                startTime: formatTimeFromMinutes(dayWorkStart),
                endTime: formatTimeFromMinutes(dayWorkEnd)
            });
        }

        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        currentMinutes = 0;
        daysSearched++;
    }
    
    return timeline;
}

/**
 * Simulates a continuous timeline of work across multiple days.
 * Yields every slot interval that has any overlap with the Work + Buffer range.
 */
function* simulateProgression(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    bufferDuration: number,
    appConfig: AppSettings,
    leaves: LeaveRequest[]
) {
    const timezone = appConfig.timezone || 'Asia/Kolkata';
    let remainingMinutesToBlock = workDuration;
    let bufferRemaining = bufferDuration;
    let isWorkCompleted = false;
    let currentMinutes = startMinutes;
    
    const [y, m, d] = startDateISO.split('-').map(Number);
    const currentDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    
    const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;

    let daysSearched = 0;
    while (remainingMinutesToBlock > 0 && daysSearched < 30) {
        let dateISO = currentDate.toISOString().split('T')[0];
        const intervals = getDayActiveIntervals(dateISO, appConfig, leaves);

        if (intervals.length === 0) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        const interval = intervals.find(i => i.endMin > currentMinutes);

        if (!interval) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        if (currentMinutes < interval.startMin) {
            currentMinutes = interval.startMin;
        }

        const minutesAvailable = interval.endMin - currentMinutes;
        const consume = Math.min(minutesAvailable, remainingMinutesToBlock);
        
        const segmentStart = currentMinutes;
        const segmentEnd = currentMinutes + consume;

        let slotStart = interval.startMin;
        while (slotStart < segmentEnd) {
            if (slotStart + slotInterval > segmentStart) {
                yield { dateISO, minutes: slotStart };
            }
            slotStart += slotInterval;
        }

        remainingMinutesToBlock -= consume;
        currentMinutes += consume;

        if (!isWorkCompleted && remainingMinutesToBlock <= 0) {
            isWorkCompleted = true;
            const bufferSpaceLeftInInterval = interval.endMin - currentMinutes;
            if (bufferSpaceLeftInInterval > 0) {
                remainingMinutesToBlock = Math.min(bufferRemaining, bufferSpaceLeftInInterval);
            } else {
                const nextInterval = intervals.find(i => i.startMin >= currentMinutes);
                if (nextInterval) {
                    currentMinutes = nextInterval.startMin;
                    const nextSpace = nextInterval.endMin - currentMinutes;
                    remainingMinutesToBlock = Math.min(bufferRemaining, nextSpace);
                } else {
                    remainingMinutesToBlock = 0;
                }
            }
        }

        if (currentMinutes >= interval.endMin) {
            if (isWorkCompleted && remainingMinutesToBlock <= 0) {
                break;
            }

            const hasMoreToday = intervals.some(i => i.startMin >= currentMinutes);
            if (!hasMoreToday) {
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                currentMinutes = 0;
                daysSearched++;
            }
        }
    }
}

export async function POST(req: NextRequest) {
    try {
        const { selectedDate, cartEntries, latitude, longitude } = await req.json();

        if (!selectedDate || !cartEntries) {
            return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
        }

        // Fetch config first to get timezone (cached for 1 minute)
        let appConfig: AppSettings;
        const currentTimestamp = Date.now();
        if (CACHED_APP_CONFIG && (currentTimestamp - CACHED_APP_CONFIG_TIME < CACHE_TTL_MS)) {
            appConfig = CACHED_APP_CONFIG;
        } else {
            const appConfigSnap = await adminDb.collection("webSettings").doc("applicationConfig").get();
            appConfig = (appConfigSnap.exists ? appConfigSnap.data() : defaultAppSettings) as AppSettings;
            CACHED_APP_CONFIG = appConfig;
            CACHED_APP_CONFIG_TIME = currentTimestamp;
        }
        const timezone = appConfig.timezone || 'Asia/Kolkata';

        // Robust parsing: Extract "YYYY-MM-DD" part even if it's a full ISO string
        let dateStr = selectedDate;
        if (selectedDate.includes('T')) {
            dateStr = formatZonedDateToISO(new Date(selectedDate), timezone);
        }

        const dateParts = dateStr.split('-');
        if (dateParts.length < 3) {
            return NextResponse.json({ error: "Invalid date format. Expected YYYY-MM-DD." }, { status: 400 });
        }

        const y = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10);
        const d = parseInt(dateParts[2], 10);

        if (isNaN(y) || isNaN(m) || isNaN(d)) {
            return NextResponse.json({ error: "Invalid date components." }, { status: 400 });
        }

        const dateObj = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); 
        const dateISO = formatZonedDateToISO(dateObj, timezone);

        const lookBackDate = new Date(dateObj);
        lookBackDate.setDate(lookBackDate.getDate() - 7);
        const lookBackISO = formatZonedDateToISO(lookBackDate, timezone);

        // Fetch bookings and leaves (filtered to target range to avoid over-fetching)
        const [bookingsSnap, leavesSnap] = await Promise.all([
            adminDb.collection("bookings")
                .where("scheduledDate", ">=", lookBackISO)
                .where("scheduledDate", "<=", dateISO) 
                .get(),
            adminDb.collection("leaves")
                .where("endDate", ">=", lookBackISO)
                .get()
        ]);

        const existingBookings = bookingsSnap.docs
            .map(doc => doc.data() as FirestoreBooking)
            .filter(b => b.status !== "Cancelled" && b.status !== "Completed");
        const leavesData = leavesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest));

        // Collect all unique service IDs from cart AND active bookings in target range
        const serviceIds = new Set<string>();
        cartEntries.forEach((entry: CartEntry) => {
            if (entry.serviceId) serviceIds.add(entry.serviceId);
        });
        existingBookings.forEach((b: FirestoreBooking) => {
            if (b.services) {
                b.services.forEach(item => {
                    if (item.serviceId) serviceIds.add(item.serviceId);
                });
            }
        });
        const serviceIdsArray = Array.from(serviceIds);

        // Fetch details ONLY for the required services
        const serviceRefs = serviceIdsArray.map(id => adminDb.collection("adminServices").doc(id));
        const serviceDocs = serviceRefs.length > 0 ? await adminDb.getAll(...serviceRefs) : [];
        const servicesData = Object.fromEntries(
            serviceDocs
                .filter(doc => doc.exists)
                .map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService])
        );

        // Collect unique subcategory IDs from the resolved services
        const subCategoryIds = new Set<string>();
        (Object.values(servicesData) as FirestoreService[]).forEach(service => {
            if (service.subCategoryId) subCategoryIds.add(service.subCategoryId);
        });
        const subCategoryIdsArray = Array.from(subCategoryIds);

        // Fetch details ONLY for the required subcategories
        const subCatRefs = subCategoryIdsArray.map(id => adminDb.collection("adminSubCategories").doc(id));
        const subCatDocs = subCatRefs.length > 0 ? await adminDb.getAll(...subCatRefs) : [];
        const subCatsData = Object.fromEntries(
            subCatDocs
                .filter(doc => doc.exists)
                .map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreSubCategory])
        );

        // Collect category IDs from resolved subcategories
        const categoryIds = new Set<string>();
        (Object.values(subCatsData) as FirestoreSubCategory[]).forEach(subCat => {
            if (subCat.parentId) categoryIds.add(subCat.parentId);
        });
        const categoryIdsArray = Array.from(categoryIds);

        // Fetch category limits ONLY for the required category IDs
        const limitsSnap = categoryIdsArray.length > 0
            ? await adminDb.collection("timeSlotCategoryLimits").where("categoryId", "in", categoryIdsArray).get()
            : { docs: [] };
        const limitsData = Object.fromEntries(
            limitsSnap.docs.map(doc => [doc.data().categoryId, { id: doc.id, ...doc.data() } as TimeSlotCategoryLimit])
        );

        const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;
        const breakTimeMinutes = appConfig.timeSlotSettings?.breakTimeMinutes || 0;
        const enableLimitLateBookings = appConfig.enableLimitLateBookings ?? DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS;
        const limitLateBookingHours = enableLimitLateBookings ? (appConfig.limitLateBookingHours ?? DEFAULT_HOURS_WHEN_LIMIT_ENABLED) : 0;

        const uniqueCartCategoryIds = new Set<string>();
        let totalCartDuration = 0;
        cartEntries.forEach((entry: CartEntry) => {
            const service = servicesData[entry.serviceId];
            if (service) {
                totalCartDuration += getServiceDurationInMinutes(service) * entry.quantity;
                const subCat = subCatsData[service.subCategoryId];
                if (subCat?.parentId) uniqueCartCategoryIds.add(subCat.parentId);
            }
        });
        const cartCategoryIds = Array.from(uniqueCartCategoryIds);

        // --- Cache Logic Start ---
        const bookingsHash = bookingsSnap.docs
            .map(doc => `${doc.id}_${doc.updateTime?.toMillis() || 0}`)
            .sort()
            .join('|');
            
        const limitsHash = Object.values(limitsData)
            .map((l: any) => `${l.categoryId}_${l.maxConcurrentBookings}`)
            .sort()
            .join('|');
            
        const cacheKey = `${lookBackISO}_${dateISO}_${bookingsHash}_${limitsHash}_${appConfig.updatedAt?.toMillis() || 0}_${breakTimeMinutes}_${latitude || 0}_${longitude || 0}`;
        
        let cacheData: {
            globalBusyMap: Map<string, Record<string, number>>;
            providerBusyMap: Map<string, Set<string>>;
            adminBusyMap: Map<string, Record<string, number>>;
        };

        if (BUSY_MAP_CACHE.has(cacheKey)) {
            cacheData = BUSY_MAP_CACHE.get(cacheKey)!;
        } else {
            const globalBusyMap = new Map<string, Record<string, number>>();
            const providerBusyMap = new Map<string, Set<string>>();
            const adminBusyMap = new Map<string, Record<string, number>>();

            existingBookings.forEach(booking => {
                let bookingWorkDuration = 0;
                const bookingCategoryIds = new Set<string>();

                booking.services.forEach(item => {
                    const serviceDetail = servicesData[item.serviceId];
                    if (serviceDetail) {
                        bookingWorkDuration += getServiceDurationInMinutes(serviceDetail) * item.quantity;
                        const subCat = subCatsData[serviceDetail.subCategoryId];
                        if (subCat?.parentId) bookingCategoryIds.add(subCat.parentId);
                    }
                });

                const startMin = parseTimeToMinutes(booking.scheduledTimeSlot);
                const progression = simulateProgression(
                    booking.scheduledDate,
                    startMin,
                    bookingWorkDuration,
                    breakTimeMinutes,
                    appConfig,
                    leavesData
                );

                for (const step of progression) {
                    const key = getSlotKey(step.dateISO, step.minutes);
                    
                    // 1. Update Global Busy Map
                    const counts = globalBusyMap.get(key) || {};
                    bookingCategoryIds.forEach(catId => {
                        counts[catId] = (counts[catId] || 0) + 1;
                    });
                    globalBusyMap.set(key, counts);

                    // 2. Update Provider Busy Map
                    if (booking.providerId) {
                        const busySet = providerBusyMap.get(key) || new Set<string>();
                        busySet.add(booking.providerId);
                        providerBusyMap.set(key, busySet);
                    }

                    // 3. Update Admin Busy Map
                    if (!booking.providerId) {
                        const adminCounts = adminBusyMap.get(key) || {};
                        bookingCategoryIds.forEach(catId => {
                            adminCounts[catId] = (adminCounts[catId] || 0) + 1;
                        });
                        adminBusyMap.set(key, adminCounts);
                    }
                }
            });

            if (BUSY_MAP_CACHE.size >= MAX_CACHE_SIZE) {
                const firstKey = BUSY_MAP_CACHE.keys().next().value;
                if (firstKey !== undefined) {
                    BUSY_MAP_CACHE.delete(firstKey);
                }
            }
            cacheData = { globalBusyMap, providerBusyMap, adminBusyMap };
            BUSY_MAP_CACHE.set(cacheKey, cacheData);
        }
        
        const { globalBusyMap, providerBusyMap, adminBusyMap } = cacheData;
        // --- Cache Logic End ---

        // Check if selected date is fully blocked by a leave
        const selectedDateActiveLeaves = leavesData.filter(l => l.startDate <= dateISO && l.endDate >= dateISO);
        const hasFullDayLeave = selectedDateActiveLeaves.some(l => l.leaveType === 'full_day');
        if (hasFullDayLeave) {
            const leaveReason = selectedDateActiveLeaves.find(l => l.leaveType === 'full_day')?.reason || "Provider Leave / Holiday";
            return NextResponse.json({ isLeave: true, leaveReason, availableTimeSlots: [], totalCartDuration });
        }

        const activeIntervals = getDayActiveIntervals(dateISO, appConfig, leavesData);
        if (activeIntervals.length === 0) {
            return NextResponse.json({ availableTimeSlots: [], totalCartDuration });
        }
        const now = getZonedDate(new Date(), timezone);
        const earliestBookableTime = new Date(now.getTime() + (limitLateBookingHours * 60 * 60 * 1000));

        // Fetch local approved providers for the required category IDs that cover the customer's coordinates
        const localProvidersMap = new Map<string, any[]>();
        for (const catId of cartCategoryIds) {
            let providersList: any[] = [];
            if (latitude !== undefined && longitude !== undefined) {
                try {
                    const providersSnapshot = await adminDb.collection('providerApplications')
                        .where('status', '==', 'approved')
                        .where('workCategoryId', '==', catId)
                        .get();
                    
                    providersList = providersSnapshot.docs.map(doc => {
                        const pData = doc.data() as any;
                        let distance = Infinity;
                        if (pData.workAreaCenter && pData.workAreaRadiusKm) {
                            distance = getHaversineDistance(
                                Number(latitude),
                                Number(longitude),
                                Number(pData.workAreaCenter.latitude),
                                Number(pData.workAreaCenter.longitude)
                            );
                        }
                        return { id: doc.id, ...pData, distance };
                    }).filter(p => p.distance <= (p.workAreaRadiusKm || 0));
                } catch (err) {
                    console.error(`Error loading providers for category ${catId}:`, err);
                }
            }
            localProvidersMap.set(catId, providersList);
        }

        const availableSlots: { slot: string; remainingCapacity: number, endDateTime: string }[] = [];

        for (const interval of activeIntervals) {
            let potentialStart = interval.startMin;
            while (potentialStart < interval.endMin) {
                const slotDateTime = getZonedDate(new Date(selectedDate), timezone);
                slotDateTime.setHours(Math.floor(potentialStart / 60), potentialStart % 60, 0, 0);

                if (slotDateTime < earliestBookableTime) {
                    potentialStart += slotInterval;
                    continue;
                }

                // 🚨 MULTI-DAY SERVICE RESTRICTION
                const totalWorkingMinutesInDay = activeIntervals.reduce((acc, i) => acc + (i.endMin - i.startMin), 0);
                const dayStartMinutes = activeIntervals[0].startMin;

                if (totalCartDuration > totalWorkingMinutesInDay) {
                    if (potentialStart !== dayStartMinutes) {
                        potentialStart += slotInterval;
                        continue;
                    }
                }

                // 🚨 LONG SERVICE RESTRICTION (FULL-DAY FIX)
                const FULL_DAY_THRESHOLD = 6 * 60; // 6 hours
                let remainingMinutesToday = 0;
                for (const val of activeIntervals) {
                    if (potentialStart < val.endMin) {
                        const activeStart = Math.max(potentialStart, val.startMin);
                        remainingMinutesToday += (val.endMin - activeStart);
                    }
                }

                if (
                    totalCartDuration >= FULL_DAY_THRESHOLD &&
                    totalCartDuration <= totalWorkingMinutesInDay &&
                    remainingMinutesToday < totalCartDuration
                ) {
                    potentialStart += slotInterval;
                    continue;
                }

                let isPathClear = true;
                let minRemainingCapacity = Infinity;

                const pathSteps = Array.from( simulateProgression(dateISO, potentialStart, totalCartDuration, breakTimeMinutes, appConfig, leavesData) );
                if (pathSteps.length === 0) {
                    isPathClear = false;
                }
                
                // Track busy providers across the entire path steps
                const busyProviderIds = new Set<string>();
                for (const step of pathSteps) {
                    const key = getSlotKey(step.dateISO, step.minutes);
                    const busySet = providerBusyMap.get(key);
                    if (busySet) {
                        busySet.forEach(id => busyProviderIds.add(id));
                    }
                }
                
                for (const step of pathSteps) {
                    for (const catId of cartCategoryIds) {
                         const adminLimit = (limitsData[catId] && typeof limitsData[catId].maxConcurrentBookings === 'number')
                             ? limitsData[catId].maxConcurrentBookings
                             : 1;
                        
                        // Count unassigned admin bookings at this step key
                        const key = getSlotKey(step.dateISO, step.minutes);
                        const adminCounts = adminBusyMap.get(key) || {};
                        const adminBookings = adminCounts[catId] || 0;

                        const remainingAdminCapacity = Math.max(0, adminLimit - adminBookings);
                        
                        // Count available local providers
                        const localProviders = localProvidersMap.get(catId) || [];
                        const availableProviders = localProviders.filter(p => !busyProviderIds.has(p.id)).length;

                        // Dynamic Remaining Capacity
                        const remaining = remainingAdminCapacity + availableProviders;
                        
                        minRemainingCapacity = Math.min(minRemainingCapacity, remaining);
                        if (remaining <= 0) {
                            isPathClear = false;
                            break;
                        }
                    }
                    if (!isPathClear) break;
                }

                if (isPathClear) {
                    const endDateTime = calculateEndDateTime(dateISO, potentialStart, totalCartDuration, 0, appConfig, leavesData);
                    const dailyTimeline = calculateDailyTimeline(dateISO, potentialStart, totalCartDuration, appConfig, leavesData);
                    availableSlots.push({ 
                        slot: formatTimeFromMinutes(potentialStart), 
                        remainingCapacity: minRemainingCapacity,
                        endDateTime: endDateTime,
                        dailyTimeline: dailyTimeline
                    } as any);
                }

                potentialStart += slotInterval;
            }
        }

        return NextResponse.json({ availableTimeSlots: availableSlots, totalCartDuration });
    } catch (error) {
        console.error("Continuous Multi-day API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
