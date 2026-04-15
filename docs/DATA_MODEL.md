# Data Model

Artifact file: public/data/events-index.json

Top-level fields:
- version: schema version.
- generatedAt: ISO timestamp.
- sourcePath: source directory used for generation.
- stats: events/localizationEntries/references counters.
- events: list of parsed events.

Event fields:
- id, namespace, sourceFile.
- titleKey/descKey and resolved title/description.
- immediateEffects: command key summary.
- options: option-level localized names, effects, references.
- references: outgoing links to events/focuses/decisions/scripted effects.
- incomingEventIds: reverse event links.
