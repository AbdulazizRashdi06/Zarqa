import { api } from './api'

export type PushState = 'unsupported' | 'needs-install' | 'default' | 'granted' | 'denied'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Where this device stands. iOS only allows push for apps added to the Home Screen. */
export function pushState(): PushState {
  if (isIos() && !isStandalone()) return 'needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return Notification.permission as PushState
}

function keyBytes(base64url: string) {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/** Asks permission (must follow a tap) and registers this device for alerts. */
export async function enablePush(): Promise<PushState> {
  if (pushState() !== 'default' && pushState() !== 'granted') return pushState()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission as PushState
  const registration = await navigator.serviceWorker.ready
  const { publicKey } = await api<{ publicKey: string }>('/push/key')
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await api('/push/subscribe', { body: subscription.toJSON() })
  return 'granted'
}

/** Re-sends an existing subscription (keeps the server's copy fresh after a sign-in). */
export async function refreshPush() {
  if (pushState() !== 'granted') return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (subscription) await api('/push/subscribe', { body: subscription.toJSON() }).catch(() => undefined)
}
