// Narration clips are cached in IndexedDB so re-exports and repeat visits skip synthesis.
// Every call is wrapped: private windows or blocked storage just mean no cache.
const DB = 'explainer-tts'
const STORE = 'clips'

/** IndexedDB can stall (another tab blocking an upgrade or delete). The cache is optional, so give up quickly. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      () => { clearTimeout(timer); resolve(fallback) },
    )
  })
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => {
        const d = req.result
        // Let other tabs upgrade or clear the cache instead of blocking them.
        d.onversionchange = () => {
          d.close()
          dbPromise = null
        }
        resolve(d)
      }
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

let dbPromise: Promise<IDBDatabase | null> | null = null
const db = () => (dbPromise ??= withTimeout(open(), 1500, null))

export interface CachedClip {
  samples: Float32Array
  sampleRate: number
}

export async function getClip(key: string): Promise<CachedClip | null> {
  const d = await db()
  if (!d) return null
  return withTimeout(readClip(d, key), 1500, null)
}

function readClip(d: IDBDatabase, key: string): Promise<CachedClip | null> {
  return new Promise((resolve) => {
    try {
      const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      req.onsuccess = () => {
        const v = req.result as { samples: ArrayBuffer; sampleRate: number } | undefined
        resolve(v ? { samples: new Float32Array(v.samples), sampleRate: v.sampleRate } : null)
      }
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function putClip(key: string, clip: CachedClip): Promise<void> {
  const d = await db()
  if (!d) return
  try {
    d.transaction(STORE, 'readwrite')
      .objectStore(STORE)
      .put({ samples: clip.samples.slice().buffer, sampleRate: clip.sampleRate }, key)
  } catch {
    // Quota or private mode; skip caching.
  }
}
