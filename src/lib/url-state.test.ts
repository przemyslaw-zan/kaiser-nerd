import { describe, expect, it } from 'vitest'

import { readEventFromQuery, readSelectionFromQuery, writeEventToQuery, writeSelectionToQuery } from '@/lib/url-state'

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

  it('reads focus selection when both keys are present', () => {
    expect(readSelectionFromQuery('?event=poland_events.5&focus=POL_emergency')).toEqual({
      kind: 'focus',
      id: 'POL_emergency',
    })
  })

  it('writes focus selection and clears event key', () => {
    expect(writeSelectionToQuery('?foo=bar&event=poland_events.5', { kind: 'focus', id: 'POL_emergency' })).toBe(
      '?foo=bar&focus=POL_emergency',
    )
  })
})
