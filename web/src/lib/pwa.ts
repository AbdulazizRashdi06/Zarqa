/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// A new version waits until a moment that can't interrupt anyone: the app going to the background, or the
// next page change (lib/nav.tsx). The Home draft survives the reload.
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
let updateReady = false

/** Registers the service worker and checks for a new version on every return to the app and hourly. */
export function startPwa() {
  if (!('serviceWorker' in navigator)) return
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true
      if (document.visibilityState === 'hidden') applyPendingUpdate()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update().catch(() => undefined)
      }
      setInterval(check, 60 * 60 * 1000)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
    },
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') applyPendingUpdate()
  })
}

/** Swaps in a downloaded version (and reloads) if one is waiting. Called on page changes and when hidden. */
export function applyPendingUpdate() {
  if (!updateReady || !applyUpdate) return
  updateReady = false
  void applyUpdate(true)
}
