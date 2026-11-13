// Web push for Zarqa. Imported into the generated service worker (vite.config.ts → workbox.importScripts).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Zarqa', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Zarqa', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      // No badge: Android draws it from the alpha channel only, and the full-colour icon would be a white square.
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    }),
  )
})

// An open app moves to the page itself (lib/nav.tsx listens), so nothing on screen is reloaded or lost.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => w.url.startsWith(self.location.origin))
      if (!open) return self.clients.openWindow(url)
      if (open.url === url) return open.focus()
      // A window this worker controls can route in place; any other is sent to the URL.
      const controlled = (await self.clients.matchAll({ type: 'window' })).some((w) => w.id === open.id)
      if (controlled) open.postMessage({ type: 'navigate', url })
      else {
        try {
          await open.navigate(url)
        } catch {
          return self.clients.openWindow(url)
        }
      }
      return open.focus()
    })(),
  )
})
