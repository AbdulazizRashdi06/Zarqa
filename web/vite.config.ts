import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const ground = '#222634'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'mascot/*.webp', 'push-sw.js'],
      manifest: {
        name: 'Zarqa',
        short_name: 'Zarqa',
        description: 'The GUtech lost & found. Post what you lost or found, Zarqa matches the two.',
        theme_color: ground,
        background_color: ground,
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // API responses are never cached: reports and chats must be live.
        navigateFallbackDenylist: [/^\/api\//],
        // Push and notification-click handlers (public/push-sw.js).
        importScripts: ['push-sw.js'],
        globIgnores: ['mascot/*.png'],
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:5284' },
  },
})
