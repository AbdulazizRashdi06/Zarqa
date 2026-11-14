import { t } from '../i18n'

/** An error the server explained ({ error: "…" }); the message is safe to show as-is. Status 0 = no answer (offline or timed out). */
export class ApiError extends Error {
  status: number
  /** A machine-readable cause the server added to some errors ({ reason: "…" }), e.g. "codes_sent". */
  reason?: string
  constructor(message: string, status: number, reason?: string) {
    super(message)
    this.status = status
    this.reason = reason
  }
}

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; timeoutMs?: number }

/**
 * Plain calls give up after 15s. Uploads get 5 minutes, enough for several photos on a weak uplink (a shorter cap
 * aborts a slow but working post every time), while a dead connection still never leaves "POSTING…" up forever.
 */
const JSON_TIMEOUT = 15_000
const UPLOAD_TIMEOUT = 5 * 60_000

// SessionProvider registers this: a 401 in the middle of a session means the session has ended.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

async function send(path: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`/api${path}`, { ...init, credentials: 'same-origin', signal: controller.signal })
  } catch {
    throw new ApiError(t('common.offline'), 0)
  } finally {
    clearTimeout(timer)
  }
}

async function read<T>(path: string, res: Response): Promise<T> {
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Sign-in endpoints answer 401 for a wrong code: that is not "signed out".
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized?.()
    throw new ApiError(data?.error ?? t('common.error'), res.status, typeof data?.reason === 'string' ? data.reason : undefined)
  }
  return data as T
}

export async function api<T = unknown>(path: string, { method, body, timeoutMs = JSON_TIMEOUT }: Options = {}): Promise<T> {
  const res = await send(
    path,
    {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    timeoutMs,
  )
  return read<T>(path, res)
}

/** Multipart upload (reports with photos, avatar). */
export async function apiForm<T = unknown>(path: string, form: FormData): Promise<T> {
  const res = await send(path, { method: 'POST', body: form }, UPLOAD_TIMEOUT)
  return read<T>(path, res)
}
