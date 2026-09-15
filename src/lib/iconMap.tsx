"use client";

import { 
  Car, Droplets, Home, PaintRoller, PlugZap, ShieldCheck, Sparkles, Star, Users, 
  Utensils, Wrench, Layers, ShoppingBag, Settings, List, LayoutGrid, BarChart3, 
  Tag, PackageSearch, MapPin, CreditCard, CheckCircle2, CalendarDays, MessageSquare, 
  Clock, Bell, Menu, X, LogOut, UserCircle, Briefcase, ArrowLeft, HomeIcon as HomeIconLucide, // Renamed to avoid conflict
  ShoppingCart as ShoppingCartIcon, // Renamed to avoid conflict
  LocateFixed, Info, IndianRupee, Landmark, Wallet, Download, ListOrdered, Building, AirVent, Refrigerator, Shirt,
  Hammer, PlaySquare, Settings2, HelpCircle, AlertTriangle, FileText // Added FileText
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const iconMap: { [key: string]: LucideIcon } = {
  Car,
  Droplets,
  Home,
  PaintRoller,
  PlugZap,
  ShieldCheck,
  Sparkles,
  Star, // Used for rating, can also be used for Reviews menu item
  Users,
  Utensils,
  Wrench,
  Layers,
  ShoppingBag,
  Settings,
  List,
  LayoutGrid,
  BarChart3,
  Tag, // Can be used for booking_update or admin_alert
  PackageSearch, // Used in MyBookings for empty state
  MapPin,
  CreditCard,
  CheckCircle2, // Good for success notifications
  CalendarDays,
  MessageSquare, // Good for reviews/feedback
  Clock,
  Bell, // Default for 'info' or generic notifications
  Menu,
  X,
  LogOut,
  UserCircle,
  Briefcase,
  ArrowLeft,
  HomeIcon: HomeIconLucide, 
  ShoppingCart: ShoppingCartIcon,
  LocateFixed,
  Info, // Good for info notifications
  IndianRupee,
  Landmark,
  Wallet,
  Download,
  ListOrdered,
  Building, // Generic building, could be useful
  AirVent, // For AC specific things
  Refrigerator, // For Refrigerator specific things
  Shirt, // For laundry or similar
  Hammer, // Added for carpenter
  PlaySquare, // Added for slideshow
  Settings2, // Added for Web Settings
  HelpCircle, // Added for FAQ
  AlertTriangle, // Good for warning or error notifications
  FileText, // Added for Blog
  Default: PackageSearch, // Fallback icon
};

export const getIconComponent = (iconName?: string): LucideIcon => {
  if (!iconName) {
    // console.warn("Icon name not provided, using default.");
    return iconMap.Default;
  }

  const directMatch = iconMap[iconName];
  if (directMatch) {
    return directMatch;
  }

  // Attempt case-insensitive match
  const lowerIconName = iconName.toLowerCase();
  for (const key in iconMap) {
    if (key.toLowerCase() === lowerIconName) {
      return iconMap[key];
    }
  }
  
  // Attempt to match common variations like "HomeIcon" -> "Home"
  if (iconName.endsWith("Icon")) {
    const strippedName = iconName.slice(0, -4);
    if (iconMap[strippedName]) return iconMap[strippedName];
    const capitalizedStrippedName = strippedName.charAt(0).toUpperCase() + strippedName.slice(1);
    if (iconMap[capitalizedStrippedName]) return iconMap[capitalizedStrippedName];
  }


  console.warn(`Icon "${iconName}" not found in map, using default. Available icons: ${Object.keys(iconMap).join(', ')}`);
  return iconMap.Default;
};
