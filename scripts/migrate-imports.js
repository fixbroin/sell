// scripts/migrate-imports.js
const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath);
    } else if (stat.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      // Skip the adapter files themselves to avoid any self-reference loops
      if (
        file === 'mysqlDb.ts' || 
        file === 'mysqlDbAdmin.ts' || 
        file === 'mysqlStorage.ts' ||
        file === 'mysql.ts'
      ) {
        continue;
      }
      migrateFile(filePath);
    }
  }
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  // Replace client-side firestore imports
  const firestorePattern1 = /from\s+['"]firebase\/firestore['"]/g;
  if (firestorePattern1.test(content)) {
    content = content.replace(firestorePattern1, "from '@/lib/mysqlDb'");
    changed = true;
  }

  // Replace client-side storage imports
  const storagePattern1 = /from\s+['"]firebase\/storage['"]/g;
  if (storagePattern1.test(content)) {
    content = content.replace(storagePattern1, "from '@/lib/mysqlStorage'");
    changed = true;
  }

  // Replace any server-side firestore admin imports just in case
  const adminFirestorePattern = /from\s+['"]firebase-admin\/firestore['"]/g;
  if (adminFirestorePattern.test(content)) {
    content = content.replace(adminFirestorePattern, "from '@/lib/mysqlDbAdmin'");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Migrated imports in: ${path.relative(srcDir, filePath)}`);
  }
}

console.log("Starting imports migration from Firebase Firestore/Storage to local MySQL/FileSystem adapters...");
walk(srcDir);
console.log("Imports migration completed.");
