// Test helper: caches Wikipedia responses on disk and identifies the client, so repeated planner runs
// do not hammer the API (Wikimedia rate limits anonymous clients without a user agent).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dir = path.join(process.env.WIKI_CACHE ?? tmpdir(), 'explainer-wiki-cache')
mkdirSync(dir, { recursive: true })
const real = globalThis.fetch

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.includes('wikipedia.org/w/api.php')) return real(input, init)
  const file = path.join(dir, createHash('sha1').update(url).digest('hex') + '.json')
  if (existsSync(file)) return new Response(readFileSync(file), { status: 200, headers: { 'content-type': 'application/json' } })
  const res = await real(url, { ...init, headers: { 'User-Agent': 'ReelixDev/0.2 (local planner tests)' } })
  const body = await res.text()
  if (res.ok) writeFileSync(file, body)
  return new Response(body, { status: res.status, headers: { 'content-type': 'application/json' } })
}) as typeof fetch
