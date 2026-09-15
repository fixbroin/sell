
import type { GlobalWebSettings } from '@/types/firestore';
import { DEFAULT_LIGHT_THEME_COLORS_HSL, DEFAULT_DARK_THEME_COLORS_HSL } from '@/lib/colorUtils';

export const defaultGlobalWebSettings: GlobalWebSettings = {
  websiteName: "Yourbrand",
  contactEmail: "support@yourdomain.com",
  contactMobile: "+917353113455",
  address: "123 Main Street, City, Country - 123456",
  logoUrl: "/android-chrome-512x512.png",
  faviconUrl: "/favicon.ico",
  websiteIconUrl: "/android-chrome-512x512.png",
  socialMediaLinks: {
    facebook: "https://www.facebook.com/yourbrand.in",
    instagram: "https://www.instagram.com/yourbrand.in",
    twitter: "https://x.com/yourbrand_in",
    linkedin: "https://www.linkedin.com/company/yourbrand-in",
    youtube: "https://www.youtube.com/@yourbrand-in",
  },
  themeColors: {
    light: { ...DEFAULT_LIGHT_THEME_COLORS_HSL },
    dark: { ...DEFAULT_DARK_THEME_COLORS_HSL },
  },
  loaderType: 'pulse',
  isChatEnabled: false,
  isAiChatBotEnabled: false,
  chatNotificationSoundUrl: "/sounds/default-notification.mp3",
  globalAdminPopup: {
    message: "",
    isActive: false,
    durationSeconds: 10,
  },
  isCookieConsentEnabled: false,
  cookieConsentMessage: "We use cookies to improve your experience. By continuing, you agree to our Cookie Policy.",
  cookiePolicyContent: "<p>Our Cookie Policy details will be updated here soon.</p>",
};
