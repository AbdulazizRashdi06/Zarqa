/// <reference types="vite-plugin-pwa/client" />
import { registerSW } from 'virtual:pwa-register'

// A new version waits for a moment that can't interrupt anyone: the next in-app page change (lib/nav.tsx) or
// the next cold start. Never when the page is hidden: on a phone that is the camera or the mail app, and a
// reload there loses the photo being taken and anything typed.
let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null
let updateReady = false
// This tab asked for the new version, so its reload is expected.
let requested = false
// Another tab put the new version live: this one picks it up at its own next page change, not mid-form.
let reloadOnNextPage = false

/** Registers the service worker and checks for a new version on every return to the app and hourly. */
export function startPwa() {
  if (!('serviceWorker' in navigator)) return
  // True once a new version has been seen waiting: only then does a change of worker mean "the update went live".
  let sawUpdate = false
  // The new version took over: the tab that asked for it reloads now, any other at its own next page change.
  const tookOver = () => {
    if (requested) window.location.reload()
    else reloadOnNextPage = true
  }
  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true
      sawUpdate = true
    },
    // Without this the plugin reloads every open tab, including one being typed in.
    onNeedReload: tookOver,
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
  // The plugin only reports a takeover to tabs that already had a worker when they loaded. A tab opened on a first
  // visit (claimed by the first worker afterwards) would otherwise stay on the old code after asking for the update.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sawUpdate) tookOver()
  })
}

/** Swaps in a downloaded version (and reloads) if one is waiting or already live. Called on page changes. */
export function applyPendingUpdate() {
  if (reloadOnNextPage) {
    reloadOnNextPage = false
    window.location.reload()
    return
  }
  if (!updateReady || !applyUpdate) return
  updateReady = false
  requested = true
  void applyUpdate(true)
}
