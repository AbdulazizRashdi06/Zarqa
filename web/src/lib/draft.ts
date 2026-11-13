import type { Mode } from './rules'

// The Home form survives a reload, a trip to another screen, a new tab or the phone killing the app.
// Fields go to localStorage; photos are blobs, so they go to IndexedDB. Both are best effort.
// Both carry the account they belong to (another account on this browser never sees them, and signing out
// clears them) and the time they last changed (a draft left alone for a day is dropped).

export type DraftFields = {
  mode: Mode
  text: string
  locQuery: string
  placeName: string | null
  knowsWhen: boolean
  date: string
  time: string
  dropAtRsa: boolean
}

type StoredFields = { owner: string; savedAt: number; fields: Partial<DraftFields> }
type StoredPhotos = { owner: string; savedAt: number; sig: string; blobs: Blob[] }

const KEY = 'zarqa.draft'
const DB = 'zarqa-draft'
const STORE = 'photos'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const fresh = (savedAt: unknown) => typeof savedAt === 'number' && Date.now() - savedAt < MAX_AGE_MS

function readFields(): StoredFields | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredFields) : null
  } catch {
    return null
  }
}

/** The signed-in user's unfinished form, or {} (someone else's or a stale draft is thrown away). */
export function loadFields(owner: string): Partial<DraftFields> {
  const stored = readFields()
  if (!stored) return {}
  if (stored.owner !== owner || !fresh(stored.savedAt) || typeof stored.fields !== 'object') {
    clearDraft()
    return {}
  }
  return stored.fields ?? {}
}

export function saveFields(owner: string, fields: DraftFields) {
  try {
    const stored = readFields()
    // Unchanged: keep the old time, so only real edits keep a draft alive.
    if (stored?.owner === owner && JSON.stringify(stored.fields) === JSON.stringify(fields)) return
    localStorage.setItem(KEY, JSON.stringify({ owner, savedAt: Date.now(), fields } satisfies StoredFields))
  } catch {
    // Private mode or full storage: the draft just isn't kept.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function readPhotos(): Promise<StoredPhotos | null> {
  const db = await openDb()
  return new Promise<StoredPhotos | null>((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get('list')
    req.onsuccess = () => {
      const v = req.result as StoredPhotos | undefined
      // Older drafts were a bare array with no owner: treat them as nobody's.
      resolve(v && !Array.isArray(v) && Array.isArray(v.blobs) ? v : null)
    }
    req.onerror = () => reject(req.error)
  })
}

async function writePhotos(value: StoredPhotos | null) {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    if (value) tx.objectStore(STORE).put(value, 'list')
    else tx.objectStore(STORE).delete('list')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

const signature = (blobs: Blob[]) => blobs.map((b) => `${b.size}:${b.type}`).join('|')

export async function loadPhotos(owner: string): Promise<Blob[]> {
  try {
    const stored = await readPhotos()
    if (!stored) return []
    if (stored.owner !== owner || !fresh(stored.savedAt)) {
      await writePhotos(null)
      return []
    }
    return stored.blobs
  } catch {
    return []
  }
}

export async function savePhotos(owner: string, blobs: Blob[]) {
  try {
    if (!blobs.length) return await writePhotos(null)
    const sig = signature(blobs)
    const stored = await readPhotos()
    if (stored?.owner === owner && stored.sig === sig) return
    await writePhotos({ owner, savedAt: Date.now(), sig, blobs })
  } catch {
    // Not kept; the user can add them again.
  }
}

/** Forget the form: after posting, on "Start over" and when this browser signs out. */
export function clearDraft() {
  try {
    localStorage.removeItem(KEY)
    // Drafts used to live in the tab's sessionStorage.
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  void writePhotos(null).catch(() => undefined)
}
