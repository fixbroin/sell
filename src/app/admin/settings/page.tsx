
"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings, Save, Loader2, AlertCircle, MapPin as MapIcon, MailIcon, PlaySquare, Percent, Ban, Users, Clock, DollarSign, CreditCard, Bell, Plus, Trash2, CalendarDays, Edit3, Activity } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, addDoc, deleteDoc, query, orderBy } from '@/lib/mysqlDb';
import { cn, formatDateInTimezone, formatTimeInTimezone, formatCustomDate } from '@/lib/utils';
import { triggerRefresh } from '@/lib/revalidateUtils';
import type { AppSettings, DayAvailability } from '@/types/firestore'; 
import { defaultAppSettings } from '@/config/appDefaults'; 
import PlatformSettingsForm from '@/components/admin/PlatformSettingsForm';
import { Input } from '@/components/ui/input';
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Check, Copy, ChevronsUpDown, Search as SearchIcon } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import PermissionGuard from '@/components/admin/PermissionGuard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const APP_CONFIG_COLLECTION = "webSettings";
const APP_CONFIG_DOC_ID = "applicationConfig";

const DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD.MM.YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD',
  'YYYY/MM/DD',
  'DD MMM YYYY',
  'MMM DD, YYYY',
  'DD MMMM YYYY',
  'MMMM DD, YYYY',
];

interface TimezoneOption {
  label: string;
  subLabel: string;
  value: string;
  searchLabel: string;
}

// Generate a comprehensive list of world timezones with offsets
const generateTimezones = (): TimezoneOption[] => {
  try {
    const tzList = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') : [
      'Asia/Kolkata', 'Asia/Dubai', 'UTC', 'America/New_York', 'Europe/London', 'Asia/Singapore', 'Australia/Sydney'
    ];
    
    return tzList.map((tz: string): TimezoneOption => {
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          timeZoneName: 'shortOffset',
        });
        const parts = formatter.formatToParts(now);
        const offset = parts.find(p => p.type === 'timeZoneName')?.value || "";
        
        let label = tz.replace(/_/g, ' ');
        let extraSearch = "";
        
        // India specific aliases
        if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') {
          label = "India (IST)";
          extraSearch = "kolkata calcutta india ist";
        }
        
        return {
          label: `${label} (${offset})`,
          subLabel: tz,
          value: tz,
          searchLabel: `${label} ${tz} ${offset} ${extraSearch}`.toLowerCase().replace(/\//g, ' ')
        };
      } catch (e) {
        return { label: tz, subLabel: tz, value: tz, searchLabel: tz.toLowerCase() };
      }
    }).sort((a: TimezoneOption, b: TimezoneOption) => a.label.localeCompare(b.label));
  } catch (e) {
    console.error("Timezone generation failed", e);
    return [{ label: "UTC (Offset +0)", subLabel: "UTC", value: "UTC", searchLabel: "utc" }];
  }
};

const getTimezoneOffsetString = (timezone: string): string => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'longOffset'
    }).formatToParts(new Date());
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || '';
    if (tzName === 'GMT') return '+00:00';
    const offset = tzName.replace('GMT', '');
    const match = offset.match(/^([+-])(\d{1,2}):(\d{2})$/);
    if (match) {
      const [_, sign, hours, mins] = match;
      return `${sign}${hours.padStart(2, '0')}:${mins}`;
    }
    return offset;
  } catch (e) {
    return '';
  }
};

const getLiveTimeInTimezone = (timezone: string, date: Date): string => {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch (e) {
    return '';
  }
};

interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
}

const currenciesList: CurrencyOption[] = [
  { code: "INR", symbol: "₹", name: "India Rupee" },
  { code: "USD", symbol: "$", name: "United States Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "United Kingdom Pound" },
  { code: "AED", symbol: "د.إ", name: "United Arab Emirates Dirham" },
  { code: "SAR", symbol: "ر.س", name: "Saudi Arabia Riyal" },
  { code: "CAD", symbol: "C$", name: "Canada Dollar" },
  { code: "AUD", symbol: "A$", name: "Australia Dollar" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "MYR", symbol: "RM", name: "Malaysia Ringgit" },
  { code: "NPR", symbol: "रू", name: "Nepal Rupee" },
  { code: "LKR", symbol: "රු", name: "Sri Lanka Rupee" },
  { code: "BDT", symbol: "৳", name: "Bangladesh Taka" },
  { code: "PKR", symbol: "₨", name: "Pakistan Rupee" },
  { code: "QAR", symbol: "ر.ق", name: "Qatar Riyal" },
  { code: "KWD", symbol: "د.ك", name: "Kuwait Dinar" },
  { code: "BHD", symbol: ".د.ب", name: "Bahrain Dinar" },
  { code: "OMR", symbol: "ر.ع.", name: "Oman Rial" },
  { code: "MMK", symbol: "K", name: "Myanmar (Burma) Kyat" },
  { code: "THB", symbol: "฿", name: "Thailand Baht" },
  { code: "IDR", symbol: "Rp", name: "Indonesia Rupiah" },
  { code: "PHP", symbol: "₱", name: "Philippines Peso" },
  { code: "VND", symbol: "₫", name: "Vietnam Dong" },
  { code: "CNY", symbol: "¥", name: "China Yuan Renminbi" },
  { code: "JPY", symbol: "¥", name: "Japan Yen" },
];

const ALL_TIMEZONES = generateTimezones();

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AppSettings>(defaultAppSettings);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const symbol = settings.currencySymbol || '₹';
  const previewDate = useMemo(() => new Date(), []);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedStripe, setCopiedStripe] = useState(false);
  const [copiedRazorpay, setCopiedRazorpay] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [timezoneSearch, setTimezoneSearch] = useState("");
  const [isTimezoneDialogOpen, setIsTimezoneDialogOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [isCurrencyDialogOpen, setIsCurrencyDialogOpen] = useState(false);
  const [isDateFormatDialogOpen, setIsDateFormatDialogOpen] = useState(false);
  const [isVcTaxPickerOpen, setIsVcTaxPickerOpen] = useState(false);
  const [isCancelFeeTypePickerOpen, setIsCancelFeeTypePickerOpen] = useState(false);

  // Leaves & Holidays States
  const [leaves, setLeaves] = useState<any[]>([]);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(true);
  const [isAddLeaveDialogOpen, setIsAddLeaveDialogOpen] = useState(false);
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveType, setLeaveType] = useState<'full_day' | 'partial_day'>("full_day");
  const [leaveStartTime, setLeaveStartTime] = useState("09:00");
  const [leaveEndTime, setLeaveEndTime] = useState("17:00");
  const [leaveReason, setLeaveReason] = useState("");
  const [isSavingLeave, setIsSavingLeave] = useState(false);
  const [isLeaveTypePickerOpen, setIsLeaveTypePickerOpen] = useState(false);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  const filteredTimezones = useMemo(() => {
    let result = ALL_TIMEZONES;
    if (timezoneSearch) {
      const search = timezoneSearch.toLowerCase().replace(/\//g, ' ').trim();
      result = ALL_TIMEZONES.filter((tz: TimezoneOption) => {
        if (tz.searchLabel.includes(search)) return true;
        const offsetStr = getTimezoneOffsetString(tz.value).toLowerCase();
        if (offsetStr.includes(search) || offsetStr.replace(':', '').includes(search)) return true;
        const liveTime = getLiveTimeInTimezone(tz.value, currentTime).toLowerCase();
        if (liveTime.includes(search) || liveTime.replace(':', '').includes(search)) return true;
        return false;
      });
    }
    const kolkataIndex = result.findIndex(tz => tz.value === 'Asia/Kolkata' || tz.value === 'Asia/Calcutta');
    if (kolkataIndex > -1) {
      const kolkataTz = result[kolkataIndex];
      const withoutKolkata = result.filter(tz => tz.value !== 'Asia/Kolkata' && tz.value !== 'Asia/Calcutta');
      return [kolkataTz, ...withoutKolkata];
    }
    return result;
  }, [timezoneSearch, currentTime]);

  const filteredCurrencies = useMemo(() => {
    if (!currencySearch) return currenciesList;
    const search = currencySearch.toLowerCase().trim();
    return currenciesList.filter(c => c.code.toLowerCase().includes(search) || c.name.toLowerCase().includes(search));
  }, [currencySearch]);

  // Scroll selected timezone into view when dialog opens
  useEffect(() => {
    if (isTimezoneDialogOpen) {
      setTimeout(() => {
        const activeItem = document.querySelector('[data-timezone-active="true"]');
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest', behavior: 'instant' as any });
        }
      }, 100);
    }
  }, [isTimezoneDialogOpen]);

  // Scroll selected date format into view when dialog opens
  useEffect(() => {
    if (isDateFormatDialogOpen) {
      setTimeout(() => {
        const activeItem = document.querySelector('[data-dateformat-active="true"]');
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest', behavior: 'instant' as any });
        }
      }, 100);
    }
  }, [isDateFormatDialogOpen]);

  // Scroll selected currency into view when dialog opens
  useEffect(() => {
    if (isCurrencyDialogOpen) {
      setTimeout(() => {
        const activeItem = document.querySelector('[data-currency-active="true"]');
        if (activeItem) {
          activeItem.scrollIntoView({ block: 'nearest', behavior: 'instant' as any });
        }
      }, 100);
    }
  }, [isCurrencyDialogOpen]);

  const loadSettingsFromFirestore = useCallback(async () => {
    setIsLoadingSettings(true);
    try {
      const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
      const docSnap = await getDoc(settingsDocRef);
      if (docSnap.exists()) {
        const firestoreData = docSnap.data() as Partial<AppSettings>;
        
        const mergedSettings = { 
          ...defaultAppSettings, 
          ...firestoreData,
          timeSlotSettings: { // Deep merge for timeSlotSettings
            ...defaultAppSettings.timeSlotSettings,
            ...(firestoreData.timeSlotSettings || {}),
            weeklyAvailability: {
                ...defaultAppSettings.timeSlotSettings.weeklyAvailability,
                ...(firestoreData.timeSlotSettings?.weeklyAvailability || {}),
            }
          },
          // Merge cancellation policy settings
          enableCancellationPolicy: typeof firestoreData.enableCancellationPolicy === 'boolean' ? firestoreData.enableCancellationPolicy : defaultAppSettings.enableCancellationPolicy,
          freeCancellationDays: firestoreData.freeCancellationDays ?? defaultAppSettings.freeCancellationDays,
          freeCancellationHours: firestoreData.freeCancellationHours ?? defaultAppSettings.freeCancellationHours,
          freeCancellationMinutes: firestoreData.freeCancellationMinutes ?? defaultAppSettings.freeCancellationMinutes,
          cancellationFeeType: firestoreData.cancellationFeeType ?? defaultAppSettings.cancellationFeeType,
          cancellationFeeValue: firestoreData.cancellationFeeValue ?? defaultAppSettings.cancellationFeeValue,
          enableFinalCancellationWindow: typeof firestoreData.enableFinalCancellationWindow === 'boolean' ? firestoreData.enableFinalCancellationWindow : defaultAppSettings.enableFinalCancellationWindow,
          finalCancellationHours: firestoreData.finalCancellationHours ?? defaultAppSettings.finalCancellationHours,
          finalCancellationMinutes: firestoreData.finalCancellationMinutes ?? defaultAppSettings.finalCancellationMinutes,
          maxProviderRadiusKm: firestoreData.maxProviderRadiusKm ?? defaultAppSettings.maxProviderRadiusKm, // Merge new field
          autoDispatchRadiusKm: firestoreData.autoDispatchRadiusKm ?? defaultAppSettings.autoDispatchRadiusKm, // Merge auto dispatch field
        };
        const daysKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
        daysKeys.forEach(day => {
            const dayAvail = mergedSettings.timeSlotSettings.weeklyAvailability[day];
            if (!dayAvail.intervals || dayAvail.intervals.length === 0) {
                dayAvail.intervals = [{ startTime: dayAvail.startTime || "09:00", endTime: dayAvail.endTime || "17:00" }];
            }
        });
        setSettings(mergedSettings);
      } else {
        setSettings(defaultAppSettings);
      }
    } catch (e) {
      console.error("Failed to load settings from Firestore", e);
      toast({ title: "Error Loading Settings", description: "Could not load settings from database. Using defaults.", variant: "destructive" });
      setSettings(defaultAppSettings); 
    } finally {
      setIsLoadingSettings(false);
    }
  }, [toast]);

  useEffect(() => {
    loadSettingsFromFirestore();
  }, [loadSettingsFromFirestore]);

  const loadLeavesFromFirestore = useCallback(async () => {
    setIsLoadingLeaves(true);
    try {
      const leavesRef = collection(db, "leaves");
      const q = query(leavesRef, orderBy("startDate", "desc"));
      const querySnapshot = await getDocs(q);
      const fetchedLeaves = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLeaves(fetchedLeaves);
    } catch (e) {
      console.error("Failed to load leaves", e);
      toast({ title: "Error Loading Leaves", description: "Could not load leaves list.", variant: "destructive" });
    } finally {
      setIsLoadingLeaves(false);
    }
  }, [toast]);

  useEffect(() => {
    loadLeavesFromFirestore();
  }, [loadLeavesFromFirestore]);

  const handleEditLeaveClick = (leave: any) => {
    setEditingLeaveId(leave.id);
    setLeaveStartDate(leave.startDate);
    setLeaveEndDate(leave.endDate);
    setLeaveType(leave.leaveType);
    setLeaveReason(leave.reason || "");
    if (leave.leaveType === "partial_day") {
      setLeaveStartTime(leave.startTime || "09:00");
      setLeaveEndTime(leave.endTime || "17:00");
    } else {
      setLeaveStartTime("09:00");
      setLeaveEndTime("17:00");
    }
    setIsAddLeaveDialogOpen(true);
  };

  const handleSaveLeave = async () => {
    if (!leaveStartDate || !leaveEndDate) {
      toast({ title: "Invalid Input", description: "Start Date and End Date are required.", variant: "destructive" });
      return;
    }
    if (leaveEndDate < leaveStartDate) {
      toast({ title: "Invalid Date Range", description: "End Date cannot be before Start Date.", variant: "destructive" });
      return;
    }
    if (leaveType === "partial_day" && leaveEndTime <= leaveStartTime) {
      toast({ title: "Invalid Time Range", description: "End Time must be after Start Time.", variant: "destructive" });
      return;
    }

    setIsSavingLeave(true);
    try {
      const leaveData: any = {
        startDate: leaveStartDate,
        endDate: leaveEndDate,
        leaveType,
        reason: leaveReason || "Scheduled Provider Leave / Holiday",
        createdAt: Timestamp.now()
      };
      if (leaveType === "partial_day") {
        leaveData.startTime = leaveStartTime;
        leaveData.endTime = leaveEndTime;
      }
      
      if (editingLeaveId) {
        const docRef = doc(db, "leaves", editingLeaveId);
        await setDoc(docRef, leaveData, { merge: true });
        toast({ title: "Leave / Holiday Updated", description: "Successfully updated leave slot." });
      } else {
        const leavesRef = collection(db, "leaves");
        await addDoc(leavesRef, leaveData);
        toast({ title: "Leave / Holiday Added", description: "Successfully saved leave slot." });
      }
      
      setEditingLeaveId(null);
      setLeaveStartDate("");
      setLeaveEndDate("");
      setLeaveType("full_day");
      setLeaveStartTime("09:00");
      setLeaveEndTime("17:00");
      setLeaveReason("");
      setIsAddLeaveDialogOpen(false);
      
      loadLeavesFromFirestore();
    } catch (e) {
      console.error("Failed to save leave", e);
      toast({ title: "Error Saving Leave", description: "Could not save leave configuration.", variant: "destructive" });
    } finally {
      setIsSavingLeave(false);
    }
  };

  const handleDeleteLeave = async (id: string) => {
    try {
      const docRef = doc(db, "leaves", id);
      await deleteDoc(docRef);
      toast({ title: "Leave Deleted", description: "The leave configuration was successfully removed." });
      loadLeavesFromFirestore();
    } catch (e) {
      console.error("Failed to delete leave", e);
      toast({ title: "Error Deleting Leave", description: "Could not delete the leave document.", variant: "destructive" });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    
    // Handle nested weekly availability
    if (name.startsWith('weeklyAvailability.')) {
        const [_, day, field] = name.split('.');
        setSettings(prev => {
            const newSettings = JSON.parse(JSON.stringify(prev));
            if (!newSettings.timeSlotSettings) newSettings.timeSlotSettings = { ...defaultAppSettings.timeSlotSettings };
            (newSettings.timeSlotSettings.weeklyAvailability as any)[day][field] = value;
            return newSettings;
        });
        return;
    }

    setSettings(prev => {
      const newSettings = JSON.parse(JSON.stringify(prev)); 

      if (['carouselAutoplayDelay', 'visitingChargeTaxPercent', 'minimumBookingAmount', 'visitingChargeAmount', 'limitLateBookingHours', 'freeCancellationDays', 'freeCancellationHours', 'freeCancellationMinutes', 'cancellationFeeValue', 'maxProviderRadiusKm', 'autoDispatchRadiusKm', 'timeSlotSettings.slotIntervalMinutes', 'timeSlotSettings.breakTimeMinutes', 'currencyDecimalPoints', 'finalCancellationHours', 'finalCancellationMinutes'].includes(name)) {
        const keys = name.split('.');
        const parsedValue = value === '' ? '' : (isNaN(parseFloat(value)) ? 0 : parseFloat(value));
        if (keys.length > 1) {
          (newSettings as any)[keys[0]][keys[1]] = parsedValue;
        } else {
           newSettings[name as keyof AppSettings] = parsedValue as any;
        }
      }
      else {
        (newSettings as any)[name] = value;
      }

      // If tax on VC is disabled or rate is 0, ensure isVisitingChargeTaxInclusive is false
      if (name === "enableTaxOnVisitingCharge" && value === "false") {
        newSettings.isVisitingChargeTaxInclusive = false;
      }
      if (name === "visitingChargeTaxPercent" && (parseFloat(value) || 0) <= 0) {
        newSettings.isVisitingChargeTaxInclusive = false;
      }
      return newSettings;
    });
  };
  
  const handleSwitchChange = (name: keyof AppSettings | string, checked: boolean) => {
    if (name.startsWith('weeklyAvailability.')) {
        const [_, day, field] = name.split('.');
        setSettings(prev => {
            const newSettings = JSON.parse(JSON.stringify(prev));
            if (!newSettings.timeSlotSettings) newSettings.timeSlotSettings = { ...defaultAppSettings.timeSlotSettings };
            (newSettings.timeSlotSettings.weeklyAvailability as any)[day][field] = checked;
            return newSettings;
        });
        return;
    }
    
    setSettings(prev => {
      const newSettings = { ...prev, [name as keyof AppSettings]: checked };
      // If tax on VC is disabled, ensure isVisitingChargeTaxInclusive is false
      if (name === "enableTaxOnVisitingCharge" && !checked) {
        newSettings.isVisitingChargeTaxInclusive = false;
      }
      // If main cancellation policy is disabled, ensure fee type/value are reset or handled appropriately (optional reset)
      if (name === "enableCancellationPolicy" && !checked) {
        // newSettings.cancellationFeeType = defaultAppSettings.cancellationFeeType; // Or keep last value
        // newSettings.cancellationFeeValue = defaultAppSettings.cancellationFeeValue;
      }
      return newSettings;
    });
  };
  
  const handleSelectChange = (name: keyof AppSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [name]: name === 'isVisitingChargeTaxInclusive' ? (value === "true") : value,
    }));
  };

  const handleSelectCurrency = (currency: CurrencyOption) => {
    let decimals = 2;
    if (['JPY', 'VND'].includes(currency.code)) {
      decimals = 0;
    } else if (['KWD', 'BHD', 'OMR'].includes(currency.code)) {
      decimals = 3;
    }

    setSettings(prev => ({
      ...prev,
      currencyCode: currency.code,
      currencySymbol: currency.symbol,
      currencyDecimalPoints: decimals,
    }));
  };

  const handleIntervalChange = (day: keyof AppSettings['timeSlotSettings']['weeklyAvailability'], index: number, field: 'startTime' | 'endTime', value: string) => {
    setSettings(prev => {
        const newSettings = JSON.parse(JSON.stringify(prev));
        const dayAvail = newSettings.timeSlotSettings.weeklyAvailability[day];
        if (!dayAvail.intervals) dayAvail.intervals = [];
        if (dayAvail.intervals[index]) {
            dayAvail.intervals[index][field] = value;
        }
        // Also update fallback startTime and endTime
        if (dayAvail.intervals.length > 0) {
            dayAvail.startTime = dayAvail.intervals[0].startTime;
            dayAvail.endTime = dayAvail.intervals[dayAvail.intervals.length - 1].endTime;
        }
        return newSettings;
    });
  };

  const addInterval = (day: keyof AppSettings['timeSlotSettings']['weeklyAvailability']) => {
    setSettings(prev => {
        const newSettings = JSON.parse(JSON.stringify(prev));
        const dayAvail = newSettings.timeSlotSettings.weeklyAvailability[day];
        if (!dayAvail.intervals) dayAvail.intervals = [];
        
        let newStart = "09:00";
        let newEnd = "17:00";
        if (dayAvail.intervals.length > 0) {
            const lastEnd = dayAvail.intervals[dayAvail.intervals.length - 1].endTime;
            newStart = lastEnd;
            const [h, m] = lastEnd.split(':').map(Number);
            const nextH = Math.min(23, h + 2);
            newEnd = `${String(nextH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
        
        dayAvail.intervals.push({ startTime: newStart, endTime: newEnd });
        dayAvail.startTime = dayAvail.intervals[0].startTime;
        dayAvail.endTime = dayAvail.intervals[dayAvail.intervals.length - 1].endTime;
        return newSettings;
    });
  };

  const deleteInterval = (day: keyof AppSettings['timeSlotSettings']['weeklyAvailability'], index: number) => {
    setSettings(prev => {
        const newSettings = JSON.parse(JSON.stringify(prev));
        const dayAvail = newSettings.timeSlotSettings.weeklyAvailability[day];
        if (dayAvail.intervals && dayAvail.intervals.length > 1) {
            dayAvail.intervals.splice(index, 1);
            dayAvail.startTime = dayAvail.intervals[0].startTime;
            dayAvail.endTime = dayAvail.intervals[dayAvail.intervals.length - 1].endTime;
        }
        return newSettings;
    });
  };


  const handleSaveSettings = async (sectionName: string) => {
    setIsSaving(true);
    
    const settingsToSave: AppSettings = {
      ...defaultAppSettings, 
      ...settings, 
      timeSlotSettings: { 
        ...defaultAppSettings.timeSlotSettings,
        ...(settings.timeSlotSettings || {}),
         weeklyAvailability: {
            ...defaultAppSettings.timeSlotSettings.weeklyAvailability,
            ...(settings.timeSlotSettings?.weeklyAvailability || {}),
        }
      },
      updatedAt: Timestamp.now(),
    };

    // Sanitize any empty string values from numeric fields back to 0 before saving to database
    const numericKeys = [
      'carouselAutoplayDelay', 'visitingChargeTaxPercent', 'minimumBookingAmount', 
      'visitingChargeAmount', 'limitLateBookingHours', 'freeCancellationDays', 
      'freeCancellationHours', 'freeCancellationMinutes', 'cancellationFeeValue', 
      'maxProviderRadiusKm', 'autoDispatchRadiusKm', 'currencyDecimalPoints',
      'finalCancellationHours', 'finalCancellationMinutes'
    ];
    numericKeys.forEach(key => {
      if ((settingsToSave as any)[key] === '') {
        (settingsToSave as any)[key] = 0;
      }
    });

    if (settingsToSave.timeSlotSettings) {
      if ((settingsToSave.timeSlotSettings as any).slotIntervalMinutes === '') {
        settingsToSave.timeSlotSettings.slotIntervalMinutes = 0;
      }
      if ((settingsToSave.timeSlotSettings as any).breakTimeMinutes === '') {
        settingsToSave.timeSlotSettings.breakTimeMinutes = 0;
      }
    }

    // Ensure isVisitingChargeTaxInclusive is false if conditions aren't met
    if (!settingsToSave.enableTaxOnVisitingCharge || (settingsToSave.visitingChargeTaxPercent || 0) <= 0) {
        settingsToSave.isVisitingChargeTaxInclusive = false;
    }
    // Ensure cancellation fee value is appropriate if policy is disabled or fee type makes value irrelevant
    if (!settingsToSave.enableCancellationPolicy) {
        // Optionally clear/reset fee type and value, or just let them be (they won't be used)
        // settingsToSave.cancellationFeeType = defaultAppSettings.cancellationFeeType;
        // settingsToSave.cancellationFeeValue = defaultAppSettings.cancellationFeeValue;
    }
    
    console.log('Saving ' + sectionName + ' settings to Firestore:', settingsToSave);

    try {
        const settingsDocRef = doc(db, APP_CONFIG_COLLECTION, APP_CONFIG_DOC_ID);
        await setDoc(settingsDocRef, settingsToSave, { merge: true }); 
        await triggerRefresh('app-settings');
        await triggerRefresh('global-cache');
        await triggerRefresh('sitemap');
        
        toast({
            title: "Settings Saved",
            description: sectionName + ' settings have been saved to the database.',
        });
    } catch (e) {
        console.error("Failed to save settings to Firestore", e);
        toast({
            title: "Error Saving Settings",
            description: "Could not save settings to the database.",
            variant: "destructive",
        });
    }
    await new Promise(resolve => setTimeout(resolve, 700)); 
    setIsSaving(false);
  };
  
  const canSetVcTaxInclusive = settings.enableTaxOnVisitingCharge && (settings.visitingChargeTaxPercent || 0) > 0;
  
  const renderWeeklyAvailability = () => {
    const days: (keyof AppSettings['timeSlotSettings']['weeklyAvailability'])[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    
    return days.map(day => {
      const dayAvail = settings.timeSlotSettings.weeklyAvailability[day];
      const intervals = dayAvail.intervals || [{ startTime: dayAvail.startTime || "09:00", endTime: dayAvail.endTime || "17:00" }];
      
      return (
        <div key={day} className="p-4 border rounded-lg space-y-3">
          <div className="flex justify-between items-center">
            <Label className="capitalize text-lg font-medium">{day}</Label>
            <Switch
              checked={dayAvail.isEnabled}
              onCheckedChange={(checked) => handleSwitchChange(`weeklyAvailability.${day}.isEnabled`, checked)}
              disabled={isSaving}
            />
          </div>
          
          {dayAvail.isEnabled && (
            <div className="space-y-3 pt-2">
              <Label className="text-xs text-muted-foreground">Time Slot Intervals</Label>
              {intervals.map((interval, index) => (
                <div key={index} className="flex items-center gap-3 bg-muted/30 p-2.5 rounded-lg border">
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div>
                      <Label htmlFor={`${day}-interval-${index}-startTime`} className="text-xs text-muted-foreground">Start Time</Label>
                      <Input
                        id={`${day}-interval-${index}-startTime`}
                        type="time"
                        value={interval.startTime}
                        onChange={(e) => handleIntervalChange(day, index, 'startTime', e.target.value)}
                        disabled={isSaving}
                        className="h-9 text-xs"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${day}-interval-${index}-endTime`} className="text-xs text-muted-foreground">End Time</Label>
                      <Input
                        id={`${day}-interval-${index}-endTime`}
                        type="time"
                        value={interval.endTime}
                        onChange={(e) => handleIntervalChange(day, index, 'endTime', e.target.value)}
                        disabled={isSaving}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                  
                  {intervals.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteInterval(day, index)}
                      disabled={isSaving}
                      className="mt-4 h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              
              <div className="pt-1 flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addInterval(day)}
                  disabled={isSaving}
                  className="text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Time Slot
                </Button>
              </div>
            </div>
          )}
          
          {!dayAvail.isEnabled && (
            <div className="py-4 text-center text-sm text-muted-foreground italic">
              Shop Closed / Offline
            </div>
          )}
        </div>
      );
    });
  };


  if (isLoadingSettings) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Loading application settings...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl flex items-center">
            <Settings className="mr-2 h-6 w-6 text-primary" /> Application Settings
          </CardTitle>
          <CardDescription>
            Configure various application settings. Changes here affect the entire application.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="general" className="w-full">
        <div className="relative mb-6">
          <TabsList className="h-12 w-full justify-start gap-2 bg-transparent p-0 overflow-x-auto no-scrollbar flex-nowrap border-b border-border rounded-none">
            <TabsTrigger 
              value="general"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <DollarSign className="mr-2 h-4 w-4" /> General
            </TabsTrigger>
            <TabsTrigger 
              value="payment"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <CreditCard className="mr-2 h-4 w-4" /> Payment
            </TabsTrigger>
            <TabsTrigger 
              value="provider"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Users className="mr-2 h-4 w-4" /> Provider
            </TabsTrigger>
            <TabsTrigger 
              value="slots"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Clock className="mr-2 h-4 w-4" /> Time Slots
            </TabsTrigger>
            <TabsTrigger 
              value="cancellation"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Ban className="mr-2 h-4 w-4" /> Cancellation
            </TabsTrigger>
            <TabsTrigger 
              value="notifications"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <Bell className="mr-2 h-4 w-4" /> Notifications
            </TabsTrigger>
            <TabsTrigger 
              value="leaves"
              className="relative h-12 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-semibold text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none whitespace-nowrap"
            >
              <CalendarDays className="mr-2 h-4 w-4" /> Leaves & Holidays
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="mt-0 focus-visible:outline-none">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>Basic application-wide configurations.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Timezone Configuration */}
              <div className="space-y-4 p-4 border rounded-md shadow-sm bg-muted/5">
                <h3 className="text-lg font-semibold flex items-center">
                  <Clock className="mr-2 h-5 w-5 text-primary" /> Application Timezone
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Select Timezone</Label>
                  <Dialog open={isTimezoneDialogOpen} onOpenChange={setIsTimezoneDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        id="timezone"
                        variant="outline"
                        role="combobox"
                        aria-expanded={isTimezoneDialogOpen}
                        className="w-full justify-between text-left font-normal h-auto min-h-10 py-2 border-border/60 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground focus:ring-2 focus:ring-primary focus:border-primary group transition-all"
                        disabled={isSaving}
                        type="button"
                      >
                        {settings.timezone ? (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 font-mono text-sm w-full pr-2">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-4 w-4 text-primary shrink-0 group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                              <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary-foreground group-focus:text-primary-foreground">{getTimezoneOffsetString(settings.timezone)}</span>
                              <span className="text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                              <span className="text-primary font-bold group-hover:text-primary-foreground group-focus:text-primary-foreground">{getLiveTimeInTimezone(settings.timezone, currentTime)}</span>
                            </div>
                            <span className="hidden sm:inline text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                            <span className="text-slate-600 dark:text-slate-400 truncate max-w-[200px] sm:max-w-none group-hover:text-primary-foreground/90 group-focus:text-primary-foreground/90">{settings.timezone}</span>
                          </div>
                        ) : (
                          "Select application timezone..."
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[550px] md:max-w-[600px]">
                      <DialogHeader>
                        <DialogTitle>Select Application Timezone</DialogTitle>
                        <DialogDescription>
                          Choose the primary timezone for booking slots, emails, and reporting.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="relative">
                          <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Type timezone name..."
                            className="pl-8"
                            value={timezoneSearch}
                            onChange={(e) => setTimezoneSearch(e.target.value)}
                          />
                        </div>
                        <ScrollArea className="h-[300px] rounded-md border p-2">
                          <div className="space-y-1">
                            {filteredTimezones.map((tz) => (
                              <Button
                                key={tz.value}
                                variant={settings.timezone === tz.value ? "default" : "ghost"}
                                className="w-full justify-start text-left h-auto py-2.5 px-3 relative group whitespace-normal hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground transition-all"
                                onClick={() => {
                                  handleSelectChange('timezone', tz.value);
                                  setIsTimezoneDialogOpen(false);
                                  setTimezoneSearch("");
                                }}
                                type="button"
                                data-timezone-active={settings.timezone === tz.value ? "true" : "false"}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 font-mono text-sm w-full pr-8">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-primary-foreground group-focus:text-primary-foreground">{getTimezoneOffsetString(tz.value)}</span>
                                    <span className="text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                                    <span className={settings.timezone === tz.value ? "text-primary-foreground font-bold" : "text-primary font-bold group-hover:text-primary-foreground group-focus:text-primary-foreground"}>{getLiveTimeInTimezone(tz.value, currentTime)}</span>
                                  </div>
                                  <span className="hidden sm:inline text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                                  <span className="text-slate-600 dark:text-slate-400 truncate max-w-[160px] xs:max-w-[220px] sm:max-w-none group-hover:text-primary-foreground/90 group-focus:text-primary-foreground/90">{tz.value}</span>
                                </div>
                                {settings.timezone === tz.value && (
                                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                                )}
                              </Button>
                            ))}
                            {filteredTimezones.length === 0 && (
                              <p className="text-center py-4 text-sm text-muted-foreground">No timezones found.</p>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs text-muted-foreground">
                    Search and select from all world timezones. This will be used for booking slots, email timestamps, and all date/time calculations.
                  </p>
                </div>
              </div>

              {/* Date Format Configuration */}
              <div className="space-y-4 p-4 border rounded-md shadow-sm bg-muted/5">
                <h3 className="text-lg font-semibold flex items-center">
                  <CalendarDays className="mr-2 h-5 w-5 text-primary" /> Application Date Format
                </h3>
                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Select Date Format</Label>
                  <Dialog open={isDateFormatDialogOpen} onOpenChange={setIsDateFormatDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        id="dateFormat"
                        variant="outline"
                        role="combobox"
                        aria-expanded={isDateFormatDialogOpen}
                        className="w-full justify-between text-left font-normal h-auto min-h-10 py-2 border-border/60 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground focus:ring-2 focus:ring-primary focus:border-primary group transition-all"
                        disabled={isSaving}
                        type="button"
                      >
                        {settings.dateFormat ? (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm w-full pr-2">
                            <div className="flex items-center gap-2">
                              <CalendarDays className="h-4 w-4 text-primary shrink-0 group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                              <span className="font-semibold group-hover:text-primary-foreground group-focus:text-primary-foreground">{settings.dateFormat}</span>
                            </div>
                            <span className="hidden sm:inline text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none group-hover:text-primary-foreground/90 group-focus:text-primary-foreground/90">Example: {formatCustomDate(previewDate, settings.dateFormat, settings.timezone)}</span>
                          </div>
                        ) : (
                          "Choose a date format..."
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[500px] md:max-w-[550px]">
                      <DialogHeader>
                        <DialogTitle>Select Application Date Format</DialogTitle>
                        <DialogDescription>
                          Choose the display format that matches your country's standard.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <ScrollArea className="h-[280px] rounded-md border p-2">
                          <div className="space-y-1">
                            {DATE_FORMATS.map((fmt) => (
                              <Button
                                key={fmt}
                                variant={settings.dateFormat === fmt ? "default" : "ghost"}
                                className="w-full justify-start text-left h-auto py-2.5 px-3 relative group whitespace-normal hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground transition-all"
                                onClick={() => {
                                  handleSelectChange('dateFormat', fmt);
                                  setIsDateFormatDialogOpen(false);
                                }}
                                type="button"
                                data-dateformat-active={settings.dateFormat === fmt ? "true" : "false"}
                              >
                                <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-sm w-full pr-8">
                                  <span className="font-semibold group-hover:text-primary-foreground group-focus:text-primary-foreground">{fmt}</span>
                                  <span className="hidden sm:inline text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                                  <span className="text-xs text-muted-foreground truncate max-w-[160px] xs:max-w-[220px] sm:max-w-none group-hover:text-primary-foreground/90 group-focus:text-primary-foreground/90">Example: {formatCustomDate(previewDate, fmt, settings.timezone)}</span>
                                </div>
                                {settings.dateFormat === fmt && (
                                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                                )}
                              </Button>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <p className="text-xs text-muted-foreground">
                    Choose the date display format that matches your country's standard. This format will be used across the entire website, client/provider dashboards, emails, and PDFs.
                  </p>
                </div>
              </div>

              {/* Currency Settings */}
              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-primary" /> Currency Settings
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Country Currency Selector */}
                  <div className="space-y-2 flex flex-col justify-between">
                    <Label htmlFor="countryCurrency" className="mb-1 text-slate-700 dark:text-slate-200">Country Currency</Label>
                    <Dialog open={isCurrencyDialogOpen} onOpenChange={setIsCurrencyDialogOpen}>
                      <DialogTrigger asChild>
                        <Button
                          id="countryCurrency"
                          variant="outline"
                          role="combobox"
                          aria-expanded={isCurrencyDialogOpen}
                          className="w-full justify-between h-auto min-h-10 py-2 border-border/60 hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground focus:ring-2 focus:ring-primary focus:border-primary group transition-all"
                        >
                          {(() => {
                            const cur = currenciesList.find(c => c.code === (settings.currencyCode || 'INR')) || currenciesList[0];
                            return (
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm w-full pr-2 text-left">
                                <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-primary-foreground group-focus:text-primary-foreground">{cur.code}</span>
                                <span className="hidden sm:inline text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                                <span className="text-xs text-muted-foreground truncate max-w-[200px] sm:max-w-none group-hover:text-primary-foreground/90 group-focus:text-primary-foreground/90">{cur.name}</span>
                              </div>
                            );
                          })()}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[500px] md:max-w-[550px]">
                        <DialogHeader>
                          <DialogTitle>Select Country Currency</DialogTitle>
                          <DialogDescription>Search and select your local business currency.</DialogDescription>
                        </DialogHeader>
                        <div className="flex flex-col gap-4 pt-2">
                          <div className="relative">
                            <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Search currency code or name..."
                              className="pl-8"
                              value={currencySearch}
                              onChange={(e) => setCurrencySearch(e.target.value)}
                            />
                          </div>
                          <ScrollArea className="h-[250px] rounded-md border p-2">
                            <div className="space-y-1">
                               {filteredCurrencies.map((c) => (
                                <Button
                                  key={c.code}
                                  variant={settings.currencyCode === c.code ? "default" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-2.5 px-3 relative group hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground transition-all"
                                  onClick={() => {
                                    handleSelectCurrency(c);
                                    setIsCurrencyDialogOpen(false);
                                    setCurrencySearch("");
                                  }}
                                  type="button"
                                  data-currency-active={settings.currencyCode === c.code ? "true" : "false"}
                                >
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 text-sm w-full pr-8">
                                    <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-primary-foreground group-focus:text-primary-foreground">{c.code}</span>
                                    <span className="hidden sm:inline text-slate-400 group-hover:text-primary-foreground group-focus:text-primary-foreground">-</span>
                                    <span className="text-xs text-muted-foreground truncate max-w-[160px] xs:max-w-[220px] sm:max-w-none group-hover:text-primary-foreground/90 group-focus:text-primary-foreground/90">{c.name}</span>
                                  </div>
                                  {settings.currencyCode === c.code && (
                                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground group-hover:text-primary-foreground group-focus:text-primary-foreground" />
                                  )}
                                </Button>
                              ))}
                              {filteredCurrencies.length === 0 && (
                                <p className="text-center py-4 text-sm text-muted-foreground">No matching currencies found.</p>
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {/* Currency Symbol Text Input */}
                  <div className="space-y-2">
                    <Label htmlFor="currencySymbol">Currency Symbol</Label>
                    <Input
                      id="currencySymbol"
                      name="currencySymbol"
                      value={settings.currencySymbol || '₹'}
                      onChange={handleInputChange}
                      placeholder="e.g., ₹, $, €"
                      disabled={isSaving}
                    />
                  </div>

                  {/* Decimal Points Select Dropdown */}
                  <div className="space-y-2">
                    <Label htmlFor="currencyDecimalPoints">Decimal Point</Label>
                    <div className="relative">
                      <select
                        id="currencyDecimalPoints"
                        name="currencyDecimalPoints"
                        value={settings.currencyDecimalPoints !== undefined ? settings.currencyDecimalPoints : 2}
                        onChange={(e) => {
                          setSettings(prev => ({
                            ...prev,
                            currencyDecimalPoints: parseInt(e.target.value, 10)
                          }));
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSaving}
                      >
                        <option value={0}>0</option>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold">Minimum Booking Policy</h3>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableMinimumBookingPolicy" className="text-base">Enable Policy</Label>
                    <p className="text-sm text-muted-foreground">
                      Apply a visiting charge if booking total is below a set minimum.
                    </p>
                  </div>
                  <Switch
                    id="enableMinimumBookingPolicy"
                    name="enableMinimumBookingPolicy" 
                    checked={settings.enableMinimumBookingPolicy}
                    onCheckedChange={(checked) => handleSwitchChange('enableMinimumBookingPolicy', checked)}
                    disabled={isSaving}
                  />
                </div>

                {settings.enableMinimumBookingPolicy && (
                  <div className="space-y-4 pl-4 border-l-2 border-primary ml-2 pt-4">
                    <div className="space-y-2">
                      <Label htmlFor="minimumBookingAmount">Minimum Booking Amount ({settings.currencySymbol || '₹'})</Label>
                      <Input
                        id="minimumBookingAmount"
                        name="minimumBookingAmount"
                        type="number"
                        value={settings.minimumBookingAmount}
                        onChange={handleInputChange}
                        placeholder="e.g., 500"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="visitingChargeAmount">Visiting Charge Amount ({settings.currencySymbol || '₹'})</Label>
                      <Input
                        id="visitingChargeAmount"
                        name="visitingChargeAmount"
                        type="number"
                        value={settings.visitingChargeAmount}
                        onChange={handleInputChange}
                        placeholder="e.g., 100"
                        disabled={isSaving}
                      />
                      <p className="text-xs text-muted-foreground">This is the amount displayed to the user. Tax may be applied on top or included based on below setting.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minimumBookingPolicyDescription">
                        Policy Description
                        <Tooltip delayDuration={100}>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 ml-1 p-0 align-middle">
                              <AlertCircle className="h-4 w-4 text-muted-foreground"/>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">
                              Use placeholders: <code className="font-mono bg-muted p-0.5 rounded-sm">{"{MINIMUM_BOOKING_AMOUNT}"}</code> and <code className="font-mono bg-muted p-0.5 rounded-sm">{"{VISITING_CHARGE}"}</code>.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Textarea
                        id="minimumBookingPolicyDescription"
                        name="minimumBookingPolicyDescription"
                        value={settings.minimumBookingPolicyDescription}
                        onChange={handleInputChange}
                        placeholder={`e.g., A visiting charge of ${symbol}{VISITING_CHARGE} will be applied if your booking total is below ${symbol}{MINIMUM_BOOKING_AMOUNT}.`}
                        rows={3}
                        disabled={isSaving}
                      />
                    </div>
                    {/* Visiting Charge Tax Settings */}
                    <div className="pt-4 mt-4 border-t">
                        <h4 className="text-md font-semibold mb-2 flex items-center"><Percent className="mr-1.5 h-4 w-4 text-muted-foreground"/>Tax on Visiting Charge</h4>
                        <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <Label htmlFor="enableTaxOnVisitingCharge" className="text-base font-normal">Enable Tax</Label>
                                <p className="text-xs text-muted-foreground">Apply tax to the visiting charge amount.</p>
                            </div>
                            <Switch
                                id="enableTaxOnVisitingCharge"
                                name="enableTaxOnVisitingCharge"
                                checked={settings.enableTaxOnVisitingCharge}
                                onCheckedChange={(checked) => handleSwitchChange('enableTaxOnVisitingCharge', checked)}
                                disabled={isSaving}
                            />
                        </div>
                        {settings.enableTaxOnVisitingCharge && (
                          <div className="space-y-2 mt-3 pl-2">
                            <Label htmlFor="visitingChargeTaxPercent">Visiting Charge Tax Rate (%)</Label>
                            <Input
                            id="visitingChargeTaxPercent"
                            name="visitingChargeTaxPercent"
                            type="number"
                            step="0.01"
                            value={settings.visitingChargeTaxPercent}
                            onChange={handleInputChange}
                            placeholder="e.g., 5 or 18"
                            disabled={isSaving}
                            />
                            <p className="text-xs text-muted-foreground">Enter the percentage (e.g., 5 for 5%). Set to 0 for no tax.</p>
                          </div>
                        )}
                        <div className="space-y-2 mt-3 pl-2">
                          <Label htmlFor="isVisitingChargeTaxInclusive" className={!canSetVcTaxInclusive ? "text-muted-foreground" : ""}>Visiting Charge Price Type</Label>
                          <Dialog open={isVcTaxPickerOpen} onOpenChange={setIsVcTaxPickerOpen}>
                            <DialogTrigger asChild>
                              <Button
                                id="isVisitingChargeTaxInclusive"
                                variant="outline"
                                role="combobox"
                                aria-expanded={isVcTaxPickerOpen}
                                className="w-full justify-between text-left font-normal h-10"
                                disabled={isSaving || !canSetVcTaxInclusive}
                                type="button"
                              >
                                <span>
                                  {settings.isVisitingChargeTaxInclusive
                                    ? "Tax Inclusive (Charge includes Tax)"
                                    : "Tax Exclusive (Charge + Tax)"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[425px]">
                              <DialogHeader>
                                <DialogTitle>Select Price Tax Type</DialogTitle>
                                <DialogDescription>
                                  Choose how tax is calculated on the visiting charge.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="py-4">
                                <ScrollArea className="h-[150px] rounded-md border p-2">
                                  <div className="space-y-1">
                                    <Button
                                      variant={!settings.isVisitingChargeTaxInclusive ? "secondary" : "ghost"}
                                      className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                      onClick={() => {
                                        handleSelectChange('isVisitingChargeTaxInclusive', 'false');
                                        setIsVcTaxPickerOpen(false);
                                      }}
                                      type="button"
                                    >
                                      <span className="font-semibold text-sm">Tax Exclusive (Charge + Tax)</span>
                                      {!settings.isVisitingChargeTaxInclusive && (
                                        <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                      )}
                                    </Button>
                                    <Button
                                      variant={settings.isVisitingChargeTaxInclusive ? "secondary" : "ghost"}
                                      className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                      onClick={() => {
                                        handleSelectChange('isVisitingChargeTaxInclusive', 'true');
                                        setIsVcTaxPickerOpen(false);
                                      }}
                                      type="button"
                                    >
                                      <span className="font-semibold text-sm">Tax Inclusive (Charge includes Tax)</span>
                                      {settings.isVisitingChargeTaxInclusive && (
                                        <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                      )}
                                    </Button>
                                  </div>
                                </ScrollArea>
                              </div>
                            </DialogContent>
                          </Dialog>
                          {!canSetVcTaxInclusive && <p className="text-xs text-muted-foreground">Enable tax on visiting charge and set a rate  0 to configure this.</p>}
                        </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><PlaySquare className="mr-2 h-5 w-5 text-muted-foreground"/>Homepage Hero Carousel</h3>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableHeroCarousel" className="text-base">Enable Hero Carousel</Label>
                    <p className="text-sm text-muted-foreground">
                      Show or hide the main slideshow on the homepage.
                    </p>
                  </div>
                  <Switch
                    id="enableHeroCarousel"
                    name="enableHeroCarousel" 
                    checked={settings.enableHeroCarousel}
                    onCheckedChange={(checked) => handleSwitchChange('enableHeroCarousel', checked)}
                    disabled={isSaving}
                  />
                </div>
                {settings.enableHeroCarousel && (
                  <div className="space-y-4 pl-4 border-l-2 border-primary ml-2 pt-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="enableCarouselAutoplay" className="text-base">Enable Autoplay</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically transition between slides.
                        </p>
                      </div>
                      <Switch
                        id="enableCarouselAutoplay"
                        name="enableCarouselAutoplay"
                        checked={settings.enableCarouselAutoplay}
                        onCheckedChange={(checked) => handleSwitchChange('enableCarouselAutoplay', checked)}
                        disabled={isSaving}
                      />
                    </div>
                    {settings.enableCarouselAutoplay && (
                       <div className="space-y-2">
                        <Label htmlFor="carouselAutoplayDelay">Autoplay Delay (milliseconds)</Label>
                        <Input
                          id="carouselAutoplayDelay"
                          name="carouselAutoplayDelay"
                          type="number"
                          value={settings.carouselAutoplayDelay}
                          onChange={handleInputChange}
                          placeholder="e.g., 5000"
                          disabled={isSaving}
                          min="1000" 
                        />
                        <p className="text-xs text-muted-foreground">Time between slide transitions (e.g., 5000 for 5 seconds). Min: 1000ms.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><Activity className="mr-2 h-5 w-5 text-muted-foreground"/>Performance & Logging</h3>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableVisitorLogging" className="text-base">Enable Visitor IP & Location Logging</Label>
                    <p className="text-sm text-muted-foreground">
                      Track page visits, IP addresses, city, country, browser, and ISP data to show in Visitor Info tab. Disable to stop visitor tracking and reduce database connection usage.
                    </p>
                  </div>
                  <Switch
                    id="enableVisitorLogging"
                    name="enableVisitorLogging" 
                    checked={settings.enableVisitorLogging}
                    onCheckedChange={(checked) => handleSwitchChange('enableVisitorLogging', checked)}
                    disabled={isSaving}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableUserPresence" className="text-base">Enable User Presence Tracking (Last Seen)</Label>
                    <p className="text-sm text-muted-foreground">
                      Keep track of user and provider online status (last seen timestamp). Disable to save database connection limit.
                    </p>
                  </div>
                  <Switch
                    id="enableUserPresence"
                    name="enableUserPresence" 
                    checked={settings.enableUserPresence}
                    onCheckedChange={(checked) => handleSwitchChange('enableUserPresence', checked)}
                    disabled={isSaving}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableKeyboardSuggestions" className="text-base">Enable Keyboard Suggestions</Label>
                    <p className="text-sm text-muted-foreground">
                      Allow mobile virtual keyboards to show text recommendations and autocompletes. Disable to keep suggestions bar hidden.
                    </p>
                  </div>
                  <Switch
                    id="enableKeyboardSuggestions"
                    name="enableKeyboardSuggestions" 
                    checked={settings.enableKeyboardSuggestions ?? true}
                    onCheckedChange={(checked) => handleSwitchChange('enableKeyboardSuggestions', checked)}
                    disabled={isSaving}
                  />
                </div>
              </div>

              <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><MapIcon className="mr-2 h-5 w-5 text-muted-foreground"/>Google Maps Configuration</h3>
                 <div className="space-y-2">
                    <Label htmlFor="googleMapsApiKey">Google Maps API Key</Label>
                    <Input
                      id="googleMapsApiKey"
                      name="googleMapsApiKey"
                      type="text"
                      value={settings.googleMapsApiKey}
                      onChange={handleInputChange}
                      placeholder="Enter your Google Maps API Key"
                      disabled={isSaving}
                    />
                    <p className="text-xs text-muted-foreground">Used for address selection and location-based features.</p>
                  </div>
              </div>

               <div className="space-y-4 p-4 border rounded-md shadow-sm">
                <h3 className="text-lg font-semibold flex items-center"><MailIcon className="mr-2 h-5 w-5 text-muted-foreground"/>Email Configuration (SMTP)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="smtpHost">SMTP Host</Label>
                        <Input id="smtpHost" name="smtpHost" value={settings.smtpHost} onChange={handleInputChange} placeholder="e.g., smtp.example.com" disabled={isSaving}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtpPort">SMTP Port</Label>
                        <Input id="smtpPort" name="smtpPort" type="text" value={settings.smtpPort} onChange={handleInputChange} placeholder="e.g., 587 or 465" disabled={isSaving}/>
                    </div>
                  </div>
                  <div className="space-y-2">
                      <Label htmlFor="senderEmail">Sender Email Address</Label>
                      <Input id="senderEmail" name="senderEmail" type="email" value={settings.senderEmail} onChange={handleInputChange} placeholder="e.g., no-reply@yourdomain.com" disabled={isSaving}/>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="smtpUser">SMTP Username</Label>
                        <Input id="smtpUser" name="smtpUser" value={settings.smtpUser} onChange={handleInputChange} placeholder="Your SMTP username" disabled={isSaving}/>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="smtpPass">SMTP Password</Label>
                        <Input id="smtpPass" name="smtpPass" type="password" value={settings.smtpPass} onChange={handleInputChange} placeholder="Your SMTP password" disabled={isSaving}/>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Used for sending booking confirmations and other system emails.</p>
              </div>

            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("General")} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save General Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="payment">
          <Card>
            <CardHeader>
              <CardTitle>Payment Gateway Settings</CardTitle>
              <CardDescription>Configure payment methods and gateway credentials.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableOnlinePayment" className="text-base">Enable Online Payments (Razorpay & Stripe)</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow customers to pay using online methods like UPI, Cards, Netbanking.
                  </p>
                </div>
                <Switch
                  id="enableOnlinePayment"
                  name="enableOnlinePayment" 
                  checked={settings.enableOnlinePayment}
                  onCheckedChange={(checked) => handleSwitchChange('enableOnlinePayment', checked)}
                  disabled={isSaving}
                />
              </div>

              {settings.enableOnlinePayment && (
                <div className="space-y-6 pl-4 border-l-2 border-primary ml-2 pt-4">
                  {/* Razorpay Configurations */}
                  <div className="space-y-4 rounded-xl border p-4 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-md font-bold">Razorpay Payment Gateway</Label>
                        <p className="text-xs text-muted-foreground">Enable Razorpay checkout payments.</p>
                      </div>
                      <Switch
                        id="enableRazorpay"
                        name="enableRazorpay"
                        checked={settings.enableRazorpay}
                        onCheckedChange={(checked) => handleSwitchChange('enableRazorpay', checked)}
                        disabled={isSaving}
                      />
                    </div>
                    {settings.enableRazorpay && (
                      <div className="space-y-4 pt-2 border-t border-dashed">
                        <div className="space-y-2">
                          <Label htmlFor="razorpayKeyId">Razorpay Key ID</Label>
                          <Input
                            id="razorpayKeyId"
                            name="razorpayKeyId"
                            value={settings.razorpayKeyId || ""}
                            onChange={handleInputChange}
                            placeholder="rzp_live_xxxxxxxxxxxxxx"
                            disabled={isSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="razorpayKeySecret">Razorpay Key Secret</Label>
                          <Input
                            id="razorpayKeySecret"
                            name="razorpayKeySecret"
                            type="password"
                            value={settings.razorpayKeySecret || ""}
                            onChange={handleInputChange}
                            placeholder="••••••••••••••••••••••"
                            disabled={isSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="razorpayWebhookSecret">Razorpay Webhook Secret</Label>
                          <Input
                            id="razorpayWebhookSecret"
                            name="razorpayWebhookSecret"
                            type="password"
                            value={settings.razorpayWebhookSecret || ""}
                            onChange={handleInputChange}
                            placeholder="••••••••••••••••••••••"
                            disabled={isSaving}
                          />
                          <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                            Required to authenticate webhook callbacks from Razorpay.
                          </p>
                        </div>
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-xs">
                          <p className="font-bold text-primary mb-1 uppercase tracking-wider text-[10px]">Razorpay Webhook Endpoint URL:</p>
                          <div className="flex gap-2 items-center">
                            <code className="flex-1 block select-all bg-background border rounded px-2 py-1.5 font-mono text-[11px] text-foreground font-semibold break-all">
                              {typeof window !== 'undefined' ? `${window.location.origin}/api/razorpay/webhook` : "/api/razorpay/webhook"}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0 bg-background"
                              onClick={() => {
                                const url = typeof window !== 'undefined' ? `${window.location.origin}/api/razorpay/webhook` : "/api/razorpay/webhook";
                                navigator.clipboard.writeText(url);
                                setCopiedRazorpay(true);
                                setTimeout(() => setCopiedRazorpay(false), 2000);
                              }}
                            >
                              {copiedRazorpay ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5 leading-normal">
                            Register this URL in your Razorpay Dashboard under Settings &gt; Webhooks.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stripe Configurations */}
                  <div className="space-y-4 rounded-xl border p-4 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-md font-bold">Stripe Payment Gateway</Label>
                        <p className="text-xs text-muted-foreground">Enable Stripe checkout payments.</p>
                      </div>
                      <Switch
                        id="enableStripe"
                        name="enableStripe"
                        checked={settings.enableStripe}
                        onCheckedChange={(checked) => handleSwitchChange('enableStripe', checked)}
                        disabled={isSaving}
                      />
                    </div>
                    {settings.enableStripe && (
                      <div className="space-y-4 pt-2 border-t border-dashed">
                        <div className="space-y-2">
                          <Label htmlFor="stripePublishableKey">Stripe Publishable Key</Label>
                          <Input
                            id="stripePublishableKey"
                            name="stripePublishableKey"
                            value={settings.stripePublishableKey || ""}
                            onChange={handleInputChange}
                            placeholder="pk_live_xxxxxxxxxxxxxx"
                            disabled={isSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stripeSecretKey">Stripe Secret Key</Label>
                          <Input
                            id="stripeSecretKey"
                            name="stripeSecretKey"
                            type="password"
                            value={settings.stripeSecretKey || ""}
                            onChange={handleInputChange}
                            placeholder="sk_live_xxxxxxxxxxxxxx"
                            disabled={isSaving}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stripeWebhookSecret">Stripe Webhook Secret</Label>
                          <Input
                            id="stripeWebhookSecret"
                            name="stripeWebhookSecret"
                            type="password"
                            value={settings.stripeWebhookSecret || ""}
                            onChange={handleInputChange}
                            placeholder="whsec_xxxxxxxxxxxxxx"
                            disabled={isSaving}
                          />
                          <p className="text-[10px] text-muted-foreground leading-normal mt-1">
                            Required to authenticate webhook callbacks from Stripe.
                          </p>
                        </div>
                        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 text-xs">
                          <p className="font-bold text-primary mb-1 uppercase tracking-wider text-[10px]">Stripe Webhook Endpoint URL:</p>
                          <div className="flex gap-2 items-center">
                            <code className="flex-1 block select-all bg-background border rounded px-2 py-1.5 font-mono text-[11px] text-foreground font-semibold break-all">
                              {typeof window !== 'undefined' ? `${window.location.origin}/api/stripe/webhook` : "/api/stripe/webhook"}
                            </code>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 shrink-0 bg-background"
                              onClick={() => {
                                const url = typeof window !== 'undefined' ? `${window.location.origin}/api/stripe/webhook` : "/api/stripe/webhook";
                                navigator.clipboard.writeText(url);
                                setCopiedStripe(true);
                                setTimeout(() => setCopiedStripe(false), 2000);
                              }}
                            >
                              {copiedStripe ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5 leading-normal">
                            Register this URL in your Stripe Dashboard under Developers &gt; Webhooks. Select event: <strong className="text-foreground">checkout.session.completed</strong>.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableCOD" className="text-base">Enable "Pay After Service"</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow customers to opt for paying after the service is completed.
                  </p>
                </div>
                <Switch
                  id="enableCOD"
                  name="enableCOD" 
                  checked={settings.enableCOD}
                  onCheckedChange={(checked) => handleSwitchChange('enableCOD', checked)}
                  disabled={isSaving}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("Payment")} disabled={isSaving}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Payment Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="provider">
            <Card>
                <CardHeader>
                    <CardTitle>Provider Settings</CardTitle>
                    <CardDescription>Configurations related to service providers.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                      <Label htmlFor="maxProviderRadiusKm">Max Provider Service Radius (km)</Label>
                      <Input
                        id="maxProviderRadiusKm"
                        name="maxProviderRadiusKm"
                        type="number"
                        value={settings.maxProviderRadiusKm}
                        onChange={handleInputChange}
                        placeholder="e.g., 30"
                        disabled={isSaving}
                        min="1"
                      />
                      <p className="text-xs text-muted-foreground">Sets the maximum service radius a provider can select during registration.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="autoDispatchRadiusKm">Auto-Dispatch Radius (km)</Label>
                      <Input
                        id="autoDispatchRadiusKm"
                        name="autoDispatchRadiusKm"
                        type="number"
                        value={settings.autoDispatchRadiusKm ?? 5}
                        onChange={handleInputChange}
                        placeholder="e.g., 5"
                        disabled={isSaving}
                        min="1"
                        max="50"
                      />
                      <p className="text-xs text-muted-foreground">Nearby providers within this radius will be automatically assigned to new bookings.</p>
                    </div>
                </CardContent>
                <CardFooter className="border-t px-6 py-4">
                    <Button onClick={() => handleSaveSettings("Provider")} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Provider Settings
                    </Button>
                </CardFooter>
            </Card>
        </TabsContent>

        <TabsContent value="slots">
          <Card>
            <CardHeader>
              <CardTitle>Time Slot Configuration</CardTitle>
              <CardDescription>Set your working hours for each day of the week. This will determine the available booking slots for customers.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="timeSlotSettings.slotIntervalMinutes">Slot Interval (minutes)</Label>
                        <Input
                            id="timeSlotSettings.slotIntervalMinutes"
                            name="timeSlotSettings.slotIntervalMinutes"
                            type="number"
                            value={settings.timeSlotSettings.slotIntervalMinutes}
                            onChange={handleInputChange}
                            placeholder="e.g., 60"
                            disabled={isSaving}
                            min="15" 
                        />
                        <p className="text-xs text-muted-foreground">Duration of each booking slot (e.g., 30, 60, 90 minutes).</p>
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="timeSlotSettings.breakTimeMinutes">Break Time (minutes)</Label>
                        <Input
                            id="timeSlotSettings.breakTimeMinutes"
                            name="timeSlotSettings.breakTimeMinutes"
                            type="number"
                            value={settings.timeSlotSettings.breakTimeMinutes !== undefined ? settings.timeSlotSettings.breakTimeMinutes : 0}
                            onChange={handleInputChange}
                            placeholder="e.g., 15"
                            disabled={isSaving}
                            min="0"
                        />
                        <p className="text-xs text-muted-foreground">Buffer time added after each appointment slot.</p>
                    </div>
                </div>
                
                <h3 className="text-lg font-semibold pt-4 border-t">Weekly Availability</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderWeeklyAvailability()}
                </div>

              <div className="flex items-center justify-between rounded-lg border p-4 mt-6">
                <div className="space-y-0.5">
                  <Label htmlFor="enableLimitLateBookings" className="text-base">Limit Late Bookings</Label>
                  <p className="text-sm text-muted-foreground">
                    Prevent customers from booking too close to the current time.
                  </p>
                </div>
                <Switch
                  id="enableLimitLateBookings"
                  name="enableLimitLateBookings"
                  checked={settings.enableLimitLateBookings}
                  onCheckedChange={(checked) => handleSwitchChange('enableLimitLateBookings', checked)}
                  disabled={isSaving}
                />
              </div>

              {settings.enableLimitLateBookings && (
                <div className="space-y-1 pl-4 border-l-2 border-primary ml-2">
                  <Label htmlFor="limitLateBookingHours">Booking Delay (hours)</Label>
                  <Input
                    id="limitLateBookingHours"
                    name="limitLateBookingHours"
                    type="number"
                    value={settings.limitLateBookingHours}
                    onChange={handleInputChange}
                    placeholder="e.g., 4"
                    disabled={isSaving}
                    min="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum hours before a slot becomes available from the current time.
                  </p>
                </div>
              )}

            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("Time Slot")} disabled={isSaving}>
                 {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Time Slot Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="cancellation">
          <Card>
            <CardHeader>
              <CardTitle>Cancellation Policy Settings</CardTitle>
              <CardDescription>Define rules for booking cancellations and associated fees.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableCancellationPolicy" className="text-base">Enable Cancellation Policy</Label>
                  <p className="text-sm text-muted-foreground">
                    If disabled, users can cancel freely. If enabled, below rules apply.
                  </p>
                </div>
                <Switch
                  id="enableCancellationPolicy"
                  name="enableCancellationPolicy" 
                  checked={settings.enableCancellationPolicy}
                  onCheckedChange={(checked) => handleSwitchChange('enableCancellationPolicy', checked)}
                  disabled={isSaving}
                />
              </div>

              {settings.enableCancellationPolicy && (
                <div className="space-y-4 pl-4 border-l-2 border-primary ml-2 pt-4">
                  <h4 className="text-md font-semibold">Free Cancellation Window (before service start)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="freeCancellationDays">Days</Label>
                      <Input id="freeCancellationDays" name="freeCancellationDays" type="number" min="0" value={settings.freeCancellationDays ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 1" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="freeCancellationHours">Hours</Label>
                      <Input id="freeCancellationHours" name="freeCancellationHours" type="number" min="0" max="23" value={settings.freeCancellationHours ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 2"/>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="freeCancellationMinutes">Minutes</Label>
                      <Input id="freeCancellationMinutes" name="freeCancellationMinutes" type="number" min="0" max="59" value={settings.freeCancellationMinutes ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 30"/>
                    </div>
                  </div>
                   <p className="text-xs text-muted-foreground">Timeframe before service start within which cancellation is free. Values are cumulative (e.g., 1 day & 2 hours).</p>


                  <h4 className="text-md font-semibold pt-3">Cancellation Fee (if outside free window)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="cancellationFeeType">Fee Type</Label>
                      <Dialog open={isCancelFeeTypePickerOpen} onOpenChange={setIsCancelFeeTypePickerOpen}>
                        <DialogTrigger asChild>
                          <Button
                            id="cancellationFeeType"
                            variant="outline"
                            role="combobox"
                            aria-expanded={isCancelFeeTypePickerOpen}
                            className="w-full justify-between text-left font-normal h-10"
                            disabled={isSaving}
                            type="button"
                          >
                            <span>
                              {settings.cancellationFeeType === 'percentage'
                                ? "Percentage (%)"
                                : `Fixed Amount (${symbol})`}
                            </span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Select Cancellation Fee Type</DialogTitle>
                            <DialogDescription>
                              Choose how the fee is calculated.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            <ScrollArea className="h-[150px] rounded-md border p-2">
                              <div className="space-y-1">
                                <Button
                                  variant={settings.cancellationFeeType !== 'percentage' ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                  onClick={() => {
                                    handleSelectChange('cancellationFeeType', 'fixed');
                                    setIsCancelFeeTypePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="font-semibold text-sm">Fixed Amount ({symbol})</span>
                                  {settings.cancellationFeeType !== 'percentage' && (
                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                  )}
                                </Button>
                                <Button
                                  variant={settings.cancellationFeeType === 'percentage' ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-3 px-3 relative group"
                                  onClick={() => {
                                    handleSelectChange('cancellationFeeType', 'percentage');
                                    setIsCancelFeeTypePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="font-semibold text-sm">Percentage (%)</span>
                                  {settings.cancellationFeeType === 'percentage' && (
                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                  )}
                                </Button>
                              </div>
                            </ScrollArea>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cancellationFeeValue">Fee Value</Label>
                      <Input id="cancellationFeeValue" name="cancellationFeeValue" type="number" min="0" value={settings.cancellationFeeValue ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder={settings.cancellationFeeType === 'percentage' ? "e.g., 10 (for 10%)" : `e.g., 50 (for ${symbol}50)`} />
                    </div>
                  </div>
                   <p className="text-xs text-muted-foreground">If percentage, it's based on the booking's total amount.</p>

                  <div className="flex items-center justify-between rounded-lg border p-4 mt-6">
                    <div className="space-y-0.5">
                      <Label htmlFor="enableFinalCancellationWindow" className="text-base">Enable Final Restricted Cancellation Window</Label>
                      <p className="text-sm text-muted-foreground">
                        If enabled, cancellations made within this final restricted window before service start will receive a 100% cancellation charge (no refund).
                      </p>
                    </div>
                    <Switch
                      id="enableFinalCancellationWindow"
                      name="enableFinalCancellationWindow" 
                      checked={settings.enableFinalCancellationWindow}
                      onCheckedChange={(checked) => handleSwitchChange('enableFinalCancellationWindow', checked)}
                      disabled={isSaving}
                    />
                  </div>

                  {settings.enableFinalCancellationWindow && (
                    <div className="space-y-4 pl-4 border-l-2 border-destructive ml-2 pt-2 mt-4">
                      <h4 className="text-md font-semibold text-destructive">Final Restricted Window (before service start)</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label htmlFor="finalCancellationHours">Hours</Label>
                          <Input id="finalCancellationHours" name="finalCancellationHours" type="number" min="0" max="23" value={settings.finalCancellationHours ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 3"/>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="finalCancellationMinutes">Minutes</Label>
                          <Input id="finalCancellationMinutes" name="finalCancellationMinutes" type="number" min="0" max="59" value={settings.finalCancellationMinutes ?? 0} onChange={handleInputChange} disabled={isSaving} placeholder="e.g., 0"/>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Timeframe before service start within which cancellation is fully charged (₹0 refund).</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <Button onClick={() => handleSaveSettings("Cancellation Policy")} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Cancellation Settings
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Manage how system notifications and emails are sent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableStatusUpdateEmails" className="text-base">Status Update Emails</Label>
                  <p className="text-sm text-muted-foreground">
                    Send emails to customers when their booking status changes (e.g., Assigned, In Progress). 
                    <br/>
                    <span className="text-xs text-primary font-medium">Note: Confirmation, Completion, and Cancellation emails are always sent.</span>
                  </p>
                </div>
                <Switch
                  id="enableStatusUpdateEmails"
                  name="enableStatusUpdateEmails" 
                  checked={settings.enableStatusUpdateEmails}
                  onCheckedChange={(checked) => handleSwitchChange('enableStatusUpdateEmails', checked)}
                  disabled={isSaving}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableAccountDisabledEmail" className="text-base">Account Disabled Notification & Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Send notification and email to users when their account is disabled by the admin.
                  </p>
                </div>
                <Switch
                  id="enableAccountDisabledEmail"
                  name="enableAccountDisabledEmail" 
                  checked={settings.enableAccountDisabledEmail}
                  onCheckedChange={(checked) => handleSwitchChange('enableAccountDisabledEmail', checked)}
                  disabled={isSaving}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="enableAccountActivatedEmail" className="text-base">Account Activated Email</Label>
                  <p className="text-sm text-muted-foreground">
                    Send email to users when their account is activated (unblocked) by the admin.
                  </p>
                </div>
                <Switch
                  id="enableAccountActivatedEmail"
                  name="enableAccountActivatedEmail" 
                  checked={settings.enableAccountActivatedEmail}
                  onCheckedChange={(checked) => handleSwitchChange('enableAccountActivatedEmail', checked)}
                  disabled={isSaving}
                />
              </div>
            </CardContent>
            <CardFooter className="border-t px-6 py-4">
              <PermissionGuard moduleId="settings" action="write">
                <Button onClick={() => handleSaveSettings("Notification")} disabled={isSaving}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Notification Settings
                </Button>
              </PermissionGuard>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="leaves">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Leaves & Holidays</CardTitle>
                <CardDescription>Configure leaves and holidays to block service bookings during specific periods.</CardDescription>
              </div>
              <Dialog open={isAddLeaveDialogOpen} onOpenChange={(open) => {
                setIsAddLeaveDialogOpen(open);
                if (!open) {
                  setEditingLeaveId(null);
                  setLeaveStartDate("");
                  setLeaveEndDate("");
                  setLeaveType("full_day");
                  setLeaveStartTime("09:00");
                  setLeaveEndTime("17:00");
                  setLeaveReason("");
                }
              }}>
                <Button 
                  type="button" 
                  size="sm" 
                  className="h-9"
                  onClick={() => {
                    setEditingLeaveId(null);
                    setLeaveStartDate("");
                    setLeaveEndDate("");
                    setLeaveType("full_day");
                    setLeaveStartTime("09:00");
                    setLeaveEndTime("17:00");
                    setLeaveReason("");
                    setIsAddLeaveDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Leave / Holiday
                </Button>
                <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>{editingLeaveId ? "Edit Leave / Holiday" : "Add Leave / Holiday"}</DialogTitle>
                    <DialogDescription>
                      {editingLeaveId ? "Modify this schedule blockout." : "Create a new schedule blockout. Bookings will be prevented during this time."}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="leaveStartDate">Start Date</Label>
                        <Input
                          id="leaveStartDate"
                          type="date"
                          value={leaveStartDate}
                          onChange={(e) => setLeaveStartDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="leaveEndDate">End Date</Label>
                        <Input
                          id="leaveEndDate"
                          type="date"
                          value={leaveEndDate}
                          onChange={(e) => setLeaveEndDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1 flex flex-col">
                      <Label className="mb-2">Leave Type</Label>
                      <Dialog open={isLeaveTypePickerOpen} onOpenChange={setIsLeaveTypePickerOpen}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between text-left font-normal h-10"
                            type="button"
                          >
                            <span>{leaveType === 'full_day' ? 'Full Day Leave' : 'Partial Day (Custom Hours)'}</span>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-[425px]">
                          <DialogHeader>
                            <DialogTitle>Select Leave Type</DialogTitle>
                            <DialogDescription>Choose if the entire day or specific hours are blocked.</DialogDescription>
                          </DialogHeader>
                          <div className="py-4">
                            <ScrollArea className="h-[150px] rounded-md border p-2">
                              <div className="space-y-1">
                                <Button
                                  variant={leaveType === 'full_day' ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                  onClick={() => {
                                    setLeaveType('full_day');
                                    setIsLeaveTypePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="font-semibold text-sm">Full Day Leave</span>
                                  {leaveType === 'full_day' && (
                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                  )}
                                </Button>
                                <Button
                                  variant={leaveType === 'partial_day' ? "secondary" : "ghost"}
                                  className="w-full justify-start text-left h-auto py-3 px-3 relative"
                                  onClick={() => {
                                    setLeaveType('partial_day');
                                    setIsLeaveTypePickerOpen(false);
                                  }}
                                  type="button"
                                >
                                  <span className="font-semibold text-sm">Partial Day (Custom Hours)</span>
                                  {leaveType === 'partial_day' && (
                                    <Check className="absolute right-3 top-3 h-4 w-4 text-green-500" />
                                  )}
                                </Button>
                              </div>
                            </ScrollArea>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    {leaveType === 'partial_day' && (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border">
                        <div className="space-y-1">
                          <Label htmlFor="leaveStartTime">Start Time</Label>
                          <Input
                            id="leaveStartTime"
                            type="time"
                            value={leaveStartTime}
                            onChange={(e) => setLeaveStartTime(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="leaveEndTime">End Time</Label>
                          <Input
                            id="leaveEndTime"
                            type="time"
                            value={leaveEndTime}
                            onChange={(e) => setLeaveEndTime(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor="leaveReason">Reason / Holiday Name</Label>
                      <Input
                        id="leaveReason"
                        placeholder="e.g. Independence Day, Annual Maintenance"
                        value={leaveReason}
                        onChange={(e) => setLeaveReason(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-3 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsAddLeaveDialogOpen(false)}>Cancel</Button>
                    <Button type="button" onClick={handleSaveLeave} disabled={isSavingLeave}>
                      {isSavingLeave ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      {editingLeaveId ? "Update Leave" : "Save Leave"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {isLoadingLeaves ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading leaves and holidays...</p>
                </div>
              ) : leaves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-xl bg-muted/10">
                  <CalendarDays className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <h3 className="text-base font-semibold">No leaves or holidays configured</h3>
                  <p className="text-sm text-muted-foreground max-w-xs mt-1">Configure holidays or staff leaves to block checkout slots.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-muted text-muted-foreground text-xs uppercase font-semibold">
                      <tr>
                        <th className="p-3">Date Range</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">Hours blocked</th>
                        <th className="p-3">Reason</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {leaves.map((leave) => (
                        <tr key={leave.id} className="hover:bg-muted/20">
                          <td className="p-3 font-medium">
                            {leave.startDate === leave.endDate 
                              ? leave.startDate 
                              : `${leave.startDate} to ${leave.endDate}`}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${leave.leaveType === 'full_day' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                              {leave.leaveType === 'full_day' ? 'Full Day' : 'Partial Day'}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {leave.leaveType === 'full_day' 
                              ? 'All Day (Full Block)' 
                              : `${leave.startTime} - ${leave.endTime}`}
                          </td>
                          <td className="p-3 font-medium">{leave.reason}</td>
                          <td className="p-3 text-right flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditLeaveClick(leave)}
                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteLeave(leave.id)}
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
    </TooltipProvider>
  );
}
