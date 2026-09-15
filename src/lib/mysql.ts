import mysql from 'mysql2/promise';
import { Timestamp, isTimestamp } from './timestamp';
export { Timestamp };

const host = process.env.MYSQL_HOST || 'localhost';
const user = process.env.MYSQL_USER || 'root';
const password = process.env.MYSQL_PASSWORD || '';
const databaseName = process.env.MYSQL_DATABASE || 'yourbrand_db';
const port = parseInt(process.env.MYSQL_PORT || '3306', 10);

let poolPromise: Promise<mysql.Pool> | null = null;
let isInitialized = false;

const TABLES = [
  'adminCategories',
  'adminSubCategories',
  'adminServices',
  'userCarts',
  'bookings',
  'users',
  'adminSlideshows',
  'webSettings',
  'appConfiguration',
  'contentPages',
  'adminFAQs',
  'adminReviews',
  'timeSlotCategoryLimits',
  'adminPromoCodes',
  'taxes',
  'visitorInfoLogs',
  'userActivities',
  'chats',
  'chats_messages',
  'userNotifications',
  'adminPopups',
  'admins',
  'providerApplications',
  'withdrawalRequests',
  'blogPosts',
  'contactUsSubmissions',
  'popupSubmissions',
  'cityCategorySeoSettings',
  'areaCategorySeoSettings',
  'areaServiceSeoSettings',
  'quotations',
  'invoices',
  'serviceZones',
  'referrals',
  'pinCodeAreaMappings',
  'cities',
  'areas',
  'searchAnalytics',
  'leaves',
  'seoSettings',
  'outOfZoneRequests',
  'customServiceRequests',
  'push_templates',
  'email_templates',
  'indexingProgress',
  'promoCodeUsage',
  'providerWalletTransactions',
  'providerComplaints',
  'providerControlOptions',
  'adminCoupons',
  'services',
  'adminTaxes',
  'adminCustomImages'
];

/**
 * Gets or creates the MySQL pool, ensuring the database and tables are initialized.
 */
export async function getPool(): Promise<mysql.Pool> {
  const globalPool = (globalThis as any)._mysqlPool as mysql.Pool | undefined;
  if (globalPool) return globalPool;

  if (poolPromise) return poolPromise;

  poolPromise = (async () => {
    try {
      // Create the connection pool with the database selected directly (saves connection quota)
      const newPool = mysql.createPool({
        host,
        user,
        password,
        database: databaseName,
        port,
        connectTimeout: 15000,
        waitForConnections: true,
        connectionLimit: 3,
        maxIdle: 2,
        idleTimeout: 15000,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
      });

      // Run auto-initialization for tables
      await initializeDatabase(newPool);

      (globalThis as any)._mysqlPool = newPool;
      return newPool;
    } catch (error) {
      poolPromise = null;
      console.error("Failed to connect to MySQL database:", error);
      throw error;
    }
  })();

  return poolPromise;
}

/**
 * Creates a specific table on the fly if it does not exist.
 */
export async function ensureTableExists(conn: mysql.Pool | mysql.PoolConnection, tableName: string) {
  const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, '');
  if (!cleanName) return;

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS \`${cleanName}\` (
      \`id\` VARCHAR(255) NOT NULL,
      \`parent_id\` VARCHAR(255) DEFAULT NULL,
      \`data\` JSON NOT NULL,
      \`createdAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_created_at\` (\`createdAt\`),
      INDEX \`idx_parent_id\` (\`parent_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await conn.query(createTableQuery);
}

/**
 * Creates any missing tables with the standardized JSON document schema.
 */
async function initializeDatabase(p: mysql.Pool) {
  if (isInitialized) return;

  try {
    for (const table of TABLES) {
      await ensureTableExists(p, table);
    }
    isInitialized = true;
    console.log("MySQL Database & Tables initialized successfully.");
  } catch (error) {
    console.error("Error during table initialization:", error);
    throw error;
  }
}

async function seedDemoDataForTable(conn: mysql.Pool | mysql.PoolConnection, table: string) {
  console.log(`Seeding default demo data for empty table: ${table}`);
  
  const insert = async (id: string, parentId: string | null, data: any) => {
    const serializedData = { ...data, id };
    await conn.query(
      `INSERT INTO \`${table}\` (\`id\`, \`parent_id\`, \`data\`) VALUES (?, ?, ?)`,
      [id, parentId, JSON.stringify(serializedData)]
    );
  };

  try {
    switch (table) {
      case 'cities':
        await insert('kochi', null, { name: 'Kochi', slug: 'kochi', isActive: true });
        await insert('bangalore', null, { name: 'Bangalore', slug: 'bangalore', isActive: true });
        break;

      case 'areas':
        await insert('edapally', 'kochi', { name: 'Edapally', slug: 'edapally', parentId: 'kochi', cityId: 'kochi', isActive: true });
        await insert('kakkanad', 'kochi', { name: 'Kakkanad', slug: 'kakkanad', parentId: 'kochi', cityId: 'kochi', isActive: true });
        await insert('electronic-city', 'bangalore', { name: 'Electronic City', slug: 'electronic-city', parentId: 'bangalore', cityId: 'bangalore', isActive: true });
        await insert('hsr-layout', 'bangalore', { name: 'HSR Layout', slug: 'hsr-layout', parentId: 'bangalore', cityId: 'bangalore', isActive: true });
        break;

      case 'adminCategories':
        await insert('cleaning', null, { name: 'Cleaning', slug: 'cleaning', order: 1, isActive: true, imageUrl: '/uploads/categories/cleaning.png', iconUrl: '/uploads/categories/cleaning-icon.png' });
        await insert('plumbing', null, { name: 'Plumbing', slug: 'plumbing', order: 2, isActive: true, imageUrl: '/uploads/categories/plumbing.png', iconUrl: '/uploads/categories/plumbing-icon.png' });
        await insert('electrical', null, { name: 'Electrical', slug: 'electrical', order: 3, isActive: true, imageUrl: '/uploads/categories/electrical.png', iconUrl: '/uploads/categories/electrical-icon.png' });
        break;

      case 'adminSubCategories':
        await insert('home-cleaning', null, { parentId: 'cleaning', name: 'Home Cleaning', slug: 'home-cleaning', order: 1, isActive: true });
        await insert('pipe-repair', null, { parentId: 'plumbing', name: 'Pipe Repair', slug: 'pipe-repair', order: 1, isActive: true });
        await insert('fan-installation', null, { parentId: 'electrical', name: 'Fan Installation', slug: 'fan-installation', order: 1, isActive: true });
        break;

      case 'adminServices':
        await insert('deep-cleaning', null, { subCategoryId: 'home-cleaning', name: 'Deep House Cleaning', slug: 'deep-cleaning', description: 'Full deep cleaning of 2BHK/3BHK homes.', price: 2999, discountPrice: 2499, isActive: true, rating: 4.8, totalRatings: 25, durationMinutes: 240, imageUrl: '/uploads/services/deep-cleaning.png' });
        await insert('pipe-fix', null, { subCategoryId: 'pipe-repair', name: 'Leaking Pipe Repair', slug: 'pipe-fix', description: 'Fixing standard household pipe leaks.', price: 399, discountPrice: 299, isActive: true, rating: 4.6, totalRatings: 18, durationMinutes: 60, imageUrl: '/uploads/services/pipe-fix.png' });
        await insert('fan-install', null, { subCategoryId: 'fan-installation', name: 'Ceiling Fan Installation', slug: 'fan-install', description: 'Mounting and connecting standard ceiling fan.', price: 249, discountPrice: 199, isActive: true, rating: 4.7, totalRatings: 32, durationMinutes: 45, imageUrl: '/uploads/services/fan-install.png' });
        break;

      case 'admins':
        await insert('superadmin', null, { email: process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@yourdomain.com', name: 'Super Admin', role: 'superadmin', permissions: ['all'], isActive: true });
        break;

      case 'appConfiguration':
        await insert('stats', null, {
          totalBookings: 0,
          completedBookings: 0,
          totalRevenue: 0,
          earnedCommission: 0,
          totalUsers: 0,
          newSignups30d: 0,
          lastUserNumber: 1000,
          lastBookingNumber: 1000,
          totalDiscountGiven: 0
        });
        break;

      case 'webSettings':
        await insert('global', null, {
          websiteName: "Yourbrand",
          contactEmail: "support@yourdomain.com",
          contactMobile: "+1 123-456-7890",
          address: "123 Main Street, City, Country - 123456",
          logoUrl: "/android-chrome-512x512.png",
          faviconUrl: "/favicon.ico",
          websiteIconUrl: "/android-chrome-512x512.png",
          socialMediaLinks: {
            facebook: "https://facebook.com/yourbrand.in",
            instagram: "https://instagram.com/yourbrand.in",
            twitter: "https://x.com/yourbrand"
          },
          themeColors: {
            light: {
              primary: "221.2 83.2% 53.3%",
              background: "0 0% 100%",
              foreground: "222.2 84% 4.9%",
              card: "0 0% 100%",
              cardForeground: "222.2 84% 4.9%",
              popover: "0 0% 100%",
              popoverForeground: "222.2 84% 4.9%",
              primaryForeground: "210 40% 98%",
              secondary: "210 40% 96.1%",
              secondaryForeground: "222.2 47.4% 11.2%",
              muted: "210 40% 96.1%",
              mutedForeground: "215.4 16.3% 46.9%",
              accent: "210 40% 96.1%",
              accentForeground: "222.2 47.4% 11.2%",
              destructive: "0 84.2% 60.2%",
              destructiveForeground: "210 40% 98%",
              border: "214.3 31.8% 91.4%",
              input: "214.3 31.8% 91.4%",
              ring: "221.2 83.2% 53.3%",
              radius: "0.5rem"
            },
            dark: {
              primary: "217.2 91.2% 59.8%",
              background: "222.2 84% 4.9%",
              foreground: "210 40% 98%",
              card: "222.2 84% 4.9%",
              cardForeground: "210 40% 98%",
              popover: "222.2 84% 4.9%",
              popoverForeground: "210 40% 98%",
              primaryForeground: "222.2 47.4% 11.2%",
              secondary: "217.2 32.6% 17.5%",
              secondaryForeground: "210 40% 98%",
              muted: "217.2 32.6% 17.5%",
              mutedForeground: "215 20.2% 65.1%",
              accent: "217.2 32.6% 17.5%",
              accentForeground: "210 40% 98%",
              destructive: "0 62.8% 30.6%",
              destructiveForeground: "210 40% 98%",
              border: "217.2 32.6% 17.5%",
              input: "217.2 32.6% 17.5%",
              ring: "224.3 76.3% 48%",
              radius: "0.5rem"
            }
          },
          loaderType: "pulse",
          isChatEnabled: true,
          isAiChatBotEnabled: false,
          chatNotificationSoundUrl: "/sounds/default-notification.mp3",
          isCookieConsentEnabled: false,
          cookieConsentMessage: "We use cookies to improve your experience. By continuing, you agree to our Cookie Policy.",
          cookiePolicyContent: "<p>Our Cookie Policy details will be updated here soon.</p>"
        });
        await insert('applicationConfig', null, {
          smtpHost: "smtp.gmail.com",
          smtpPort: "465",
          smtpUser: process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com",
          smtpPass: "your_app_password_here",
          senderEmail: process.env.NEXT_PUBLIC_ADMIN_EMAIL || "admin@yourdomain.com",
          razorpayKeyId: "rzp_test_key_here",
          razorpayKeySecret: "rzp_secret_here",
          commissionPercentage: 15,
          referralBonusReferrer: 100,
          referralBonusReferred: 50,
          smsGatewayApiKey: "",
          fcmServerKey: ""
        });
        await insert('referralSettings', null, {
          referrerBonus: 100,
          referredBonus: 50,
          minWithdrawalLimit: 500,
          isActive: true
        });
        await insert('withdrawalSettings', null, {
          minWithdrawalLimit: 500,
          isActive: true
        });
        await insert('chatSettings', null, {
          isAiBotEnabled: false,
          botGreetingMessage: "Hello! Welcome to Yourbrand. How can we help you today?",
          supportWorkingHours: "9:00 AM - 6:00 PM"
        });
        await insert('whatsappSettings', null, {
          apiUrl: "https://api.whatsapp.com/send",
          accessToken: "",
          phoneNumberId: "",
          businessAccountId: "",
          isActive: false
        });
        await insert('seo', null, {
          title: "Yourbrand | Premium Home Services on Demand",
          description: "Book certified professionals for cleaning, plumbing, electrical, and other premium home services.",
          keywords: "home services, cleaning service, plumber, electrician, yourbrand",
          ogImage: "/android-chrome-512x512.png"
        });
        await insert('loginSettings', null, {
          allowSocialLogin: true,
          requireEmailVerification: false,
          maxLoginAttempts: 5
        });
        break;

      case 'adminFAQs':
        await insert('faq1', null, { question: 'How do I book a service?', answer: 'You can choose a category, select a service, specify your location, select a time slot, and make payment to book.', order: 1, isActive: true });
        await insert('faq2', null, { question: 'What are your service timings?', answer: 'We offer services from 8:00 AM to 8:00 PM every day.', order: 2, isActive: true });
        break;

      case 'adminReviews':
        await insert('review1', null, { customerName: 'Siddharth R.', serviceId: 'deep-cleaning', rating: 5, comment: 'Fantastic service! The cleaners were extremely professional.', date: '2026-07-15' });
        await insert('review2', null, { customerName: 'Ananya M.', serviceId: 'pipe-fix', rating: 4, comment: 'Fixed my leaking kitchen tap within 30 minutes. Good plumber.', date: '2026-07-18' });
        break;

      case 'contentPages':
        await insert('about-us', null, { slug: 'about-us', title: 'About Us', content: '<h1>About Yourbrand</h1><p>Yourbrand is India\'s premium on-demand home services platform...</p>', isActive: true });
        await insert('terms-and-conditions', null, { slug: 'terms-and-conditions', title: 'Terms & Conditions', content: '<h1>Terms & Conditions</h1><p>Please read these terms carefully before booking...</p>', isActive: true });
        await insert('privacy-policy', null, { slug: 'privacy-policy', title: 'Privacy Policy', content: '<h1>Privacy Policy</h1><p>We respect your privacy and protect your data...</p>', isActive: true });
        break;

      case 'adminSlideshows':
        await insert('slide1', null, { title: 'Premium Cleaning Services', description: 'Get 20% off on your first deep home cleaning.', imageUrl: '/uploads/slideshows/slide1.png', linkUrl: '/category/cleaning', order: 1, isActive: true });
        await insert('slide2', null, { title: 'Certified Plumbers', description: 'Fix pipe leaks, taps and blockages quickly.', imageUrl: '/uploads/slideshows/slide2.png', linkUrl: '/category/plumbing', order: 2, isActive: true });
        break;

      case 'adminPromoCodes':
        await insert('Yourbrand20', null, { code: 'Yourbrand20', type: 'percentage', value: 20, minOrderValue: 500, maxDiscountAmount: 200, isActive: true, usageLimit: 100, usageCount: 0 });
        break;
      case 'taxes':
        await insert('gst', null, { name: 'GST', rate: 18, type: 'percentage', isActive: true });
        break;

      case 'seoSettings': {
        const { defaultSeoValues } = require('./seoUtils');
        await insert('global', null, defaultSeoValues);
        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error(`Failed to seed demo data for table ${table}:`, error);
  }
}
// Helpers for serializing/deserializing Timestamp objects to/from JSON

/**
 * Recursively scans an object, converting Timestamps/Dates into standard JSON-serializable structures.
 */
export function serializeDbData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (obj instanceof Date) {
    return { _seconds: Math.floor(obj.getTime() / 1000), _nanoseconds: 0, _isTimestamp: true };
  }

  if (isTimestamp(obj)) {
    const s = typeof obj.seconds === 'number' ? obj.seconds : obj._seconds;
    const ns = typeof obj.nanoseconds === 'number' ? obj.nanoseconds : obj._nanoseconds;
    return { _seconds: s, _nanoseconds: ns, _isTimestamp: true };
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeDbData);
  }

  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const key of Object.keys(obj)) {
      serialized[key] = serializeDbData(obj[key]);
    }
    return serialized;
  }

  return obj;
}

/**
 * Recursively scans an object, reconstructing Timestamp classes from serialized Timestamp structures.
 */
export function deserializeDbData(obj: any): any {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'object') {
    if (obj._isTimestamp === true || (typeof obj._seconds === 'number' && typeof obj._nanoseconds === 'number')) {
      return { _seconds: obj._seconds, _nanoseconds: obj._nanoseconds, _isTimestamp: true };
    }
    if (typeof obj.seconds === 'number' && typeof obj.nanoseconds === 'number' && Object.keys(obj).length === 2) {
      return { _seconds: obj.seconds, _nanoseconds: obj.nanoseconds, _isTimestamp: true };
    }
  }

  if (Array.isArray(obj)) {
    return obj.map(deserializeDbData);
  }

  if (typeof obj === 'object') {
    const deserialized: any = {};
    for (const key of Object.keys(obj)) {
      deserialized[key] = deserializeDbData(obj[key]);
    }
    return deserialized;
  }

  return obj;
}

/**
 * Gets a clean table name from path segments. Handles subcollections by joining with underscore.
 * e.g., "chats/123/messages" -> table: "chats_messages", parent_id: "123"
 */
export function resolvePath(path: string): { table: string; docId: string | null; parentId: string | null } {
  const parts = path.split('/').filter(Boolean);
  let tableName = parts[0] || path;
  if (tableName === 'adminTaxes') tableName = 'taxes';

  let finalTable = tableName;
  let docId: string | null = null;
  let parentId: string | null = null;

  if (parts.length === 1) {
    finalTable = tableName;
  } else if (parts.length === 2) {
    finalTable = tableName;
    docId = parts[1];
  } else if (parts.length === 3) {
    finalTable = `${parts[0]}_${parts[2]}`;
    parentId = parts[1];
  } else if (parts.length >= 4) {
    finalTable = `${parts[0]}_${parts[2]}`;
    docId = parts.slice(3).join('/');
    parentId = parts[1];
  }

  // Validate whitelisted table name to prevent SQL Injection
  if (!TABLES.includes(finalTable)) {
    throw new Error(`Access denied: Invalid database table "${finalTable}"`);
  }

  return { table: finalTable, docId, parentId };
}

// Database query runners implementing Firestore interfaces on MySQL
export async function getDocInternal(conn: mysql.PoolConnection | mysql.Pool, path: string, docIdInput?: string) {
  const resolved = resolvePath(docIdInput ? `${path}/${docIdInput}` : path);
  if (!resolved.docId) {
    return { exists: false, data: null };
  }

  let rows: any = [];
  try {
    const [result]: any = await conn.query(
      `SELECT \`data\` FROM \`${resolved.table}\` WHERE \`id\` = ? LIMIT 1`,
      [resolved.docId]
    );
    rows = result;
  } catch (err: any) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146 || (err.message && err.message.includes("doesn't exist"))) {
      await ensureTableExists(conn, resolved.table);
      return { exists: false, data: null };
    }
    throw err;
  }

  if (rows.length === 0) {
    return { exists: false, data: null };
  }

  const rawData = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  return {
    exists: true,
    data: deserializeDbData(rawData)
  };
}

function jsonExtractText(field: string): string {
  return `JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${field}'))`;
}

function jsonExtractRaw(field: string): string {
  return `JSON_EXTRACT(\`data\`, '$.${field}')`;
}

export async function getDocsInternal(conn: mysql.PoolConnection | mysql.Pool, path: string, constraints: any[] = []) {
  const resolved = resolvePath(path);
  let sql = `SELECT \`id\`, \`data\` FROM \`${resolved.table}\``;
  const whereClauses: string[] = [];
  const params: any[] = [];

  // Filter subcollections by parent_id automatically
  if (resolved.parentId) {
    whereClauses.push('`parent_id` = ?');
    params.push(resolved.parentId);
  }

  const orderByClauses: string[] = [];
  let limitClause = '';
  let offsetClause = '';
  const limitParams: any[] = [];

  const parseConstraint = (c: any) => {
    if (!c) return;
    if (c.type === 'where') {
      const field = c.field;
      const op = c.op;
      const value = serializeDbData(c.value);

      // Safe field validation to prevent SQL Injection
      if (field && !/^[a-zA-Z0-9_$.*\[\]\-]+$/.test(field)) {
        throw new Error(`Access denied: Unsafe field name in query "${field}"`);
      }

      // Handle document id filter
      if (field === 'id' || field === 'uid' || field === '__name__') {
        if (op === '==' || op === 'compare') {
          whereClauses.push('`id` = ?');
          params.push(value);
        } else if (op === 'in') {
          const list = Array.isArray(value) ? value : [value];
          whereClauses.push(`\`id\` IN (${list.map(() => '?').join(', ')})`);
          params.push(...list);
        }
        return;
      }
      // Handle date filters (createdAt/updatedAt) on actual table columns
      if (field === 'createdAt' || field === 'updatedAt') {
        const sqlField = `\`${field}\``;
        const dateValue = extractDate(c.value);
        
        if (op === '==') {
          if (dateValue === null) {
            whereClauses.push(`${sqlField} IS NULL`);
          } else {
            whereClauses.push(`${sqlField} = ?`);
            params.push(dateValue);
          }
        } else if (op === '!=') {
          if (dateValue === null) {
            whereClauses.push(`${sqlField} IS NOT NULL`);
          } else {
            whereClauses.push(`${sqlField} != ?`);
            params.push(dateValue);
          }
        } else if (op === '<') {
          whereClauses.push(`${sqlField} < ?`);
          params.push(dateValue);
        } else if (op === '<=') {
          whereClauses.push(`${sqlField} <= ?`);
          params.push(dateValue);
        } else if (op === '>') {
          whereClauses.push(`${sqlField} > ?`);
          params.push(dateValue);
        } else if (op === '>=') {
          whereClauses.push(`${sqlField} >= ?`);
          params.push(dateValue);
        } else if (op === 'in') {
          const list = (Array.isArray(value) ? value : [value]).map(v => extractDate(v)).filter(Boolean);
          if (list.length > 0) {
            whereClauses.push(`${sqlField} IN (${list.map(() => '?').join(', ')})`);
            params.push(...list);
          }
        }
        return;
      }
      // Translate filter to JSON path
      if (op === '==') {
        if (typeof value === 'boolean') {
          whereClauses.push(`(${jsonExtractText(field)} = ? OR ${jsonExtractText(field)} = ? OR ${jsonExtractText(field)} = ?)`);
          params.push(value ? 'true' : 'false');
          params.push(value ? '1' : '0');
          params.push(value ? '1.0' : '0.0');
        } else if (value === null) {
          whereClauses.push(`${jsonExtractText(field)} IS NULL`);
        } else {
          whereClauses.push(`${jsonExtractText(field)} = ?`);
          params.push(String(value));
        }
      } else if (op === '!=') {
        whereClauses.push(`${jsonExtractText(field)} != ?`);
        params.push(String(value));
      } else if (op === '<') {
        if (typeof value === 'number') {
          whereClauses.push(`CAST(${jsonExtractText(field)} AS DECIMAL(15,4)) < ?`);
        } else {
          whereClauses.push(`${jsonExtractText(field)} < ?`);
        }
        params.push(value);
      } else if (op === '<=') {
        if (typeof value === 'number') {
          whereClauses.push(`CAST(${jsonExtractText(field)} AS DECIMAL(15,4)) <= ?`);
        } else {
          whereClauses.push(`${jsonExtractText(field)} <= ?`);
        }
        params.push(value);
      } else if (op === '>') {
        if (typeof value === 'number') {
          whereClauses.push(`CAST(${jsonExtractText(field)} AS DECIMAL(15,4)) > ?`);
        } else {
          whereClauses.push(`${jsonExtractText(field)} > ?`);
        }
        params.push(value);
      } else if (op === '>=') {
        if (typeof value === 'number') {
          whereClauses.push(`CAST(${jsonExtractText(field)} AS DECIMAL(15,4)) >= ?`);
        } else {
          whereClauses.push(`${jsonExtractText(field)} >= ?`);
        }
        params.push(value);
      } else if (op === 'array-contains') {
        whereClauses.push(`JSON_CONTAINS(${jsonExtractRaw(field)}, ?)`);
        params.push(typeof value === 'string' ? JSON.stringify(value) : value);
      } else if (op === 'in') {
        const list = Array.isArray(value) ? value : [value];
        whereClauses.push(`${jsonExtractText(field)} IN (${list.map(() => '?').join(', ')})`);
        params.push(...list.map(v => String(v)));
      } else if (op === 'array-contains-any') {
        const list = Array.isArray(value) ? value : [value];
        const subQueries = list.map(() => `JSON_CONTAINS(${jsonExtractRaw(field)}, ?)`).join(' OR ');
        whereClauses.push(`(${subQueries})`);
        params.push(...list.map(v => typeof v === 'string' ? JSON.stringify(v) : v));
      }
    } else if (c.type === 'orderBy') {
      const field = c.field;
      const direction = c.direction || 'asc';

      // Safe field validation
      if (field && !/^[a-zA-Z0-9_$.*\[\]\-]+$/.test(field)) {
        throw new Error(`Access denied: Unsafe order field name "${field}"`);
      }

      if (!['asc', 'desc'].includes(direction.toLowerCase())) {
        throw new Error(`Access denied: Invalid sorting direction "${direction}"`);
      }

      if (field === 'createdAt' || field === 'updatedAt') {
        orderByClauses.push(`\`${field}\` ${direction.toUpperCase()}`);
      } else if (['order', 'price', 'rating', 'reviewCount', 'discountedPrice', 'minQuantity', 'maxQuantity'].includes(field)) {
        orderByClauses.push(`CAST(${jsonExtractText(field)} AS SIGNED) ${direction.toUpperCase()}`);
      } else {
        orderByClauses.push(`${jsonExtractText(field)} ${direction.toUpperCase()}`);
      }
    } else if (c.type === 'limit') {
      limitClause = ` LIMIT ?`;
      limitParams.push(Number(c.value));
    } else if (c.type === 'offset') {
      offsetClause = ` OFFSET ?`;
      limitParams.push(Number(c.value));
    } else if (c.type === 'and') {
      if (Array.isArray(c.conditions)) {
        c.conditions.forEach(parseConstraint);
      }
    } else if (c.type === 'or') {
      const orClauses: string[] = [];
      if (Array.isArray(c.conditions)) {
        for (const cond of c.conditions) {
          const tempWhere: string[] = [];
          const tempParams: any[] = [];
          
          if (cond.type === 'where') {
            const f = cond.field;
            const o = cond.op;
            const val = serializeDbData(cond.value);

            // Safe field validation for OR query
            if (f && !/^[a-zA-Z0-9_$.*\[\]\-]+$/.test(f)) {
              throw new Error(`Access denied: Unsafe field name in OR query "${f}"`);
            }
            if (f === 'id' || f === 'uid' || f === '__name__') {
              tempWhere.push('`id` = ?');
              tempParams.push(val);
            } else if (o === '==') {
              if (typeof val === 'boolean') {
                tempWhere.push(`${jsonExtractText(f)} = ?`);
                tempParams.push(val ? 'true' : 'false');
              } else if (val === null) {
                tempWhere.push(`${jsonExtractText(f)} IS NULL`);
              } else {
                tempWhere.push(`${jsonExtractText(f)} = ?`);
                tempParams.push(String(val));
              }
            } else if (o === '!=') {
              tempWhere.push(`${jsonExtractText(f)} != ?`);
              tempParams.push(String(val));
            } else if (o === 'array-contains') {
              tempWhere.push(`JSON_CONTAINS(${jsonExtractRaw(f)}, ?)`);
              tempParams.push(typeof val === 'string' ? JSON.stringify(val) : val);
            }
          } else if (cond.type === 'and') {
            cond.conditions?.forEach(parseConstraint);
          }
          
          if (tempWhere.length > 0) {
            orClauses.push(tempWhere.join(' AND '));
            params.push(...tempParams);
          }
        }
      }
      if (orClauses.length > 0) {
        whereClauses.push(`(${orClauses.join(' OR ')})`);
      }
    }
  };

  constraints.forEach(parseConstraint);

  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  if (orderByClauses.length > 0) {
    sql += ` ORDER BY ${orderByClauses.join(', ')}`;
  }
  if (limitClause) {
    sql += limitClause;
    if (offsetClause) sql += offsetClause;
  } else if (offsetClause) {
    sql += ` LIMIT 18446744073709551615${offsetClause}`;
  }

  if (limitParams.length > 0) {
    params.push(...limitParams);
  }

  let rows: any = [];
  try {
    const [result]: any = await conn.query(sql, params);
    rows = result;
  } catch (err: any) {
    if (err.code === 'ER_NO_SUCH_TABLE' || err.errno === 1146 || (err.message && err.message.includes("doesn't exist"))) {
      await ensureTableExists(conn, resolved.table);
      return [];
    }
    throw err;
  }

  return (rows || []).map((row: any) => {
    const rawData = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    return {
      id: row.id,
      data: deserializeDbData(rawData)
    };
  });
}

function resolveFieldValues(target: any, source: any): any {
  if (source === null || source === undefined) return source;

  if (typeof source === 'object') {
    if (source.type === 'arrayUnion' && Array.isArray(source.elements)) {
      const arr = Array.isArray(target) ? [...target] : [];
      for (const el of source.elements) {
        const stringifiedEl = JSON.stringify(el);
        if (!arr.some(item => JSON.stringify(item) === stringifiedEl)) {
          arr.push(el);
        }
      }
      return arr;
    }

    if (source.type === 'arrayRemove' && Array.isArray(source.elements)) {
      const arr = Array.isArray(target) ? [...target] : [];
      const elementsToRemove = source.elements.map((el: any) => JSON.stringify(el));
      return arr.filter(item => !elementsToRemove.includes(JSON.stringify(item)));
    }

    if (source.type === 'deleteField') {
      return undefined;
    }

    if (source.type === 'serverTimestamp') {
      const now = new Date();
      return { _seconds: Math.floor(now.getTime() / 1000), _nanoseconds: 0, _isTimestamp: true };
    }

    if (source.type === 'increment' && Array.isArray(source.elements)) {
      return (Number(target) || 0) + (Number(source.elements[0]) || 0);
    }
  }

  if (Array.isArray(source)) {
    return source.map((item) => resolveFieldValues(undefined, item));
  }

  if (typeof source === 'object' && !isTimestamp(source)) {
    const result = { ...(target || {}) };
    for (const key of Object.keys(source)) {
      const resolved = resolveFieldValues(result[key], source[key]);
      if (resolved === undefined) {
        delete result[key];
      } else {
        result[key] = resolved;
      }
    }
    return result;
  }

  return source;
}

function extractDate(val: any): Date | null {
  if (!val) return null;
  if (val._isTimestamp && typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000);
  }
  if (val.seconds !== undefined && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function addDocInternal(conn: mysql.PoolConnection | mysql.Pool, path: string, data: any) {
  const resolved = resolvePath(path);
  await ensureTableExists(conn, resolved.table);
  // Generate random id if not in data, or use existing
  const docId = data.id || data.uid || require('nanoid').nanoid(20);
  const resolvedData = resolveFieldValues(null, data);
  const cleanData = { ...serializeDbData(resolvedData), id: docId };

  const createdAtDate = extractDate(cleanData.createdAt);
  const updatedAtDate = extractDate(cleanData.updatedAt);

  if (createdAtDate && updatedAtDate) {
    await conn.query(
      `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`, \`createdAt\`, \`updatedAt\`) VALUES (?, ?, ?, ?, ?)`,
      [docId, resolved.parentId, JSON.stringify(cleanData), createdAtDate, updatedAtDate]
    );
  } else if (createdAtDate) {
    await conn.query(
      `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`, \`createdAt\`) VALUES (?, ?, ?, ?)`,
      [docId, resolved.parentId, JSON.stringify(cleanData), createdAtDate]
    );
  } else {
    await conn.query(
      `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`) VALUES (?, ?, ?)`,
      [docId, resolved.parentId, JSON.stringify(cleanData)]
    );
  }

  return { id: docId };
}

export async function setDocInternal(conn: mysql.PoolConnection | mysql.Pool, path: string, docIdInput: string, data: any, options: any = {}) {
  const resolved = resolvePath(`${path}/${docIdInput}`);
  await ensureTableExists(conn, resolved.table);
  const resolvedData = resolveFieldValues(null, data);
  const cleanData = serializeDbData(resolvedData);

  if (options.merge) {
    // Merge with existing
    const existing = await getDocInternal(conn, path, docIdInput);
    if (existing.exists) {
      const merged = resolveFieldValues(serializeDbData(existing.data), cleanData);
      merged.id = resolved.docId;
      
      const createdAtDate = extractDate(merged.createdAt);
      const updatedAtDate = extractDate(merged.updatedAt);

      if (createdAtDate && updatedAtDate) {
        await conn.query(
          `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`, \`createdAt\`, \`updatedAt\`) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`), \`createdAt\` = VALUES(\`createdAt\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
          [resolved.docId, resolved.parentId, JSON.stringify(merged), createdAtDate, updatedAtDate]
        );
      } else if (createdAtDate) {
        await conn.query(
          `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`, \`createdAt\`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`), \`createdAt\` = VALUES(\`createdAt\`)`,
          [resolved.docId, resolved.parentId, JSON.stringify(merged), createdAtDate]
        );
      } else {
        await conn.query(
          `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`)`,
          [resolved.docId, resolved.parentId, JSON.stringify(merged)]
        );
      }
      return;
    }
  }

  const finalData = { ...cleanData, id: resolved.docId };
  const createdAtDate = extractDate(finalData.createdAt);
  const updatedAtDate = extractDate(finalData.updatedAt);

  if (createdAtDate && updatedAtDate) {
    await conn.query(
      `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`, \`createdAt\`, \`updatedAt\`) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`), \`createdAt\` = VALUES(\`createdAt\`), \`updatedAt\` = VALUES(\`updatedAt\`)`,
      [resolved.docId, resolved.parentId, JSON.stringify(finalData), createdAtDate, updatedAtDate]
    );
  } else if (createdAtDate) {
    await conn.query(
      `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`, \`createdAt\`) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`), \`createdAt\` = VALUES(\`createdAt\`)`,
      [resolved.docId, resolved.parentId, JSON.stringify(finalData), createdAtDate]
    );
  } else {
    await conn.query(
      `INSERT INTO \`${resolved.table}\` (\`id\`, \`parent_id\`, \`data\`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE \`data\` = VALUES(\`data\`)`,
      [resolved.docId, resolved.parentId, JSON.stringify(finalData)]
    );
  }
}

export async function updateDocInternal(conn: mysql.PoolConnection | mysql.Pool, path: string, docIdInput: string, data: any) {
  const resolved = resolvePath(`${path}/${docIdInput}`);
  const cleanData = serializeDbData(data);

  const existing = await getDocInternal(conn, path, docIdInput);
  const merged: any = existing.exists ? { ...serializeDbData(existing.data) } : {};
  for (const key of Object.keys(cleanData)) {
    // Support dot notation path updates e.g. "marketingStatus.welcomeSent"
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = merged;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      const lastKey = parts[parts.length - 1];
      const resolvedVal = resolveFieldValues(current[lastKey], cleanData[key]);
      if (resolvedVal === undefined) {
        delete current[lastKey];
      } else {
        current[lastKey] = resolvedVal;
      }
    } else {
      const resolvedVal = resolveFieldValues(merged[key], cleanData[key]);
      if (resolvedVal === undefined) {
        delete merged[key];
      } else {
        merged[key] = resolvedVal;
      }
    }
  }

  const createdAtDate = extractDate(merged.createdAt);
  const updatedAtDate = extractDate(merged.updatedAt);

  if (createdAtDate && updatedAtDate) {
    await conn.query(
      `UPDATE \`${resolved.table}\` SET \`data\` = ?, \`createdAt\` = ?, \`updatedAt\` = ? WHERE \`id\` = ?`,
      [JSON.stringify(merged), createdAtDate, updatedAtDate, resolved.docId]
    );
  } else if (createdAtDate) {
    await conn.query(
      `UPDATE \`${resolved.table}\` SET \`data\` = ?, \`createdAt\` = ? WHERE \`id\` = ?`,
      [JSON.stringify(merged), createdAtDate, resolved.docId]
    );
  } else {
    await conn.query(
      `UPDATE \`${resolved.table}\` SET \`data\` = ? WHERE \`id\` = ?`,
      [JSON.stringify(merged), resolved.docId]
    );
  }
}

export async function deleteDocInternal(conn: mysql.PoolConnection | mysql.Pool, path: string, docIdInput?: string) {
  const resolved = resolvePath(docIdInput ? `${path}/${docIdInput}` : path);
  if (!resolved.docId) return;

  await conn.query(
    `DELETE FROM \`${resolved.table}\` WHERE \`id\` = ?`,
    [resolved.docId]
  );
}
