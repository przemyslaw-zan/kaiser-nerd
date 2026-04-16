import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { loadArtifact } from '@/lib/data'
import { stripHoiFormatting } from '@/lib/text'
import { readEventFromQuery, writeEventToQuery } from '@/lib/url-state'
import type { DataArtifact, EventDoc } from '@/types/artifact'

const PAGE_SIZE = 200

type SearchWorkerRequest =
  | {
      type: 'init'
      events: EventDoc[]
    }
  | {
      type: 'search'
      query: string
      requestId: number
    }

type SearchWorkerResponse =
  | {
      type: 'ready'
    }
  | {
      type: 'result'
      requestId: number
      eventIds: string[] | null
    }

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
  const [inputValue, setInputValue] = useState('')
  const [query, setQuery] = useState('')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [filteredEventIds, setFilteredEventIds] = useState<string[] | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const workerReadyRef = useRef(false)
  const latestRequestIdRef = useRef(0)
  const latestQueryRef = useRef('')

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        setQuery(inputValue)
      })
    }, 120)

    return () => clearTimeout(timer)
  }, [inputValue])

  useEffect(() => {
    loadArtifact()
      .then((data) => {
        setArtifact(data)
        setFilteredEventIds(null)
        setIsSearching(false)
        const fromUrl = readEventFromQuery(window.location.search)
        const first = data.events.at(0)?.id ?? null
        setSelectedEventId(fromUrl ?? first)
      })
      .catch((loadError: unknown) => {
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
      })
  }, [])

  const deferredQuery = useDeferredValue(query)

  const eventById = useMemo(() => {
    if (!artifact) {
      return new Map<string, EventDoc>()
    }

    return new Map<string, EventDoc>(artifact.events.map((event) => [event.id, event]))
  }, [artifact])

  const allEventIds = useMemo(() => {
    if (!artifact) {
      return []
    }

    return artifact.events.map((event) => event.id)
  }, [artifact])

  useEffect(() => {
    if (!artifact) {
      return
    }

    const worker = new Worker(new URL('./workers/event-search.worker.ts', import.meta.url), {
      type: 'module',
    })

    workerRef.current = worker
    workerReadyRef.current = false
    latestRequestIdRef.current = 0

    worker.onmessage = (message: MessageEvent<SearchWorkerResponse>) => {
      if (message.data.type === 'ready') {
        workerReadyRef.current = true

        const requestId = latestRequestIdRef.current + 1
        latestRequestIdRef.current = requestId
        const initialSearchMessage: SearchWorkerRequest = {
          type: 'search',
          query: latestQueryRef.current,
          requestId,
        }
        worker.postMessage(initialSearchMessage)
        return
      }

      if (message.data.requestId !== latestRequestIdRef.current) {
        return
      }

      setFilteredEventIds(message.data.eventIds)
      setIsSearching(false)
    }

    const initMessage: SearchWorkerRequest = {
      type: 'init',
      events: artifact.events,
    }
    worker.postMessage(initMessage)

    return () => {
      workerRef.current = null
      worker.terminate()
    }
  }, [artifact])

  useEffect(() => {
    latestQueryRef.current = deferredQuery

    if (!workerReadyRef.current || !workerRef.current) {
      return
    }

    const requestId = latestRequestIdRef.current + 1
    latestRequestIdRef.current = requestId

    const searchMessage: SearchWorkerRequest = {
      type: 'search',
      query: deferredQuery,
      requestId,
    }
    workerRef.current.postMessage(searchMessage)
  }, [deferredQuery])

  const filteredIds = useMemo(() => {
    return filteredEventIds ?? allEventIds
  }, [allEventIds, filteredEventIds])

  const visibleEventIds = useMemo(() => {
    return filteredIds.slice(0, visibleCount)
  }, [filteredIds, visibleCount])

  const visibleEvents = useMemo(() => {
    return visibleEventIds.map((eventId) => eventById.get(eventId)).filter((event): event is EventDoc => event !== undefined)
  }, [eventById, visibleEventIds])

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) {
      return null
    }

    return eventById.get(selectedEventId) ?? null
  }, [eventById, selectedEventId])

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
          value={inputValue}
          onChange={(event) => {
            setIsSearching(true)
            setFilteredEventIds([])
            setInputValue(event.target.value)
            setVisibleCount(PAGE_SIZE)
          }}
          placeholder="Type event title or id"
          autoComplete="off"
        />

        <p className="meta">
          Showing {String(visibleEvents.length)} of {String(filteredIds.length)} matches
          {isSearching ? ' (searching...)' : ''}
        </p>

        <ul className="event-list" data-testid="event-list">
          {isSearching ? <li className="meta">Searching…</li> : null}
          {!isSearching && visibleEvents.length === 0 ? <li className="meta">No matching events.</li> : null}
          {!isSearching
            ? visibleEvents.map((event) => (
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
              ))
            : null}
        </ul>

        {filteredIds.length > visibleEvents.length ? (
          <button
            type="button"
            className="event-link"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Load more events
          </button>
        ) : null}
      </aside>

      <section className="panel panel-right">
        {selectedEvent ? <EventSummary event={selectedEvent} /> : <p>Select an event from the list.</p>}
      </section>
    </main>
  )
}

export default App
