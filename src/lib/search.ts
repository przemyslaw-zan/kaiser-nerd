import Fuse from 'fuse.js'

import type { EventDoc } from '@/types/artifact'

interface SearchRow {
  event: EventDoc
  searchableTitle: string
  searchableDescription: string
  optionNames: string
}

export function createEventSearch(events: EventDoc[]): Fuse<SearchRow> {
  const rows: SearchRow[] = events.map((event) => ({
    event,
    searchableTitle: event.title ?? '',
    searchableDescription: event.description ?? '',
    optionNames: event.options.map((option) => option.name ?? '').join(' '),
  }))

  return new Fuse(rows, {
    keys: ['event.id', 'searchableTitle', 'searchableDescription', 'optionNames'],
    threshold: 0.32,
    includeScore: true,
    ignoreLocation: true,
  })
}

export function searchEvents(events: EventDoc[], query: string): EventDoc[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return events
  }

  const fuse = createEventSearch(events)
  return fuse.search(trimmed).map((row) => row.item.event)
}
