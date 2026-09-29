
import type { Icon as LucideIconType } from 'lucide-react';
import { Timestamp } from '@/lib/mysqlDb';

export { Timestamp };

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FirestoreCategory {
  id: string; // Firestore document ID
  name: string;
  slug: string;
  order: number;
  isActive?: boolean; // New field
  imageUrl?: string;
  imageHint?: string;
  h1_title?: string; // SEO: H1 title for the category page
  seo_title?: string; // SEO: Meta title for the category page
  seo_description?: string; // SEO: Meta description
  seo_keywords?: string; // SEO: Meta keywords (comma-separated)
  seo_content?: string; // NEW: Long-form SEO content/bio for the category
  faqs?: FaqItem[]; // NEW: SEO FAQs for the category
  meta_title?: string; // NEW: Consistency with other SEO models
  meta_description?: string; // NEW: Consistency with other SEO models
  meta_keywords?: string; // NEW: Consistency with other SEO models
  metaTitle?: string; // Legacy/Alternative SEO meta title
  metaDescription?: string; // Legacy/Alternative SEO meta description
  metaKeywords?: string; // Legacy/Alternative SEO meta keywords
  createdAt?: Timestamp;
  visitingChargeAmount?: number;
  minimumBookingAmount?: number;
  minimumBookingPolicyDescription?: string;
}

export interface FirestoreSubCategory {
  id: string; // Firestore document ID
  parentId: string; // ID of the parent FirestoreCategory
  parentCategoryId?: string; // Consistency
  parentCategoryName: string; // Denormalized
  name: string;
  slug: string;
  order: number;
  isActive?: boolean; // New field
  isHidden?: boolean; // Visibility toggle
  imageUrl?: string;
  imageHint?: string;
  h1_title?: string;
  createdAt?: Timestamp;
}

export interface ServiceFaqItem {
  id?: string; // For React key in form
  question: string;
  answer: string;
}

// New type for Price Variation
export interface PriceVariant {
  id: string; // For React key
  fromQuantity: number;
  toQuantity?: number | null; // Optional for open-ended ranges like "6 and up"
  price: number;
}

export interface FirestoreService {
  id: string; // Firestore document ID
  subCategoryId: string; // ID of the parent FirestoreSubCategory
  parentCategoryId?: string; // Optional denormalized parent category ID
  name: string;
  slug: string;
  order?: number; // New field for service ordering
  description: string; // Short description for cards
  price: number; // This is the DISPLAYED price (can be inclusive or exclusive of tax)
  isTaxInclusive?: boolean; // True if the 'price' field already includes tax
  discountedPrice?: number | null; // This is also DISPLAYED price
  
  hasPriceVariants?: boolean; // New: Toggle for tiered pricing
  priceVariants?: PriceVariant[]; // New: Array for pricing tiers

  rating: number; // Default rating, can be an aggregate
  reviewCount?: number;
  minQuantity?: number | null; // New field for minimum booking quantity
  hasMinQuantity?: boolean; // New field to enable/disable min quantity
  maxQuantity?: number | null; // Maximum quantity a user can book
  imageUrl?: string; // Main image for the service detail page
  imageHint?: string; // AI hint for the main image
  isActive: boolean;
  shortDescription?: string | null; // Could be same as description or a slightly longer version
  fullDescription?: string | null; // Detailed description for service page
  serviceHighlights?: string[];
  taxId?: string | null; // Allow null for "No Tax"
  taxName?: string; // Denormalized tax name
  taxPercent?: number; // Denormalized tax percentage
  h1_title?: string | null; // SEO: H1 title for the service page
  seo_title?: string | null; // SEO: Meta title for the service page
  seo_description?: string | null; // SEO: Meta description
  seo_keywords?: string | null; // SEO: Meta keywords (comma-separated)
  createdAt?: Timestamp;
  updatedAt?: Timestamp;

  // New fields for task duration
  taskTimeValue?: number | null;
  taskTimeUnit?: 'hours' | 'minutes' | null;
  includedItems?: string[];
  excludedItems?: string[];
  allowPayLater?: boolean;
  serviceFaqs?: ServiceFaqItem[];

  // Fields from new request
  membersRequired?: number | null;
  bookedCount?: number; // Added bookedCount
}

// Client-safe version of FirestoreService with serialized dates
export interface ClientServiceData extends Omit<FirestoreService, 'createdAt' | 'updatedAt'> {
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
  parentCategoryName?: string; // Added for breadcrumbs
  parentCategorySlug?: string; // Added for breadcrumbs
  parentCategoryId?: string; // Added for fetching related services
  metaTitle?: string | null;
  metaDescription?: string | null;
  metaKeywords?: string | null;
}

export interface CartEntry {
  serviceId: string;
  quantity: number;
}

export interface UserCart {
  id?: string; // Firestore doc ID, same as userId
  userId: string;
  items: CartEntry[];
  updatedAt: Timestamp;
  marketingStatus?: {
    reminderSent?: boolean;
  };
}

export type BookingStatus =
  | "Pending Payment"
  | "Confirmed"
  | "Processing"
  | "Completed"
  | "Cancelled"
  | "Rescheduled"
  | "AssignedToProvider"
  | "ProviderAccepted"
  | "ProviderRejected"
  | "InProgressByProvider";

export interface BookingServiceItem {
  serviceId: string;
  name: string;
  imageUrl?: string; // Added imageUrl property
  shortDescription?: string | null; // Added shortDescription
  taskTimeValue?: number | null; // Added taskTimeValue
  taskTimeUnit?: 'hours' | 'minutes' | null; // Added taskTimeUnit
  quantity: number;
  pricePerUnit: number; // DISPLAYED pricePerUnit at the time of booking
  discountedPricePerUnit?: number | null; // DISPLAYED discountedPricePerUnit
  isTaxInclusive?: boolean; // Was the pricePerUnit tax inclusive at booking?
  taxPercentApplied?: number; // Tax percent applied to this item's base price
  taxAmountForItem?: number; // Calculated tax amount for this item (based on its base price)
}

export interface AppliedPlatformFeeItem {
  name: string;
  type: 'percentage' | 'fixed';
  valueApplied: number; // The original value (e.g., 10 for 10% or 50 for ₹50)
  calculatedFeeAmount: number; // Base amount of the fee calculated
  taxRatePercentOnFee: number; // Tax rate APPLIED TO THIS FEE's value (e.g., 18 for 18% tax on the fee amount). 0 if no tax.
  taxAmountOnFee: number; // Tax calculated on this fee
  amount?: number; // Total fee including tax (calculatedFeeAmount + taxAmountOnFee)
}

export interface FirestoreBooking {
  id?: string; // Firestore document ID (optional before creation)
  bookingId: string; // User-friendly booking ID (e.g., Yourbrand-TIMESTAMP-RANDOM)
  bookingNumber?: number; // Sequential Member ID for bookings
  userId?: string; // If user is logged in
  providerId?: string; // ID of the assigned provider
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number;
  longitude?: number;
  scheduledDate: string; // Store as ISO string or a user-friendly format
  scheduledTimeSlot: string;
  services: BookingServiceItem[];
  subTotal: number; // Sum of BASE prices of all services (price before individual item tax)
  visitingCharge?: number; // BASE visiting charge (amount before its own tax)
  taxAmount: number; // Total tax for the booking (sum of item taxes + tax on visiting charge + tax on platform fees)
  totalAmount: number; // Grand total: (subTotal + visitingCharge - discountAmount + sum(platformFeeBase) + sum(platformFeeTax)) + totalItemAndVCTax
  discountCode?: string;
  discountAmount?: number; // Discount applied to the sum of BASE prices + BASE visiting charge
  appliedPlatformFees?: AppliedPlatformFeeItem[]; // Store applied platform fees
  platformFeeTotal?: number; // Total amount of platform fees including tax
  additionalCharges?: { name: string; amount: number }[]; // Extra costs added during service
  paymentMethod: string;
  paymentId?: string; // If online payment
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
  status: BookingStatus;
  notes?: string; // Any special instructions from customer
  previousScheduledDate?: string; // NEW: Store previous date before reschedule
  previousScheduledTimeSlot?: string; // NEW: Store previous slot before reschedule
  estimatedEndTime?: string; // Work-only completion time (ISO string)
  interveningBreaks?: { type: 'holiday' | 'partial' | 'gap'; dateLabel: string; timeLabel?: string; reason?: string }[];
  dailyTimeline?: { dateLabel: string; startTime: string; endTime: string }[];
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  isReviewedByCustomer?: boolean;
  cancellationFeePaid?: number;
  cancellationFeeCharged?: number;
  refundableAmount?: number;
  cancellationRefundStatus?: 'Pending' | 'Processed' | 'Failed' | 'N/A';
  cancellationPaymentId?: string;
  isStatsTracked?: boolean;
  isCompletionStatsTracked?: boolean;
  isConfirmationEmailSent?: boolean;
  
  // Smart Tagging & Auto-Dispatch Fields
  coverageType?: 'provider_match' | 'admin_only';
  suggestedProviderIds?: string[];
  autoAssigned?: boolean;
  isProviderNotified?: boolean;
  workCategoryId?: string;
  autoDispatchBypassed?: boolean;
}

export interface Address {
  id: string; // nanoid() generated unique ID for the address within the array
  fullName: string;
  email?: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

// User type updated with marketing fields
export interface FirestoreUser {
  id: string; // Firestore document ID, should be same as Firebase Auth UID
  uid: string;
  userNumber?: number; // Sequential Member ID
  email: string | null;
  displayName: string | null;
  mobileNumber?: string | null;
  mobileNumberVerified?: boolean; 
  photoURL?: string | null; 
  isActive: boolean; 
  roles?: ('customer' | 'provider' | 'admin')[];
  fcmTokens?: { [token: string]: Timestamp }; 
  addresses?: Address[]; 
  createdAt: Timestamp;
  lastLoginAt?: Timestamp;
  // Fields for marketing automation logic
  hasBooking?: boolean;
  cartAddedAt?: Timestamp | null;
  lastReminderSent?: Timestamp | null;
  marketingStatus?: {
    welcomeSent?: boolean;
    bookingReminderSent?: boolean;
    cartReminderSent?: boolean;
    lastRecurringSent?: Timestamp | null;
  }
  // Referral System Fields
  referralCode?: string; // Unique code for this user
  referredBy?: string; // UID of the user who referred them
  walletBalance?: number; // Current available balance
  totalReferralPaidOut?: number; // Lifetime referral payouts
  pendingWalletBalance?: number; // Balance from referrals on "Booked" status
  deviceId?: string | null; // Unique browser fingerprint ID
  
  // New/updated for provider settlement
  withdrawableBalance?: number; // Total net earnings ready for withdrawal
  totalPaidOut?: number; // Lifetime provider payouts
  monthlyStats?: {
    monthKey: string; // e.g. "2024-03"
    gross: number;
    commission: number;
    cashCollected: number;
    withdrawals: number;
    onlineNet: number;
    cashCommission: number;
    cashNet?: number;
    onlineGross?: number;
    onlineCommission?: number;
    extraCharges?: number;
  };
  totalEarnings?: number; // Lifetime gross earnings
  totalCommissionPaid?: number; // Lifetime commission paid to admin
  withdrawalPending?: boolean; // True if a withdrawal request is active
  
  referralStatus?: {
    totalReferred: number;
    completed: number;
  }
}

export type SlideButtonLinkType = 'category' | 'subcategory' | 'service' | 'url' | null;

export interface FirestoreSlide {
  id: string; // Firestore document ID
  title?: string;
  description?: string;
  imageUrl: string;
  imageHint?: string;
  order: number;
  buttonText?: string;
  buttonLinkType?: SlideButtonLinkType;
  buttonLinkValue?: string | null;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// Theme Palette Definition
export interface ThemePalette {
  background: string;
  foreground: string;
  card: string;
  'card-foreground': string;
  popover: string;
  'popover-foreground': string;
  primary: string;
  'primary-foreground': string;
  secondary: string;
  'secondary-foreground': string;
  muted: string;
  'muted-foreground': string;
  accent: string;
  'accent-foreground': string;
  destructive: string;
  'destructive-foreground': string;
  border: string;
  input: string;
  ring: string;
  'chart-1': string;
  'chart-2': string;
  'chart-3': string;
  'chart-4': string;
  'chart-5': string;
  'sidebar-background': string;
  'sidebar-foreground': string;
  'sidebar-primary': string;
  'sidebar-primary-foreground': string;
  'sidebar-accent': string;
  'sidebar-accent-foreground': string;
  'sidebar-border': string;
  'sidebar-ring': string;
}

// Updated Theme Colors Type
export interface ThemeColors {
  light?: Partial<ThemePalette>;
  dark?: Partial<ThemePalette>;
}

export type LoaderType =
  | "logo-pulse"
  | "pulse"
  | "typing"
  | "bars"
  | "gradient"
  | "orbit"
  | "dots"
  | "progress"
  | "cube"
  | "shine"
  | "bounce"
  | "ring"
  | "flip"
  | "wave"
  | "heart"
  | "matrix";


export interface GlobalAdminPopup {
  message: string;
  isActive: boolean;
  durationSeconds?: number; // How long the popup stays on screen
  sentAt?: Timestamp; // When it was last sent/activated
}

export interface WhyChooseUsItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
}

export interface FooterCTA {
  title: string;
  subtitle?: string;
  buttonText: string;
  buttonLink: string;
}

// New types for Web Settings
export interface GlobalWebSettings {
  id?: string; // Should be "global"
  websiteName?: string;
  contactEmail?: string;
  contactMobile?: string;
  address?: string;
  logoUrl?: string;
  logoImageHint?: string;
  faviconUrl?: string;
  websiteIconUrl?: string; // Larger icon, e.g., for PWA or social sharing
  websiteIconImageHint?: string;
  socialMediaLinks?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
  homepageContent?: {
    whyChooseUs?: WhyChooseUsItem[];
    footerCompanyBio?: string;
    footerCTA?: FooterCTA;
  };
  themeColors?: ThemeColors;
  loaderType?: LoaderType; // Added loader type
  isChatEnabled?: boolean; 
  isAiChatBotEnabled?: boolean; // New: Master switch for the AI bot
  chatNotificationSoundUrl?: string;
  bookingNotificationSoundUrl?: string;
  globalAdminPopup?: GlobalAdminPopup;
  adminUserUidForChat?: string; 
  isCookieConsentEnabled?: boolean; 
  cookieConsentMessage?: string; 
  cookiePolicyContent?: string; 
  updatedAt?: Timestamp;
}

export interface ContentPage {
  id: string; // Firestore document ID, can be same as slug
  slug: string; // e.g., "about-us", "terms-and-conditions"
  title: string; // e.g., "About Us"
  content: string; // HTML or Markdown content
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  excerpt?: string;
  imageUrl?: string; // Banner Image
  imageHint?: string; // AI search hint
  coverImageUrl?: string;
  updatedAt: Timestamp;
   createdAt?: Timestamp;
}

export interface FirestoreFAQ {
  id: string; // Firestore document ID
  question: string;
  answer: string;
  order: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type ReviewStatus = "Pending" | "Approved" | "Rejected" | "Flagged";

export interface FirestoreReview {
  id: string; // Firestore document ID
  serviceId: string;
  serviceName: string; // Denormalized
  userId?: string; // Optional, if it's from a logged-in user
  userName: string; // Reviewer's name (can be 'Admin' or actual user name)
  userAvatarUrl?: string; // Optional
  rating: number; // e.g., 1-5
  comment: string;
  status: ReviewStatus;
  isFeatured?: boolean; // Optional, to highlight
  adminCreated: boolean; // true if admin created, false if from customer (for future)
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  bookingId?: string;
}

// New Type for Time Slot Category Limits
export interface TimeSlotCategoryLimit {
  id: string; // Firestore document ID (will be the categoryId)
  categoryId: string;
  categoryName: string; // Denormalized for easier display in admin
  maxConcurrentBookings: number; // Max bookings allowed for this category in a single time slot
  maxBookings?: number; // Consistency with UI usage
  updatedAt: Timestamp;
}

// New Type for Promo Codes
export type DiscountType = "percentage" | "fixed";

export interface FirestorePromoCode {
  id: string; // Firestore document ID
  code: string; // The promo code string (e.g., "SUMMER20")
  description?: string; // Optional description for admin reference
  discountType: DiscountType;
  discountValue: number; // If percentage, 1-100. If fixed, monetary value.
  minBookingAmount?: number; // Optional minimum booking amount for the code to apply
  maxUses?: number; // Optional total number of times this code can be used
  maxUsesPerUser?: number; // Optional per-user usage limit
  usesCount: number; // How many times this code has been used
  validFrom?: Timestamp; // Optional start date of validity
  validUntil?: Timestamp; // Optional end date of validity
  // Consistency fields used in admin code
  startDate?: Timestamp; 
  endDate?: Timestamp;
  currentUsage?: number;
  usageLimit?: number;
  isActive: boolean;
  isHidden?: boolean; // If true, don't show in public lists
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type FirestoreSlideshow = FirestoreSlide;

// Platform Fee Setting Type
export interface PlatformFeeSetting {
  id: string; // Unique ID for React key purposes, generated client-side
  name: string;
  type: 'percentage' | 'fixed'; // Percentage of item subtotal, or fixed amount
  value: number; // The percentage (e.g., 10 for 10%) or fixed amount (e.g., 50 for ₹50)
  feeTaxRatePercent: number; // Tax rate APPLIED TO THIS FEE's value (e.g., 18 for 18% tax on the fee amount). 0 if no tax.
  isActive: boolean;
  description?: string;
}

export type ProviderFeeType = 'fixed' | 'percentage';

// Application Settings Type
export interface TimeInterval {
    startTime: string; // HH:MM
    endTime: string;   // HH:MM
}

export interface DayAvailability {
    isEnabled: boolean;
    startTime: string; // HH:MM (fallback)
    endTime: string;   // HH:MM (fallback)
    intervals?: TimeInterval[]; // Array of custom time intervals
}

export interface LeaveRequest {
    id?: string;
    providerId?: string;       // Optional: Set for individual provider leave. Null/undefined for global platform holiday.
    providerName?: string;     // Provider's full name for quick display in Admin
    startDate: string;         // YYYY-MM-DD
    endDate: string;           // YYYY-MM-DD
    leaveType: 'full_day' | 'partial_day';
    startTime?: string;        // HH:MM (if partial_day)
    endTime?: string;          // HH:MM (if partial_day)
    reason: string;
    createdAt: any;
}

export type LoginMethod = 'email' | 'otp' | 'google';

export interface CustomBankField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'alphanumeric';
  required: boolean;
  placeholder: string;
}

export interface AppSettings {
  // General
  enableMinimumBookingPolicy: boolean;
  minimumBookingAmount: number;
  visitingChargeAmount: number; // This is the DISPLAYED visiting charge
  isVisitingChargeTaxInclusive?: boolean; // True if visitingChargeAmount includes tax
  minimumBookingPolicyDescription: string;
  googleMapsApiKey: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  senderEmail: string;
  enableHeroCarousel: boolean;
  enableCarouselAutoplay: boolean;
  carouselAutoplayDelay: number;
  enableTaxOnVisitingCharge: boolean;
  visitingChargeTaxPercent: number;     
  enableVisitorLogging: boolean;
  enableUserPresence: boolean;
  enableKeyboardSuggestions?: boolean;
  dateFormat?: string;
  // Payment
  enableOnlinePayment: boolean;
  enableRazorpay: boolean;
  enableStripe: boolean;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret?: string;
  stripePublishableKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  enableCOD: boolean; // Represents "Pay After Service"
  // Time Slots
  timeSlotSettings: {
    slotIntervalMinutes: number;
    breakTimeMinutes?: number; // Added break time
    weeklyAvailability: {
      monday: DayAvailability;
      tuesday: DayAvailability;
      wednesday: DayAvailability;
      thursday: DayAvailability;
      friday: DayAvailability;
      saturday: DayAvailability;
      sunday: DayAvailability;
    };
  };
  enableLimitLateBookings: boolean;
  limitLateBookingHours: number;
  // Platform Fees
  platformFees?: PlatformFeeSetting[];
  // Cancellation Policy
  enableCancellationPolicy: boolean;
  freeCancellationDays?: number;
  freeCancellationHours?: number;
  freeCancellationMinutes?: number;
  cancellationFeeType?: 'fixed' | 'percentage';
  cancellationFeeValue?: number;
  enableFinalCancellationWindow?: boolean;
  finalCancellationHours?: number;
  finalCancellationMinutes?: number;
  chatNotificationSoundUrl?: string; // New: default sound for chat notifications
  currencyCode?: string;
  currencySymbol?: string;
  currencyDecimalPoints?: number;
  isChatEnabled?: boolean; // Added for compatibility with appDefaults.ts
  isProviderRegistrationEnabled?: boolean; // For toggling registration
  isCancelledChequeCompulsory?: boolean; // For toggling cheque compulsory status
  enableCancelledChequeUpload?: boolean; // Toggle to completely enable/disable cancelled cheque section
  enableSignatureUpload?: boolean; // Toggle to completely enable/disable signature section
  customBankFields?: CustomBankField[]; // Dynamic custom bank details fields
  enableDefaultIndianKyc?: boolean; // For toggling Aadhaar and PAN defaults
  maxProviderRadiusKm?: number; // New for provider work area
  autoDispatchRadiusKm?: number; // New: Configurable radius for automatic assignment
  
  // Login Settings
  enableEmailPasswordLogin?: boolean;
  enableOtpLogin?: boolean;
  enableGoogleLogin?: boolean;
  defaultLoginMethod?: LoginMethod;
  defaultOtpCountryCode?: string;

  isReferralSystemEnabled?: boolean; // Added default

  // Provider Fee Settings
  providerFeeType?: ProviderFeeType;
  providerFeeValue?: number;
  providerExtraFeePercentage?: number;

  enableStatusUpdateEmails?: boolean; // New: Toggle for generic status update emails

  loaderType?: string; // Added for compatibility with appDefaults.ts

  timezone?: string; // NEW: Configurable application timezone
  enableAccountDisabledEmail?: boolean; // Toggle for account disabled emails
  enableAccountActivatedEmail?: boolean; // Toggle for account activated emails
  updatedAt?: Timestamp; // For tracking updates in Firestore
}

// New: Marketing Automation Settings
export interface AutomationDelay {
    days: number;
    hours: number;
    minutes: number;
}
export interface MarketingAutomationSettings {
    noBookingReminderEnabled: boolean;
    noBookingReminderDelay?: AutomationDelay;
    noBookingReminderTemplate?: string;
    noBookingReminderCategoryId?: string;

    abandonedCartEnabled: boolean;
    abandonedCartDelay?: AutomationDelay;
    abandonedCartTemplate?: string;
    abandonedCartCategoryId?: string;

    recurringEngagementEnabled: boolean;
    recurringEngagementDelay?: AutomationDelay;
    recurringEngagementTemplate?: string;
    recurringEngagementCategoryId?: string;
    
    // WhatsApp Automation Settings
    isWhatsAppEnabled?: boolean;
    whatsAppOnSignup?: { enabled: boolean; templateName?: string; }; 
    whatsAppOnBookingConfirmed?: { enabled: boolean; templateName?: string; };
    whatsAppOnBookingCompleted?: { enabled: boolean; templateName?: string; };
    whatsAppOnBookingCancelled?: { enabled: boolean; templateName?: string; };
    whatsAppOnPaymentSuccess?: { enabled: boolean; templateName?: string; };

    updatedAt?: Timestamp;
}

// SEO Settings Type
export interface StructuredDataSocialProfiles {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
}
export interface FirestoreSEOSettings {
  id?: string; // Should be "global"
  // Global & Homepage
  siteName?: string; // For OG, etc.
  defaultMetaTitleSuffix?: string;
  defaultMetaDescription?: string;
  defaultMetaKeywords?: string; // comma-separated

  homepageMetaTitle?: string;
  homepageMetaDescription?: string;
  homepageMetaKeywords?: string;
  homepageH1?: string;

  // Dynamic Page Patterns (using {{placeholder}})
  categoryPageTitlePattern?: string;
  categoryPageDescriptionPattern?: string;
  categoryPageKeywordsPattern?: string;
  categoryPageH1Pattern?: string;

  cityCategoryPageTitlePattern?: string;
  cityCategoryPageDescriptionPattern?: string;
  cityCategoryPageKeywordsPattern?: string;
  cityCategoryPageH1Pattern?: string;

  areaCategoryPageTitlePattern?: string;
  areaCategoryPageDescriptionPattern?: string;
  areaCategoryPageKeywordsPattern?: string;
  areaCategoryPageH1Pattern?: string;

  cityPageTitlePattern?: string;
  cityPageDescriptionPattern?: string;
  cityPageKeywordsPattern?: string;
  cityPageH1Pattern?: string;

  servicePageTitlePattern?: string;
  servicePageDescriptionPattern?: string; // Corrected this to pattern for consistency
  servicePageKeywordsPattern?: string;
  servicePageH1Pattern?: string;

  areaPageTitlePattern?: string;
  areaPageDescriptionPattern?: string; // Corrected this to pattern for consistency
  areaPageKeywordsPattern?: string; // Corrected this to pattern for consistency
  areaPageH1Pattern?: string;

  // Structured Data (LocalBusiness default)
  structuredDataType?: string; // e.g., "LocalBusiness", "Organization"
  structuredDataName?: string;
  structuredDataStreetAddress?: string;
  structuredDataLocality?: string; // City
  structuredDataRegion?: string; // State
  structuredDataPostalCode?: string;
  structuredDataCountry?: string; // e.g., "IN"
  structuredDataTelephone?: string;
  structuredDataImage?: string; // URL to a default business logo/image
  socialProfileUrls?: StructuredDataSocialProfiles;

  fallbackRatingValue?: string;
  fallbackReviewCount?: string;

  // Dynamic Content Templates (NEW)
  cityCategorySeoContentTemplate?: string;
  cityCategoryFaqsTemplate?: FaqItem[];
  areaCategorySeoContentTemplate?: string;
  areaCategoryFaqsTemplate?: FaqItem[];
  areaServiceSeoContentTemplate?: string;
  areaServiceFaqsTemplate?: FaqItem[];

  updatedAt?: Timestamp;
}

// City and Area types
export interface FirestoreCity {
  id: string; // Firestore document ID
  name: string;
  slug: string;
  isActive: boolean;
  imageUrl?: string;
  imageHint?: string;
  // SEO specific fields
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string; // comma-separated
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  h1_title?: string;
  latitude?: number;
  longitude?: number;
  nearbyCities?: Array<{ id: string, name: string, slug: string }>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FirestoreArea {
  id: string; // Firestore document ID
  name: string;
  slug: string;
  cityId: string; // Foreign key to FirestoreCity.id
  cityName: string; // Denormalized parent city name for display
  isActive: boolean;
  imageUrl?: string;
  imageHint?: string;
  // SEO specific fields
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string; // comma-separated
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  h1_title?: string;
  latitude?: number;
  longitude?: number;
  nearbyAreas?: Array<{ id: string, name: string, slug: string }>;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Tax Configuration Type
export interface FirestoreTax {
  id: string; // Firestore document ID
  taxName: string; // e.g., "GST", "VAT"
  taxPercent: number; // e.g., 5, 18
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// Marketing Settings Type
export interface FirebaseClientConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}
export interface MarketingSettings {
  id?: string; // Should be "marketingConfiguration"
  // Google
  googleTagId?: string; // New: Primary Google Tag ID (G-XXXXXXX)
  googleTagManagerId?: string;
  googleAnalyticsId?: string;
  googleAdsConversionId?: string;
  googleAdsConversionLabel?: string;
  googleOptimizeContainerId?: string;
  googleRemarketingTag?: string;
  // Meta
  metaPixelId?: string;
  metaConversionApi?: {
    accessToken?: string;
    pixelId?: string;
    testEventCode?: string;
  };
  // Other Platforms
  bingUetTagId?: string;
  pinterestTagId?: string;
  microsoftClarityProjectId?: string;
  // Feeds
  googleMerchantCenter?: {
    feedUrl?: string;
    accountId?: string;
  };
  facebookCatalog?: {
    feedUrl?: string;
    pixelId?: string;
  };
  // ads.txt
  adsTxtContent?: string;
  // Custom Scripts
  customHeadScript?: string;
  customBodyScript?: string;
  // Firebase
  firebasePublicVapidKey?: string;
  firebaseAdminSdkJson?: string;
  firebaseClientConfig?: FirebaseClientConfig;
  // WhatsApp
  whatsAppApiToken?: string;
  whatsAppPhoneNumberId?: string;
  whatsAppBusinessAccountId?: string;
  whatsAppVerifyToken?: string;
  whatsAppAppSecret?: string;
  updatedAt?: Timestamp;
}


// User Notifications
export type NotificationType = 'success' | 'info' | 'warning' | 'error' | 'booking_update' | 'admin_alert' | 'provider_app_status';

export interface FirestoreNotification {
  id?: string; // Firestore document ID
  userId: string; // ID of the user this notification is for
  title: string;
  message: string;
  type: NotificationType; // Expanded type
  href?: string; // Optional link for the notification to lead to
  read: boolean;
  createdAt: Timestamp;
}

// User Activity Log
export type UserActivityEventType =
  | 'newUser'
  | 'userLogin'
  | 'userLogout'
  | 'pageView'
  | 'addToCart'
  | 'removeFromCart'
  | 'newBooking'
  | 'checkoutStep'
  | 'adminAction'
  | 'search' // Added search event type
  | 'timeOnPage'
  | 'providerAcceptJob'
  | 'providerRejectJob'
  | 'providerStartWork'
  | 'providerCompleteWork';

export interface UserActivityEventData {
  pageUrl?: string;
  pageTitle?: string;
  searchQuery?: string; // Added for search event
  serviceId?: string;
  serviceName?: string;
  quantity?: number;
  price?: number;
  bookingId?: string;
  bookingDocId?: string;
  totalAmount?: number;
  itemCount?: number;
  paymentMethod?: string;
  services?: {id: string, name: string, quantity: number}[];
  checkoutStepName?: string;
  adminActionType?: string;
  adminActionDetails?: Record<string, any>;
  email?: string;
  fullName?: string;
  mobileNumber?: string;
  sourceGuestId?: string | null;
  loginMethod?: string;
  logoutMethod?: 'manual' | 'auto';
  usedReferral?: boolean; // To track if a referral was used during signup
  [key: string]: any;
}

export interface UserActivity {
  id?: string; // Firestore document ID
  userId?: string | null; // Firebase Auth UID if logged in
  guestId?: string | null; // localStorage UID if anonymous
  userDisplayName?: string; // Denormalized name
  eventType: UserActivityEventType;
  eventData: UserActivityEventData;
  userAgent?: string;
  timestamp: Timestamp;
  deviceType?: 'mobile' | 'tablet' | 'desktop' | 'unknown'; // Updated to include unknown
  browser?: { name?: string; version?: string };
  os?: { name?: string; version?: string };
}

// Visitor Info Log (newly added)
export interface FirestoreVisitorInfoLog {
  id?: string;
  ipAddress: string;
  city?: string;
  region?: string;
  countryName?: string;
  postalCode?: string;
  ispOrganization?: string;
  pathname: string;
  userAgent: string;
  deviceType?: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  browser?: { name?: string; version?: string };
  os?: { name?: string; version?: string };
  timestamp: Timestamp;
}


// Popup Types
export type PopupType =
  | "newsletter_signup"
  | "promotional"
  | "welcome"
  | "exit_intent"
  | "marketing_modal"
  | "lead_capture"
  | "subscribe"
  | "video";

export type PopupDisplayRuleType =
  | "on_page_load"
  | "on_exit_intent"
  | "after_x_seconds"
  | "on_scroll_percentage";

export type PopupDisplayFrequency =
  | "once_per_session"
  | "once_per_day"
  | "always";

export interface FirestorePopup {
  id: string; // Firestore document ID
  name: string; // Internal name for easy identification in admin
  popupType: PopupType;
  title?: string;
  displayText?: string;
  imageUrl?: string; // For image-based popups or background
  imageHint?: string;
  videoUrl?: string; // For video popups
  showEmailInput: boolean;
  showNameInput?: boolean;
  showMobileInput?: boolean;
  promoCode?: string;
  promoCodeConditionFieldsRequired?: number; // 0: immediate, 1: 1 field, 2: all 3 enabled fields
  targetUrl?: string; // URL to redirect to on click
  buttonText?: string;
  buttonLinkType?: SlideButtonLinkType;
  buttonLinkValue?: string | null;
  displayRuleType: PopupDisplayRuleType;
  displayRuleValue?: number | null; // Nullable
  displayFrequency: PopupDisplayFrequency;
  showCloseButton: boolean;
  isActive: boolean;
  targetPages?: string[]; // New: list of targeted paths (e.g. ["/", "/blog"])
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// Chat Types
export interface ChatMessage {
  id?: string; // Firestore document ID
  chatSessionId: string; // ID of the chat session this message belongs to
  senderId: string; // UID of the sender (user UID or admin UID)
  senderType: 'user' | 'admin' | 'ai'; // Added 'ai' sender type
  text?: string; // Text content of the message
  imageUrl?: string; // URL if the message is an image
  timestamp: Timestamp; // When the message was sent
  isReadByAdmin?: boolean; // True if admin has read this user message
  isReadByUser?: boolean; // True if user has read this admin message
}

export interface ChatSession {
  id: string; // Firestore document ID (e.g., could be same as userId for user-admin chats)
  userId: string; // UID of the customer/user
  userName?: string; // Denormalized user display name
  userPhotoUrl?: string; // Denormalized user photo URL
  adminId?: string | null; // UID of the admin interacting (can be a general admin ID or specific if multiple admins)
  adminName?: string | null; // Denormalized admin display name
  adminPhotoUrl?: string | null; // Denormalized admin photo URL
  lastMessageText?: string;
  lastMessageTimestamp?: Timestamp;
  lastMessageSenderId?: string;
  userUnreadCount: number; // Messages sent by admin that user hasn't read
  adminUnreadCount: number; // Messages sent by user that admin hasn't read
  participants: (string | null | undefined)[]; // Array containing UIDs of participants (e.g., [userId, adminId])
  aiAgentActive?: boolean; 
  isUserTyping?: boolean;
  isAdminTyping?: boolean;
  userTypingAt?: Timestamp | number | null;
  adminTypingAt?: Timestamp | number | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Inquiry Types
export type InquiryStatus = 'new' | 'replied' | 'resolved' | 'spam';
export type InquirySource = 'contact_form' | 'newsletter_popup' | 'lead_capture_popup' | 'other_popup' | 'subscribe_popup';

export interface FirestoreContactUsInquiry {
  id?: string; // Firestore document ID
  name: string;
  email: string;
  phone?: string;
  message: string;
  submittedAt: Timestamp;
  status: InquiryStatus;
  repliedByAdminUid?: string; // UID of admin who replied
  replyMessage?: string;
  repliedAt?: Timestamp;
  source: 'contact_form'; // To distinguish source
}

export interface FirestorePopupInquiry {
  id?: string; // Firestore document ID
  popupId?: string; // ID of the FirestorePopup document
  popupName: string; // Name of the popup for context
  popupType: PopupType; // e.g., 'newsletter_signup', 'lead_capture'
  name?: string;
  email?: string;
  phone?: string; // For popups that might have a message field
  formData?: Record<string, any>; // For any other captured data from the popup
  submittedAt: Timestamp;
  status: InquiryStatus;
  repliedByAdminUid?: string; // UID of admin who replied
  replyMessage?: string;
  repliedAt?: Timestamp;
  source: InquirySource;
}

// Advanced SEO Settings
export interface CityCategorySeoSetting {
  id?: string; // Firestore document ID
  cityId: string;
  cityName: string; // Denormalized
  categoryId: string;
  categoryName: string; // Denormalized
  slug: string; // e.g., "bangalore/plumbing" - primarily for admin display
  h1_title?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  seo_content?: string; // NEW: Long-form SEO content
  faqs?: FaqItem[]; // NEW: SEO FAQs
  imageHint?: string;
  isActive: boolean;
  createdAt?: Timestamp; // Added createdAt
  updatedAt?: Timestamp;
}

export interface AreaCategorySeoSetting {
  id?: string; // Firestore document ID
  cityId: string;
  cityName: string; // Denormalized
  areaId: string;
  areaName: string; // Denormalized
  categoryId: string;
  categoryName: string; // Denormalized
  slug: string; // e.g., "bangalore/whitefield/electrical" - primarily for admin display
  h1_title?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  seo_content?: string; // NEW: Long-form SEO content
  faqs?: FaqItem[]; // NEW: SEO FAQs
  imageHint?: string;
  isActive: boolean;
  createdAt?: Timestamp; // Added createdAt
  updatedAt?: Timestamp;
}

export interface AreaServiceSeoSetting {
  id?: string; // Firestore document ID
  cityId: string;
  cityName: string; // Denormalized
  citySlug: string; // Denormalized
  areaId: string;
  areaName: string; // Denormalized
  areaSlug: string; // Denormalized
  serviceId: string;
  serviceName: string; // Denormalized
  serviceSlug: string; // Denormalized
  slug: string; // e.g., "bangalore/whitefield/service/bed-dismantle"
  h1_title?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  seo_content?: string; // Long-form SEO content
  faqs?: FaqItem[];
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// Quotation & Invoice Types
export interface QuotationItem {
  id?: string; // For React key, generated client-side if new
  itemName: string;
  quantity: number;
  ratePerUnit: number;
  total: number; // Auto-calculated: quantity * ratePerUnit
}

export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'ConvertedToInvoice';

export interface FirestoreQuotation {
  id?: string; // Firestore document ID
  providerId: string; // Added to scope to provider
  quotationNumber: string; // User-friendly ID
  quotationDate: Timestamp;
  userId?: string; // ID of the FirestoreUser this quotation is for
  customerName: string; // Always required, even if user selected
  customerEmail?: string; // Optional
  customerMobile?: string; // Optional
  serviceTitle: string; // Overall title for the quotation
  serviceDescription?: string; // More details about the service/project
  items: QuotationItem[];
  additionalNotes?: string;
  subtotal: number; // Sum of all item totals
  taxPercent?: number; // e.g., 18 for 18%
  taxAmount?: number; // Calculated: subtotal * (taxPercent / 100)
  totalAmount: number; // Calculated: subtotal + taxAmount
  status: QuotationStatus;
  pdfUrl?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface InvoiceItem {
  id?: string; // For React key, generated client-side if new
  itemName: string;
  quantity: number;
  ratePerUnit: number;
  total: number; // Auto-calculated: quantity * ratePerUnit
}

export type InvoicePaymentStatus = 'Pending' | 'Paid' | 'Partial' | 'Overdue' | 'Cancelled';
export type InvoicePaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Online Gateway' | 'Other';

export interface FirestoreInvoice {
  id?: string; // Firestore document ID
  providerId: string; // Added to scope to provider
  invoiceNumber: string; // User-friendly ID
  invoiceDate: Timestamp;
  dueDate?: Timestamp;
  quotationId?: string; // Optional: if generated from a quotation
  userId?: string; // ID of the FirestoreUser this invoice is for
  customerName: string; // Always required
  customerEmail?: string; // Optional
  customerMobile?: string; // Optional
  serviceDescription?: string; // Overall description for the invoice
  items: InvoiceItem[];
  subtotal: number; // Sum of all item totals
  discountPercent?: number; // e.g., 10 for 10%
  discountAmount?: number; // Calculated: subtotal * (discountPercent / 100)
  taxPercent?: number; // e.g., 18 for 18%
  taxAmount?: number; // Calculated: (Subtotal - DiscountAmount) + TaxAmount
  totalAmount: number; // Calculated: (Subtotal - DiscountAmount) + TaxAmount
  amountPaid?: number;
  amountDue?: number; // Calculated: TotalAmount - AmountPaid
  paymentStatus: InvoicePaymentStatus;
  paymentMode?: InvoicePaymentMode | null; // Allow null
  paymentNotes?: string; // e.g., transaction ID if paid
  additionalNotes?: string; // General notes for the invoice
  pdfUrl?: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface CompanyDetailsForPdf {
  name: string;
  address: string;
  contactEmail: string;
  contactMobile: string;
  logoUrl?: string;
  currencySymbol?: string;
  dateFormat?: string;
}

// --- Homepage Features Configuration ---
export type AdActionType = 'url' | 'category' | 'service';
export type AdPlacement =
  | 'AFTER_HERO_CAROUSEL'
  | 'AFTER_POPULAR_SERVICES'
  | 'AFTER_RECENTLY_ADDED_SERVICES'
  | 'AFTER_CATEGORY_SECTIONS' // After the entire block of all category-wise service listings
  | 'BEFORE_FOOTER_CTA'; // Before the "Ready to get started?" call to action

export interface HomepageAd {
  id: string; // Unique ID for the ad, e.g., nanoid()
  name: string; // Internal name for admin reference
  imageUrl: string;
  imageHint?: string;
  actionType: AdActionType;
  targetValue: string; // URL string, category slug, or service slug
  placement: AdPlacement;
  order: number; // For sorting ads within the same placement (e.g., 0, 1, 2...)
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface FeaturesConfiguration {
  showMostPopularServices: boolean;
  showRecentlyAddedServices: boolean;
  showCategoryWiseServices: boolean;
  showBlogSection: boolean;
  showCustomServiceButton?: boolean; // Added for Custom Service Request
  homepageCategoryVisibility: { [categoryId: string]: boolean };
  ads?: HomepageAd[];
  enableUserActivityLogging?: boolean;
  enableProviderActivityLogging?: boolean;
  updatedAt?: Timestamp;
}

// --- Provider Registration & Management Types ---

export interface ExperienceLevelOption {
  id: string; // Unique ID, can be nanoid()
  label: string; // e.g., "0-1 Year", "1-3 Years", "3+ Years"
  description?: string; // Optional detailed description
  order: number; // For sorting in dropdowns
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface SkillLevelOption {
  id: string; // Unique ID, can be nanoid()
  label: string; // e.g., "Helper", "Medium Carpenter", "Senior Electrician"
  description?: string;
  categoryId?: string; // Optional: if skills are category-specific
  order: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface QualificationOption {
  id: string;
  label: string; // e.g., "10th Pass", "ITI Diploma", "BE Electrical"
  order: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface LanguageOption {
  id: string;
  label: string; // e.g., "English", "Hindi", "Kannada"
  code?: string; // e.g., "en", "hi", "kn" (optional)
  order: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface OptionalDocumentTypeOption {
  id: string; // e.g., "voter_id", "driving_license"
  label: string; // e.g., "Voter ID", "Driving License"
  description?: string;
  order: number;
  isActive: boolean;
  isRequired: boolean;
  imageCount: number; // 1 or 2
  // New fields for number validation
  docNumberType?: 'numeric' | 'alphabetic' | 'alphanumeric' | 'any';
  docNumberMinLength?: number;
  docNumberMaxLength?: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export type AdditionalDocumentTypeOption = OptionalDocumentTypeOption;

export interface ProviderControlOptions {
  categories: FirestoreCategory[];
  experienceLevels: ExperienceLevelOption[];
  skillLevels: SkillLevelOption[];
  qualificationOptions: QualificationOption[];
  languageOptions: LanguageOption[];
  additionalDocTypes: AdditionalDocumentTypeOption[]; // Updated
  pinCodeAreaMappings?: PinCodeAreaMapping[];
}

export interface KycDocument {
  docType: 'aadhaar' | 'pan' | string; // string for custom additional docs from AdditionalDocumentTypeOption.id
  docLabel?: string; // Added: readable name for display in admin
  docNumber?: string;
  frontImageUrl?: string;
  frontImageFileName?: string; // Original filename of the uploaded front image
  backImageUrl?: string;
  backImageFileName?: string; // Original filename of the uploaded back image
  verified: boolean; // Default false
  adminNotes?: string;
}

export interface BankDetails {
  bankName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifscCode?: string;
  cancelledChequeUrl?: string;
  customFields?: Record<string, string>; // Dynamic custom fields like swiftCode, bankCode, etc.
  cancelledChequeFileName?: string;
  verified: boolean; // Default false
  adminNotes?: string;
}

export type ProviderApplicationStatus = 'pending_step_1' | 'pending_step_2' | 'pending_step_3' | 'pending_step_4' | 'pending_review' | 'approved' | 'rejected' | 'needs_update';

export interface ProviderApplication {
  id?: string; // Firestore document ID (same as userId)
  userId: string; // Firebase Auth UID of the applicant
  status: ProviderApplicationStatus;
  isOnline?: boolean; // Availability toggle (true = online/accepting bookings, false = offline)

  // Step 1: Client Category & Skills
  workCategoryId?: string;
  workCategoryName?: string; // Denormalized
  additionalCategories?: { id: string; name: string }[];
  allCategoryIds?: string[];
  additionalServices?: { id: string; name: string; categoryName?: string }[];
  additionalServiceIds?: string[];
  experienceLevelId?: string;
  experienceLevelLabel?: string; // Denormalized
  skillLevelId?: string;
  skillLevelLabel?: string; // Denormalized
  bio?: string; // Added field for short bio

  // Step 2: Personal Information
  fullName?: string;
  email?: string;
  mobileNumber?: string;
  address?: string;
  age?: number;
  qualificationId?: string;
  qualificationLabel?: string; // Denormalized
  alternateMobile?: string;
  languagesSpokenIds?: string[]; // Array of LanguageOption IDs
  languagesSpokenLabels?: string[]; // Denormalized array of labels
  profilePhotoUrl?: string;

  // Step 3: KYC Documents
  aadhaar?: KycDocument | null;
  pan?: KycDocument | null;
  additionalDocuments?: KycDocument[]; // Updated

  // Step 4: Work Location & Bank Details
  workAreaCenter?: {
    latitude: number;
    longitude: number;
  };
  workAreaRadiusKm?: number;
  workAreaAddress?: string;
  bankDetails?: BankDetails;
  termsConfirmedAt?: Timestamp;
  signatureUrl?: string;
  signatureFileName?: string;

  adminReviewNotes?: string;
  kycUpdateRequest?: boolean;
  kycUpdateNotes?: string;
  submittedAt?: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;

  // Provider Earnings/Wallet - these should perhaps be on the main User document for a provider role
  withdrawableBalance?: number;
  totalEarnings?: number;
  totalDeductions?: number;
}



// This would be the main profile for an approved provider
export interface ProviderProfile extends Omit<ProviderApplication, 'status' | 'submittedAt' | 'adminReviewNotes'> {
  overallRating?: number;
  totalJobsCompleted?: number;
  isAvailable?: boolean;
}

// Service Zone
export interface ServiceZone {
  id: string;
  name: string;
  center: {
    latitude: number;
    longitude: number;
  };
  radiusKm: number;
  categoryIds?: string[]; // New: IDs of categories this zone applies to
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

// Blog Post Type
export interface FirestoreBlogPost {
  id: string; // Firestore document ID
  title: string;
  slug: string;
  content: string; // HTML content from rich text editor
  coverImageUrl: string;
  imageHint?: string;
  excerpt?: string; // Optional excerpt
  tags?: string[] | string; // Optional tags (can be array or comma-separated string)
  readingTime?: string; // Optional reading time (e.g., "5 min")
  isPublished: boolean;
  authorId?: string; // Optional: link to an admin/author user
  authorName?: string; // Optional: denormalized author name

  categoryId?: string;
  categoryName?: string;

  // SEO Fields
  h1_title?: string;
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;
  
  // Legacy or alternative SEO field names used in code
  metaTitle?: string;
  metaDescription?: string;

  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface ClientBlogPost extends Omit<FirestoreBlogPost, 'createdAt' | 'updatedAt'> {
  createdAt: string; // ISO string
  updatedAt?: string; // ISO string
}

// Custom Service Request
export type CustomRequestStatus = 'new' | 'reviewed' | 'contacted' | 'closed';

export interface CustomServiceRequest {
  id?: string;
  userId?: string; // Optional: If user was logged in
  userName?: string; // Denormalized
  userEmail?: string; // Denormalized
  userMobile?: string; // Denormalized
  serviceTitle: string;
  description: string;
  categoryId?: string; // If they selected an existing category
  categoryName?: string; // Denormalized
  customCategory?: string; // If they entered their own
  minBudget?: number;
  maxBudget?: number;
  imageUrls: string[];
  preferredStartDate: Timestamp;
  submittedAt: Timestamp;
  status: CustomRequestStatus;
  address?: Address;
}


// --- Referral & Wallet System Types ---

export type ReferralBonusType = 'fixed' | 'percentage';
export type ReferralStatus = 'pending' | 'completed' | 'failed';

export interface ReferralSettings {
  id?: string; // Should be "referral"
  isReferralSystemEnabled: boolean;
  referrerBonus: number;
  referredUserBonus: number;
  bonusType: ReferralBonusType;
  referralCodeLength: number;
  preventReuse: boolean;
  minBookingValueForBonus: number;
  maxEarningsPerReferrer?: number;
  updatedAt?: Timestamp;
}

export interface Referral {
  id?: string; // Firestore document ID
  referrerId: string; // User who referred
  referredUserId: string; // User who was referred
  referredUserEmail?: string; // Email of the user who was referred
  bookingId?: string; // ID of the first qualifying booking
  status: ReferralStatus;
  referrerBonus: number;
  referredBonus: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  // Anti-abuse fields
  ipAddress?: string | null;
  deviceId?: string | null;
}

export interface EnrichedReferral extends Referral {
    referredUserName?: string;
}

// Withdrawal Types (NEW)
export type WithdrawalMethodType = 'bank_transfer' | 'upi' | 'amazon_gift_card' | 'other';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'processing' | 'completed' | 're_submit';

export interface SystemStats {
  totalBookings: number;
  completedBookings: number;
  totalRevenue: number;
  earnedCommission: number;
  totalUsers: number;
  newSignups30d: number;
  updatedAt: Timestamp;
}

export interface WithdrawalSettings {
  id?: string; // Should be "withdrawal"
  isWithdrawalEnabled: boolean;
  minWithdrawalAmount: number;
  enabledMethods: {
    amazon_gift_card: boolean;
    bank_transfer: boolean;
    upi: boolean;
  }
  updatedAt?: Timestamp;
}


export interface WithdrawalRequest {
  id?: string; // Firestore document ID
  providerId: string;
  providerName: string; // Denormalized
  providerEmail: string; // Denormalized
  userId?: string; // For referral withdrawal compatibility
  userName?: string;
  userEmail?: string;
  amount: number;
  method: WithdrawalMethodType;
  details: {
    email?: string;
    mobileNumber?: string;
    accountHolderName?: string;
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
    upiId?: string;
  };
  status: WithdrawalStatus;
  requestedAt: Timestamp;
  processedAt?: Timestamp;
  adminNotes?: string; // For rejection reasons
}

export interface WithdrawalTabProps {
  settings: WithdrawalSettings;
}


export interface PinCodeAreaMapping {
    id: string;
    pinCode: string;
    areaName: string;
    order: number;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}
