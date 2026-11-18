# Explainer Studio: from animated slides to a 3D explainer

Status: proposed, awaiting Sheng's approval. Nothing here is built yet.

## Intent

Sheng's words: the app should help people "understand and visualize a topic", and it "still looks like a slide
presentation with more animations". They want it to "use online images, custom 3d animations, etc".

Today every scene is a card (an icon badge, a heading, two or three lines of text) placed in a flat 2D world, and
the camera whips from card to card. However many animations are added, the unit is still a slide. The fix is a
different unit: one continuous lit 3D world per video, filled with objects and real photos that move because the
narration says so, with words reduced to short labels and the captions.

What "not a slideshow" means here, in checkable terms:

1. **One world.** Every scene lives in the same 3D space. The camera travels; the previous scene stays visible in
   the distance, out of focus, for a few seconds. No hard cuts between scenes.
2. **Show, don't write.** No bullet lists on screen. A label is at most 4 words; only the title may run to 8.
   Sentences live in the narration and the captions only.
3. **Narration drives motion.** Objects enter, move, grow or pulse on the word that names them (the word timings
   already exist).
4. **Real pictures.** Each video uses several relevant, credited, freely licensed photos, shown with depth.
5. **Depth and light.** Perspective camera, soft shadows, depth of field, a little bloom and grain.

## Goals

- A video that reads as a 3D motion graphics explainer, judged by the five points above.
- Several relevant online photos per topic video, with correct licenses and visible credit.
- Custom 3D treatments: generic ones for every topic, plus kits for common topic families (places, molecules,
  space, earth science, biology).
- Same promise as today: free, no API key, no server, runs in the browser, files never leave the device.

## Non-goals

- Characters or hand-drawn style animation (no procedural way to make them good).
- AI image or video generation (needs servers, keys or multi-gigabyte models).
- An editor. The app explains; it does not author videos.
- 60 fps output. Export stays 30 fps with motion blur.

## Anti-goals (a failure even if it technically works)

- 3D that is decoration: spinning logos next to the same text cards.
- Photos that are off topic, unlicensed, uncredited, or so many that the video becomes a slideshow of photos.
- A landing page that gets heavy: the 3D engine must load only after the visitor asks for a video.
- A video that renders differently in export than in preview.
- Phones or old browsers getting a broken page instead of the current 2D video.

## Constraints

- Keyless, browser only. Allowed online sources, all verified on 2026-11-16 to send `Access-Control-Allow-Origin: *`
  so pixels can be read for export:
  - Wikipedia and Wikimedia Commons APIs, with pixels from `upload.wikimedia.org` and `thumb.wikimedia.org`.
  - Openverse API anonymously (limits 20 requests a minute and 200 a day per visitor), with pixels through its
    `/thumb/?full_size=true` proxy (up to about 1024 px wide). Openverse also covers NASA, whose own image host
    sends no CORS header and must not be loaded directly.
  - Wikidata SPARQL (coordinates, dates, entity types), PubChem PUG REST (3D molecule coordinates as SDF).
  - jsDelivr for static assets: NASA Blue Marble Earth texture (1.46 MB), `world-atlas` country outlines.
  - Hugging Face for model files (already used for the voice).
- Deterministic rendering: `render(t)` draws frame t from scratch. No `Math.random`, `Date` or carried state in
  render; anything simulated (particles) is precomputed from a seed.
- Timing comes from the motion plan (`src/motion/plan.ts`), shared by the 2D and 3D renderers. Phase 1 extends it
  with word-anchored cues: a list item's cue is the moment its key word is spoken, and a stat's count ends on the
  spoken number. The sound effects use the same cues, so toggling the renderer never changes the audio.
- three.js r187 (`three@0.187.0`) with `WebGLRenderer` (not WebGPU: custom shaders and broad support), and
  `postprocessing@6.39.6` (supports three >= 0.168 and < 0.188).
- Performance: preview renders at 1280x720 and holds 30 fps on an M-series Mac; export renders 1920x1080 at no worse
  than 1.5x real time; the 3D chunk adds at most 250 KB gzip and loads lazily.
- Fallback: if WebGL2 is missing or the context cannot be created or is lost and not restored, use today's 2D
  renderer. The 2D renderer stays in the codebase.
- Visual rules carried over: Geist only, no italics, labels at least 34 px on a 1080 canvas, Phosphor icons,
  theme tokens (Night, Paper, Graphite), entrance easing `cubic-bezier(0.16, 1, 0.3, 1)`, state to state
  `cubic-bezier(0.65, 0, 0.35, 1)`, linear only for continuous motion.
- Licenses for photos: public domain, CC0, CC BY and CC BY-SA only. No NC, no ND, no "fair use", nothing unknown.
- Privacy: online lookups send only short topic phrases and respect the existing Wikipedia setting.

## Approaches considered

| Approach | What it is | Trade-off |
|---|---|---|
| **A. 3D stage (chosen)** | Rebuild the visual layer on three.js: one world, 3D actors, real photos as depth dioramas, topic kits | Biggest change, most work; needs WebGL2 (fallback covers the rest) |
| B. 2.5D documentary | Stay on Canvas 2D; lead with many photos, Ken Burns and depth parallax, flat maps | Smaller and safer, but it is not "custom 3D animations" and still reads as flat panels |
| C. Animation framework | Remotion, Motion Canvas or Theatre.js | Solves timeline authoring, not automatic direction; heavy; browser export immature; adds license terms |
| D. Generative video | Text to video or image models | Needs servers, keys or huge downloads; breaks the free and keyless promise |

A is the only option that delivers what was asked. B's photo work lives on inside A as photo actors. This choice
is Claude's call; Sheng has not picked yet.

## Design

### Pipeline

```
storyboard + timing (unchanged)
        |
   motion plan (unchanged: shots, cues, captions, sfx)
        |
   director (new, pure): plan -> StageSet { pieces, actors, camera keys }
        |
   stage (new): three.js scene, built lazily per piece, rendered at time t
        |
   frame: 3D layer drawn into the 2D canvas, then today's overlays (chapter pill, captions, fade)
        |
   preview player / WebCodecs export (unchanged)
```

The director is pure data (serializable specs), so placement, choreography and camera paths are unit tested
without WebGL. Only the actor builders and the renderer touch three.js.

### Actors (generic, every topic)

- **Icon object:** the Phosphor duotone icon (`src/motion/icons.json`, 201 icons, `f` and `b` paths on a 256 grid)
  extruded with a bevel: front shape solid, back shape as a translucent slab. Replaces every flat badge.
- **Label:** a text plane drawn with the existing canvas text code at 2x and used as a texture. At most 4 words.
- **Photo:** a framed plane in the world. In phase 2 it becomes a depth diorama.
- **Data:** 3D bars (instanced rounded boxes), a line ribbon (tube), a pictogram (instanced 10x10 grid), a count up
  number label, a scale tower (stacked icon objects for magnitude).
- **Path and token:** a tube path with stations and a glowing token that travels between them.
- **Particles:** seeded point sprites for flows (rise, fall, stream), precomputed per piece.

### Set pieces (one per storyboard scene)

| Scene | 3D treatment |
|---|---|
| Title | Hero (lead photo if present, else topic icon object) rises into a lit pool; camera cranes down; title label |
| Definition | Hero icon object, term label, and a short label for what it is (for example "Solar radiation"); the full meaning stays in captions |
| Key points | 1 to 3 icon objects with 2 to 4 word labels on a shallow arc, each entering on its cue word |
| Stat | Percent: 3D pictogram lighting up N of 100. Count or amount: count up label over a scale tower |
| Compare | Two pillars scaled by value, camera orbits about 20 degrees, values on top |
| Chart | Bars or line ribbon on a floor grid; camera orbits to the highlighted value |
| Image | Photo actor with a slow dolly (depth parallax in phase 2) |
| Timeline | A rail receding into depth with year plaques; the camera flies along it |
| Steps | A loop path with stations; the token moves to each station on that step's cue |
| Kinds | Objects on an arc; each grows and glows when named |
| Summary | The camera pulls back until the earlier heroes are all in frame; the closing tags as labels |
| End | Its own piece: a sources card in the world, slow orbit |

Pieces sit along a gentle spline through the world (about 14 units apart, alternating height and depth). Only
pieces within a few seconds of t are built; the rest are disposed, so long videos keep bounded GPU memory.

### Camera

A continuous path through per piece viewpoints: dolly in during a piece, flight between pieces on the existing
transition windows, depth of field focused on the current hero, focus pulls on cues. Reduced motion shortens and
softens flights in preview.

### Online pictures (phase 2)

1. Candidates, in order: the Wikipedia article's own images (`generator=images` with `extmetadata`: license,
   artist, description), then Wikimedia Commons file search on each scene's key phrase, then Openverse.
   Measured on 2026-11-16: the articles for Black hole, Photosynthesis, Volcano and French Revolution offer 11, 5,
   18 and 23 free photos of at least 1000 px.
2. Scoring: word overlap between the image description or title and the scene's sentence, size (prefer at least
   1200 px wide), aspect 0.8 to 2.2, penalties for flags, logos, maps (unless places) and portraits (unless the
   person is named), no duplicates.
3. Budget: at most one photo per scene and 8 per video, fewer than half of all scenes.
4. Credits: a small credit line while a photo is on screen (artist, license, source) and the full list under the
   video and on the end card.
5. Depth: Depth Anything V2 Small (`onnx-community/depth-anything-v2-small`, `model_q4f16.onnx`, 19.1 MB) in a
   worker through `@huggingface/transformers` (already a dependency), WebGPU when present, cached per image in
   IndexedDB. The photo plane is displaced by depth so the camera move shows real parallax. Optional setting,
   off on slow connections and data saver.

### Topic kits (phase 3)

Each kit has `match(context) -> score` and `build(scene) -> SetPiece`; the director uses the best match above a
threshold, else the generic treatment.

- **Globe:** Blue Marble globe with country outlines; places from the article's linked entities through Wikidata
  coordinates; fly to and pin.
- **Molecule:** ball and stick model from PubChem 3D SDF for compounds named in a scene.
- **Space:** planets, stars, orbits, a black hole with accretion disk and lensing ring.
- **Earth science:** strata cross section, volcano with magma particles, water cycle diorama.
- **Biology:** cell with organelles, DNA helix.
- **Optics:** light rays, scattering by air molecules, wavelengths and colour, prisms.
- **Immune system:** viruses, antibodies, immune cells, for topics like vaccines.

With optics, immune system, space and data, the four examples on the landing page all get topic specific scenes.
- **Narration verbs:** a lexicon maps verbs near a noun's cue to actions (rise, fall, spin, orbit, grow, shrink,
  split, combine, flow, heat, glow, erupt).

### Labels

Labels name what the object shows. For a sentence, the label is the word that chose the icon (the icon matcher's
topical word) plus up to two words right before it ("General relativity", "Direct sunlight"). If that phrase is
only the topic itself ("Black holes" in a black hole video), the next best content word is used ("Relativistic
jets"). If nothing good is found, the object carries no label and the captions do the work. Data labels (chart
categories, values), the sources card and photo credits are exempt from the word limit.

### Devices

- Desktop and laptop: 3D by default. A "high" tier previews at 1280x720 with every effect; a "medium" tier (4 GB
  of memory or less, or fewer than 8 cores) previews at 960x540 without depth of field.
- Phones and tablets (coarse pointer or a screen under 900 px wide): 2D by default, with 3D available in settings
  at the medium tier. This protects the tab: the voice workers already hold a few hundred MB.
- A watchdog drops the preview one tier when the median frame time passes 50 ms over 3 seconds, and to 2D with a
  one line note if the lowest 3D tier is still too slow.
- Export renders 1920x1080 with every effect on the high tier and medium effects otherwise. Export matches the
  preview in content and timing; pixels are identical only within the same tier.
- On devices reporting 4 GB of memory or less, the voice workers are released once every clip is recorded.

### Settings

The gear gains "3D visuals" (on when supported) and, in phase 2, "Moving photos". Turning 3D off uses the 2D
renderer.

## Example: "Why is the sky blue?"

This sketch shows the full vision, which needs the phase 3 optics kit. Phase 1 alone renders the same storyboard
with generic treatments: a glowing sun object with the label "Diffuse sky radiation" and "Solar radiation", a
pictogram lighting 23 of 100 cells, and short labelled objects for the key points, all in one lit world.

```
TODAY (a card)                          PROPOSED (one world)
+--------------------------------+      +--------------------------------+
| (o) What it is                 |      |   sun object glowing, top left |
| [icon] Diffuse sky radiation   |      |    \   \   \  light rays       |
|        is solar radiation      |      |  . : . air molecules . : .     |
|        reaching the Earth's... |      |  blue rays bounce everywhere,  |
|                                |      |  red rays pass straight on     |
| captions: "...scattered..."    |      |  label: "Blue scatters most"   |
+--------------------------------+      +--------------------------------+
```

## Phases

Each phase ships on its own and gets its own implementation plan.

1. **3D stage.** Word-anchored cues, labels, director, stage, generic actors, all set pieces, camera, post effects,
   export, device tiers, fallback, settings toggle. Uses only the images the app already has. Done when the four
   landing examples and the six upload fixtures (water cycle DOCX, volcanoes PDF, photosynthesis PPTX, rainfall
   XLSX, black hole notes, mitochondria picture) all pass:
   - no bullet lists and every label within its limit;
   - no camera jump between frames;
   - every entrance within 150 ms of its cue and sound;
   - something moving at every moment;
   - export matching preview at the same tier;
   - the speed and size budgets;
   - and Sheng looking at three frames from each and agreeing it no longer reads as slides.
2. **Real pictures.** Online sourcing, scoring, licenses, credits, depth dioramas.
3. **Topic kits.** Globe, molecule, space, earth science, biology, narration verbs.

## Builder check

A reviewer read this design as the builder would. Their questions and how they were settled:

- Approval and phase order: open, for Sheng.
- Whether the sky sketch is a phase 1 deliverable: no, it needs the optics kit; phase 1 output is described above
  the sketch, and the pass criteria are in Phases.
- Where short labels come from: the Labels section.
- Whether motion may land on the spoken word: yes, through word-anchored cues in the shared motion plan, which also
  improves the 2D video and keeps one sound timeline.
- What "supported" means: the Devices section.
- Whether photo searches may use phrases from uploaded files: open, for Sheng; it can wait for the phase 2 plan.

## Calls Claude made (please check)

- Approach A over B.
- Phase order: 3D stage first, then photos, then kits. Photos first is possible if they matter more.
- WebGL, not WebGPU. Text as canvas textures, not 3D font geometry.
- The 2D renderer stays as the fallback and as the "3D visuals off" mode.
- Photo licenses limited to PD, CC0, CC BY and CC BY-SA.
- At most 8 photos per video and fewer than half of the scenes.
- Export stays 1080p 30 fps.
- Labels come from the icon's topical word, with no label rather than a fragment.
- Cues anchor to spoken words in the shared plan, changing the 2D video's timing too.
- Phones and tablets default to 2D; a watchdog steps down slow previews.
- Phase 3 adds optics and immune system kits so every landing example gets custom scenes.

## Left to the builder

Exact spline spacing, lens and colour values, material settings per theme, particle counts, label typography
inside the stated limits, and file layout beyond the interfaces in the plan.
