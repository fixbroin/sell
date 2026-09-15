# Yourbrand VPS Deployment Guide

This document describes the deployment procedures for the Yourbrand Next.js standalone application on a VPS using PM2.

---

## 1. First-Time Setup (Fresh Installation)

Use these commands when deploying the application on a new VPS or setting up a clean directory:

```bash
# 1. Stop and remove any old PM2 instance if it exists
pm2 stop yourdomain.com || true
pm2 delete yourdomain.com || true

# 2. Clean old files and clone the repository
rm -rf /var/www/yourdomain.com
cd /var/www/
git clone https://github.com/yourbrandin/yourdomain.com.git
cd /var/www/yourdomain.com

# 3. Create and configure your environment variables
# Copy your production credentials into this file
nano .env

# 4. Install all node package dependencies
npm install

# 5. Compile the production bundle
npm run build

# 6. Start the standalone server with PM2
pm2 start npm --name "yourdomain.com" -- start

# 7. Save PM2 state so the server boots on system restart
pm2 save
```

---

## 2. Deploying Updates (Standard Update Flow)

For all future updates, use this workflow to pull changes without losing your `.env` file configuration and to keep downtime to a minimum:

```bash
# 1. Navigate to the project directory
cd /var/www/yourdomain.com

# 2. Pull the latest commits from GitHub
git pull origin main

# 3. Install any new dependencies if added
npm install

# 4. Re-compile the production bundle
npm run build

# 5. Restart the PM2 process
pm2 restart yourdomain.com
```

> [!WARNING]
> If a commit changes the `start` script in `package.json` (such as changing the port or swapping from `next start` to `node .next/standalone`), PM2 may still hold the old execution path in its memory cache. 
> In this case, perform a clean restart:
> ```bash
> pm2 delete yourdomain.com
> pm2 start npm --name "yourdomain.com" -- start
> pm2 save
> ```
