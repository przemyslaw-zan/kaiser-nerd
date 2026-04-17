# Architecture

The project has two layers:

1. Data pipeline (Node + TypeScript) in scripts/src
- Reads Kaiserreich files from KAISERREICH_PATH in .env.
- Parses events and localization.
- Extracts event/focus/decision/idea/scripted-effect references.
- Writes deterministic split artifacts to public/data/ (index plus per-domain detail files).
- Enforces artifact size budgets before CI deploys or contributors push oversized data.

2. Static SPA (React + Vite) in src
- Loads committed split artifacts from public/data and reconstructs the in-memory model.
- Supports fuzzy lookup by human-readable event names and ids.
- Uses query parameter state (?event=...) for deep links.

Data is never parsed in-browser. The app always reflects committed artifact content.

Artifact budget policy:
- Warning at 50MB.
- Hard fail at 90MB.
- If growth continues, reduce schema size first and split the artifact second.
