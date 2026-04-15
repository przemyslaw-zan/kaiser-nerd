const EVENT_QUERY_KEY = 'event'

export function readEventFromQuery(search: string): string | null {
  const params = new URLSearchParams(search)
  const value = params.get(EVENT_QUERY_KEY)
  return value?.trim() ? value : null
}

export function writeEventToQuery(search: string, eventId: string): string {
  const params = new URLSearchParams(search)
  params.set(EVENT_QUERY_KEY, eventId)
  const query = params.toString()
  return query ? `?${query}` : ''
}
