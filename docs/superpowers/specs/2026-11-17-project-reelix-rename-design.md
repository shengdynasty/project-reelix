# Project Reelix rename: short design (approved 2026-11-17)

## Intent
Sheng renamed Explainer Studio to Project Reelix. The app gets the new name everywhere a person sees it, and the
code gets its own public GitHub repo instead of living only as a build copied into the portfolio site. Hosting the
demo comes later, as separate work.

## Goals
- The name "Project Reelix" in the page title and og:title, the header, both end cards ("Made with Project Reelix")
  and their tests, and the README.
- Path `/reelix/` in the Vite base, og:url and the deploy script (`public/reelix`, marker `.reelix-build`).
- Package name `project-reelix`; dev User-Agent `ReelixDev`; download-name fallback `reelix`.
- A public repo `shengdynasty/project-reelix` with the renamed code, pushed once the rename passes its checks
  (one commit as shengdynasty, no Claude attribution).
- Site (`~/cool-website`, edits inside Sheng's uncommitted changes): project id `reelix`, title and first
  paragraph renamed, `github` points at the new repo, no `live` link until a demo exists, cover renamed to
  `reelix.webp`, SEO key `project/reelix` with a "Project Reelix" title.

## Non-goals
- No copy of the build in the site for now: the untracked `public/explainer/` is deleted, `public/reelix/` is not
  created, and the site's `explainer` sitemap route and `public/explainer/**` eslint ignore are removed.
- The site copy still describes the 2D canvas engine; updating it for the 3D stage is separate.
- The folder rename (~/explainer-video to ~/project-reelix) and the memory file come last, after the final review.

## Anti-goals
- Renaming the storage keys `explainer-settings` and `explainer-tts` (it would drop saved settings and cached voice).
- Rewriting history: old docs, plans and the ledger keep the old name.
- Pushing `.superpowers/` (30 MB of snapshots, review packages and frames).

## Approaches
- **Chosen: rename the user-facing name and URL, keep internal storage keys.**
- Rename everything including storage keys: rejected, it wipes every visitor's saved state.
- Keep `/explainer/` with a redirect stub: rejected, the old folder was never committed so the URL was never live.

## Builder's calls
- `.gitignore` gains `.superpowers`; `docs/` is included in the repo.
- README: the live demo line says the demo is coming; the deploy section names `/reelix/`.
- The demo step may change the base path (for example to `/project-reelix/` on GitHub Pages); that is decided then.
- `src/content/projects.ts` says it is generated, but the Reelix entry is already a hand edit in the uncommitted
  changes, so it is edited by hand.

## Checks
Snapshot `pre-rename` first; then `tsc -b`, oxlint, `npm test`, `npm run build`, and a grep that finds no
"Explainer Studio" outside docs and the ledger; then `npm run check` in ~/cool-website.
