import { describe, expect, it } from 'vitest'

import { readEventFromQuery, writeEventToQuery } from '@/lib/url-state'

describe('url-state', () => {
  it('reads event id from query', () => {
    expect(readEventFromQuery('?event=poland_events.5')).toBe('poland_events.5')
  })

  it('writes event id into query', () => {
    expect(writeEventToQuery('', 'poland_events.5')).toBe('?event=poland_events.5')
  })

  it('preserves unrelated query keys', () => {
    expect(writeEventToQuery('?foo=bar', 'poland_events.5')).toBe('?foo=bar&event=poland_events.5')
  })
})
