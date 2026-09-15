# 🌐 Shared Hosting Remote Database Setup Guide (Hostinger / cPanel / hPanel)

This optional guide explains step-by-step how to set up your **MySQL Database** on a Shared Hosting server (like Hostinger hPanel or cPanel) and connect your **Next.js Web Application** (running on a VPS or Vercel) remotely. This is ideal if you want to run your database separately for safety, backups, or maintenance.

---

## 📌 Option A: Deploying Next.js on Vercel / VPS & Connecting Shared Hosting MySQL Remotely (Optional)

If your Next.js web application is hosted on a VPS or Vercel and you want to use your Shared Hosting plan purely for your MySQL database:

### Step 1: Create MySQL Database in Shared Hosting Panel
1. Log into your **Shared Hosting hPanel/cPanel**.
2. Navigate to **Databases** ➔ **MySQL Databases**.
3. Create a new database:
   - **Database Name**: `your_database_name`
   - **MySQL Username**: `your_database_user`
   - **Password**: Create a strong password (e.g. `your_strong_db_password_here`)
4. Click **Create**.

### Step 2: Enable Remote MySQL Access in Hosting Panel
1. In your hosting panel, go to **Databases** ➔ **Remote MySQL**.
2. Under **IP (IPv4 or IPv6)**, enter the IP address of your VPS / Vercel deployment, OR check the option/enter **"Any Host (%)"** to allow any host to connect.
3. Select your newly created Database.
4. Click **Create** or **Save**.
   *(Note down the database Host IP/URL: e.g., `mysql.yourdomain.com` or your database server IP address)*

### Step 3: Configure Environment Variables in Next.js Server / Vercel
In your VPS `.env` file or your Vercel Project Settings ➔ **Environment Variables**, configure the database credentials to point to your remote hosting server:

```env
MYSQL_HOST=mysql.yourdomain.com (or your hosting database server IP)
MYSQL_USER=your_database_user
MYSQL_PASSWORD=your_strong_db_password_here
MYSQL_DATABASE=your_database_name
MYSQL_PORT=3306
```

### Step 4: Run Initial Migration
1. Start your server.
2. Open your website Admin Panel and navigate to **Database Tools** in the sidebar.
3. The database initialization script will run automatically on startup to build all tables with the standardized JSON document schema, or you can run migrations manually.

---

## 📌 Option B: Running Next.js Directly on Hostinger Shared Hosting Node.js Application Runner

If your Hostinger Shared Hosting plan includes the **Node.js App** feature and you wish to run both the Next.js app and database locally on it:

### Step 1: Create Database in Hostinger
1. Create Database & User in Hostinger hPanel (**MySQL Databases**).
2. Since Next.js runs on the same server, set the database host to localhost:

```env
MYSQL_HOST=localhost
MYSQL_USER=your_database_user
MYSQL_PASSWORD=your_strong_db_password_here
MYSQL_DATABASE=your_database_name
MYSQL_PORT=3306
```

### Step 2: Build & Upload Standalone Next.js App
1. On your local machine, run:
   ```bash
   npm run build
   ```
2. Compress and upload the `.next/standalone` folder and `public/` directory into your Hostinger `public_html` or Node.js app directory.
3. Start the application runner:
   ```bash
   npm run start
   ```

---

## ✅ Verification
1. Visit your domain `https://yourdomain.com`.
2. Open `/admin/database-tools` to verify database health status.
3. Test creating a booking or service to confirm remote MySQL database operations!
