# Data Model

Artifact files:
- public/data/events-index.json
- public/data/event-details.json
- public/data/focus-details.json
- public/data/decision-details.json

Budget policy:
- Warning at 50MB.
- Hard fail at 90MB.
- The artifact is split by domain so each file stays under budget and avoids single-file overflow.

Top-level fields:
- version: schema version.
- generatedAt: ISO timestamp.
- stats: events/localizationEntries/references counters.
- events: list of event summary records (id/title metadata).

Detail files contain bulk payloads:
- event-details.json: descriptions, immediate effects, option effect trees, references, incoming links.
- focus-details.json: descriptions, prerequisites, completion effects/trees, references.
- decision-details.json: descriptions, properties, effects/trees, references.

Event fields:
- id, namespace, sourceFile.
- titleKey/descKey and resolved title/description.
- immediateEffects: command key summary.
- options: option-level localized names, effects, references.
- references: outgoing links to events/focuses/decisions/scripted effects.
- incomingEventIds: reverse event links.
