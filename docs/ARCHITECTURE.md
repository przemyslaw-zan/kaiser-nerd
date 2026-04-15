# Architecture

The project has two layers:

1. Data pipeline (Node + TypeScript) in scripts/src
- Reads Kaiserreich files from KAISERREICH_PATH in .env.
- Parses events and localization.
- Extracts event/focus/decision/scripted-effect references.
- Writes deterministic artifact to public/data/events-index.json.

2. Static SPA (React + Vite) in src
- Loads committed artifact from public/data/events-index.json.
- Supports fuzzy lookup by human-readable event names and ids.
- Uses query parameter state (?event=...) for deep links.

Data is never parsed in-browser. The app always reflects committed artifact content.
