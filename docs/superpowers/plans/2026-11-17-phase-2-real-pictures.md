# Phase 2: Real Pictures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Topic videos show a few relevant, freely licensed online photos with visible credit, and photos gain
depth parallax ("Moving photos").

**Architecture:** A lazily imported `src/photos/` module finds candidates (the Wikipedia article's images, Commons
search, Openverse), keeps only PD/CC0/CC BY/CC BY-SA, scores them against each scene's sentence and assigns at most
one per scene. Chosen photos join the images map like the Wikipedia lead image does today; a scene carries
`photo: { imageId, credit }`; 3D pieces with a single hero show the photo instead of the icon; a credit line is drawn
while it is on screen; credits join the sources list (player and end card). A depth worker (Depth Anything V2 Small)
makes depth maps that displace the photo plane.

**Tech Stack:** TypeScript, MediaWiki API (en.wikipedia.org, commons.wikimedia.org, origin=*), Openverse API,
`@huggingface/transformers` depth-estimation in a worker, IndexedDB, three.js.

**Spec:** `docs/superpowers/specs/2026-11-16-3d-explainer-design.md` (Online pictures, Settings, Constraints)

## Global Constraints

- Licenses: public domain, CC0, CC BY and CC BY-SA only. No NC, no ND, no "fair use", nothing unknown.
- Sources: Wikipedia/Commons APIs with pixels from `upload.wikimedia.org`; Openverse anonymously (20 requests a
  minute, 200 a day) with pixels through `https://api.openverse.org/v1/images/<id>/thumb/?full_size=true`; never
  load NASA's own host.
- Budget: at most one photo per scene and 8 per video, fewer than half of all scenes.
- Scoring: word overlap between description/title and the scene's sentence; prefer >= 1200 px wide; aspect 0.8 to
  2.2 only; penalties for flags, logos, maps (unless places) and portraits (unless the person is named); no duplicates.
- Credits: a small credit line while a photo is on screen (artist, license); full list under the video and on the
  end card.
- Depth: `onnx-community/depth-anything-v2-small`, `model_q4f16.onnx`, WebGPU when present, cached per image in
  IndexedDB; setting "Moving photos", off on data saver and slow connections (2g/3g).
- Privacy (roadmap ruling): searches send only the Wikipedia article title already looked up and key phrases of
  scenes whose sentences come from that article; only when `settings.lookup` is on and an article was used.
- Determinism: photos and depth are inputs to a stage set; a new depth map gives a new set (rebuilt by the handle);
  render(t) stays pure.
- Initial JS budget 236.2 KB gzip; `src/photos/**` and the depth worker load lazily.

## Review Focus

1. A topic whose article has no usable photo (all NC, all SVG diagrams, all tiny): the video plays with icons, no
   error, no empty frame (Task 3 test: attachPhotos with zero candidates returns the storyboard unchanged).
2. Wikipedia or Openverse down, slow or rate limited (429): photos are skipped within the time budget, never a
   failed video (Task 2/3 tests: a rejecting fetch and a 429 give [] and the storyboard unchanged).
3. A photo whose pixels cannot be read (no CORS, decode error): it is dropped before assignment, never shown blank
   (Task 3 test: a failing decode drops that candidate and assigns the next).
4. HTML in Commons metadata (Artist `<a href>`, descriptions with markup): credits show plain text only (Task 1 test).
5. Depth model unavailable (no WebGPU, download fails, data saver): photos stay flat, the video is unaffected
   (Task 5 test: depthFor rejecting gives a flat plane).

---

### Task 1: Selection rules (pure)

**Files:** Create `src/photos/select.ts`, `src/photos/select.test.ts`

**Interfaces:** Produces
- `type License = 'Public domain' | 'CC0' | \`CC BY ${string}\` | \`CC BY-SA ${string}\``
- `interface PhotoCandidate { url: string; width: number; height: number; title: string; description: string; artist: string; license: License; source: string; origin: 'article' | 'commons' | 'openverse' }`
- `licenseOf(raw: string): License | null` (raw: Commons LicenseShortName or Openverse `license` + version, any case)
- `plainText(html: string): string` (strip tags and entities, collapse spaces, cap 80 chars at a word)
- `scorePhoto(c: PhotoCandidate, sentence: string, opts: { place: boolean; people: string[] }): number` (-Infinity = unusable)
- `assignPhotos(scenes: { id: string; sentence: string; eligible: boolean; place: boolean; people: string[] }[], candidates: PhotoCandidate[]): Map<string, PhotoCandidate>`

- [ ] **Step 1: Tests** — `licenseOf`: 'CC BY-SA 4.0' -> 'CC BY-SA 4.0', 'cc-by-sa-3.0' -> 'CC BY-SA 3.0', 'Public domain'/'PD-USGov' -> 'Public domain', 'CC0' -> 'CC0', openverse 'by 2.0' -> 'CC BY 2.0', 'pdm' -> 'Public domain', 'CC BY-NC 2.0'/'CC BY-ND 4.0'/'Fair use'/'' -> null. `plainText('<a href="x">Jane</a> &amp; co')` -> 'Jane & co'. `scorePhoto`: aspect 0.5 or 3 -> -Infinity; svg/png diagram titles ('Diagram', '.svg') and width < 640 -> -Infinity; overlap raises score; >= 1200 wide beats 800 wide at equal overlap; 'Flag of', 'logo', 'map' (place false), a portrait title with a name not in `people` each score lower than the same photo without. `assignPhotos`: <= 1 per scene, <= 8 total, total < half of scenes (10 scenes -> at most 4), a candidate used once, ineligible scenes get none, a scene gets none when its best score <= 0.
- [ ] **Step 2: Run** `npx vitest run src/photos/select.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** — overlap counts content words (`contentWords` from `src/input/parseText.ts`) shared by `title + description` and the sentence; score = overlap * 2 + (width >= 1200 ? 1 : 0) - penalties (1.5 each); assignment is greedy by score across (scene, candidate) pairs.
- [ ] **Step 4: Run** — PASS; then tsc, oxlint, npm test green; commit "Photos: licenses, scoring and assignment".

### Task 2: Sources (network, fetch stubbed in tests)

**Files:** Create `src/photos/source.ts`, `src/photos/source.test.ts`

**Interfaces:** Consumes Task 1 types. Produces
- `articlePhotos(title: string, signal?: AbortSignal): Promise<PhotoCandidate[]>` — `en.wikipedia.org/w/api.php?action=query&generator=images&titles=<title>&gimlimit=50&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1280&format=json&formatversion=2&origin=*`; keep image/jpeg|png|webp, licence from `extmetadata.LicenseShortName`, artist `plainText(Artist)`, description `plainText(ImageDescription)`, `url` = `thumburl`, `source` = `descriptionurl`.
- `commonsPhotos(phrase: string, signal?): Promise<PhotoCandidate[]>` — same on `commons.wikimedia.org/w/api.php` with `generator=search&gsrnamespace=6&gsrsearch=<phrase>&gsrlimit=20`.
- `openversePhotos(phrase: string, signal?): Promise<PhotoCandidate[]>` — `https://api.openverse.org/v1/images/?q=<phrase>&license=pdm,cc0,by,by-sa&page_size=20`; `url` = the thumb proxy above; 429 or any error -> [].

- [ ] **Step 1: Tests** with `vi.stubGlobal('fetch', ...)` returning recorded-shape JSON: each client maps fields as above, drops NC/ND/unknown licences and non-photo mimes, sends `origin=*`, returns [] on a rejecting fetch, a non-ok status and a 429.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS; gates; commit "Photos: Wikipedia, Commons and Openverse sources".

### Task 3: Attach photos to a storyboard; credits; app wiring

**Files:** Create `src/photos/attach.ts`, `src/photos/attach.test.ts`, `src/photos/index.ts` (lazy entry); modify `src/model/storyboard.ts` (Scene `photo?: { imageId: string; credit: string }`), `src/App.tsx` (after planning: `if (settings.lookup && articleTitle) await import('./photos')` then attach, status "Finding photos", images map), `src/ingest/index.ts` (return the article title used: `corpus.article?: string`), `src/ingest/types.ts`.

**Interfaces:** Produces `attachPhotos(sb: Storyboard, opts: { article: string; signal?: AbortSignal; timeoutMs?: number; load?: (url: string) => Promise<ImageBitmap> }): Promise<{ storyboard: Storyboard; images: IngestedImage[] }>`; eligible scenes are those whose visual kind is `title` or `definition` (the single-hero pieces Task 4 changes; ruling: stat has no single hero); phrases = article title + the scene's key phrase (`topicalWord` phrase); candidates: article first, then Commons for scenes still empty, then Openverse; decode failures drop the candidate; credit = `Photo: <artist>, <license>`; each photo also adds a source `{ label: 'Photo: <title> by <artist> (<license>)', url: source }`; default timeoutMs 8000 (whatever is assigned by then is used).

- [ ] **Step 1: Tests** (sources stubbed through `vi.mock('./source')`): zero candidates -> storyboard unchanged and no images; a decode failure assigns the next candidate; budget respected on a 10 scene storyboard; credits and sources added; a timeout returns what was ready.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** (the storyboard schema accepts `photo`; old saved storyboards without it still parse). **Step 4: Run** — PASS; gates; build; initial JS <= 236.2 KB gzip; commit "Photos: attach to scenes with credits".

### Task 4: Show photos and their credit

**Files:** Modify `src/stage/pieces/definition.ts`, `src/stage/pieces/stat.ts` (hero via `pictureHero` when `ctx.scene.photo` and `ctx.hasImage`), `src/render/overlays.ts` (credit line, bottom left, 26 px Geist on the theme's dim ink, only while a shot of a photo scene is on and the frame is drawn by the 3D stage), tests in `src/stage/pieces/pieces-a.test.ts` and a renderFrame overlay test if one exists (else a pure `creditFor(plan, t, stage3d): string | null` in overlays with a test).

- [ ] **Step 1: Tests** — definition and stat pieces use a photo hero for a scene with `photo` and an available image, the icon otherwise; extent tests still pass with photo heroes; `creditFor` returns the credit during the photo scene's shots in 3D, null in 2D and outside the scene.
- [ ] **Step 2–4:** RED, implement, GREEN; gates; commit "Photos: photo heroes and on-screen credit".

### Task 5: Moving photos (depth)

**Files:** Create `src/photos/depth.worker.ts`, `src/photos/depth.ts` (`depthFor(key: string, bitmap: ImageBitmap): Promise<ImageBitmap | null>`, IndexedDB `reelix-depth` cache), `src/photos/depth.test.ts`; modify `src/stage/types.ts`/`src/stage/three/actors.ts` (`BuildDeps.depths?: Map<string, ImageSource>`; a photo with depth is a 96x54 segment plane whose vertices move toward the camera by depth * DEPTH_RELIEF, 0.35 units, sampled once at build), `src/stage/handle.ts` (depths in the StageSet key), `src/ui/settingsStore.ts` (`movingPhotos: boolean | null`, null = automatic: off when `navigator.connection.saveData` or effectiveType 2g/3g), `src/ui/Settings.tsx` ("Moving photos" toggle), `src/App.tsx` (depth runs after photos attach, results update the depths map), `src/export/exportVideo.ts` (export stage gets the depths).

- [ ] **Step 1: Tests** — builders: a photo with a depth source builds a plane with 97*55 vertices whose z spread is about DEPTH_RELIEF, flat without; settings: null resolves off under saveData; depth.ts: a cache hit skips the worker; a worker error resolves null.
- [ ] **Step 2–4:** RED, implement, GREEN; gates; build (the worker and model load lazily; initial JS budget holds); commit "Photos: moving photos with depth".

### Task 6: Acceptance, docs, review

- [ ] Browser (dev server): the four landing examples. Each gets 1 to 4 photos with readable credits, licences in
  the allowed set, the credit line shows only while the photo is on screen, Moving photos shows parallax, ?visuals=2d
  shows no credit line; Wikipedia setting off gives no photo requests (network panel).
- [ ] Budgets: initial JS <= 236.2 KB gzip; photos and depth chunks lazy; bench unchanged within 10%.
- [ ] README: a Real pictures bullet and the Moving photos setting.
- [ ] Final review (Opus) of the phase; one fix pass; ledger.
