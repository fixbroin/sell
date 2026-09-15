// src/config/apiEndpoints.ts

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'https://yourdomain';
};

export const API_ENDPOINTS = {
  // Core Shared & Public APIs (Frontend & Flutter App)
  GLOBAL_SETTINGS: '/api/global-settings',
  CATEGORIES: '/api/categories',
  SERVICES: '/api/services',
  SLIDESHOWS: '/api/slideshows',

  // Database Core Layer APIs
  DB_GET_DOC: '/api/db/getDoc',
  DB_GET_DOCS: '/api/db/getDocs',
  DB_MUTATE: '/api/db/mutate',
  DB_BATCH: '/api/db/batch',

  // Core Management APIs
  ADMIN_DASHBOARD: '/api/admin/dashboard',
  ADMIN_NOTIFICATIONS: '/api/admin/notifications',
  ADMIN_ACTIVITY_FEED: '/api/admin/activity-feed',
  ADMIN_STAFF: '/api/admin/manage-admins',
  ADMIN_BOOKINGS: '/api/admin/bookings',
  ADMIN_USERS: '/api/admin/users',
  ADMIN_INQUIRIES: '/api/admin/inquiries',
  ADMIN_CUSTOM_REQUESTS: '/api/admin/custom-requests',

  // Provider Management APIs
  ADMIN_PROVIDERS: '/api/admin/providers',
  ADMIN_WITHDRAWALS: '/api/admin/withdrawals',

  // Content Management APIs
  ADMIN_CATEGORIES: '/api/admin/categories',
  ADMIN_SERVICES: '/api/admin/services',
  ADMIN_REVIEWS: '/api/admin/reviews',
  ADMIN_BLOG: '/api/admin/blog',
  ADMIN_FAQ: '/api/admin/faq',

  // Location & SEO APIs
  ADMIN_LOCATIONS: '/api/admin/locations',
  ADMIN_SEO: '/api/admin/seo',
  ADMIN_PROMO_CODES: '/api/admin/promo-codes',
  ADMIN_POPUPS: '/api/admin/popups',
  ADMIN_SYSTEM_LOGS: '/api/admin/system-logs',

  // Provider Mobile & Web App APIs
  PROVIDER_REGISTRATION: '/api/provider/registration',
  PROVIDER_DASHBOARD: '/api/provider/dashboard',
  PROVIDER_BOOKINGS: '/api/provider/bookings',
};

export const buildApiUrl = (endpoint: string): string => {
  const base = getBaseUrl();
  return `${base.replace(/\/$/, '')}${endpoint}`;
};
