
import type { NextConfig } from 'next';
import withPWAInit from '@ducanh2912/next-pwa';
import path from 'path';

// Safely handles responses
const cacheUpdatePlugin = {
  cacheWillUpdate: ({ response }: { response: Response }) => {
    if (!response || response.status !== 200) return null;
    return response;
  },
};

// Runtime caching for USER PWA
const userRuntimeCaching = [
  {
    urlPattern: /^https:\/\/yourbrand\.in\/api\/.*/i,
    handler: 'NetworkFirst' as const,
    options: {
      cacheName: 'api-cache',
      networkTimeoutSeconds: 10,
      expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 },
      plugins: [cacheUpdatePlugin],
    },
  },
  {
    urlPattern: /\/_next\/image\?url=.*/i,
    handler: 'StaleWhileRevalidate' as const,
    options: {
      cacheName: 'next-image',
      expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
      plugins: [cacheUpdatePlugin],
    },
  },
  {
    urlPattern: /\.(png|jpg|jpeg|svg|webp)$/i,
    handler: 'CacheFirst' as const,
    options: {
      cacheName: 'images-cache',
      expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 14 },
      plugins: [cacheUpdatePlugin],
    },
  },
];

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  reloadOnOnline: true,
  swcMinify: true,
  fallbacks: {
    document: '/offline',
  },

  workboxOptions: {
    maximumFileSizeToCacheInBytes: 3000000,
    exclude: [
      /googletagmanager\.com/,
      /admin/,
      /provider/,
      /chunk-[A-Za-z0-9]+\.js/,
      /\.map$/,
    ],
    runtimeCaching: [
      {
        urlPattern: /\/_next\/data\/.*/i,
        handler: 'NetworkOnly' as const,
      },
      ...userRuntimeCaching
    ],
  },

  pwas: {
    admin: {
      dest: 'public/admin',
      sw: 'sw.js',
      scope: '/admin',
      reloadOnOnline: true,
      workboxOptions: {
        runtimeCaching: [
          {
            urlPattern: /^\/admin.*/i,
            handler: 'NetworkOnly',
          },
        ],
        // The invalid 'plugins' key is removed from here.
      },
    },

    provider: {
      dest: 'public/provider',
      sw: 'sw.js',
      scope: '/provider',
      reloadOnOnline: true,
      workboxOptions: {
        runtimeCaching: [
          {
            urlPattern: /^\/provider.*/i,
            handler: 'NetworkOnly',
          },
        ],
        // The invalid 'plugins' key is removed from here.
      },
    },
  },
} as any);

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, './'),
  images: {
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: 'https', hostname: 'yourbrand.in' },
      { protocol: 'https', hostname: 'yourbrand.in' },
      { protocol: 'https', hostname: '*.yourbrand.in' },
      { protocol: 'https', hostname: '*.yourbrand.in' }, // ADD THIS
      { protocol: 'https', hostname: 'ad.yourbrand.in' },
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      { protocol: 'https', hostname: 'placehold.co' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },

  typescript: { ignoreBuildErrors: true },
  experimental: {
    workerThreads: false,
    cpus: 2
  }
};

export default withPWA(nextConfig);
