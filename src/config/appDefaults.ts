

import type { AppSettings, ThemeColors } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL } from '@/lib/colorUtils';

export const defaultAppSettings: AppSettings = {
  // General
  enableMinimumBookingPolicy: false,
  minimumBookingAmount: 500,
  visitingChargeAmount: 100, // This is the DISPLAYED visiting charge
  isVisitingChargeTaxInclusive: false, // Default to exclusive
  minimumBookingPolicyDescription: "A visiting charge of {VISITING_CHARGE} will be applied if your booking total is below {MINIMUM_BOOKING_AMOUNT}.",
  googleMapsApiKey: "",
  smtpHost: "",
  smtpPort: "587", // Default to common non-SSL/TLS port
  smtpUser: "",
  smtpPass: "",
  senderEmail: "",
  enableHeroCarousel: true,
  enableCarouselAutoplay: true, 
  carouselAutoplayDelay: 5000, 
  enableTaxOnVisitingCharge: true, 
  visitingChargeTaxPercent: 5,     
  enableVisitorLogging: true,
  enableUserPresence: true,
  enableKeyboardSuggestions: true,
  // Payment
  enableOnlinePayment: true,
  enableRazorpay: true,
  enableStripe: false,
  razorpayKeyId: "",
  razorpayKeySecret: "",
  razorpayWebhookSecret: "",
  stripePublishableKey: "",
  stripeSecretKey: "",
  stripeWebhookSecret: "",
  enableCOD: true, // Represents "Pay After Service"
  // Time Slots
  timeSlotSettings: {
    slotIntervalMinutes: 60,
    breakTimeMinutes: 15, // Added break time
    weeklyAvailability: {
      monday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
      tuesday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
      wednesday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
      thursday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
      friday: { isEnabled: true, startTime: "09:00", endTime: "17:00", intervals: [{ startTime: "09:00", endTime: "17:00" }] },
      saturday: { isEnabled: true, startTime: "10:00", endTime: "14:00", intervals: [{ startTime: "10:00", endTime: "14:00" }] },
      sunday: { isEnabled: true, startTime: "10:00", endTime: "14:00", intervals: [{ startTime: "10:00", endTime: "14:00" }] },
    }
  },
  enableLimitLateBookings: false,
  limitLateBookingHours: 4,
  // Platform Fees
  platformFees: [], // Default to an empty array
  // Cancellation Policy
  enableCancellationPolicy: false,
  freeCancellationDays: 1, // e.g., 1 day before
  freeCancellationHours: 0,
  freeCancellationMinutes: 0,
  cancellationFeeType: 'fixed', // 'fixed' or 'percentage'
  cancellationFeeValue: 100, // e.g., 100 (for fixed) or 10 (for 10%)
  enableFinalCancellationWindow: false,
  finalCancellationHours: 3,
  finalCancellationMinutes: 0,

  // Chat setting - default sound URL
  // User needs to place default-notification.mp3 in public/sounds/
  chatNotificationSoundUrl: "/sounds/default-notification.mp3", 
  isChatEnabled: false, // Default chat to false. Will be managed in GlobalWebSettings now.
  
  isProviderRegistrationEnabled: true, // Added default
  isCancelledChequeCompulsory: false, // Added default (optional)
  enableCancelledChequeUpload: true,
  enableSignatureUpload: true,
  customBankFields: [
    { id: 'ifsc', name: 'IFSC Code', type: 'alphanumeric', required: true, placeholder: 'Enter IFSC code' }
  ],
  maxProviderRadiusKm: 50, // Added default max provider radius
  autoDispatchRadiusKm: 5, // Default auto-dispatch radius (km)
  
  // Login Settings
  enableEmailPasswordLogin: true,
  enableOtpLogin: true,
  enableGoogleLogin: true,
  defaultLoginMethod: 'email',
  defaultOtpCountryCode: '+91',

  isReferralSystemEnabled: false, // Added default

  // Provider Fee Settings
  providerFeeType: 'fixed', // 'fixed' or 'percentage'
  providerFeeValue: 0, // Default to 0, meaning no fee
  providerExtraFeePercentage: 0,

  enableStatusUpdateEmails: true,
  enableAccountDisabledEmail: true,
  enableAccountActivatedEmail: true,
  timezone: 'Asia/Kolkata', // Default timezone

  currencyCode: 'INR',
  currencySymbol: '₹',
  currencyDecimalPoints: 0,

  // UI/UX
  loaderType: 'logo-pulse',

  dateFormat: 'DD/MM/YYYY',

  updatedAt: undefined, // No default for updatedAt
};

// Default theme colors are now primarily managed in useGlobalSettings and colorUtils
// This is because themeColors is part of GlobalWebSettings, not AppSettings.

    
