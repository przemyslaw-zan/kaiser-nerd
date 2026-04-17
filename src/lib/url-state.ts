const EVENT_QUERY_KEY = 'event'
const FOCUS_QUERY_KEY = 'focus'
const DECISION_QUERY_KEY = 'decision'
const IDEA_QUERY_KEY = 'idea'

export interface DocSelectionFromQuery {
  kind: 'event' | 'focus' | 'decision' | 'idea'
  id: string
}

export function readEventFromQuery(search: string): string | null {
  const params = new URLSearchParams(search)
  const value = params.get(EVENT_QUERY_KEY)
  return value?.trim() ? value : null
}

export function readSelectionFromQuery(search: string): DocSelectionFromQuery | null {
  const params = new URLSearchParams(search)

  const ideaValue = params.get(IDEA_QUERY_KEY)
  if (ideaValue?.trim()) {
    return {
      kind: 'idea',
      id: ideaValue,
    }
  }

  const decisionValue = params.get(DECISION_QUERY_KEY)
  if (decisionValue?.trim()) {
    return {
      kind: 'decision',
      id: decisionValue,
    }
  }

  const focusValue = params.get(FOCUS_QUERY_KEY)
  if (focusValue?.trim()) {
    return {
      kind: 'focus',
      id: focusValue,
    }
  }

  const eventValue = params.get(EVENT_QUERY_KEY)
  if (eventValue?.trim()) {
    return {
      kind: 'event',
      id: eventValue,
    }
  }

  return null
}

export function writeEventToQuery(search: string, eventId: string): string {
  const params = new URLSearchParams(search)
  params.set(EVENT_QUERY_KEY, eventId)
  params.delete(IDEA_QUERY_KEY)
  params.delete(FOCUS_QUERY_KEY)
  params.delete(DECISION_QUERY_KEY)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function writeSelectionToQuery(search: string, selection: DocSelectionFromQuery): string {
  const params = new URLSearchParams(search)

  if (selection.kind === 'idea') {
    params.set(IDEA_QUERY_KEY, selection.id)
    params.delete(DECISION_QUERY_KEY)
    params.delete(FOCUS_QUERY_KEY)
    params.delete(EVENT_QUERY_KEY)
  } else if (selection.kind === 'decision') {
    params.set(DECISION_QUERY_KEY, selection.id)
    params.delete(IDEA_QUERY_KEY)
    params.delete(FOCUS_QUERY_KEY)
    params.delete(EVENT_QUERY_KEY)
  } else if (selection.kind === 'focus') {
    params.set(FOCUS_QUERY_KEY, selection.id)
    params.delete(IDEA_QUERY_KEY)
    params.delete(DECISION_QUERY_KEY)
    params.delete(EVENT_QUERY_KEY)
  } else {
    params.set(EVENT_QUERY_KEY, selection.id)
    params.delete(IDEA_QUERY_KEY)
    params.delete(DECISION_QUERY_KEY)
    params.delete(FOCUS_QUERY_KEY)
  }

  const query = params.toString()
  return query ? `?${query}` : ''
}
