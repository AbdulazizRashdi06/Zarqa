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

/** What is stored: undefined when there's nothing, null when there's something unreadable. */
function readFields(): StoredFields | null | undefined {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return undefined
    const v = JSON.parse(raw) as StoredFields | null
    return v && typeof v === 'object' && typeof v.owner === 'string' && v.fields && typeof v.fields === 'object' ? v : null
  } catch {
    return null
  }
}

/**
 * The signed-in user's unfinished form, or {}. Anything else found here (another account's draft, a draft with no owner
 * from an older version, a stale or broken one) is thrown away with its photos, not just hidden.
 */
export function loadFields(owner: string): Partial<DraftFields> {
  if (!owner) return {}
  try {
    // Older versions kept an ownerless draft in the tab's sessionStorage.
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  const stored = readFields()
  if (stored === undefined) return {}
  if (!stored || stored.owner !== owner || !fresh(stored.savedAt)) {
    clearDraft()
    return {}
  }
  const fields = stored.fields
  return fields.mode === 'lost' || fields.mode === 'found' ? fields : { ...fields, mode: undefined }
}

export function saveFields(owner: string, fields: DraftFields) {
  if (!owner) return
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

// Photo reads and writes run one after another, so a save that started before clearDraft() can't land after it.
let queue: Promise<unknown> = Promise.resolve()
function queued<T>(op: () => Promise<T>): Promise<T> {
  const next = queue.then(op, op)
  queue = next.catch(() => undefined)
  return next
}

async function withStore<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  const db = await openDb()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = use(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? (req.result as T) : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

const readPhotos = () => withStore<unknown>('readonly', (s) => s.get('list'))
const writePhotos = (value: StoredPhotos | null) =>
  withStore<void>('readwrite', (s) => {
    if (value) s.put(value, 'list')
    else s.delete('list')
  })

const isStoredPhotos = (v: unknown): v is StoredPhotos =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as StoredPhotos).owner === 'string' && Array.isArray((v as StoredPhotos).blobs)

const signature = (blobs: Blob[]) => `${blobs.length}#` + blobs.map((b) => `${b.size}:${b.type}`).join('|')

/** The signed-in user's draft photos. Anyone else's, ownerless ones from older versions and stale ones are deleted. */
export function loadPhotos(owner: string): Promise<Blob[]> {
  if (!owner) return Promise.resolve([])
  return queued(async () => {
    const stored = await readPhotos()
    if (stored === undefined) return []
    if (!isStoredPhotos(stored) || stored.owner !== owner || !fresh(stored.savedAt)) {
      await writePhotos(null)
      return []
    }
    return stored.blobs
  }).catch(() => [])
}

export function savePhotos(owner: string, blobs: Blob[]): Promise<void> {
  if (!owner) return Promise.resolve()
  return queued(async () => {
    if (!blobs.length) return await writePhotos(null)
    const sig = signature(blobs)
    const stored = await readPhotos()
    // Unchanged (the restored set): keep the old time, so only real edits keep a draft alive.
    if (isStoredPhotos(stored) && stored.owner === owner && stored.sig === sig) return
    await writePhotos({ owner, savedAt: Date.now(), sig, blobs })
  }).catch(() => {
    // Not kept; the user can add them again.
  })
}

/** Forget the form, whoever it belongs to: after posting, on "Start over", and when this browser signs out. */
export function clearDraft() {
  for (const storage of [() => localStorage, () => sessionStorage]) {
    try {
      // sessionStorage: older versions kept the draft there.
      storage().removeItem(KEY)
    } catch {
      // ignore
    }
  }
  void queued(() => writePhotos(null)).catch(() => undefined)
}
