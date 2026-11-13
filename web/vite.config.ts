import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const ground = '#222634'

/**
 * Preloads the headline font and the body weights the first screens use, so the browser fetches them with the
 * page instead of after parsing the CSS (headlines otherwise wait, or reflow). Build only: the files are hashed.
 */
function preloadFonts(): Plugin {
  const wanted = [/anton-latin-400-normal-[\w-]+\.woff2$/, /figtree-latin-600-normal-[\w-]+\.woff2$/, /figtree-latin-700-normal-[\w-]+\.woff2$/]
  return {
    name: 'zarqa-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((name) => wanted.some((re) => re.test(name)))
        return files.map((file) => ({
          tag: 'link',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${file}`, crossorigin: '' },
          injectTo: 'head',
        }))
      },
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    preloadFonts(),
    VitePWA({
      // The app decides when a new version goes live (lib/pwa.ts): between pages or in the background.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'mascot/*.webp', 'push-sw.js'],
      // The install icons are for the operating system, not the page: not stored with the app shell.
      includeManifestIcons: false,
      manifest: {
        name: 'Zarqa',
        short_name: 'Zarqa',
        description: 'The GUtech lost & found. Post what you lost or found, Zarqa matches the two.',
        theme_color: ground,
        background_color: ground,
        display: 'standalone',
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
        // The animated clips are big and each plays once: fetched when needed, not stored with the app shell.
        // Icons and logo.png (the original of logo.webp) are never drawn by the page.
        globIgnores: ['mascot/*.png', 'mascot/anim/**', 'icons/**', 'logo.png'],
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
      },
    }),
  ],
  server: {
    proxy: { '/api': 'http://localhost:5284' },
  },
})
