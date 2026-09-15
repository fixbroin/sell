const fs = require('fs');
const path = require('path');

function copyDirFiltered(src, dest, excludeDirName) {
  try {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === excludeDirName) continue; // Skip copying large uploads folder to prevent duplicating storage

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        copyDirFiltered(srcPath, destPath, excludeDirName);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  } catch (err) {
    console.error(`[Postbuild] Error copying ${src} -> ${dest}:`, err);
  }
}

const root = path.join(__dirname, '..');
const standalonePath = path.join(root, '.next', 'standalone');

if (fs.existsSync(standalonePath)) {
  console.log('[Postbuild] Copying essential assets to standalone (excluding uploads)...');
  copyDirFiltered(path.join(root, 'public'), path.join(standalonePath, 'public'), 'uploads');
  
  const staticSrc = path.join(root, '.next', 'static');
  const staticDest = path.join(standalonePath, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    fs.mkdirSync(staticDest, { recursive: true });
    fs.cpSync(staticSrc, staticDest, { recursive: true });
    console.log(`[Postbuild] Successfully copied ${staticSrc} -> ${staticDest}`);
  }

  const serverSrc = path.join(root, '.next', 'server');
  const serverDest = path.join(standalonePath, '.next', 'server');
  if (fs.existsSync(serverSrc)) {
    fs.mkdirSync(serverDest, { recursive: true });
    fs.cpSync(serverSrc, serverDest, { recursive: true });
    console.log(`[Postbuild] Successfully copied ${serverSrc} -> ${serverDest}`);
  }
} else {
  console.log('[Postbuild] Standalone folder not found. Skipping static files copy.');
}
