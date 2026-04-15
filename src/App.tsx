import { useEffect, useMemo, useState } from 'react'

import { loadArtifact } from '@/lib/data'
import { searchEvents } from '@/lib/search'
import { stripHoiFormatting } from '@/lib/text'
import { readEventFromQuery, writeEventToQuery } from '@/lib/url-state'
import type { DataArtifact, EventDoc } from '@/types/artifact'

function EventSummary({ event }: { event: EventDoc }) {
  const groupedReferences = useMemo(() => {
    const buckets = new Map<string, string[]>()
    for (const reference of event.references) {
      const key = reference.type
      const current = buckets.get(key) ?? []
      const withDelay =
        reference.type === 'event' && reference.delayDays !== undefined
          ? `${reference.targetId} (days=${String(reference.delayDays)})`
          : reference.targetId
      current.push(withDelay)
      buckets.set(key, current)
    }

    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [event])

  return (
    <article className="event-detail" data-testid="event-detail">
      <header>
        <p className="eyebrow">{event.id}</p>
        <h2>{event.title ?? event.id}</h2>
        <p>{event.description ? stripHoiFormatting(event.description) : 'No localized description found.'}</p>
      </header>

      <section>
        <h3>Immediate Effects</h3>
        <ul>
          {event.immediateEffects.length > 0 ? (
            event.immediateEffects.map((effect) => <li key={effect}>{effect}</li>)
          ) : (
            <li>None parsed.</li>
          )}
        </ul>
      </section>

      <section>
        <h3>Options</h3>
        {event.options.length > 0 ? (
          event.options.map((option) => (
            <div key={`${event.id}-${option.index}`} className="option-card">
              <h4>{option.name ?? option.nameKey ?? `Option ${String(option.index + 1)}`}</h4>
              <p className="meta">Effects: {option.effects.join(', ') || 'None parsed.'}</p>
            </div>
          ))
        ) : (
          <p>No options parsed.</p>
        )}
      </section>

      <section>
        <h3>Connected Content</h3>
        {groupedReferences.length > 0 ? (
          groupedReferences.map(([type, targets]) => (
            <div key={type} className="reference-group">
              <h4>{type}</h4>
              <ul>
                {targets.map((target) => (
                  <li key={`${type}-${target}`}>{target}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p>No connected content found.</p>
        )}
        <h4>Incoming Events</h4>
        <ul>
          {event.incomingEventIds.length > 0 ? (
            event.incomingEventIds.map((id) => <li key={id}>{id}</li>)
          ) : (
            <li>No incoming event links found.</li>
          )}
        </ul>
      </section>
    </article>
  )
}

function App() {
  const [artifact, setArtifact] = useState<DataArtifact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  useEffect(() => {
    loadArtifact()
      .then((data) => {
        setArtifact(data)
        const fromUrl = readEventFromQuery(window.location.search)
        const first = data.events.at(0)?.id ?? null
        setSelectedEventId(fromUrl ?? first)
      })
      .catch((loadError: unknown) => {
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
      })
  }, [])

  const filteredEvents = useMemo(() => {
    if (!artifact) {
      return []
    }

    return searchEvents(artifact.events, query)
  }, [artifact, query])

  const selectedEvent = useMemo(() => {
    if (!artifact || !selectedEventId) {
      return null
    }

    return artifact.events.find((event) => event.id === selectedEventId) ?? null
  }, [artifact, selectedEventId])

  const onSelectEvent = (eventId: string): void => {
    setSelectedEventId(eventId)
    const nextQuery = writeEventToQuery(window.location.search, eventId)
    window.history.pushState(null, '', `${window.location.pathname}${nextQuery}`)
  }

  if (error) {
    return <main className="error-state">Failed to load data: {error}</main>
  }

  if (!artifact) {
    return <main className="loading-state">Loading Kaiserreich data…</main>
  }

  return (
    <main className="layout">
      <aside className="panel panel-left">
        <header>
          <p className="eyebrow">Kaiser Nerd</p>
          <h1>Event Browser</h1>
          <p className="meta">{artifact.stats.events} events indexed</p>
        </header>
        <label htmlFor="event-search" className="search-label">
          Search events
        </label>
        <input
          id="event-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type event title or id"
          autoComplete="off"
        />

        <ul className="event-list" data-testid="event-list">
          {filteredEvents.map((event) => (
            <li key={event.id}>
              <button
                type="button"
                className={event.id === selectedEvent?.id ? 'event-link active' : 'event-link'}
                onClick={() => onSelectEvent(event.id)}
              >
                <strong>{event.title ?? event.id}</strong>
                <span>{event.id}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="panel panel-right">
        {selectedEvent ? <EventSummary event={selectedEvent} /> : <p>Select an event from the list.</p>}
      </section>
    </main>
  )
}

export default App
