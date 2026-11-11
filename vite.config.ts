import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      // landing page independente (index.html) + app PWA (app.html)
      input: { landing: resolve(__dirname, 'index.html'), app: resolve(__dirname, 'app.html') },
      output: { manualChunks: { react: ['react', 'react-dom'], banco: ['dexie', 'dexie-react-hooks'], mapa: ['maplibre-gl'] } },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'VanAaki — Van escolar',
        short_name: 'VanAaki',
        description: 'Gestão da van escolar, rastreio para os pais e gamificação para os alunos.',
        lang: 'pt-BR',
        start_url: './app.html',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#14213D',
        theme_color: '#14213D',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: null,
        // azulejos do mapa já vistos ficam guardados (abre o mapa mesmo sem internet)
        runtimeCaching: [{
          urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
          handler: 'CacheFirst',
          options: { cacheName: 'mapa-tiles', expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 30 } },
        }],
      },
    }),
  ],
});
