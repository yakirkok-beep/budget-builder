/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative paths: the build works at any address (GitHub Pages /<repo>/, a file share, localhost).
  // Routing is by #hash, so no server rewrites are needed.
  base: './',
  plugins: [
    react(),
    // PWA (CLAUDE.md section 3): installable, and works offline after the first visit.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'בונה תקציב - מחלקת ההדרכה',
        short_name: 'תקציב הדרכה',
        description: 'בניית התקציב השנתי של מחלקת ההדרכה בתנועת עזרא',
        lang: 'he',
        dir: 'rtl',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#F3F4F0',
        theme_color: '#1D5866',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // everything, including fonts and the lazily loaded Excel library
        globPatterns: ['**/*.{js,css,html,woff2,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // Pre-bundle everything up front, so the dev server never re-optimizes mid-session
  // (that can load two copies of React into an open tab).
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'zustand', 'zustand/vanilla', 'zustand/middleware/immer', 'immer', 'dexie', 'exceljs'],
  },
  build: {
    // exceljs (~940 kB) is loaded only when exporting, so a big chunk is fine
    chunkSizeWarningLimit: 1000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
