import { describe, expect, it } from 'vitest'

import { searchEvents } from '@/lib/search'
import type { EventDoc } from '@/types/artifact'

const events: EventDoc[] = [
  {
    id: 'poland_events.5',
    namespace: 'poland_events',
    sourceFile: 'events/pol.txt',
    title: 'The Emergency Session',
    description: 'A political crisis in Warsaw',
    immediateEffects: [],
    options: [],
    references: [],
    incomingEventIds: [],
  },
  {
    id: 'germany_events.9',
    namespace: 'germany_events',
    sourceFile: 'events/ger.txt',
    title: 'Berlin Conference',
    description: 'Diplomatic talks continue',
    immediateEffects: [],
    options: [],
    references: [],
    incomingEventIds: [],
  },
]

describe('searchEvents', () => {
  it('returns all events on empty query', () => {
    expect(searchEvents(events, '')).toHaveLength(2)
  })

  it('finds event by fuzzy title match', () => {
    const result = searchEvents(events, 'emerjency sesson')
    expect(result.at(0)?.id).toBe('poland_events.5')
  })

  it('finds event by id', () => {
    const result = searchEvents(events, 'germany_events.9')
    expect(result.at(0)?.id).toBe('germany_events.9')
  })
})
