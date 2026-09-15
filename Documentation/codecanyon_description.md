<h1>WeCanFix | Handyman Service Booking and On-Demand Marketplace (Next.js + MySQL)</h1>

<p><strong>WeCanFix</strong> is a complete, production-ready multi-vendor handyman and on-demand home services marketplace solution. Built on modern web technologies—<strong>Next.js (App Router), React, MySQL, Firebase Auth, and Tailwind CSS</strong>—it delivers ultra-fast performance, full Progressive Web App (PWA) support, an intelligent automated dispatch engine, and a comprehensive provider wallet and commission system.</p>

<hr>

<h2>🌐 Interactive Live Demos</h2>
<ul>
  <li><strong>Customer Web App &amp; PWA:</strong> <a href="https://me.fixbro.in" target="_blank" rel="noopener noreferrer">https://me.fixbro.in</a></li>
  <li><strong>Provider Portal &amp; PWA:</strong> <a href="https://me.fixbro.in/provider" target="_blank" rel="noopener noreferrer">https://me.fixbro.in/provider</a>
    <br><em>Demo Login:</em> Select demo provider or register a new provider account.
  </li>
  <li><strong>Super Admin Dashboard:</strong> <a href="https://me.fixbro.in/admin" target="_blank" rel="noopener noreferrer">https://me.fixbro.in/admin</a>
    <br><em>Demo Login:</em> Available on the demo page.
  </li>
</ul>

<hr>

<h2>✨ Core Features Overview</h2>

<h3>1. 🛒 Customer Booking Experience</h3>
<ul>
  <li><strong>Interactive Location Selector:</strong> Google Maps address search and pin-drop coordinate selection with service zone validation.</li>
  <li><strong>Multi-Service Booking:</strong> Add multiple services and sub-services to cart in a single checkout.</li>
  <li><strong>Flexible Pricing:</strong> Support for variable price variants, minimum booking quantities, and promotional discount codes.</li>
  <li><strong>Smart Scheduling:</strong> Dynamic time slots (30/60-minute intervals), buffer times, same-day scheduling, and holiday controls.</li>
  <li><strong>Payment Flexibility:</strong> Integrated with <strong>Razorpay</strong> and <strong>Stripe</strong> for instant online checkout, plus <strong>Pay After Service</strong>.</li>
  <li><strong>Customer Account:</strong> Live booking tracking, downloadable PDF invoices, ratings and reviews, address book, and referral rewards.</li>
</ul>

<h3>2. 👷 Multi-Vendor Provider Portal &amp; Wallet</h3>
<ul>
  <li><strong>4-Step Provider Onboarding:</strong> Streamlined registration with KYC document uploads (ID proof, address proof, certifications).</li>
  <li><strong>Service Zone Management:</strong> Configurable service radius and interactive polygon/radius area coverage on maps.</li>
  <li><strong>Availability Controls:</strong> Set daily operating hours, break times, weekly offs, and custom holiday dates.</li>
  <li><strong>Job Workflow:</strong> Real-time incoming job alerts with accept/reject controls, direct customer navigation, and status tracking (Accepted &rarr; In Progress &rarr; Completed).</li>
  <li><strong>Comprehensive Wallet System:</strong> Real-time balance ledger, platform commission breakdown, earnings overview, and bank withdrawal requests.</li>
  <li><strong>Wallet Balance Gate:</strong> Admin-configured minimum wallet balance requirement to receive new bookings.</li>
</ul>

<h3>3. ⚙️ Intelligent Dispatch &amp; Booking Engine</h3>
<ul>
  <li><strong>Automated Radius Dispatch:</strong> Automatically routes new bookings to the nearest qualified provider within the designated service zone.</li>
  <li><strong>Admin Override &amp; Manual Assignment:</strong> Marketplace administrators can manually assign, reassign, or reschedule bookings.</li>
  <li><strong>Conflict Prevention:</strong> Dynamic slot calculation prevents double bookings and accounts for provider active workload and buffer windows.</li>
</ul>

<h3>4. 🎛️ Super Admin Control Center</h3>
<ul>
  <li><strong>Complete Catalog Management:</strong> Manage categories, subcategories, service items, pricing tiers, and descriptions.</li>
  <li><strong>Provider Verification:</strong> Review and approve/reject provider applications, verify submitted KYC documents, and inspect service zones.</li>
  <li><strong>Commission &amp; Fee Rules:</strong> Define global marketplace commission percentages, platform service fees, and minimum wallet balances.</li>
  <li><strong>Payout Management:</strong> Approve or reject provider payout requests with automatic wallet refund protection on rejected payouts.</li>
  <li><strong>Authentication &amp; Security:</strong> Enable/disable login options (Phone OTP, Google OAuth, Email/Password) and manage administrative staff roles.</li>
  <li><strong>Analytics &amp; Visitor Intelligence:</strong> Real-time revenue reports, order volume metrics, live visitor monitoring, and system activity feed.</li>
</ul>

<h3>5. 🚀 Location-Based SEO &amp; AI Automation</h3>
<ul>
  <li><strong>Automated City &amp; Area Landing Pages:</strong> Bulk create localized landing pages using OpenStreetMap geographical data.</li>
  <li><strong>Google Indexing Integration:</strong> Push newly generated service URLs directly to Google Search via Google Indexing API.</li>
  <li><strong>Gemini AI Assistant:</strong> AI-assisted customer chat assistant plus AI-generated SEO titles, meta descriptions, and keywords.</li>
</ul>

<hr>

<h2>🔌 Third-Party Integrations &amp; Services</h2>
<p>WeCanFix integrates with industry-standard third-party APIs. Buyers must configure their own accounts and credentials for services they choose to enable:</p>
<ul>
  <li><strong>Payments:</strong> Razorpay (Domestic/International) &amp; Stripe (Global Credit/Debit Cards, Webhooks).</li>
  <li><strong>Authentication &amp; Push:</strong> Firebase Authentication (Phone OTP, Email, Google OAuth) and Firebase Cloud Messaging (Web &amp; PWA Push).</li>
  <li><strong>Maps &amp; Geocoding:</strong> Google Maps Platform (Places Autocomplete &amp; Maps JS) and OpenStreetMap (Bulk Location Data).</li>
  <li><strong>Artificial Intelligence:</strong> Google Gemini API (AI Chat Assistant and Automated SEO Metadata Generation).</li>
  <li><strong>Communications (Optional):</strong> WhatsApp Business API / Gateway for automated transactional alerts.</li>
  <li><strong>Analytics:</strong> Google Analytics 4 (GA4), Google Tag Manager (GTM), and Microsoft Clarity.</li>
</ul>
<p><em>Note: Third-party usage fees, API quotas, and payment gateway transaction fees are determined by respective providers and are separate from the item purchase.</em></p>

<hr>

<h2>💻 Technical Architecture &amp; System Requirements</h2>
<ul>
  <li><strong>Frontend:</strong> Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Lucide Icons, Radix UI.</li>
  <li><strong>Backend:</strong> Next.js Server Components, API Route Handlers, Node.js.</li>
  <li><strong>Database:</strong> MySQL 5.7+ / 8.0+ or MariaDB (hosted locally on VPS or via shared-hosting remote MySQL).</li>
  <li><strong>PWA:</strong> Offline support, manifest files, and background service workers for mobile-app-like installation on iOS &amp; Android.</li>
  <li><strong>Media Storage:</strong> Local VPS disk storage or remote PHP-based shared hosting media bridge.</li>
  <li><strong>Hosting Requirements:</strong> Linux VPS (Ubuntu 20.04/22.04 LTS recommended with Node.js 18+ or 20+ LTS, Nginx, and PM2) or Node.js-capable shared hosting (cPanel).</li>
</ul>

<hr>

<h2>📦 What's Included in the Download</h2>
<ul>
  <li>Complete unminified source code (Next.js frontend, backend API routes, components, and database schemas).</li>
  <li>Full HTML documentation with Quick Start Guide, visual workflow diagrams, annotated UI walkthroughs, and installation troubleshooting.</li>
  <li>Database migration scripts (<code>scripts/db-init.js</code>) and seed data.</li>
  <li>Remote storage bridge script (<code>SHARED_HOSTING_MEDIA_UPLOAD_SCRIPT.php</code>).</li>
  <li>Automated release packaging script (<code>scripts/package-release.js</code>).</li>
</ul>

<hr>

<h2>🏷️ Recommended CodeCanyon Tags</h2>
<p><code>handyman, on-demand services, home services, service booking, booking system, nextjs, mysql, service marketplace, provider wallet, multi vendor, cleaning booking, technician booking, pwa, booking script, appointment booking, plumber booking, pest control booking, repair marketplace</code></p>