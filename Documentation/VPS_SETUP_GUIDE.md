# 🚀 VPS Setup & Production Deployment Guide (Ubuntu / Debian / Hostinger VPS)

This guide covers a comprehensive, step-by-step setup of **MySQL Server**, **Node.js**, **Nginx Reverse Proxy**, **SSL Certificates**, and **PM2 Process Manager** on an Ubuntu/Debian VPS. Follow these steps to host your application under your custom domain.

---

## 📋 Prerequisites
* A VPS running **Ubuntu 20.04 / 22.04 LTS** or **Debian 11/12**.
* SSH access to the VPS.
* A domain name (e.g., `yourdomain.com`) with its **DNS A Records** pointed to your VPS IP address.

---

## 🛠️ Step 1: Connect to VPS & Install Runtime Environment

### 1. Connect via SSH
Open your computer's terminal (or Git Bash / PuTTY) and connect to your server as `root` (or a sudo user):
```bash
ssh root@your_vps_ip_address
```

### 2. Update System Packages
Ensure all system dependencies are up-to-date:
```bash
sudo apt update && sudo apt upgrade -y
```

### 3. Install Node.js (LTS Version 20)
Run the NodeSource setup script to install Node.js 20.x:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx git build-essential unzip
```

### 4. Verify Installation
Ensure Node.js and NPM are successfully installed:
```bash
node -v   # Should show v20.x.x
npm -v    # Should show v10.x.x
```

### 5. Install PM2 Globally
PM2 is a production process manager that keeps your Node.js application running in the background and restarts it if it crashes:
```bash
sudo npm install -g pm2
```

---

## 🗄️ Step 2: Install and Secure MySQL Server

### 1. Install MySQL
```bash
sudo apt install -y mysql-server
```

### 2. Start and Enable MySQL Service
Ensure MySQL runs automatically on system boot:
```bash
sudo systemctl start mysql
sudo systemctl enable mysql
```

### 3. Secure MySQL (Optional but Recommended)
Run the security script to configure password validation, disable remote root login, and remove test databases:
```bash
sudo mysql_secure_installation
```
*(Follow the on-screen prompts to configure your security preferences).*

---

## 🔑 Step 3: Create MySQL Database & User

### 1. Log into MySQL CLI
```bash
sudo mysql
```

### 2. Execute Database Configuration Commands
Run the following SQL commands to create a clean database and authorized user:
```sql
-- 1. Create your production database
CREATE DATABASE your_database_name CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. Create a secure MySQL user with a strong password
CREATE USER 'your_database_user'@'localhost' IDENTIFIED BY 'SuperStrongPassword123!';

-- 3. Grant privileges to the user on the database
GRANT ALL PRIVILEGES ON your_database_name.* TO 'your_database_user'@'localhost';

-- 4. Apply privileges and exit
FLUSH PRIVILEGES;
EXIT;
```

---

## 📁 Step 4: Upload and Build Next.js Application

You can deploy the files to the VPS using **Option A (Git)**, **Option B (SFTP/Zip Source)**, or **Option C (Local Build Upload)**.

### 📌 Option A: Deploying via Git (Recommended)
1. Push your customized project code to a private Git repository (GitHub/GitLab).
2. Clone it directly onto your VPS in the `/var/www/` directory:
```bash
cd /var/www
git clone <YOUR_GIT_REPOSITORY_URL> your-app-directory
cd your-app-directory
```

### 📌 Option B: Deploying via SFTP (FileZilla/Cyberduck Source)
1. Compress your project folder into a `.zip` archive on your local computer (**exclude** `node_modules`, `.next`, and `.vscode` to keep the file small).
2. Open an SFTP client (like FileZilla), connect to your VPS IP, and upload the zip file to `/var/www/`.
3. In your VPS terminal, extract the archive and enter the folder:
```bash
cd /var/www
unzip your-package.zip -d your-app-directory
cd your-app-directory
```

### 📌 Option C: Local Standalone Build Upload (Recommended for Low-RAM VPS)
If your VPS has 1GB of RAM or less, running `npm run build` on the server will fail with an **"Out of Memory (OOM)"** error. You should compile it locally instead:
1. On your local machine, prepare your production `.env` configuration file.
2. Run `npm run build` locally in your VS Code terminal. Your post-build compiler script (`scripts/postbuild.js`) automatically copies all static assets (`public/` and `.next/static/`) into the `.next/standalone/` output folder.
3. Compress the **contents** of the `.next/standalone/` folder along with your production `.env` file into a zip file (e.g. `standalone.zip`).
4. Upload `standalone.zip` via SFTP to `/var/www/` on your VPS.
5. Unzip the file on your server:
```bash
cd /var/www
unzip standalone.zip -d your-app-directory
cd your-app-directory
```

---

### 3. Setup Production Environment File (For Options A & B)
*(If you used Option C, your `.env` is already uploaded inside the folder. Skip to Step 5).*

Create a new `.env` file to store your production variables:
```bash
nano .env
```
Paste the following configurations (replacing placeholders with actual keys):
```env
NODE_ENV=production
PORT=3006
NEXT_PUBLIC_BASE_URL=https://yourdomain.com

# Database Configurations
MYSQL_HOST=localhost
MYSQL_USER=your_database_user
MYSQL_PASSWORD=SuperStrongPassword123!
MYSQL_DATABASE=your_database_name
MYSQL_PORT=3306

# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK Configuration
FIREBASE_ADMIN_SDK_CONFIG='{"type": "service_account", "project_id": "your_project_id", "private_key": "-----BEGIN PRIVATE KEY-----\nyour_key\n-----END PRIVATE KEY-----\n", "client_email": "your_client_email"}'

# Other APIs
GEMINI_API_KEY=your_gemini_key
CRON_SECRET=yourbrand123
```
Save and exit (`Ctrl+O` ➔ `Enter` ➔ `Ctrl+X`).

### 4. Install Packages & Compile Standalone Build (For Options A & B)
```bash
# Install NPM packages
npm install

# Compile production bundle
npm run build
```

---

## ⚙️ Step 5: Start Application with PM2

Next.js standalone server handles execution under a customized node configuration. Start the production backend server using PM2:

* **If you built the app directly on the server (Option A or B):**
```bash
pm2 start .next/standalone/server.js --name "your-app-name"
```
* **If you uploaded the local standalone build (Option C):**
```bash
pm2 start server.js --name "your-app-name"
```

Save the process list so that it auto-starts when the VPS reboots:
```bash
pm2 save
pm2 startup
```
*(PM2 will output a script command starting with `sudo env PATH=...`. Copy and paste that exact outputted command into your terminal to activate systemd boot scripts).*

---

## 🌐 Step 6: Configure Nginx Reverse Proxy & SSL

### 1. Create Nginx Site File
Create a site configuration file for your app:
```bash
sudo nano /etc/nginx/sites-available/your-app-name
```

### 2. Paste Initial HTTP Reverse Proxy
Paste this simple HTTP configuration to map your domain traffic to Node port 3006:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Save and exit (`Ctrl+O` ➔ `Enter` ➔ `Ctrl+X`).

### 3. Enable Site Configuration
Link the file to the enabled directory and reload Nginx:
```bash
# Link config to active sites
sudo ln -s /etc/nginx/sites-available/your-app-name /etc/nginx/sites-enabled/

# Test Nginx syntax
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### 4. Enable Let's Encrypt SSL (HTTPS)
Use Certbot to request and automatically configure your Let's Encrypt SSL certificate:
```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Request and apply certificates
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
*(Select the option to automatically redirect all HTTP traffic to HTTPS).*

### 5. Apply Production Caching & Anti-Cloning Security Headers (Highly Recommended)
Once Certbot successfully configures your SSL certificates, we recommend hardening your Nginx file to protect your website against clickjacking/iframe-cloning and optimize asset delivery.

Open the file again:
```bash
sudo nano /etc/nginx/sites-available/your-app-name
```

Replace the contents with this production-grade configuration (replacing `yourdomain.com` with your domain):
```nginx
# Redirect HTTP → HTTPS (Automated by Certbot)
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://yourdomain.com$request_uri;
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # Allow large database backups and image ZIP uploads up to 500MB
    client_max_body_size 500M;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # Security headers (Prevents clickjacking and site framing/cloning)
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Content-Security-Policy "frame-ancestors 'self'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Static files cache (Optimizes browser asset loading speed)
    location ~* \.(jpg|jpeg|png|gif|webp|svg|ico|css|js|woff|woff2|ttf)$ {
        expires 30d;
        access_log off;
        add_header Cache-Control "public, max-age=2592000, immutable";

        proxy_pass http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Next.js static framework assets
    location /_next/static/ {
        expires 365d;
        access_log off;
        add_header Cache-Control "public, immutable";

        proxy_pass http://127.0.0.1:3006;
        proxy_set_header Host $host;
    }

    # Main Next.js App Reverse Proxy with WebSocket support
    location / {
        proxy_pass http://127.0.0.1:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Save the file, verify syntax, and restart Nginx:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

---

## 🎉 Step 7: Post-Deployment Verification

1. **Check PM2 Status:**
   ```bash
   pm2 status
   pm2 logs your-app-name
   ```
2. **Open Domain:**
   Go to `https://yourdomain.com` in your browser. The landing page should render instantly with active SSL.
3. **PWA & Custom Branding Verification:**
   Confirm you have generated and uploaded your customized brand logo assets and favicon images inside the `public/` directory (recommendation: compile your icons using the free tool at `https://usebro.in/tools/favicon-generator` to replace default placeholders).
4. **Database Check:**
   Log into the admin panel (`https://yourdomain.com/admin/database-tools`) to verify MySQL database health.

---

## 🔄 Step 8: Updating the Application (Future Releases / Bug Fixes)

When you make changes to your codebase and want to deploy them to your VPS in the future, follow these steps to ensure all cache is cleared and the files are updated cleanly without process lock conflicts:

### 🚀 Update Deployment Command Sequence

Run the following commands in order inside your VPS terminal:

```bash
# 1. Navigate to your project folder
cd /var/www/your-app-directory

# 2. Pull the latest code updates from GitHub
git pull origin main

# 3. Install NPM packages
npm install

# 4. Compile the new production build
npm run build

# 5. Clean start PM2 process to clear active cache and reload completely
pm2 delete your-app-name
pm2 start npm --name "your-app-name" -- start
pm2 save
```

> [!IMPORTANT]
> **Browser Caching:** Next.js heavily caches pages on the client-side. If your changes are not immediately visible in your browser after deployment:
> 1. Try opening the website in an **Incognito / Private window**.
> 2. Or perform a **Hard Reload** (`Ctrl + F5` on Windows, or `Cmd + Shift + R` on Mac) to force the browser to retrieve the latest chunks.
