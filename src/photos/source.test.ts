import { afterEach, describe, expect, it, vi } from 'vitest'
import { articlePhotos, commonsPhotos, openversePhotos } from './source'

const page = (title: string, over: Record<string, unknown> = {}, meta: Record<string, string> = {}) => ({
  title,
  imageinfo: [
    {
      mime: 'image/jpeg',
      width: 3300,
      height: 2550,
      url: 'https://upload.wikimedia.org/wikipedia/commons/d/d3/A.jpg',
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/A.jpg/1280px-A.jpg',
      thumbwidth: 1280,
      thumbheight: 989,
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:A.jpg',
      extmetadata: {
        LicenseShortName: { value: meta.license ?? 'CC BY 4.0' },
        Artist: { value: meta.artist ?? '<a href="//commons.wikimedia.org/wiki/User:Jane">Jane Doe</a>' },
        ImageDescription: { value: meta.description ?? 'The <b>jet</b> of M87 &amp; its shadow' },
      },
      ...over,
    },
  ],
})
const wiki = (pages: unknown[]) => ({ query: { pages } })
const stub = (body: unknown, init: ResponseInit = {}) => {
  const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body), init))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => vi.unstubAllGlobals())

describe('articlePhotos', () => {
  it("maps an article's images to candidates with plain text credits and the thumbnail's size", async () => {
    const fetch = stub(wiki([page('File:A view of the jet.jpg')]))
    const [c] = await articlePhotos('Black hole')
    expect(c).toEqual({
      url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/A.jpg/1280px-A.jpg',
      width: 1280,
      height: 989,
      title: 'A view of the jet',
      description: 'The jet of M87 & its shadow',
      artist: 'Jane Doe',
      license: 'CC BY 4.0',
      source: 'https://commons.wikimedia.org/wiki/File:A.jpg',
      origin: 'article',
    })
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.host).toBe('en.wikipedia.org')
    expect(url.searchParams.get('origin')).toBe('*')
    expect(url.searchParams.get('generator')).toBe('images')
    expect(url.searchParams.get('titles')).toBe('Black hole')
  })
  it('uses the original size when the picture is smaller than the thumbnail asked for', async () => {
    stub(wiki([page('File:Small.jpg', { width: 700, height: 346, url: 'https://upload.wikimedia.org/x/Small.jpg', thumburl: 'https://upload.wikimedia.org/x/Small.jpg' })]))
    const [c] = await articlePhotos('Black hole')
    expect([c.width, c.height, c.url]).toEqual([700, 346, 'https://upload.wikimedia.org/x/Small.jpg'])
  })
  it('drops non free licences, unknown licences, drawings in SVG and GIFs', async () => {
    stub(
      wiki([
        page('File:NC.jpg', {}, { license: 'CC BY-NC 2.0' }),
        page('File:Unknown.jpg', {}, { license: '' }),
        page('File:Drawing.svg', { mime: 'image/svg+xml' }),
        page('File:Spin.gif', { mime: 'image/gif' }),
        { title: 'File:Missing.jpg' },
        page('File:Good.jpg'),
      ]),
    )
    expect((await articlePhotos('Black hole')).map((c) => c.title)).toEqual(['Good'])
  })
  it('returns nothing when Wikipedia fails or answers with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await articlePhotos('Black hole')).toEqual([])
    stub({}, { status: 503 })
    expect(await articlePhotos('Black hole')).toEqual([])
  })
})

describe('commonsPhotos', () => {
  it('searches files on Commons for a phrase', async () => {
    const fetch = stub(wiki([page('File:Accretion disk.jpg')]))
    const [c] = await commonsPhotos('accretion disk')
    expect(c.origin).toBe('commons')
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.host).toBe('commons.wikimedia.org')
    expect(url.searchParams.get('generator')).toBe('search')
    expect(url.searchParams.get('gsrnamespace')).toBe('6')
    expect(url.searchParams.get('gsrsearch')).toContain('accretion disk')
    expect(url.searchParams.get('origin')).toBe('*')
  })
})

describe('openversePhotos', () => {
  const result = (over: Record<string, unknown> = {}) => ({
    id: 'abc',
    title: 'Accretion disk',
    creator: 'NASA Goddard',
    license: 'by',
    license_version: '2.0',
    width: 2000,
    height: 1250,
    filetype: 'jpg',
    url: 'https://images-assets.nasa.gov/x.jpg',
    foreign_landing_url: 'https://www.flickr.com/photos/x',
    ...over,
  })
  it('loads pixels only through the Openverse thumbnail proxy, at most 1024 px wide', async () => {
    const fetch = stub({ results: [result()] })
    const [c] = await openversePhotos('accretion disk')
    expect(c).toEqual({
      url: 'https://api.openverse.org/v1/images/abc/thumb/?full_size=true',
      width: 1024,
      height: 640,
      title: 'Accretion disk',
      description: '',
      artist: 'NASA Goddard',
      license: 'CC BY 2.0',
      source: 'https://www.flickr.com/photos/x',
      origin: 'openverse',
    })
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.searchParams.get('license')).toBe('pdm,cc0,by,by-sa')
    expect(url.searchParams.get('q')).toBe('accretion disk')
  })
  it('drops results without a size or with a licence it cannot use', async () => {
    stub({ results: [result({ width: null }), result({ license: 'by-nc' }), result({ id: 'ok' })] })
    expect((await openversePhotos('x')).map((c) => c.url)).toEqual(['https://api.openverse.org/v1/images/ok/thumb/?full_size=true'])
  })
  it('returns nothing when rate limited or down', async () => {
    stub({ detail: 'throttled' }, { status: 429 })
    expect(await openversePhotos('x')).toEqual([])
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await openversePhotos('x')).toEqual([])
  })
})
