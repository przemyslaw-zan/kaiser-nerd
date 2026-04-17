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

  it('reads decision selection when all keys are present', () => {
    expect(readSelectionFromQuery('?event=poland_events.5&focus=POL_emergency&decision=ENG_war_cabinet')).toEqual({
      kind: 'decision',
      id: 'ENG_war_cabinet',
    })
  })

  it('reads idea selection when all keys are present', () => {
    expect(
      readSelectionFromQuery('?event=poland_events.5&focus=POL_emergency&decision=ENG_war_cabinet&idea=BUK_reform'),
    ).toEqual({
      kind: 'idea',
      id: 'BUK_reform',
    })
  })

  it('writes focus selection and clears event key', () => {
    expect(writeSelectionToQuery('?foo=bar&event=poland_events.5', { kind: 'focus', id: 'POL_emergency' })).toBe(
      '?foo=bar&focus=POL_emergency',
    )
  })

  it('writes decision selection and clears event/focus keys', () => {
    expect(
      writeSelectionToQuery('?foo=bar&event=poland_events.5&focus=POL_emergency', {
        kind: 'decision',
        id: 'ENG_war_cabinet',
      }),
    ).toBe('?foo=bar&decision=ENG_war_cabinet')
  })

  it('writes idea selection and clears event/focus/decision keys', () => {
    expect(
      writeSelectionToQuery('?foo=bar&event=poland_events.5&focus=POL_emergency&decision=ENG_war_cabinet', {
        kind: 'idea',
        id: 'BUK_reform',
      }),
    ).toBe('?foo=bar&idea=BUK_reform')
  })
})
