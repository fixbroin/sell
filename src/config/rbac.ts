
export type AdminRole = 'super_admin' | 'staff_admin' | 'booking_admin' | 'finance_admin' | 'content_admin' | 'staff';

export type AdminPermission = {
  read: boolean;
  create: boolean;
  write: boolean;
  delete: boolean;
};

export type AdminPermissions = Record<string, AdminPermission>;

// 1:1 Mapping for EVERY single page in the sidebar
export const PERMISSION_MODULES = [
  { id: 'dashboard', label: 'Dashboard', paths: ['/admin'] },
  { id: 'activity_feed', label: 'Activity Feed', paths: ['/admin/activity-feed'] },
  { id: 'manage_admins', label: 'Staff Management', paths: ['/admin/manage-admins'] },
  { id: 'bookings', label: 'Bookings', paths: ['/admin/bookings'] },
  { id: 'users', label: 'Users', paths: ['/admin/users'] },
  { id: 'inquiries', label: 'Inquiries', paths: ['/admin/inquiries'] },
  { id: 'chat', label: 'Chat Management', paths: ['/admin/chat'] },
  { id: 'custom_service', label: 'Custom Requests', paths: ['/admin/custom-service'] },
  { id: 'provider_applications', label: 'Provider Applications', paths: ['/admin/provider-applications'] },
  { id: 'provider_withdrawals', label: 'Provider Withdrawals', paths: ['/admin/provider-withdrawals'] },
  { id: 'provider_controls', label: 'Provider Controls', paths: ['/admin/provider-controls'] },
  { id: 'categories', label: 'Categories', paths: ['/admin/categories'] },
  { id: 'sub_categories', label: 'Sub-Categories', paths: ['/admin/sub-categories'] },
  { id: 'services', label: 'Services', paths: ['/admin/services'] },
  { id: 'slideshows', label: 'Slideshows', paths: ['/admin/slideshows'] },
  { id: 'blog', label: 'Blog', paths: ['/admin/blog'] },
  { id: 'reviews', label: 'Reviews', paths: ['/admin/reviews'] },
  { id: 'faq', label: 'FAQ', paths: ['/admin/faq'] },
  { id: 'cities', label: 'Cities', paths: ['/admin/cities'] },
  { id: 'areas', label: 'Areas', paths: ['/admin/areas'] },
  { id: 'service_zones', label: 'Service Zones', paths: ['/admin/service-zones'] },
  { id: 'seo_settings', label: 'Global SEO Patterns', paths: ['/admin/seo-settings'] },
  { id: 'seo_overrides', label: 'Advanced SEO', paths: ['/admin/seo-overrides', '/admin/service-seo', '/admin/google-indexing'] },
  { id: 'referral_settings', label: 'Referral System', paths: ['/admin/referral-settings'] },
  { id: 'quotation_invoice', label: 'Quotation & Invoice', paths: ['/admin/quotation-invoice'] },
  { id: 'taxes', label: 'Tax Configurations', paths: ['/admin/taxes'] },
  { id: 'platform_settings', label: 'Platform Fees', paths: ['/admin/platform-settings'] },
  { id: 'time_slots', label: 'Time Slot Limits', paths: ['/admin/time-slots'] },
  { id: 'reports', label: 'Booking Reports', paths: ['/admin/reports'] },
  { id: 'visitor_info', label: 'Visitor Info', paths: ['/admin/visitor-info'] },
  { id: 'features', label: 'Homepage Features', paths: ['/admin/features'] },
  { id: 'marketing_settings', label: 'Marketing IDs', paths: ['/admin/marketing-settings'] },
  { id: 'marketing_automation', label: 'Marketing Automation', paths: ['/admin/marketing-automation'] },
  { id: 'whatsapp_settings', label: 'WhatsApp Settings', paths: ['/admin/whatsapp-settings'] },
  { id: 'newsletter_popups', label: 'Newsletter Popups', paths: ['/admin/newsletter-popups'] },
  { id: 'promo_codes', label: 'Promo Codes', paths: ['/admin/promo-codes'] },
  { id: 'theme_settings', label: 'Theme Settings', paths: ['/admin/theme-settings'] },
  { id: 'image_gallery', label: 'Image Gallery', paths: ['/admin/image-gallery'] },
  { id: 'settings', label: 'App Settings', paths: ['/admin/settings'] },
  { id: 'email_settings', label: 'Email Settings', paths: ['/admin/email-settings'] },
  { id: 'push_settings', label: 'Push Settings', paths: ['/admin/push-settings'] },
  { id: 'login_settings', label: 'Login Settings', paths: ['/admin/login-settings'] },
  { id: 'web_settings', label: 'Web Settings', paths: ['/admin/web-settings'] },
  { id: 'cookie_settings', label: 'Cookie Settings', paths: ['/admin/cookie-settings'] },
  { id: 'database_tools', label: 'Database Tools', paths: ['/admin/database-tools'] },
  { id: 'system_logs', label: 'System Logs', paths: ['/admin/system-logs'] },
];

export const DEFAULT_PERMISSIONS: AdminPermissions = PERMISSION_MODULES.reduce((acc, m) => {
  acc[m.id] = { read: false, create: false, write: false, delete: false };
  return acc;
}, {} as AdminPermissions);

export const SUPER_ADMIN_PERMISSIONS: AdminPermissions = PERMISSION_MODULES.reduce((acc, m) => {
  acc[m.id] = { read: true, create: true, write: true, delete: true };
  return acc;
}, {} as AdminPermissions);

/**
 * Helper to check if a user has access to a path based on their granular permissions
 */
export function hasPathAccess(permissions: AdminPermissions | null | undefined, path: string): boolean {
  if (!permissions) return false;
  
  // Profile and Notifications are always readable for any admin (they are top bar functions)
  if (path === '/admin/profile' || path === '/admin/notifications') return true;

  // Exact match for dashboard
  if (path === '/admin') {
      return permissions['dashboard']?.read || false;
  }

  // Find the exact module that governs this path
  // Sort by length descending to match more specific paths first (e.g., /admin/provider-applications before /admin/provider)
  const sortedModules = [...PERMISSION_MODULES].sort((a, b) => {
    const aLen = Math.max(...a.paths.map(p => p.length));
    const bLen = Math.max(...b.paths.map(p => p.length));
    return bLen - aLen;
  });

  const foundModule = sortedModules.find(m => m.paths.some(p => path === p || path.startsWith(p + '/')));
  
  if (!foundModule) return false; // Path not explicitly governed by a module in the matrix
  
  return permissions[foundModule.id]?.read || false;
}

/**
 * Helper to check for specific action permissions
 */
export function hasActionPermission(permissions: AdminPermissions | null | undefined, moduleId: string, action: 'read' | 'create' | 'write' | 'delete'): boolean {
  if (!permissions) return false;
  return permissions[moduleId]?.[action] || false;
}

/**
 * Helper to find the first accessible route for a staff member if they don't have dashboard access.
 */
export function getFirstAccessiblePath(permissions: AdminPermissions | null | undefined): string {
  if (!permissions) return '/admin/profile'; 
  
  if (permissions['dashboard']?.read) return '/admin';

  // Iterate through modules in priority order to find the first readable one
  for (const m of PERMISSION_MODULES) {
    if (permissions[m.id]?.read && m.paths.length > 0) {
       return m.paths[0]; 
    }
  }

  return '/admin/profile';
}
