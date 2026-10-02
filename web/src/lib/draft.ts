import type { Mode } from './rules'

// The Home form survives a reload, a trip to another screen or the phone killing the tab.
// Fields go to sessionStorage; photos are blobs, so they go to IndexedDB. Both are best effort.

export type DraftFields = {
  mode: Mode
  text: string
  locQuery: string
  placeName: string | null
  knowsWhen: boolean
  date: string
  time: string
}

const KEY = 'zarqa.draft'
const DB = 'zarqa-draft'
const STORE = 'photos'

export function loadFields(): Partial<DraftFields> {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<DraftFields>) : {}
  } catch {
    return {}
  }
}

export function saveFields(fields: DraftFields) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(fields))
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

export async function loadPhotos(): Promise<Blob[]> {
  try {
    const db = await openDb()
    return await new Promise<Blob[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get('list')
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : [])
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function savePhotos(blobs: Blob[]) {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(blobs, 'list')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Not kept; the user can add them again.
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
  void savePhotos([])
}
