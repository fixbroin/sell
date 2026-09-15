const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

function getMySqlConfig() {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && (dbUrl.startsWith('mysql://') || dbUrl.startsWith('mysql2://'))) {
    try {
      const parsed = new URL(dbUrl);
      return {
        host: parsed.hostname || 'localhost',
        user: decodeURIComponent(parsed.username || 'root'),
        password: decodeURIComponent(parsed.password || ''),
        databaseName: (parsed.pathname || '').replace(/^\//, '') || 'yourbrand_db',
        port: parseInt(parsed.port || '3306', 10),
      };
    } catch (e) {
      console.warn("Failed to parse DATABASE_URL, falling back to MYSQL_* variables:", e);
    }
  }
  return {
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    databaseName: process.env.MYSQL_DATABASE || 'yourbrand_db',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  };
}

const { host, user, password, databaseName, port } = getMySqlConfig();

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
  'email_templates'
];

async function main() {
  console.log('[DB-Init] Checking MySQL database...');
  let rootConn;
  try {
    rootConn = await mysql.createConnection({
      host,
      user,
      password,
      port,
      connectTimeout: 10000
    });
    await rootConn.query(`CREATE DATABASE IF NOT EXISTS \`${databaseName}\``);
    console.log(`[DB-Init] Database "${databaseName}" checked/created successfully.`);
  } catch (err) {
    console.error('[DB-Init] Error creating database:', err.message || err.code || err);
    process.exit(1);
  } finally {
    if (rootConn) await rootConn.end();
  }

  let dbConn;
  try {
    dbConn = await mysql.createConnection({
      host,
      user,
      password,
      database: databaseName,
      port,
      connectTimeout: 10000
    });

    console.log('[DB-Init] Checking database tables...');
    for (const table of TABLES) {
      const cleanName = table.replace(/[^a-zA-Z0-9_]/g, '');
      if (!cleanName) continue;

      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS \`${cleanName}\` (
          \`id\` VARCHAR(255) NOT NULL,
          \`parent_id\` VARCHAR(255) DEFAULT NULL,
          \`data\` LONGTEXT NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          KEY \`idx_parent\` (\`parent_id\`),
          KEY \`idx_created\` (\`created_at\`),
          KEY \`idx_updated\` (\`updated_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;
      await dbConn.query(createTableQuery);
    }
    console.log('[DB-Init] All database tables checked/created successfully.');
  } catch (err) {
    console.error('[DB-Init] Error connecting/initializing tables:', err.message || err.code || err);
    process.exit(1);
  } finally {
    if (dbConn) await dbConn.end();
  }
}

main();
