# Project Reelix

Type a topic or a question, or upload notes, slides, a PDF or a spreadsheet, and watch a narrated, animated
explanation of it. Everything runs in the browser: no account, no API key, no server, no cost.

Live demo: coming soon.

It is built for understanding a topic, not for producing content. A video is as long as its content needs
(about 30 seconds to 3 minutes, set by the Detail setting) and ends with one short "in short" line.

## Using it

- **One input.** Type "black holes", "how do vaccines work?", or paste a page of notes.
- **Upload.** PDF, Word (DOCX), PowerPoint (PPTX), Excel (XLSX), CSV, TSV, JSON, Markdown, plain text, RTF,
  HTML, OpenDocument (ODT, ODP, ODS) and images (PNG, JPEG, WebP, GIF). Older binary formats (DOC, PPT, XLS,
  Keynote) need to be saved as one of these first.
- **Settings** (the gear, top right): detail level, theme, voice, captions, music and effects, Wikipedia
  lookup, 3D visuals, and local AI when it is available.
- **Watch** right on the page, full screen if you like. A small download button saves an MP4.

## Inferring from limited information

When there is little to go on, the app fills in:

1. **Images and scans** are read with OCR (Tesseract, in the browser) when there is not much other text. The
   engine and its English data download from jsDelivr the first time an image needs reading; the image itself
   stays on the device.
2. **Short topics and questions** are looked up on Wikipedia (free, keyless API). "How do vaccines work?" is
   reduced to its subject ("vaccines") to find the main article; "why" questions try the full question first,
   and a search hit must share a word with the topic. For a thin upload, the topic comes from the file: its
   title, the subject of an opening "X is..." sentence, or a descriptive file name. Only that short topic is
   sent; files never leave the device. Sources are shown under the video and on the end card, and Wikipedia
   text is credited (CC BY-SA). The lookup can be turned off in settings.
3. **Structure becomes visuals.** The planner finds a definition ("X is a..."), groups of kinds (a "Types"
   section with subsections), step by step processes (numbered lists, "first... then... finally"), timelines
   (dated sentences in a history section), key numbers, comparisons and charts, and the user's images.
   It ranks sentences by how central they are and how well they answer the question ("how" questions favor
   mechanism words, "why" questions favor reasons that use the question's own words), skips sentences that
   lean on the one before ("This means..."), drops near repeats, and fits the rest to a word budget. Long
   sentences lose their side remarks before they are ever cut, and cuts happen only at real clause breaks.
4. **Data alone** (a CSV or spreadsheet) is described from the numbers: trend, change, peak, leader, share.

When the app runs on `localhost` and [Ollama](https://ollama.com) is running, a local model can write the
narration from the same material instead. The public site never probes Ollama.

## How the video is made

- **Voice:** [Kokoro 82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache 2.0) via
  [kokoro-js](https://github.com/hexgrad/kokoro), in a pool of single threaded Web Workers. Narration is split
  into sentences and spread across workers, longest first; sentences are cached in IndexedDB. The model
  (about 90 MB) downloads once. The visuals can be watched, silently with music, while the voice records.
- **3D stage:** Project Reelix draws each video as one continuous, lit 3D world with
  [three.js](https://threejs.org) and [postprocessing](https://github.com/pmndrs/postprocessing). A pure
  director turns the motion plan into set pieces (title, definition, key points, stat, compare, chart, image,
  timeline, steps, kinds, summary and an end card) placed along a gentle path, with extruded Phosphor icons,
  short labels, framed photos, 3D bars, ribbons, pictograms and particles that enter on the words that name
  them. The camera flies from piece to piece, and the previous one stays in view through each flight.
  Depth of field, bloom, a vignette, grain and filmic tone mapping finish each frame. Frames are a pure function of time, so a saved video
  matches the preview. The 3D code loads only once a video starts. Desktops get 3D by default; phones and
  tablets get the 2D renderer (3D can be turned on in settings), and a watchdog steps a slow preview down to
  960x540 and then to 2D. Without WebGL2, or when the graphics context is lost, the 2D renderer takes over.
  Measured on an M-series Mac: the preview draws a 1280x720 frame in 2.5 to 12 ms (budget 33 ms), and saving
  renders 1920x1080 at about a third of real time (an 81 second video in 27 seconds; budget 1.5x).
- **2D renderer** (when 3D visuals are off or unsupported): a canvas engine with a virtual camera, whip pans
  with motion blur, illustrated icon badges ([Phosphor](https://phosphoricons.com), MIT), pictograms, animated
  charts, definition, timeline and step shots. Captions are timed word by word to the voice in both.
- **Sound:** a music bed and sound effects synthesized with Web Audio; the music ducks under the voice.
- **Export:** every frame rendered offline and encoded to MP4 (H.264, AAC) with WebCodecs through
  [Mediabunny](https://mediabunny.dev).

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Useful scripts:

```bash
npx tsx scripts/plan-topics.ts "black holes" quick       # storyboard for a topic, from live Wikipedia (cached)
npx tsx scripts/plan-topics.ts "notes:Your text here"    # storyboard for typed notes
node scripts/build-icons.mjs                              # regenerate src/motion/icons.json
node scripts/deploy-to-site.mjs                           # build and copy into ~/cool-website/public/reelix
```

## Deploying to sheng-yan.com

The site is a static Next.js export on GitHub Pages. `scripts/deploy-to-site.mjs` builds this app with the
`/reelix/` base path and copies it to `public/reelix/` in the site repo. Commit that folder there and
push to publish.

The voice workers are single threaded on purpose. Multi threaded WebAssembly needs cross origin isolation
headers, and in testing the threaded runtime stalled between runs in the bundled build. Several single
threaded workers are steady and need no special headers. Hidden URL overrides exist for benchmarking:
`?pool=2&threads=1`.

## Project layout

```
src/ingest/     uploads (PDF, Office, OpenDocument, text, images), OCR, Wikipedia lookup
src/input/      text, table and number parsing
src/planner/    rule based and Ollama storyboard planners
src/model/      storyboard schema and scene timing
src/tts/        Kokoro worker pool, clip cache, text normalization
src/motion/     shot plan (camera path, captions, sound cues), word timing, icons
src/render/     camera, background, shots and overlays drawn on canvas (the 2D renderer)
src/stage/      the 3D stage: director, set pieces, camera, three.js actors, post effects, tiers, lab checks
src/audio/      procedural music and sound effects
src/player/     preview playback and the master mix
src/export/     WebCodecs export with fallbacks
src/ui/         prompt box, settings, player
```
