import { defineConfig, Plugin } from 'vite';

// Khusus `npm run dev`: meneruskan paket "jaringan lokal" Main Bareng antar-browser lewat kanal HMR,
// supaya host dan kontroler bisa diuji di browser HP tanpa membangun APK. Tidak ikut ke build produksi.
const lanRelay = (): Plugin => ({
  name: 'ec-lan-relay', apply: 'serve',
  configureServer(server) {
    server.ws.on('ec:lan', (data, client) => { for (const c of server.ws.clients) if (c !== client) c.send('ec:lan', data); });
  },
});
import { VitePWA } from 'vite-plugin-pwa';

// base relatif agar hasil build bisa dibungkus Capacitor (Android/iOS) maupun dibuka sebagai PWA.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
  plugins: [
    lanRelay(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,woff}'] },
      manifest: {
        name: 'Elemental Clash', short_name: 'Elemental Clash', description: 'Game fighting elemen 1 lawan 1, offline melawan bot atau berdua dengan HP sebagai kontroler.',
        lang: 'id', display: 'fullscreen', orientation: 'landscape', background_color: '#070914', theme_color: '#070914', start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
