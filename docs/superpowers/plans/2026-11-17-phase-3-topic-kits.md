# Phase 3: Topic Kits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Common topic families get custom 3D heroes instead of icons (space, earth science, biology, optics, immune
system, molecules, places), and narration verbs make heroes act (spin, orbit, rise, erupt...), so the landing
examples (vaccines, black holes, why the sky is blue) show topic specific scenes.

**Architecture:** A pure kit registry (`src/stage/kits/`) scores each kit against a scene (`match(context) -> score`)
and returns a `model` actor spec for the best match above a threshold; single-hero pieces (intro, definition,
generic, image without a photo) use it instead of the icon. Models are procedural three.js builders behind a new
actor kind `{ kind: 'model'; model: ModelName; accent: boolean }` (no downloads), each with the icon as its fallback
size (scale 2 box) so every framing and extent rule still holds. A verb lexicon adds beats to a model hero at the
moment its verb is spoken. Molecules (PubChem 3D SDF) and places (globe texture + Wikidata coordinates) are network
kits and come last.

**Spec:** `docs/superpowers/specs/2026-11-16-3d-explainer-design.md` (Topic kits, Constraints)

## Global Constraints

- Kit interface: `match(context) -> score`, `build(scene) -> actor`; best match above KIT_THRESHOLD (0.5), else the
  generic treatment (icon).
- Models fit the hero box of the icon they replace (about 2 x 2 x 2 at HERO_SCALE), so framing and extent tests hold.
- Deterministic: models and their motion are functions of t and the seed; no Math.random in build or render.
- Theme tokens for colour (palette accent, series, muted); Geist labels unchanged; no new text.
- The engine chunk budget (spec: the 3D chunk adds at most 250 KB gzip) holds; initial JS unchanged.
- Network kits (molecule, globe) only with the Wikipedia setting on, only short phrases, keyless CORS sources from
  the spec (PubChem PUG REST, jsDelivr), cached, and they fall back to the icon on any failure.

## Review Focus

1. A topic that matches two kits ("the Sun's light scatters in the air"): one kit wins deterministically (score,
   then registry order); never two heroes (Task 1 test).
2. A word that is a kit keyword in another sense ("cell phone", "light meal", "star player"): the match needs the
   scene and topic together, so it stays generic (Task 1 tests).
3. Reduced motion: verb motions (spin, orbit, erupt) are damped like flights (Task 4 test).
4. Very long videos: models share geometry and are disposed with their piece (Task 2 info test: geometries bounded
   after scrubbing).
5. Molecule or globe fetch failing or slow: the icon stays, within the photo time budget (Task 5 tests).

---

### Task 1: Kit registry and matching (pure)

**Files:** Create `src/stage/kits/index.ts`, `src/stage/kits/kits.test.ts`

**Interfaces:** Produces `type ModelName = 'black-hole' | 'planet' | 'star' | 'galaxy' | 'volcano' | 'water-cycle' |
'strata' | 'cell' | 'dna' | 'virus' | 'antibody' | 'prism' | 'scatter'`, `interface KitContext { topicWords: string[];
sentence: string; term?: string }`, `kitModel(ctx: KitContext): ModelName | null`. Each kit lists keywords per model
with weights; score = topic hits * 0.6 + sentence/term hits * 0.4 (capped 1); ambiguous words need a second hit.

- [ ] Tests: "black hole" topic -> 'black-hole'; vaccines/antibody sentences -> 'virus'/'antibody'; "why is the sky
  blue" + scattering sentence -> 'scatter'; prism sentence -> 'prism'; photosynthesis/chloroplast -> 'cell';
  volcano -> 'volcano'; "cell phone battery" -> null; "a light lunch" -> null; tie -> registry order.
- [ ] RED, implement, GREEN; gates; commit "Kits: registry and matching".

### Task 2: Model actors and the single-hero pieces

**Files:** Modify `src/stage/types.ts` (actor kind `model`), `src/stage/pieces/kit.ts` (`heroFor(ctx, icon, at, t)`:
scene photo, else kit model, else icon), `intro.ts`, `definition.ts`, `image.ts`, `kit.ts` genericPiece;
`src/stage/three/models.ts` (builders, shared geometry cache like icons3d), `src/stage/three/actors.ts` (dispatch),
tests in `pieces-a.test.ts`, `builders.test.ts`.

- [ ] Tests: a definition scene about black holes gets a `model` hero 'black-hole'; with a photo, the photo wins;
  each model builds inside a 2.2 x 2.2 x 2.2 box at scale 1 and is non-empty; disposing a piece keeps shared model
  geometry; extent tests pass with model heroes.
- [ ] RED, implement the thirteen builders (spheres, tori, cones, tubes, instanced particles; emissive accent where
  the model glows), GREEN; gates; build; engine chunk within budget; commit "Kits: model heroes".

### Task 3: Model motion

**Files:** `src/stage/three/models.ts` (each model's idle motion from t: disk rotation, orbiting planet, rising
magma particles, drifting rain, helix turn, light rays pulsing), `src/stage/pose.ts` if a pose input is needed,
tests in `builders.test.ts`.

- [ ] Tests: a model's pose at t is the same reached in sequence or directly (hash of child transforms); motion
  amplitude is damped under reduced motion.
- [ ] RED, implement, GREEN; commit "Kits: model motion".

### Task 4: Narration verbs

**Files:** Create `src/stage/kits/verbs.ts` (+ test); modify the pieces using `heroFor` to add verb beats.

**Interfaces:** `verbBeats(words: WordTiming[], from: number, to: number): Beat[]` — rise/lift -> 'grow' up,
fall/sink -> 'grow' down, spin/rotate/orbit -> 'spin', grow/expand/swell -> 'grow', shrink -> 'grow' (negative),
glow/heat/burn/shine -> 'focus', erupt/explode/split -> 'pulse'; at the spoken word, 600 ms, at most 3 per piece.

- [ ] Tests: "the disk spins as gas falls in" gives a spin then a fall beat at those words; verbs outside the
  piece's span are ignored; at most 3.
- [ ] RED, implement, GREEN; commit "Kits: narration verbs".

### Task 5: Network kits: molecules and places

**Files:** Create `src/stage/kits/molecule.ts` (PubChem `compound/name/<name>/SDF?record_type=3d` -> atoms and bonds,
parse + test), `src/stage/kits/globe.ts` (Blue Marble texture from jsDelivr, country outline points from
`world-atlas`, Wikidata coordinates for a named place); App attaches molecule and place data like photos (lazy, same
time budget); models 'molecule' and 'globe' with data in the actor.

- [ ] Tests: SDF parse (atom count, bond list) on a recorded water/glucose SDF; a failed fetch gives no data and the
  icon stays; globe pin position from lat/lon.
- [ ] RED, implement, GREEN; commit "Kits: molecules and places".

### Task 6: Acceptance, docs, review

- [ ] Browser: vaccines (virus/antibody), black holes (black hole), sky (scatter or prism) show model heroes; frames
  by eye; lab accept() still passes (labels, no jumps, cue skew, still frames, hash match); bench within budget.
- [ ] README: topic kits bullet. Final review (Opus) of the phase; one fix pass; ledger.
