// Depth maps for "Moving photos": Depth Anything V2 Small in a worker (WebGPU when present), cached per photo in
// IndexedDB so a photo is only ever estimated once. Any failure gives null and the photo stays flat.
import type { DepthMap } from '../stage/types'

export interface DepthCacheParts {
  run: (bitmap: ImageBitmap) => Promise<DepthMap>
  get: (key: string) => Promise<DepthMap | undefined>
  put: (key: string, map: DepthMap) => Promise<void>
}

/** depthFor(key, bitmap): the cached map for `key`, else the model's, kept for next time; null when the model fails. */
export function createDepthCache(parts: DepthCacheParts): (key: string, bitmap: ImageBitmap) => Promise<DepthMap | null> {
  return async (key, bitmap) => {
    const hit = await parts.get(key).catch(() => undefined)
    if (hit) return hit
    let map: DepthMap
    try {
      map = await parts.run(bitmap)
    } catch {
      return null
    }
    await parts.put(key, map).catch(() => {})
    return map
  }
}

const DB = 'reelix-depth'
const STORE = 'maps'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idb<T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = act(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error)
  })
}

let worker: Worker | null = null
let nextId = 0
const waiting = new Map<number, { resolve: (map: DepthMap) => void; reject: (err: Error) => void }>()

function runInWorker(bitmap: ImageBitmap): Promise<DepthMap> {
  if (!worker) {
    worker = new Worker(new URL('./depth.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; map?: DepthMap; error?: string }>) => {
      const job = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (e.data.map) job?.resolve(e.data.map)
      else job?.reject(new Error(e.data.error ?? 'Depth failed'))
    }
  }
  const id = nextId++
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    worker!.postMessage({ id, bitmap })
  })
}

/** Depth for a photo keyed by its URL, from IndexedDB or the worker. */
export const depthFor = createDepthCache({
  run: runInWorker,
  get: (key) => idb<DepthMap | undefined>('readonly', (s) => s.get(key)),
  put: async (key, map) => void (await idb('readwrite', (s) => s.put(map, key))),
})
