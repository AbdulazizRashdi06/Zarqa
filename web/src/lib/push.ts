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

async function subscribeThisDevice() {
  const registration = await navigator.serviceWorker.ready
  const { publicKey } = await api<{ publicKey: string }>('/push/key')
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await api('/push/subscribe', { body: subscription.toJSON() })
}

/**
 * Asks permission (must follow a tap) and registers this device for alerts. Throws (ApiError or a browser
 * error) when registering fails after permission was given: show it and offer to try again.
 */
export async function enablePush(): Promise<PushState> {
  if (pushState() !== 'default' && pushState() !== 'granted') return pushState()
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission as PushState
  await subscribeThisDevice()
  return 'granted'
}

/**
 * Keeps this device registered after a sign-in: re-sends the subscription, or makes one when permission was
 * given earlier but subscribing failed.
 */
export async function refreshPush() {
  if (pushState() !== 'granted') return
  await subscribeThisDevice().catch(() => undefined)
}

/** Signing out: this phone stops getting the account's alerts (removed on the server and in the browser). */
export async function disablePushOnThisDevice() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  await api('/push/unsubscribe', { body: subscription.toJSON() }).catch(() => undefined)
  await subscription.unsubscribe().catch(() => undefined)
}
