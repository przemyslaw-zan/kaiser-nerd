# Kaiser Nerd

Static GitHub Pages app that browses Kaiserreich Hearts of Iron IV event data in a docs-style interface.

The app reads committed artifact data only. Parsing from the local game/mod directory happens via manual scripts.

## Stack

- pnpm + Node + TypeScript
- Vite + React
- Vitest for unit tests
- Playwright for browser tests
- ESLint strict type-aware rules

## Environment

Create .env in the repository root with:

KAISERREICH_PATH="<your Steam path>\\steamapps\\workshop\\content\\394360\\1521695605"

Replace `<your Steam path>` with your local Steam library location (e.g. `C:\Program Files (x86)\Steam`).

- `394360` — Steam app ID for Hearts of Iron IV
- `1521695605` — Steam Workshop mod ID for Kaiserreich

The path must point to the Kaiserreich mod root containing events and localisation directories.

## Scripts

- pnpm dev: run local app
- pnpm build: compile and build static app
- pnpm preview: preview production build
- pnpm type-check: TypeScript project references check
- pnpm lint: strict ESLint checks
- pnpm test: unit tests
- pnpm test:e2e: Playwright tests
- pnpm data:build: parse source data and regenerate public/data/events-index.json
- pnpm data:check: fail if committed artifact is stale
- pnpm ci: local quality gate (type-check + lint + unit + build)

## Data Flow

1. Run pnpm data:build.
2. Commit updated public/data/events-index.json.
3. App renders the committed artifact from current revision.

## URL Behavior

Selected event is encoded in query params:

/?event=poland_events.5

This supports shareable links and browser history navigation.

## Project Notes

- Parser implementation lives in scripts/src.
- SPA implementation lives in src.
- Additional docs are in docs.
- CI and deployment workflow is in .github/workflows/deploy.yml.
