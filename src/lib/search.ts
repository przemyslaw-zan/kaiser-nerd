import Fuse from 'fuse.js'

import type { EventDoc } from '@/types/artifact'

interface SearchRow {
  event: EventDoc
  title: string
}

export function createEventSearch(events: EventDoc[]): Fuse<SearchRow> {
  const rows: SearchRow[] = events.map((event) => ({
    event,
    title: event.title ?? '',
  }))

  return new Fuse(rows, {
    keys: ['event.id', 'title'],
    threshold: 0.32,
    includeScore: true,
    ignoreLocation: true,
  })
}

export function searchEventsWithIndex(search: Fuse<SearchRow>, events: EventDoc[], query: string): EventDoc[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return events
  }

  return search.search(trimmed).map((row) => row.item.event)
}

export function searchEvents(events: EventDoc[], query: string): EventDoc[] {
  const fuse = createEventSearch(events)
  return searchEventsWithIndex(fuse, events, query)
}
