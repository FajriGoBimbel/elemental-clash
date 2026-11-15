import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base relatif agar hasil build bisa dibungkus Capacitor (Android/iOS) maupun dibuka sebagai PWA.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'] },
      manifest: {
        name: 'Elemental Clash', short_name: 'Elemental Clash', description: 'Game fighting elemen 1 lawan 1, offline melawan bot.',
        lang: 'id', display: 'fullscreen', orientation: 'landscape', background_color: '#070914', theme_color: '#070914', start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
