# Project Reelix Roadmap (rest of the project)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline on Opus. Each phase below has its
> own plan file; a phase plan is written just before it runs, from the code as it then stands.

**Goal:** Finish everything the design (`docs/superpowers/specs/2026-11-16-3d-explainer-design.md`) describes after
phase 1: the open phase 1 polish, phase 2 (real pictures) and phase 3 (topic kits), and get the demo hosted.

**Spec:** `docs/superpowers/specs/2026-11-16-3d-explainer-design.md` (phases 2 and 3 sections are binding).

## Order and why

| # | Work | Plan | Why this order |
|---|------|------|----------------|
| 0 | Phase 1 polish: reduced motion shortens flights; a camera nudge on every shot change inside a piece so its whoosh has motion | this file (Tasks P0.1, P0.2) | small, closes known gaps in shipped work |
| 1 | Demo on GitHub Pages | blocked: Sheng enables Pages (Source: GitHub Actions); then push and add the live link to cool-website | needs Sheng |
| 2 | Phase 2, real pictures | `2026-11-17-phase-2-real-pictures.md` | spec order; biggest visible gain per token |
| 3 | Phase 3, topic kits | `phase-3-topic-kits.md`, written after phase 2 | largest; reuses phase 2's photo plumbing for textures |

## Execution rules

- Inline execution (cheapest per token); one Opus whole-phase review at the end of phases 2 and 3, one fix pass each.
- TDD per task; gates per task: `npx tsc -b`, `npx oxlint src`, `npm test`; `npm run build` and the size budget per phase.
- One local commit per task as shengdynasty, no attribution; pushes wait until Pages is enabled (a push runs the deploy).
- Stop when the session nears 80% of its cap (Sheng); the ledger
  `.superpowers/sdd/2026-11-16-3d-stage-phase-1/progress.md` is the resume point (one ledger for the project).
- Rulings instead of questions (Sheng: do not ask); every ruling goes in the ledger.

## Rulings on the spec's open questions

- Photo searches never send text from uploaded files: they use the Wikipedia article title the app already looked up
  and key phrases of scenes whose sentences come from that article; photos are sourced only when the Wikipedia
  setting allows lookups and a Wikipedia article was used.
- Phase order stays 3D, photos, kits.
- Initial JS budget for phase 2: 236.2 KB gzip (+1.5 KB over phase 1's 234.7) for the credit line, the settings toggle
  and the credits list; everything else of phase 2 loads lazily.

## Phase 1 polish tasks

### Task P0.1: Reduced motion shortens flights

**Files:** `src/stage/camera.ts` (cameraPose), `src/stage/camera.test.ts`

- [ ] Test `shortens a flight to its second half under reduced motion`: for a flight segment a->b (isFlight), with
  `reducedMotion`, the pose equals key a for p <= 0.5 and reaches b at p = 1; without reducedMotion unchanged.
- [ ] Implement: under reducedMotion a flight runs over the last half of its window (p' = max(0, 2p - 1)), eased
  with easeState; no lift, no roll (as now).

### Task P0.2: Camera nudge on shot changes inside a piece

**Files:** `src/stage/camera.ts` (defaultCameraKeys and the pieces' own keys via a shared helper), pieces using
custom keys (`kinds.ts`, `compare.ts`, `steps.ts`, `summary.ts`, `timeline.ts`, `chart.ts` as found), tests in
`src/stage/three/stage.test.ts` and `src/stage/pieces/pieces-b.test.ts`.

- [ ] Test (stage.test cueSkew): whooshes are measured against short camera moves (segments of at most ARC_MAX_MS
  that move the camera); the fixture reads <= 150; a whoosh in the middle of a hold with no shot change reads > 150.
- [ ] Implement `nudgeKeys(keys, shots)` in camera.ts, applied by the director to every piece's keys: for each shot
  after a piece's first, a key at its flightStart on the original path and a key at its flightEnd pulled back
  NUDGE (0.3 units) along the view axis, rejoining the original path at the next key. Pulling back only widens the
  frame, so every extent test still passes.
