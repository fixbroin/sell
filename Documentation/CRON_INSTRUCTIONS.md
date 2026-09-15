# Yourbrand VPS Cron Job & Google Indexing Configuration Guide

This document lists all active automated cron jobs for the Yourbrand server, how to authorize Google Search Console, and troubleshooting guidelines. Keep this guide for future reference.

---

## 1. Google Indexing Cron Job
Automatically compiles your dynamic URLs and submits them to Google Indexing in daily batches.

* **Endpoint:** `https://yourdomain.com/api/indexing-cron?secret=YOUR_CRON_SECRET`
* **Schedule:** Every day at 1:00 AM server time (recommended).
* **Control:** Can be paused/started or monitored from the **Google Indexing Dashboard** inside your Admin Panel. Once all pages are submitted, it automatically stops querying the database.
* **VPS Cron Command:**
  ```bash
  0 1 * * * curl -s "https://yourdomain.com/api/indexing-cron?secret=yourbrand123" >/dev/null 2>&1
  ```

---

## 2. Marketing Automation Cron Job
Handles email automated flows, including abandoned cart reminders, booking reminders, and customer re-engagement.

* **Endpoint:** `https://yourdomain.com/api/marketing-cron?secret=YOUR_CRON_SECRET`
* **Schedule:** Every 2 hours (recommended).
* **Control:** Configured through the **Marketing Automation Settings** dashboard.
* **VPS Cron Command:**
  ```bash
  0 */2 * * * curl -s "https://yourdomain.com/api/marketing-cron?secret=yourbrand123" >/dev/null 2>&1
  ```

---

## Google Indexing Setup Steps (Required)
Before Google will accept any automated indexing requests from your website cron, you must complete these two requirements:

### Step 1: Enable Indexing API in Google Cloud Console
1. Go to the [Google Cloud Console API Library](https://console.cloud.google.com/apis/library).
2. Select your Google Cloud / Firebase project from the top dropdown menu.
3. In the search box, search for **"Indexing API"** (or Web Search Indexing API).
4. Click on the Indexing API search result and click the blue **Enable** button.

### Step 2: Authorize Service Account in Google Search Console
You must authorize the Google Cloud Service Account as an **Owner** of your site in Google Search Console:

1. Open the [Google Search Console Dashboard](https://search.google.com/search-console).
2. Select your property: **`https://yourdomain.com`**
3. Go to **Settings** (bottom left menu) > **Users and permissions**.
4. Click the blue **Add User** button.
5. Enter your Service Account email address (found in your Firebase Admin SDK credential JSON file under `client_email`, e.g. <code>firebase-adminsdk-...@...gserviceaccount.com</code>).
6. Set the Permission level to: **Owner** 
   *(Note: It must be **Owner**. Full or Restricted permissions will fail to run the cron).*
7. Click **Add**.

---

## Manual Verification & Testing
To manually test either of the cron jobs from your VPS terminal, run the following commands:

**Test Indexing (Using your actual secret key `yourbrand123`):**
```bash
curl 'https://yourdomain.com/api/indexing-cron?secret=yourbrand123'
```
*(Always wrap the URL in single quotes `'...'` to prevent terminal shell syntax errors).*

**Test Marketing:**
```bash
curl 'https://yourdomain.com/api/marketing-cron?secret=yourbrand123'
```

---

## Troubleshooting Quota Limits

### Error: "Quota exceeded for quota metric 'Publish requests'..."
* **Reason:** The Google Indexing API has a default daily limit of **200 requests per day**. If you trigger testing scripts multiple times in one day, you will hit this limit.
* **When it resets:** The daily quota resets automatically at **12:30 PM IST (noon)** every day (which corresponds to midnight Pacific Time).
* **Retry Behavior:** Failed submissions are kept as **"Pending"** in Firestore. The system will automatically retry them on the next daily cron execution once the quota resets.

---

## How to Configure these on your VPS

### Step 1: Open the Cron schedule editor
SSH into your VPS and run:
```bash
crontab -e
```

### Step 2: Paste the Cron rules
Go to the very bottom of the file and paste:
```bash
# 1. Google Indexing Cron (Runs Daily at 1:00 AM)
0 1 * * * curl -s "https://yourdomain.com/api/indexing-cron?secret=yourbrand123" >/dev/null 2>&1

# 2. Marketing Automation Cron (Runs Every 2 Hours)
0 */2 * * * curl -s "https://yourdomain.com/api/marketing-cron?secret=yourbrand123" >/dev/null 2>&1
```

### Step 3: Save and Exit
* In `nano`: Press `Ctrl + O` and `Enter` to save, then `Ctrl + X` to exit.
