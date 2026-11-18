# 3D Stage (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card by card 2D visuals with one continuous three.js world per video, driven by the existing motion plan, with the 2D renderer kept as the fallback.

**Architecture:** A pure director turns the `MotionPlan` into a serializable `StageSet` (set pieces, actors with beats, camera keys). A stage builds three.js objects only for pieces near time t, poses them from the specs and renders with post effects into an offscreen WebGL canvas; `renderFrame` draws that canvas, then the existing 2D overlays. Preview and export call the same code, so they match.

**Tech Stack:** TypeScript 7, Vite 8, React 19, three@0.187.0, postprocessing@6.39.6, vitest@5.1.0, happy-dom@21.0.4.

**Spec:** `docs/superpowers/specs/2026-11-16-3d-explainer-design.md`

## Global Constraints

- No API key, no server, no new online sources in this phase.
- `render(t)` is pure: no `Math.random`, no `Date`, no state carried between frames. Randomness comes from `rand(seed)` in `src/render/easing.ts`.
- Timing comes from `src/motion/plan.ts`, shared by the 2D and 3D renderers. Task 4 adds word-anchored cues there (`Shot.cues`, `Shot.countEnd`); after that, the 3D layer adds placement and drawing only, and its entrances land on the sound cues (tables in Task 6 and Task 7).
- three@0.187.0 with `WebGLRenderer`; postprocessing@6.39.6.
- Preview renders 1280x720 at 30 fps or better on an M-series Mac; export renders 1920x1080 at no worse than 1.5x real time; the lazily loaded 3D chunk adds at most 250 KB gzip; the landing page's initial JavaScript grows by at most 5 KB gzip.
- Fall back to the 2D renderer when WebGL2 is missing, the context cannot be created, or a lost context is not restored within 2000 ms.
- Geist only, no italics. Labels at least 34 px on a 1080 canvas. Labels at most 4 words; only the title may run to 8; no label rather than a fragment. No bullet lists on screen. Phosphor icons. Theme tokens (Night, Paper, Graphite).
- Devices: desktops default to 3D (high tier 1280x720 with every effect; medium tier 960x540 without depth of field when memory is 4 GB or less or there are fewer than 8 cores); phones and tablets default to 2D; a watchdog steps down when the median frame time passes 50 ms over 3 s.
- Acceptance set: the four landing examples (`src/examples.ts`) and the six upload fixtures in `docs/superpowers/fixtures/`.
- Easing: entrances `cubic-bezier(0.16, 1, 0.3, 1)`, state to state `cubic-bezier(0.65, 0, 0.35, 1)`, linear only for continuous motion.
- The repo is not under git. Commit steps apply only after Sheng initializes git and approves commits; otherwise skip them.
- Every task ends with `npx oxlint src` and `npx tsc -b` reporting nothing, and `npm test` passing.

## Review Focus

1. A WebGL context lost in the middle of an export (GPU reset, many tabs open): the export still finishes, switching to the 2D renderer when the context is not restored within 2000 ms, and says so. Test in Task 12.
2. A long video (13 or more scenes, about 3 minutes): GPU memory stays bounded. At most 4 pieces are built at any time, and scrubbing end to end does not grow the geometry count. Tests in Task 9 and Task 11.
3. A photo actor whose image is missing, failed to load or would taint the canvas: it renders the fallback icon object and never throws. Tests in Task 6 and Task 10.
4. Long words and labels ("Electroencephalography readings", "1,234,567,890 people"): the label wraps to at most 2 lines at 34 px or more, keeps numbers whole, cuts at a word boundary with an ellipsis, and never shrinks below 34 px. Test in Task 2.
5. Seeking in any order (scrubbing back, jumping ahead): frame t renders identical pixels whether reached in sequence or directly, so export matches preview. Test in Task 11.

---

## File Structure

Pure modules, unit tested in Node:

- `src/stage/types.ts`: data types for the stage.
- `src/stage/layout.ts`: world constants and where pieces sit.
- `src/stage/labels.ts`: label shortening and fitting.
- `src/stage/pose.ts`: an actor's pose at time t.
- `src/stage/director.ts`: motion plan to `StageSet`.
- `src/stage/pieces/*.ts`: one spec builder per scene kind, dispatched from `src/stage/pieces/index.ts`.
- `src/stage/camera.ts`: default camera keys and the camera pose at time t.
- `src/stage/window.ts`: which pieces to build at time t.
- `src/stage/support.ts`: capability check and render mode.
- `src/stage/tiers.ts`: device profile and the frame time watchdog.
- `src/motion/anchors.ts`: word-anchored cue times.
- `src/stage/__fixtures__/plan.ts`: a deterministic storyboard covering every scene kind, and its motion plan.

three.js modules, tested in happy-dom where possible and verified in the browser lab:

- `src/stage/three/materials.ts`, `icons3d.ts`, `labelMesh.ts`, `actors.ts`, `fx.ts`, `stage.ts`.
- `src/stage/handle.ts`: the glue `renderFrame` calls.
- `stage-lab.html` and `src/stage/lab.ts`: a dev only verification page. Vite serves it in dev and does not build it.

Modified:

- `src/render/renderFrame.ts`, `src/export/exportVideo.ts`, `src/App.tsx`, `src/ui/settingsStore.ts`, `src/ui/Settings.tsx`.
- `src/motion/plan.ts`: export `cueAt`; add `Shot.cues` and `Shot.countEnd`. `src/motion/icons.ts`: export `topicalWord`. `src/render/easing.ts`: export `bezier`, add `easeEnter` and `easeState`.
- `src/render/shots/steps.ts`, `timeline.ts`, `stat.ts`: read `shot.cues` and `shot.countEnd`.
- `src/tts/tts.ts`: `releaseVoiceWorkers()`.
- `package.json`, `vite.config.ts`, `README.md`.

---

### Task 1: Test runner, dependencies, types and layout

**Files:**
- Modify: `package.json`, `vite.config.ts`
- Create: `src/stage/types.ts`, `src/stage/layout.ts`, `src/stage/layout.test.ts`

**Interfaces:**
- Consumes: `ShotKind` from `src/motion/plan.ts`.
- Produces: every type below; `PIECE_SPACING = 14`, `HOLD_DISTANCE = 10`, `FOV = 35`, `WORLD_PER_PX = (2 * HOLD_DISTANCE * Math.tan((FOV / 2) * (Math.PI / 180))) / 1080`; `pieceOrigin(index: number): Vec3`.

- [ ] **Step 1: Install and wire the test runner**

Run: `npm install three@0.187.0 postprocessing@6.39.6 && npm install -D @types/three@0.187.0 vitest@5.1.0 happy-dom@21.0.4`
Add the script `"test": "vitest run"` to `package.json`. Add `/// <reference types="vitest/config" />` to the top of `vite.config.ts` and `test: { include: ['src/**/*.test.ts'], environment: 'node' }` to its config object.

- [ ] **Step 2: Write `src/stage/types.ts`**

These are the contract every later task uses; copy them exactly.

```ts
import type { ShotKind } from '../motion/plan'

export type Vec3 = [number, number, number]
export type LabelSize = 'title' | 'term' | 'label' | 'small'
export type BeatAction = 'enter' | 'exit' | 'pulse' | 'focus' | 'grow' | 'travel' | 'count' | 'spin' | 'highlight'

export interface Beat {
  /** Global ms when the beat starts. */
  t: number
  dur: number
  action: BeatAction
  /** grow: target scale multiplier. */
  to?: number
  /** travel: polyline relative to the actor's `at`, and the station index to reach. */
  path?: Vec3[]
  index?: number
}

export type ActorData =
  | { kind: 'icon'; icon: string; accent: boolean }
  | { kind: 'label'; text: string; size: LabelSize }
  | { kind: 'photo'; imageId: string; fallbackIcon: string; aspect: number }
  | { kind: 'bars'; values: number[]; categories: string[]; highlight: number | null }
  | { kind: 'ribbon'; values: number[]; categories: string[]; highlight: number | null }
  | { kind: 'pictogram'; lit: number; total: 100 }
  | { kind: 'tower'; count: number; icon: string }
  | { kind: 'path'; points: Vec3[]; closed: boolean }
  | { kind: 'token' }
  | { kind: 'particles'; count: number; seed: number; flow: 'rise' | 'fall' | 'stream'; extent: Vec3 }
  | { kind: 'card'; lines: string[] }

export interface ActorSpec {
  /** Stable id `${pieceIndex}:${role}:${n}`, never random. */
  id: string
  /** Position relative to the piece origin, world units. */
  at: Vec3
  scale: number
  data: ActorData
  beats: Beat[]
}

export interface CameraKey {
  t: number
  position: Vec3
  target: Vec3
  fov: number
  /** Depth of field focus distance, world units. */
  focus: number
}

export interface SetPiece {
  index: number
  scene: number
  kind: ShotKind
  /** World position; actor `at` values are relative to it. */
  origin: Vec3
  /** Global ms window in which the piece can be on screen. */
  start: number
  end: number
  actors: ActorSpec[]
  /** Absolute world positions, sorted by t. */
  camera: CameraKey[]
  heroId: string
}

export interface StageSet {
  pieces: SetPiece[]
  total: number
}

export interface CameraPose {
  position: Vec3
  target: Vec3
  fov: number
  focus: number
  roll: number
}

export interface ActorPose {
  position: Vec3
  rotation: Vec3
  scale: number
  opacity: number
  glow: number
  /** 0 to 1 progress of the latest count beat, for count up labels. */
  progress: number
}
```

- [ ] **Step 3: Write the failing test `src/stage/layout.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { pieceOrigin } from './layout'

describe('pieceOrigin', () => {
  it('starts at the world origin', () => expect(pieceOrigin(0)).toEqual([0, 0, 0]))
  it('spaces consecutive pieces 12 to 18 units apart', () => {
    for (let i = 0; i < 20; i++) {
      const a = pieceOrigin(i)
      const b = pieceOrigin(i + 1)
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
      expect(d).toBeGreaterThanOrEqual(12)
      expect(d).toBeLessThanOrEqual(18)
    }
  })
  it('moves forward along x and varies height and depth', () => {
    const pts = Array.from({ length: 8 }, (_, i) => pieceOrigin(i))
    pts.slice(1).forEach((p, i) => expect(p[0]).toBeGreaterThan(pts[i][0]))
    expect(new Set(pts.map((p) => p[1])).size).toBeGreaterThan(2)
    expect(new Set(pts.map((p) => p[2])).size).toBeGreaterThan(2)
  })
})
```

- [ ] **Step 4: Run it and see it fail**

Run: `npx vitest run src/stage/layout.test.ts`
Expected: FAIL, cannot find module `./layout`.

- [ ] **Step 5: Implement `pieceOrigin(index: number): Vec3` and the constants in `src/stage/layout.ts`**

x advances `PIECE_SPACING` per piece; y and z come from fixed repeating patterns, like `Y_PATTERN` in `src/motion/plan.ts` (for example y `[0, 2.2, -1.6, 1.4, -2.4, 0.8]`, z `[0, -3, 2, -2, 3, -1]`).

- [ ] **Step 6: Run it and see it pass**

Run: `npx vitest run src/stage/layout.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts src/stage/types.ts src/stage/layout.ts src/stage/layout.test.ts
git commit -m "feat(stage): test runner, stage types and piece layout"
```

---

### Task 2: Labels

**Files:**
- Modify: `src/motion/icons.ts` (export `topicalWord(text: string): string`, the part of `focusWord` after its number branch; `focusWord` becomes the number or `topicalWord`)
- Create: `src/stage/labels.ts`, `src/stage/labels.test.ts`

**Interfaces:**
- Produces: `labelFor(sentence: string, topicWords: string[]): string | null`; `type Measure = (text: string, sizePx: number) => number`; `shortLabel(text: string, maxWords?: number): string` (default 4); `fitLabel(text: string, maxWidth: number, measure: Measure, opts?: { maxSize?: number; minSize?: number; maxLines?: number }): { lines: string[]; size: number; truncated: boolean }` (defaults 72, 34, 2); `LABEL_PX: Record<LabelSize, number> = { title: 88, term: 64, label: 44, small: 36 }`; `LABEL_MAX_WIDTH_PX = 520`.

`shortLabel` drops a leading a, an or the, keeps at most `maxWords` words, then drops trailing weak words (a an the of in on at to for from by with under over into onto than as and or but nor so its their his her our your this that these those which who whom whose is are was were be been), and capitalizes the first letter. `labelFor` takes `topicalWord(sentence)` plus up to two content words right before it in the sentence (stopping at a stop word, a number or punctuation); if every word of that phrase is a topic word (equal, or one starts with the other and the shorter has at least 4 letters), it repeats the search with the longest remaining content word that is not a topic word; it returns null when nothing is left, and the result goes through `shortLabel`. `fitLabel` tries sizes from `maxSize` down to `minSize` in 2 px steps, greedy wrapping at spaces; a token containing a digit is never split; if nothing fits at `minSize`, it keeps `maxLines` lines and ends the last at a word boundary with `…`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { fitLabel, labelFor, shortLabel, type Measure } from './labels'

// A fixed width stand in for canvas measureText.
const mono: Measure = (s, size) => s.length * size * 0.55

describe('shortLabel', () => {
  it('drops a leading article and trailing weak words', () =>
    expect(shortLabel('The core collapses under its own gravity')).toBe('Core collapses'))
  it('keeps at most four words', () => expect(shortLabel('The sun drives the cycle by heating water')).toBe('Sun drives the cycle'))
  it('leaves a single word alone', () => expect(shortLabel('Evaporation')).toBe('Evaporation'))
})

describe('labelFor', () => {
  it('names what the icon shows', () => expect(labelFor('The sun drives the cycle by heating water in oceans and lakes.', ['water', 'cycle'])).toBe('Sun'))
  it('keeps the words before it', () =>
    expect(labelFor('General relativity also predicts that every black hole should have a central singularity.', ['black', 'hole'])).toBe('General relativity'))
  it('skips a phrase that is only the topic', () => expect(labelFor('Some black holes have relativistic jets.', ['black', 'hole'])).toBe('Relativistic jets'))
  it('keeps an adjective', () => expect(labelFor('There is essentially no direct sunlight under an overcast sky.', ['sky', 'blue'])).toBe('Direct sunlight'))
  it('returns null when nothing is worth a label', () => expect(labelFor('It is.', [])).toBeNull())
})

describe('fitLabel', () => {
  it('never goes below 34 px and fits the width', () => {
    const f = fitLabel('Electroencephalography readings', 520, mono)
    expect(f.size).toBeGreaterThanOrEqual(34)
    expect(f.lines.length).toBeLessThanOrEqual(2)
    f.lines.forEach((l) => expect(mono(l, f.size)).toBeLessThanOrEqual(520))
  })
  it('keeps a number whole', () => expect(fitLabel('1,234,567,890 people', 280, mono).lines.join(' ')).toContain('1,234,567,890'))
  it('ends with an ellipsis at a word boundary when two lines are not enough', () => {
    const f = fitLabel('One two three four five six seven eight nine ten eleven twelve', 200, mono)
    expect(f.truncated).toBe(true)
    expect(f.size).toBe(34)
    expect(f.lines).toHaveLength(2)
    expect(f.lines[1].endsWith('…')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/labels.test.ts`
Expected: FAIL, cannot find module `./labels`.

- [ ] **Step 3: Implement `shortLabel`, `fitLabel` and the constants in `src/stage/labels.ts`**

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/stage/labels.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/motion/icons.ts src/stage/labels.ts src/stage/labels.test.ts
git commit -m "feat(stage): labels from the icon's topical word, shortening and fitting"
```

---

### Task 3: Actor poses

**Files:**
- Modify: `src/render/easing.ts` (export `bezier`; add `export const easeEnter = bezier(0.16, 1, 0.3, 1)` and `export const easeState = bezier(0.65, 0, 0.35, 1)`)
- Create: `src/stage/pose.ts`, `src/stage/pose.test.ts`

**Interfaces:**
- Consumes: `ActorSpec`, `ActorPose`, `Vec3` (Task 1).
- Produces: `actorPose(actor: ActorSpec, t: number): ActorPose`.

Beat semantics, all relative to the actor's `at` and `scale`:

| Action | Over `dur` | After |
|---|---|---|
| enter | opacity 0 to 1, scale x0.6 to x1, y offset -0.6 to 0, `easeEnter` | visible |
| exit | opacity to 0, scale to x0.9, `easeState` | invisible |
| pulse | scale x(1 + 0.12 sin(pi p)) | back to base |
| focus | glow to 1 in the first 200 ms, holds, back to 0 over 300 ms after `dur` | glow 0 |
| highlight | glow to 1 | glow stays 1 |
| grow | scale multiplier to `to`, `easeState` | holds |
| travel | position along `path` to station `index`, `easeState` | holds at the station |
| count | `progress` 0 to 1, linear | 1 |
| spin | rotation y + 2 pi p, linear | holds |

Before its first `enter` beat an actor has opacity 0. An actor with no `enter` beat is visible from the start.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { actorPose } from './pose'
import type { ActorSpec, Vec3 } from './types'

const actor: ActorSpec = {
  id: '0:hero:0',
  at: [1, 2, 3],
  scale: 1,
  data: { kind: 'icon', icon: 'drop', accent: false },
  beats: [
    { t: 1000, dur: 600, action: 'enter' },
    { t: 3000, dur: 400, action: 'pulse' },
  ],
}

describe('actorPose', () => {
  it('is invisible before it enters', () => expect(actorPose(actor, 999).opacity).toBe(0))
  it('is fully in place after its entrance', () => {
    const p = actorPose(actor, 1600)
    expect(p.opacity).toBe(1)
    expect(p.scale).toBeCloseTo(1)
    expect(p.position).toEqual([1, 2, 3])
  })
  it('swells mid pulse and returns to base after', () => {
    expect(actorPose(actor, 3200).scale).toBeGreaterThan(1.05)
    expect(actorPose(actor, 3400).scale).toBeCloseTo(1)
  })
  it('travels to a station and stays there', () => {
    const path: Vec3[] = [[0, 0, 0], [4, 0, 0], [4, 4, 0]]
    const token: ActorSpec = { ...actor, beats: [{ t: 0, dur: 1, action: 'enter' }, { t: 1000, dur: 500, action: 'travel', path, index: 2 }] }
    expect(actorPose(token, 1500).position).toEqual([5, 6, 3])
    expect(actorPose(token, 9000).position).toEqual([5, 6, 3])
  })
  it('is a pure function of t', () => expect(actorPose(actor, 1234)).toEqual(actorPose(actor, 1234)))
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/pose.test.ts`
Expected: FAIL, cannot find module `./pose`.

- [ ] **Step 3: Implement the easing exports and `actorPose` in `src/stage/pose.ts`**

Apply beats in time order; each beat reads the pose the earlier beats produced.

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/stage/pose.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render/easing.ts src/stage/pose.ts src/stage/pose.test.ts
git commit -m "feat(stage): actor poses from beats"
```

---

### Task 4: Word-anchored cues shared by 2D and 3D

**Files:**
- Create: `src/motion/anchors.ts`, `src/motion/anchors.test.ts`, `src/stage/__fixtures__/plan.ts`, `src/motion/plan-cues.test.ts`
- Modify: `src/motion/plan.ts` (export `cueAt`; add `Shot.cues` and `Shot.countEnd`; the sound plan reads them), `src/render/shots/steps.ts`, `src/render/shots/timeline.ts`, `src/render/shots/stat.ts`

**Interfaces:**
- Consumes: `WordTiming` (`src/motion/words.ts`), `topicalWord` (Task 2), `buildTimeline`, `estimateSpeechMs` (`src/model/timing.ts`), `buildPlan`.
- Produces:
  - `anchorTimes(words: WordTiming[], phrases: string[], fallbacks: number[]): number[]`: for each phrase in order, the start of the first spoken word after the previous match that matches the phrase's anchor (its digits if it has any, else `topicalWord(phrase)`, else its longest content word), compared lowercase without punctuation, matching when the two share a prefix of at least 4 letters or the digits are equal; the phrase's fallback when nothing matches.
  - `Shot.cues: number[]`: global ms, one per item for `timeline` and `steps` shots (both styles), from `anchorTimes(words, items, cueAt fallbacks)`; empty for other kinds.
  - `Shot.countEnd: number | null`: for `stat` shots, the start of the spoken number clamped to `[t0 + 900, end - 400]`, or `t0 + STAT_COUNT_START + STAT_COUNT_DUR` when it is not spoken; null for other kinds.
  - `fixtureStoryboard(opts?: { extraPoints?: number }): Storyboard` and `fixturePlan(opts?: { extraPoints?: number }): MotionPlan` (built with `buildTimeline(sb, sb.scenes.map((s) => estimateSpeechMs(s.narration)))` and `buildPlan(sb, tl, [])`).

The fixture storyboard, in order: title "Why is the sky blue?"; definition (term "Diffuse sky radiation"); bullets with 3 items; stat "42%" whose narration says "42%"; compare (two labeled values); chart (bar, 5 categories, highlight 2); image (`imageId: 'img1'`); timeline (4 events); steps (`style: 'steps'`, items "Evaporation", "Condensation", "Precipitation", "Collection"); steps (`style: 'kinds'`, 3 items); outro with 3 tags. Every steps, kinds and timeline narration names its items in order. `extraPoints: n` inserts n more 2 item bullets scenes before the outro. Narrations are real sentences of 12 to 25 words.

The 2D steps and timeline shots replace their `sceneCue(...)` arrival times with `shot.cues[i] - shot.t0`, and the 2D stat shot counts from `STAT_COUNT_START` to `shot.countEnd - shot.t0`. The sound plan uses the same values, so pops, ticks and the impact move with the visuals.

- [ ] **Step 1: Write the failing tests**

`src/motion/anchors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { anchorTimes } from './anchors'
import type { WordTiming } from './words'

const words = (text: string): WordTiming[] => text.split(' ').map((w, i) => ({ text: w, start: i * 300, end: i * 300 + 250 }))

describe('anchorTimes', () => {
  const w = words('First water evaporates, then the vapor condenses into clouds, and finally rain falls back down.')
  it('finds the word that names each step, in order', () =>
    expect(anchorTimes(w, ['Evaporation', 'Condensation', 'Precipitation'], [-1, -2, -3])).toEqual([600, 1800, -3]))
  it('matches a number by its digits', () =>
    expect(anchorTimes(words('Human liver cells have about 1,000 mitochondria each.'), ['1000'], [-1])).toEqual([1500]))
  it('maps a repeated word to successive mentions', () =>
    expect(anchorTimes(words('Water rises, then water falls.'), ['Water', 'Water'], [-1, -1])).toEqual([0, 900]))
})
```

`src/motion/plan-cues.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fixturePlan } from '../stage/__fixtures__/plan'

const plan = fixturePlan()

describe('word-anchored cues', () => {
  it('gives timeline and steps shots one cue per item', () =>
    plan.shots.filter((s) => s.kind === 'steps' || s.kind === 'timeline').forEach((s) => {
      const v = plan.storyboard.scenes[s.scene].visual
      const n = v.kind === 'timeline' ? v.events.length : v.kind === 'steps' ? v.items.length : -1
      expect(s.cues).toHaveLength(n)
    }))
  it('anchors each step to the word that names it', () => {
    const s = plan.shots.find((x) => x.kind === 'steps')!
    const w = plan.words[s.scene]
    expect(s.cues[0]).toBe(w.find((x) => x.text.toLowerCase().startsWith('evapor'))!.start)
    expect(s.cues[1]).toBe(w.find((x) => x.text.toLowerCase().startsWith('conden'))!.start)
  })
  it('ends the stat count when the number is spoken', () => {
    const s = plan.shots.find((x) => x.kind === 'stat')!
    const num = plan.words[s.scene].find((x) => x.text.includes('42'))!
    expect(s.countEnd).toBe(Math.min(Math.max(num.start, s.t0 + 900), s.end - 400))
    expect(plan.sfx.some((e) => e.kind === 'impact' && e.t === s.countEnd! - 120)).toBe(true)
  })
})
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/motion`
Expected: FAIL, cannot find module `./anchors` and `../stage/__fixtures__/plan`.

- [ ] **Step 3: Implement `anchorTimes`, the fixture, `Shot.cues`, `Shot.countEnd`, and switch the sound plan and the three 2D shots to them**

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run src/motion`
Expected: PASS, 6 tests.

- [ ] **Step 5: Check the 2D video by eye**

Run `npm run dev`, play "Why is the sky blue?" and the sample spreadsheet: a stat's count finishes as its number is spoken, and steps light up as each step is named, with the pops on the same moments.

- [ ] **Step 6: Commit**

```bash
git add src/motion src/render/shots/steps.ts src/render/shots/timeline.ts src/render/shots/stat.ts src/stage/__fixtures__/plan.ts
git commit -m "feat(motion): word-anchored cues shared by 2D and 3D"
```

---

### Task 5: Director skeleton

**Files:**
- Create: `src/stage/director.ts`, `src/stage/camera.ts` (keys only), `src/stage/director.test.ts`

**Interfaces:**
- Consumes: `fixturePlan` (Task 4), `MotionPlan`, `Shot` (`src/motion/plan.ts`), `pieceOrigin`, `HOLD_DISTANCE`, `FOV` (Task 1).
- Produces:
  - `interface DirectOptions { hasImage: (imageId: string) => boolean; reducedMotion?: boolean }`
  - `directVideo(plan: MotionPlan, opts: DirectOptions): StageSet`
  - `defaultCameraKeys(piece: Pick<SetPiece, 'origin' | 'start' | 'end'>, heroAt: Vec3, holdStart: number, holdEnd: number): CameraKey[]`

Pieces group the shots of one scene, except that an `end` shot always starts its own piece, so the camera flies to the end card. In this task every piece gets a generic hero (an icon actor with the scene's `shot.icon`, entering at the first shot's `t0` for 700 ms) and default camera keys: at `holdStart` the camera sits at `origin + heroAt + [0, 0.6, HOLD_DISTANCE]` looking at `origin + heroAt`; at `holdEnd` at `origin + heroAt + [0.6, 0.5, HOLD_DISTANCE * 0.9]`; fov `FOV`; focus the distance to the target. Each piece after the first also starts with a copy of the previous piece's last key, timed at its first shot's `start - transition * TRANSITION_LEAD`, so the flight between pieces happens in the same window as today's camera move and whoosh.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { directVideo } from './director'
import { fixturePlan } from './__fixtures__/plan'
import { pieceOrigin } from './layout'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: () => true })

describe('directVideo', () => {
  it('makes one piece per scene with shots, plus one for the end card', () => {
    const endCard = plan.shots.some((s) => s.kind === 'end') ? 1 : 0
    expect(set.pieces.length).toBe(new Set(plan.shots.map((s) => s.scene)).size + endCard)
  })
  it('covers the whole video with overlapping windows', () => {
    expect(set.pieces[0].start).toBeLessThanOrEqual(0)
    expect(set.pieces.at(-1)!.end).toBeGreaterThanOrEqual(plan.total)
    set.pieces.slice(1).forEach((p, i) => expect(p.start).toBeLessThanOrEqual(set.pieces[i].end))
  })
  it('places pieces with pieceOrigin', () => set.pieces.forEach((p, i) => expect(p.origin).toEqual(pieceOrigin(i))))
  it('gives every piece a hero that enters by its first shot', () =>
    set.pieces.forEach((p) => {
      const hero = p.actors.find((a) => a.id === p.heroId)!
      const first = plan.shots.find((s) => s.scene === p.scene)!
      expect(hero.beats.find((b) => b.action === 'enter')!.t).toBeLessThanOrEqual(first.start)
    }))
  it('keeps camera keys sorted in time', () =>
    set.pieces.forEach((p) => p.camera.slice(1).forEach((k, i) => expect(k.t).toBeGreaterThanOrEqual(p.camera[i].t))))
  it('is deterministic', () => expect(directVideo(plan, { hasImage: () => true })).toEqual(set))
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/director.test.ts`
Expected: FAIL, cannot find module `./director`.

- [ ] **Step 3: Write `defaultCameraKeys` and `directVideo`**

A piece's window runs from its first shot's `t0 - transition` to its last shot's `end + 3000`, clamped to `[0, plan.total]` at the ends of the video.

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/stage/director.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stage/director.ts src/stage/camera.ts src/stage/director.test.ts
git commit -m "feat(stage): director skeleton"
```

---

### Task 6: Set pieces for title, definition, points, stat, compare and image

**Files:**
- Create: `src/stage/pieces/index.ts`, `intro.ts`, `definition.ts`, `points.ts`, `stat.ts`, `compare.ts`, `image.ts`, `src/stage/pieces/pieces-a.test.ts`
- Modify: `src/stage/director.ts` (call `buildPiece` instead of the generic hero)

**Interfaces:**
- Consumes: Tasks 1 to 5; `shortLabel`, `labelFor` (Task 2); `Shot.cues`, `Shot.countEnd` (Task 4); `iconFor` (`src/motion/icons.ts`); `chartHighlightTime`; constants in `src/motion/beats.ts`.
- Produces: `interface PieceContext { plan: MotionPlan; scene: Scene; index: number; shots: Shot[]; words: WordTiming[]; origin: Vec3; hasImage: (id: string) => boolean; heroes: { piece: number; actor: ActorSpec }[] }` and `buildPiece(ctx: PieceContext): SetPiece`.

Entrances land on the sounds the motion plan already schedules (`t0` is the shot's `t0`):

| Piece | Actors | Entrance timing |
|---|---|---|
| Title | hero: photo of the first image scene if `hasImage`, else icon `shot.icon`; title label (size title, at most 8 words) | hero at 0; title at `INTRO_TITLE_START` |
| Definition | hero icon; term label (`shortLabel(term)`, size term); a small label `labelFor(meaning)` when it is not null | hero at `t0`; term at `t0 + 840`; small label at `t0 + 1100` |
| Points | per item: icon `shot.icon` and label `labelFor(item)` (none when null), on an arc, x from -4 to 4; the hero is the first item's icon | item k at that item's shot `t0` |
| Stat, percent | pictogram (`lit` = rounded value, `total` 100); count label; caption label `labelFor(label)` | count beat from `t0 + STAT_COUNT_START` to `shot.countEnd`; pulse at `shot.countEnd - 120` |
| Stat, other | tower (`count` = clamp(round(log10(value)) + 3, 3, 9)); count label; caption label | as above |
| Compare | bars with the two values and labels; a camera key orbits 20 degrees around the bars over the hold | grow at `t0 + COMPARE_POP[k] - 60`; delta label at `t0 + COMPARE_DELTA - 60` |
| Image | photo (`aspect` 16/9, `fallbackIcon` `shot.icon`) if `hasImage(imageId)`, else icon; caption label | `t0`, 700 ms |

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { directVideo } from '../director'
import { fixturePlan } from '../__fixtures__/plan'
import type { ShotKind } from '../../motion/plan'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: (id) => id === 'img1' })
const piece = (kind: ShotKind) => set.pieces.find((p) => p.kind === kind)!

describe('set pieces A', () => {
  it('points: one icon and one label per item, each entering at its shot', () => {
    const p = piece('point')
    const shots = plan.shots.filter((s) => s.scene === p.scene)
    const icons = p.actors.filter((a) => a.data.kind === 'icon')
    expect(icons).toHaveLength(shots.length)
    icons.forEach((a, k) => expect(a.beats.find((b) => b.action === 'enter')!.t).toBe(shots[k].t0))
    expect(p.actors.filter((a) => a.data.kind === 'label').length).toBeLessThanOrEqual(shots.length)
  })
  it('labels stay short everywhere', () =>
    set.pieces.forEach((p) =>
      p.actors.forEach((a) => {
        if (a.data.kind !== 'label') return
        const limit = a.data.size === 'title' ? 8 : 4
        expect(a.data.text.split(/\s+/).length).toBeLessThanOrEqual(limit)
      })))
  it('stat: a percent lights 42 of 100 cells', () =>
    expect(piece('stat').actors.find((a) => a.data.kind === 'pictogram')!.data).toEqual({ kind: 'pictogram', lit: 42, total: 100 }))
  it('image: shows the photo when it exists', () => expect(piece('image').actors.some((a) => a.data.kind === 'photo')).toBe(true))
  it('image: falls back to an icon when the photo is missing', () => {
    const p = directVideo(plan, { hasImage: () => false }).pieces.find((x) => x.kind === 'image')!
    expect(p.actors.some((a) => a.data.kind === 'photo')).toBe(false)
    expect(p.actors.some((a) => a.data.kind === 'icon')).toBe(true)
  })
  it('definition: the term lands with the second pop', () => {
    const p = piece('definition')
    const shot = plan.shots.find((s) => s.scene === p.scene)!
    const term = p.actors.find((a) => a.data.kind === 'label' && a.data.size === 'term')!
    expect(term.beats[0].t).toBe(shot.t0 + 840)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/pieces/pieces-a.test.ts`
Expected: FAIL, cannot find module or assertions fail.

- [ ] **Step 3: Implement the six builders and `buildPiece`**

`buildPiece` dispatches on the first shot's kind; kinds not yet covered keep the generic hero from Task 5. Every piece also gets one `particles` actor (count 60, `flow: 'stream'`, seed `index * 7919`) so something is always alive.

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/stage/pieces/pieces-a.test.ts src/stage/director.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stage/pieces src/stage/director.ts
git commit -m "feat(stage): title, definition, points, stat, compare and image pieces"
```

---

### Task 7: Set pieces for chart, timeline, steps, kinds, summary and end

**Files:**
- Create: `src/stage/pieces/chart.ts`, `timeline.ts`, `steps.ts`, `kinds.ts`, `summary.ts`, `end.ts`, `src/stage/pieces/pieces-b.test.ts`
- Modify: `src/stage/pieces/index.ts`

**Interfaces:**
- Consumes: `PieceContext`, `buildPiece` (Task 6).
- Produces: the six builders, dispatched from `buildPiece`.

For timeline and steps, item j arrives at `a(j) = Math.max(t0 + 350 + j * 300, shot.cues[j] - 150)`, the same formula the sound plan uses after Task 4 (its pop sits at `a(j) + 30`).

| Piece | Actors | Timing |
|---|---|---|
| Chart | `bars` (bar and pie) or `ribbon` (line) with `highlight`; a camera key at the highlight time moves the target toward the highlighted value | grow at `t0 + BAR_START`; highlight beat at `chartHighlightTime(shot, words)` |
| Timeline | a straight `path` receding in z; per event a year label (term), an event label (at most 4 words), an icon; one camera key per plaque so the camera flies along the rail | plaque j enters at `a(j) - 200` |
| Steps | closed `path` ring of radius 4 with a station per item (icon and label); one `token` | token travel beat j: `t = a(j) - 450`, `dur = 450`, `index = j`; station j pulses at `a(j)` |
| Kinds | icons and labels on an arc | kind j enters at `a(j) - 200`, then a focus beat of 1200 ms at `a(j)` |
| Summary | copies of up to 6 earlier heroes (`ctx.heroes`, ids containing `:copy:`) in a ring, the first copy being the hero; one label per closing tag (up to 3) | copy k enters at `t0 + 200 + 120 k`; tag labels at `t0 + 600 + 150 k` |
| End | its own piece: `card` (the hero) with the title, `Sources: ...` and `Made with Explainer Studio`; camera keys orbit slowly | `t0` |

The summary piece adds a camera key that pulls back until every hero copy is inside the frame.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { directVideo } from '../director'
import { fixturePlan } from '../__fixtures__/plan'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: () => true })

describe('set pieces B', () => {
  it('steps: the token reaches each station 30 ms before its pop', () => {
    const p = set.pieces.find((x) => x.kind === 'steps' && x.actors.some((a) => a.data.kind === 'token'))!
    const token = p.actors.find((a) => a.data.kind === 'token')!
    const arrivals = token.beats.filter((b) => b.action === 'travel').map((b) => b.t + b.dur)
    const shot = plan.shots.find((s) => s.scene === p.scene)!
    const pops = plan.sfx.filter((e) => e.kind === 'pop' && e.t >= shot.t0).map((e) => e.t).sort((x, y) => x - y).slice(0, 4)
    expect(arrivals).toHaveLength(4)
    arrivals.forEach((a, j) => expect(a).toBe(pops[j] - 30))
  })
  it('timeline: one plaque per event', () => {
    const p = set.pieces.find((x) => x.kind === 'timeline')!
    expect(p.actors.filter((a) => a.data.kind === 'label' && a.data.size === 'term')).toHaveLength(4)
  })
  it('chart: the highlight beat lands at chartHighlightTime', () => {
    const p = set.pieces.find((x) => x.kind === 'chart')!
    const bars = p.actors.find((a) => a.data.kind === 'bars')!
    expect(bars.beats.some((b) => b.action === 'highlight')).toBe(true)
  })
  it('summary: brings back earlier heroes', () => {
    const p = set.pieces.find((x) => x.kind === 'summary')!
    expect(p.actors.filter((a) => a.id.includes(':copy:')).length).toBeGreaterThanOrEqual(3)
  })
  it('end: a card that names the sources', () => {
    const p = set.pieces.find((x) => x.kind === 'end')!
    expect(p).toBeDefined()
    const card = p.actors.find((a) => a.data.kind === 'card')
    expect(card && card.data.kind === 'card' && card.data.lines.some((l) => l.startsWith('Sources'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/pieces/pieces-b.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the six builders**

- [ ] **Step 4: Run it and see it pass**

Run: `npm test`
Expected: PASS, all stage tests.

- [ ] **Step 5: Commit**

```bash
git add src/stage/pieces
git commit -m "feat(stage): chart, timeline, steps, kinds, summary and end pieces"
```

---

### Task 8: Camera pose

**Files:**
- Modify: `src/stage/camera.ts`
- Create: `src/stage/camera.test.ts`

**Interfaces:**
- Consumes: `StageSet`, `CameraKey`, `CameraPose` (Task 1); `easeState` (Task 3).
- Produces: `cameraPose(set: StageSet, t: number, opts?: { reducedMotion?: boolean }): CameraPose`.

All keys of all pieces form one timeline. Between two keys 1000 ms apart or less, interpolate with `easeState`; further apart, linearly (a slow dolly). When consecutive keys are more than 6 units apart and at most 1200 ms apart, lift the path by `1.2 * sin(pi p)` in y and add a roll of `0.03 * sin(pi p)`; `reducedMotion` turns both off. Before the first key and after the last, hold.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { cameraPose } from './camera'
import { directVideo } from './director'
import { fixturePlan } from './__fixtures__/plan'

const plan = fixturePlan()
const set = directVideo(plan, { hasImage: () => true })
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('cameraPose', () => {
  it('never jumps between 16 ms samples', () => {
    for (let t = 0; t < plan.total; t += 16) expect(dist(cameraPose(set, t).position, cameraPose(set, t + 16).position)).toBeLessThan(1)
  })
  it('keeps the hero inside the frame while its first shot is on screen', () =>
    set.pieces.forEach((p) => {
      const hero = p.actors.find((a) => a.id === p.heroId)!
      const first = plan.shots.find((s) => s.scene === p.scene && (p.kind !== 'end' || s.kind === 'end'))!
      const c = cameraPose(set, (first.start + first.end) / 2)
      const cam = new PerspectiveCamera(c.fov, 16 / 9, 0.1, 500)
      cam.position.set(...c.position)
      cam.lookAt(...c.target)
      cam.updateMatrixWorld()
      const v = new Vector3(p.origin[0] + hero.at[0], p.origin[1] + hero.at[1], p.origin[2] + hero.at[2]).project(cam)
      expect(Math.abs(v.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(v.y)).toBeLessThanOrEqual(1)
    }))
  it('focuses on the target', () => {
    const c = cameraPose(set, plan.total / 2)
    expect(Math.abs(c.focus - dist(c.position, c.target)) / dist(c.position, c.target)).toBeLessThan(0.05)
  })
  it('does not roll with reduced motion', () => {
    for (let t = 0; t < plan.total; t += 250) expect(cameraPose(set, t, { reducedMotion: true }).roll).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/camera.test.ts`
Expected: FAIL, `cameraPose` is not exported.

- [ ] **Step 3: Implement `cameraPose`**

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/stage/camera.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stage/camera.ts src/stage/camera.test.ts
git commit -m "feat(stage): continuous camera pose"
```

---

### Task 9: Active pieces window

**Files:**
- Create: `src/stage/window.ts`, `src/stage/window.test.ts`

**Interfaces:**
- Consumes: `StageSet` (Task 1).
- Produces: `activePieces(set: StageSet, t: number, marginMs?: number): number[]` (default 3000): indices of pieces whose window widened by the margin contains t, always including the piece before the current one during the current piece's first 3000 ms, at most 4, sorted ascending, nearest kept when trimming.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { activePieces } from './window'
import { directVideo } from './director'
import { fixturePlan } from './__fixtures__/plan'

const plan = fixturePlan({ extraPoints: 4 })
const set = directVideo(plan, { hasImage: () => true })

describe('activePieces', () => {
  it('builds at most 4 pieces at any time of a long video', () => {
    expect(set.pieces.length).toBeGreaterThanOrEqual(13)
    for (let t = 0; t <= plan.total; t += 100) expect(activePieces(set, t).length).toBeLessThanOrEqual(4)
  })
  it('always includes the piece on screen', () => {
    for (let t = 0; t <= plan.total; t += 100) {
      const on = set.pieces.findIndex((p) => t >= p.start && t <= p.end)
      expect(activePieces(set, t)).toContain(on)
    }
  })
  it('is sorted', () => {
    const a = activePieces(set, plan.total / 2)
    expect([...a].sort((x, y) => x - y)).toEqual(a)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/window.test.ts`
Expected: FAIL, cannot find module `./window`.

- [ ] **Step 3: Implement `activePieces`**

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/stage/window.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stage/window.ts src/stage/window.test.ts
git commit -m "feat(stage): bounded window of built pieces"
```

---

### Task 10: three.js builders

**Files:**
- Create: `src/stage/three/materials.ts`, `icons3d.ts`, `labelMesh.ts`, `actors.ts`, `src/stage/three/builders.test.ts`

**Interfaces:**
- Consumes: `Theme` (`src/render/theme.ts`), `ImageSource` (`src/render/env.ts`), `fitLabel`, `LABEL_PX`, `LABEL_MAX_WIDTH_PX` (Task 2), `WORLD_PER_PX` (Task 1), `rand` (`src/render/easing.ts`), icons in `src/motion/icons.json` (`{ n, t, b, f }`, paths on a 256 grid).
- Produces:
  - `interface StagePalette { background: string; fog: string; ground: string; object: string; accent: string; ink: string; muted: string; series: string[] }` and `stagePalette(theme: Theme): StagePalette`.
  - `interface IconGeometry { front: THREE.BufferGeometry; back: THREE.BufferGeometry | null }` and `iconGeometry(name: string): IconGeometry`: cached per name; unknown names use `sparkle`; built with `SVGLoader().parse(...)` and `shapePath.toShapes(true)` (`SVGLoader.createShapes` is deprecated in r187); y flipped; centered; scaled so the larger side is 1 unit; front depth 0.16 with a 0.03 bevel; back slab depth 0.04.
  - `labelMesh(text: string, size: LabelSize, palette: StagePalette): THREE.Mesh`: a plane with a `CanvasTexture` drawn at 2x with Geist through `src/render/text.ts`, sized in world units with `WORLD_PER_PX`.
  - `interface BuildDeps { palette: StagePalette; images: Map<string, ImageSource> }`
  - `buildActor(spec: ActorSpec, deps: BuildDeps): THREE.Object3D` and `applyPose(obj: THREE.Object3D, pose: ActorPose): void` (position, rotation, scale, material opacity, emissive glow).

Rules: the pictogram is one `InstancedMesh` of 100 `RoundedBoxGeometry` cells (from `three/addons/geometries/RoundedBoxGeometry.js`), not icons (one extruded icon is about 11,000 vertices). Photos use `crossOrigin` images already in `deps.images`; if the id is missing or `texImage2D` would throw, build the icon object instead and set `userData.fallback = true`. Particles take positions from `rand(seed + i)` once, at build. Each object stores its spec id in `userData.actorId`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { InstancedMesh, Points, Vector3 } from 'three'
import { iconGeometry } from './icons3d'
import { buildActor } from './actors'
import { stagePalette } from './materials'
import { THEMES } from '../../render/theme'

const deps = { palette: stagePalette(THEMES.night), images: new Map() }

describe('three builders', () => {
  it('extrudes an icon into a unit sized solid', () => {
    const g = iconGeometry('drop')
    g.front.computeBoundingBox()
    const s = g.front.boundingBox!.getSize(new Vector3())
    expect(Math.max(s.x, s.y)).toBeCloseTo(1, 1)
    expect(s.z).toBeGreaterThan(0.1)
  })
  it('caches icon geometry', () => expect(iconGeometry('drop')).toBe(iconGeometry('drop')))
  it('falls back to an icon object when the photo is missing', () => {
    const o = buildActor({ id: '6:photo:0', at: [0, 0, 0], scale: 1, data: { kind: 'photo', imageId: 'nope', fallbackIcon: 'drop', aspect: 1.5 }, beats: [] }, deps)
    expect(o.userData.fallback).toBe(true)
  })
  it('builds a 100 cell pictogram', () => {
    const o = buildActor({ id: '3:pic:0', at: [0, 0, 0], scale: 1, data: { kind: 'pictogram', lit: 42, total: 100 }, beats: [] }, deps)
    let count = 0
    o.traverse((c) => { if (c instanceof InstancedMesh) count += c.count })
    expect(count).toBe(100)
  })
  it('places particles identically for the same seed', () => {
    const spec = { id: '0:fx:0', at: [0, 0, 0] as [number, number, number], scale: 1, data: { kind: 'particles' as const, count: 60, seed: 7, flow: 'stream' as const, extent: [8, 4, 4] as [number, number, number] }, beats: [] }
    const pos = (o: ReturnType<typeof buildActor>) => { let p: number[] = []; o.traverse((c) => { if (c instanceof Points) p = Array.from(c.geometry.attributes.position.array) }); return p }
    expect(pos(buildActor(spec, deps))).toEqual(pos(buildActor(spec, deps)))
  })
})
```

If `labelMesh` cannot draw in happy-dom (no canvas 2D), stub `getContext` in this test file only, and cover the real drawing in the Task 11 lab.

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/three/builders.test.ts`
Expected: FAIL, cannot find module `./icons3d`.

- [ ] **Step 3: Implement the four modules**

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run src/stage/three/builders.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/stage/three
git commit -m "feat(stage): three.js actor builders"
```

---

### Task 11: Stage renderer, post effects and the lab page

**Files:**
- Create: `src/stage/three/fx.ts`, `src/stage/three/stage.ts`, `stage-lab.html`, `src/stage/lab.ts`

**Interfaces:**
- Consumes: Tasks 1 to 10.
- Produces:
  - `createStage(opts: { width: number; height: number; quality: 'preview' | 'export'; reducedMotion?: boolean }): Stage | null` (null when WebGL2 is unavailable or creation throws).
  - `interface Stage { render(set: StageSet, t: number, deps: BuildDeps): HTMLCanvasElement | null; resize(width: number, height: number): void; dispose(): void; readonly lost: boolean; readonly info: { pieces: number; geometries: number; textures: number }; loseContextForTest(): void; restoreContextForTest(): void }`
  - `interface Fx { setFocus(distance: number): void; render(): void; setSize(width: number, height: number): void; dispose(): void }` and `createFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: 'preview' | 'export'): Fx`.

`render` builds groups for `activePieces(set, t)` at their origins, disposes groups no longer active (geometries, materials, textures; cached icon geometry stays), applies `actorPose` to every actor, applies `cameraPose`, and renders. Lighting: `RoomEnvironment` through PMREM, one shadow casting directional key light (shadow map 1024 preview, 2048 export), a ground `ShadowMaterial` with `polygonOffset`, fog in the palette's `fog` colour. Post effects with postprocessing: depth of field at the pose's focus, bloom (intensity 0.35, luminance threshold 0.85), vignette (darkness 0.35), noise (opacity 0.04), ACES filmic tone mapping as the last effect. Clamp every `pow()` base in custom shaders (one NaN pixel blacks out bloom) and write `1.0 - smoothstep(b, a, x)` instead of `smoothstep` with reversed edges. Listen for `webglcontextlost` and `webglcontextrestored`; `render` returns null while lost.

The lab page builds `fixturePlan()`, its `StageSet` and a 1280x720 stage, draws into a visible canvas, and exposes:

```ts
window.__lab = {
  render(t: number): void,
  report(): { nonBackground: number; meanLuma: number; pieces: number; geometries: number; textures: number },
  hashAt(t: number): string, // FNV-1a of a 64x36 downscale of frame t
  scrub(from: number, to: number, step: number): { maxPieces: number; geometriesAtEnd: number; geometriesAtStart: number },
  bench(frames: number): { msPerFrame: number },
  loseContext(): void,
  restoreContext(): void,
  // Builds the plan through the app's own pipeline (Local AI and voice off), or the fixture.
  load(source: 'fixture' | { example: string } | { file: string }): Promise<void>,
  // Checks for the acceptance set: label limits, camera continuity, entrance skew against
  // shot cues and sound, frames with nothing moving, and preview against export tier hashes.
  accept(): { labelsOk: boolean; cameraJumps: number; maxCueSkewMs: number; stillFrames: number; hashMatch: boolean },
}
```

`{ file }` names a file in `docs/superpowers/fixtures/`, which the lab fetches through the dev server.

- [ ] **Step 1: Write the lab first**

Write `stage-lab.html` (loads `/src/stage/lab.ts`) and `src/stage/lab.ts` against the interfaces above, so each check below fails until the stage exists.

- [ ] **Step 2: Run the lab and see it fail**

Run: `npm run dev`, open `http://localhost:5173/stage-lab.html`.
Expected: an error in the console that `createStage` is missing.

- [ ] **Step 3: Implement `createFx` and `createStage`**

- [ ] **Step 4: Verify in the browser console**

```js
__lab.render(2500); __lab.report()
// nonBackground between 0.08 and 0.85, meanLuma above 0.02
const a = __lab.hashAt(12000); __lab.render(40000); const b = __lab.hashAt(12000); a === b
// true: direct seek matches after a jump
for (let t = 11000; t < 12000; t += 33) __lab.render(t); __lab.hashAt(12000) === a
// true: sequential playback matches
__lab.scrub(0, 90000, 250)
// maxPieces at most 4; geometriesAtEnd at most geometriesAtStart + 50
__lab.bench(120)
// msPerFrame at most 33
```

Look at frames at 2.5 s, 12 s, 30 s and the last second: objects lit and shadowed, labels crisp and at least 34 px tall, nothing clipped by the captions area.

- [ ] **Step 5: Commit**

```bash
git add src/stage/three/fx.ts src/stage/three/stage.ts stage-lab.html src/stage/lab.ts
git commit -m "feat(stage): stage renderer, post effects and lab page"
```

---

### Task 12: Wire the stage into preview, export and settings

**Files:**
- Create: `src/stage/support.ts`, `src/stage/support.test.ts`, `src/stage/handle.ts`
- Modify: `src/render/renderFrame.ts`, `src/export/exportVideo.ts`, `src/ui/settingsStore.ts`, `src/ui/Settings.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: `createStage` (Task 11), `directVideo` (Task 5), `cameraPose` (Task 8).
- Produces:
  - `supportsWebGL2(): boolean` (cached; `?visuals=2d` in the URL forces false, for testing) and `renderMode(setting: boolean, supported: boolean): '3d' | '2d'`.
  - `interface StageHandle { draw(ctx: CanvasRenderingContext2D, plan: MotionPlan, t: number, opts: RenderOptions, samples?: number): boolean; dispose(): void; readonly lost: boolean }` and `createStageHandle(quality: 'preview' | 'export', size: { width: number; height: number }, opts?: { reducedMotion?: boolean }): Promise<StageHandle | null>`. It loads the three.js modules with a dynamic `import()`, caches one `StageSet` per plan in a `WeakMap`, answers `hasImage` from `opts.images`, and with `samples > 1` averages that many sub frames over the 14 ms shutter.
  - `RenderOptions` gains `stage?: StageHandle | null`. When `stage.draw(...)` returns true, `renderFrame` skips the 2D world and still draws the chapter pill, captions and fade.
  - `SettingsState.visuals3d: boolean`, default true; the gear shows a "3D visuals" toggle with Phosphor's `Cube` icon, disabled with "Not supported in this browser" when unsupported.

Export: when the preview uses 3D, `exportVideo` creates its own handle at 1920x1080 with quality `export` and disposes it at the end. Sub frames: `samples = clamp(ceil(cameraSpeed * 14 / 0.15), 1, 6)` where `cameraSpeed` is the distance in world units the camera moves per ms between `t - 14` and `t`. If the context is lost, wait up to 2000 ms for a restore; otherwise finish the remaining frames with the 2D renderer and report "Saved with 2D visuals because the graphics context was lost." through the existing export status.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { renderMode } from './support'

describe('renderMode', () => {
  it('uses 3D only when wanted and supported', () => {
    expect(renderMode(true, true)).toBe('3d')
    expect(renderMode(true, false)).toBe('2d')
    expect(renderMode(false, true)).toBe('2d')
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/support.test.ts`
Expected: FAIL, cannot find module `./support`.

- [ ] **Step 3: Implement support, the handle, the renderFrame branch, export, settings and App wiring**

App creates the preview handle lazily after the first storyboard exists, passes it in `renderOptions`, disposes it when the setting turns off, and passes `reducedMotion` from `matchMedia('(prefers-reduced-motion: reduce)')`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

With `npm run dev` and Local AI off:
1. Click "Black holes". The video shows lit 3D objects and labels, flying between pieces. Screenshots at 3 s, 10 s, 25 s.
2. Turn "3D visuals" off: the 2D video returns at the same time position. Turn it on: 3D returns.
3. Open `http://localhost:5173/?visuals=2d`: the toggle is disabled with the note, and the 2D video plays.
4. Export without a download, by calling `exportVideo` from the page as in the existing manual check: `ext` is `mp4`, the duration equals the plan's, and the time is at most 1.5x the video's length.
5. During an export, call `loseContextForTest()` on the export stage: the export finishes and the status shows the 2D note.

- [ ] **Step 6: Commit**

```bash
git add src/stage/support.ts src/stage/support.test.ts src/stage/handle.ts src/render/renderFrame.ts src/export/exportVideo.ts src/ui/settingsStore.ts src/ui/Settings.tsx src/App.tsx
git commit -m "feat(stage): 3D visuals in preview and export with 2D fallback"
```

---

### Task 13: Device tiers and the watchdog

**Files:**
- Create: `src/stage/tiers.ts`, `src/stage/tiers.test.ts`
- Modify: `src/ui/settingsStore.ts` (`visuals3d: boolean | null`, null meaning automatic, the default), `src/ui/Settings.tsx`, `src/stage/handle.ts`, `src/App.tsx`, `src/tts/tts.ts`

**Interfaces:**
- Consumes: `createStageHandle` (Task 12).
- Produces:
  - `type Tier = 'high' | 'medium'` and `deviceProfile(env: { coarsePointer: boolean; screenWidth: number; deviceMemory?: number; cores: number }): { default3d: boolean; tier: Tier }`: phones and tablets (coarse pointer or width under 900) get `default3d: false` and medium; desktops with `deviceMemory` of 4 or less, or fewer than 8 cores, get medium; others high. A missing `deviceMemory` counts as 8.
  - `createWatchdog(opts?: { budgetMs?: number; windowMs?: number }): { sample(frameMs: number, now: number): 'ok' | 'step-down' }` (defaults 50 and 3000): `step-down` when the median of the frames in the last window exceeds the budget and the window is full; it then starts a new window.
  - `createStageHandle(quality, size, opts)` gains `opts.tier`: medium previews at 960x540 without depth of field; export uses every effect on high and medium effects otherwise.
  - `releaseVoiceWorkers(): void` in `src/tts/tts.ts`: terminates the worker pool; the next synthesis starts a new one.

App: the effective 3D choice is `visuals3d ?? deviceProfile(...).default3d`. On `step-down`, high becomes medium (a new handle); medium becomes 2D with the note "Switched to 2D visuals to keep playback smooth." When every clip exists and `navigator.deviceMemory` is 4 or less, call `releaseVoiceWorkers()`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { createWatchdog, deviceProfile } from './tiers'

describe('deviceProfile', () => {
  it('phones default to 2D', () => expect(deviceProfile({ coarsePointer: true, screenWidth: 390, cores: 6 }).default3d).toBe(false))
  it('a big desktop gets the high tier', () =>
    expect(deviceProfile({ coarsePointer: false, screenWidth: 1440, deviceMemory: 16, cores: 12 })).toEqual({ default3d: true, tier: 'high' }))
  it('a small laptop gets the medium tier', () =>
    expect(deviceProfile({ coarsePointer: false, screenWidth: 1280, deviceMemory: 4, cores: 4 })).toEqual({ default3d: true, tier: 'medium' }))
})

describe('createWatchdog', () => {
  it('steps down after 3 s of slow frames', () => {
    const w = createWatchdog()
    let r = 'ok'
    for (let t = 0; t <= 3000; t += 60) r = w.sample(70, t)
    expect(r).toBe('step-down')
  })
  it('ignores one slow frame', () => {
    const w = createWatchdog()
    const results = []
    for (let t = 0; t <= 3000; t += 33) results.push(w.sample(t === 990 ? 400 : 20, t))
    expect(results.every((r) => r === 'ok')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run src/stage/tiers.test.ts`
Expected: FAIL, cannot find module `./tiers`.

- [ ] **Step 3: Implement `tiers.ts`, the tier option, the setting, the App wiring and `releaseVoiceWorkers`**

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify in the browser**

1. In Chrome device mode at 390x844 with touch emulation, reload: the video plays in 2D and the 3D toggle is off. Turning it on gives a 960x540 3D preview.
2. On a desktop window with CPU throttled 6x in DevTools, play a topic video: within a few seconds it drops to medium, then to 2D with the note.

- [ ] **Step 6: Commit**

```bash
git add src/stage/tiers.ts src/stage/tiers.test.ts src/ui/settingsStore.ts src/ui/Settings.tsx src/stage/handle.ts src/App.tsx src/tts/tts.ts
git commit -m "feat(stage): device tiers and frame time watchdog"
```

---

### Task 14: Acceptance, budgets, docs and deploy

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the acceptance set**

For each landing example (`?example=vaccines`, `black-holes`, `sky`, `bakery`) and each file in `docs/superpowers/fixtures/`, load it in the lab and run `__lab.accept()`.
Expected for every one: `labelsOk` true, `cameraJumps` 0, `maxCueSkewMs` at most 150, `stillFrames` 0, `hashMatch` true. Save frames at 25%, 50% and 75% of each video for Sheng to review.

- [ ] **Step 2: Check the bundle budget**

Run: `npm run build`
Expected: the chunk holding three.js, postprocessing and `src/stage` is at most 250 KB gzip and is not loaded by `index.html`; the main `index-*.js` chunk is at most 234.7 KB gzip (229.7 KB before this work, plus 5).

- [ ] **Step 3: Check the speed budgets**

Expected: the lab `bench(120)` reports at most 33 ms per frame (Task 11), and the export check in Task 12 runs at no worse than 1.5x real time. Record both numbers in the README.

- [ ] **Step 4: Update the README**

Add the 3D stage to "How the video is made" (director, stage, set pieces, post effects, fallback) and "3D visuals" to the settings list.

- [ ] **Step 5: Deploy and check the static site**

Run: `node scripts/deploy-to-site.mjs && cd ~/cool-website && npm run check`
Expected: `check` exits 0. Serve `out/` with `python3 -m http.server 8765 --bind 127.0.0.1`, open `http://127.0.0.1:8765/explainer/`, generate a topic video and an upload video: both render in 3D; with `?visuals=2d` the 2D video plays.

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: 3D stage"
```
