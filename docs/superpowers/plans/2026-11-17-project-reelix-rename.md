# Project Reelix Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Explainer Studio to Project Reelix in the app and the portfolio site, and publish the code as the public repo `shengdynasty/project-reelix`.

**Architecture:** String and path edits only; no behaviour changes. The app had no git before this plan, so the
pre-change state is the workspace snapshot `pre-rename` (snap.sh); Task 3 creates the repo and makes its one commit.

**Tech Stack:** Vite + React + TypeScript (vitest, oxlint); Next.js site in ~/cool-website; gh CLI.

**Spec:** `docs/superpowers/specs/2026-11-17-project-reelix-rename-design.md`

## Global Constraints

- Display name: `Project Reelix`; end card line: `Made with Project Reelix`; path `/reelix/`; site slug `reelix`; package name `project-reelix`; repo `shengdynasty/project-reelix`, public.
- Keep storage keys `explainer-settings` and `explainer-tts`; keep generic "explainer" wording (aria labels, prompts); old docs and the ledger keep the old name.
- Commits only as shengdynasty <149344545+shengdynasty@users.noreply.github.com>, no Co-Authored-By or Claude attribution; exactly one commit and one push (Task 3).
- ~/cool-website: keep Sheng's uncommitted changes; make no commits there.

## Review Focus

1. The built page served at `/reelix/` must load its assets: dist/index.html references `/reelix/assets/`, never `/explainer/` (Task 1 Step 5).
2. A returning visitor keeps saved settings and cached voice: both storage keys unchanged (Task 1 Step 5 grep).
3. No site link points at a missing page: `out/` has no `/explainer/` or `project/explainer-studio` reference (Task 2 Step 3).
4. The public repo holds no secrets, build output, dependencies or `.superpowers/` (Task 3 Step 2 listing).
5. The end card still fits: the existing extent tests in pieces-b.test.ts pass with the new line (Task 1 Step 4).

---

### Task 1: Rename the app

**Files:**
- Modify: `src/stage/pieces/end.ts:16`, `src/render/shots/end.ts:39`, `src/ui/Header.tsx:17`, `src/App.tsx:34`, `index.html:8,10,13`, `vite.config.ts:6-9`, `scripts/deploy-to-site.mjs`, `scripts/cached-fetch.ts:17`, `package.json:2`, `package-lock.json` (both root `name` fields), `README.md`
- Test: `src/stage/pieces/pieces-b.test.ts:391-409`, `src/stage/three/builders.test.ts:185`

- [ ] **Step 0: Snapshot** — `bash .superpowers/sdd/2026-11-16-3d-stage-phase-1/snap.sh pre-rename`. Expected: `snapshot pre-rename <- ...`.
- [ ] **Step 1: Write the failing test** — replace `'Made with Explainer Studio'` with `'Made with Project Reelix'` in both test files.
- [ ] **Step 2: Run it** — `npx vitest run src/stage/pieces/pieces-b.test.ts`. Expected: FAIL in the cardLines tests (received `Made with Explainer Studio`).
- [ ] **Step 3: Implement**
  - `MADE_WITH` in stage end.ts and the 2D end card text: `Made with Project Reelix`.
  - Header text, `<title>`: `Project Reelix`; og:title `Project Reelix by Sheng Yan`; og:url `https://sheng-yan.com/reelix/`.
  - vite base `/reelix/` (comment too); deploy script: dest `public/reelix`, `MARKER = '.reelix-build'`, marker text `Built from project-reelix`, comments and log name `/reelix/`.
  - UA `ReelixDev/0.2 (local planner tests)`; App.tsx slug fallback `'reelix'`; package and lock name `project-reelix`.
  - README: title `# Project Reelix`; `Live demo: coming soon.`; deploy section `/reelix/` and `public/reelix/`.
- [ ] **Step 4: Run the gates** — `npx tsc -b && npx oxlint src && npm test`. Expected: tsc clean, oxlint 0 warnings 0 errors, 15 files 194 passed.
- [ ] **Step 5: Build and grep** — `npm run build`; then `grep -o '/reelix/assets/[^"]*' dist/index.html | head -2` (non-empty) and `grep -c explainer dist/index.html` (0); `grep -rnI --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.superpowers --exclude-dir=docs -iE "explainer[ -]?studio|/explainer/" .` (no output); `grep -n "'explainer-settings'\|'explainer-tts'" src/ui/settingsStore.ts src/tts/cache.ts` (2 lines).

### Task 2: Rename on the site (~/cool-website)

**Files:**
- Modify: `src/content/projects.ts` (the `explainer-studio` entry), `src/content/seo.ts:61-70`, `eslint.config.mjs:15-16`
- Rename: `public/images/projects/explainer-studio.webp` -> `reelix.webp`
- Delete: `public/explainer/` (untracked; check `.explainer-build` exists inside first)

- [ ] **Step 1: Edit** — entry: `"id": "reelix"`, `"title": "Project Reelix"`, first paragraph starts `Project Reelix is for understanding`, `"github": "https://github.com/shengdynasty/project-reelix"`, no `live` key, cover `/images/projects/reelix.webp`. seo.ts: key `project/reelix` with title `Project Reelix — Understand Any Topic Visually | Sheng Yan`; remove the `explainer` route and its comment. eslint: remove the two `public/explainer` lines. Rename the image; delete `public/explainer/`.
- [ ] **Step 2: Grep** — `grep -rnI -iE "explainer[ -]?studio|public/explainer|sheng-yan.com/explainer" src eslint.config.mjs` (no output); `git status --short` shows the same three modified files plus `public/images/projects/reelix.webp`.
- [ ] **Step 3: Check** — `npm run check` exit 0; `ls out/project/reelix` exists; `grep -rl "project/explainer-studio\|/explainer/" out --include=*.html --include=*.xml --include=*.txt` (no output).

### Task 3: Create the repo and push

**Files:**
- Modify: `.gitignore` (add `.superpowers`)

- [ ] **Step 1: Init** — add `.superpowers` to .gitignore; `git init -b main`; `git add -A`.
- [ ] **Step 2: Inspect** — `git status --short | wc -l` and `git ls-files | grep -E "node_modules|^dist/|\.superpowers|\.env|\.local$"` (no output); `git ls-files -z | xargs -0 du -k | sort -rn | head -5` (nothing over 1 MB without a reason); `git config user.name` = shengdynasty.
- [ ] **Step 3: Commit** — `git commit -m "Project Reelix: narrated 3D explainer videos made in the browser"` (no trailers); `git log --format='%an <%ae>%n%B' -1` shows shengdynasty and the one-line message only.
- [ ] **Step 4: Publish** — `gh repo create shengdynasty/project-reelix --public --source . --remote origin --push --description "Ask about any topic or upload notes, slides, a PDF or a spreadsheet, and watch a narrated 3D explanation made in your browser."`; then `gh repo view shengdynasty/project-reelix --json visibility,defaultBranchRef` shows PUBLIC and main, and `git status -sb` shows `main...origin/main`.
