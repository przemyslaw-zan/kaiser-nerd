import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'

import { loadArtifact } from '@/lib/data'
import { stripHoiFormatting } from '@/lib/text'
import { readSelectionFromQuery, writeSelectionToQuery } from '@/lib/url-state'
import type { DataArtifact, DecisionDoc, EventDoc, EventEffectNode, EventReference, FocusDoc } from '@/types/artifact'

const PAGE_SIZE = 200

type DocKind = 'event' | 'focus' | 'decision'

interface SearchEntry {
  key: string
  title?: string
}

type SearchWorkerRequest =
  | {
      type: 'init'
      entries: SearchEntry[]
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
      docKeys: string[] | null
    }

interface BrowseEventItem {
  kind: 'event'
  key: string
  id: string
  title: string
  description?: string
  doc: EventDoc
}

interface BrowseFocusItem {
  kind: 'focus'
  key: string
  id: string
  title: string
  description?: string
  doc: FocusDoc
}

interface BrowseDecisionItem {
  kind: 'decision'
  key: string
  id: string
  title: string
  description?: string
  doc: DecisionDoc
}

type BrowseItem = BrowseEventItem | BrowseFocusItem | BrowseDecisionItem

function makeDocKey(kind: DocKind, id: string): string {
  return `${kind}:${id}`
}

function parseDocKey(key: string): { kind: DocKind; id: string } | null {
  if (key.startsWith('event:')) {
    return { kind: 'event', id: key.slice('event:'.length) }
  }

  if (key.startsWith('focus:')) {
    return { kind: 'focus', id: key.slice('focus:'.length) }
  }

  if (key.startsWith('decision:')) {
    return { kind: 'decision', id: key.slice('decision:'.length) }
  }

  return null
}

function OptionEffectTree({ nodes }: { nodes: EventEffectNode[] }) {
  return (
    <ul className="effect-list">
      {nodes.map((node, index) => (
        <li key={`${node.key}-${node.value ?? ''}-${String(index)}`}>
          <span className="effect-key">{node.key}</span>
          {node.value ? <span className="effect-values"> = {node.value}</span> : null}
          {node.children && node.children.length > 0 ? <OptionEffectTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  )
}

function DocSelectionLink({
  kind,
  id,
  label,
  onSelectDoc,
}: {
  kind: DocKind
  id: string
  label: string
  onSelectDoc: (docKey: string) => void
}) {
  const href = `${window.location.pathname}${writeSelectionToQuery(window.location.search, { kind, id })}`

  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onSelectDoc(makeDocKey(kind, id))
      }}
    >
      {label}
    </a>
  )
}

function EventSummary({
  event,
  onSelectDoc,
  getDocTitle,
}: {
  event: EventDoc
  onSelectDoc: (docKey: string) => void
  getDocTitle: (kind: DocKind, id: string) => string
}) {
  const groupedReferences = useMemo(() => {
    const buckets = new Map<string, EventReference[]>()
    for (const reference of event.references) {
      const key = reference.type
      const current = buckets.get(key) ?? []
      current.push(reference)
      buckets.set(key, current)
    }

    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [event])

  return (
    <article className="event-detail" data-testid="event-detail">
      <header>
        <p className="eyebrow">Event</p>
        <h2>{event.title ?? event.id}</h2>
        <p>{event.description ? stripHoiFormatting(event.description) : 'No localized description found.'}</p>
      </header>

      <section>
        <h3>Immediate Effects</h3>
        {event.immediateEffectTree && event.immediateEffectTree.length > 0 ? (
          <OptionEffectTree nodes={event.immediateEffectTree} />
        ) : (
          <ul>
            {event.immediateEffects.length > 0 ? (
              event.immediateEffects.map((effect) => <li key={effect}>{effect}</li>)
            ) : (
              <li>None parsed.</li>
            )}
          </ul>
        )}
      </section>

      <section>
        <h3>Options</h3>
        {event.options.length > 0 ? (
          event.options.map((option) => (
            <div key={`${event.id}-${option.index}`} className="option-card">
              <h4>{option.name ?? option.nameKey ?? `Option ${String(option.index + 1)}`}</h4>
              {option.effectTree && option.effectTree.length > 0 ? (
                <OptionEffectTree nodes={option.effectTree} />
              ) : option.effects.length > 0 ? (
                <ul className="effect-list">
                  {option.effects.map((effect) => (
                    <li key={`${event.id}-${option.index}-${effect}`}>
                      <span className="effect-key">{effect}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="meta">No effects parsed.</p>
              )}
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
                {targets.map((target, index) => (
                  <li key={`${type}-${target.targetId}-${String(index)}`}>
                    {target.type === 'event' || target.type === 'focus' || target.type === 'decision' ? (
                      <>
                        <DocSelectionLink
                          kind={target.type}
                          id={target.targetId}
                          label={getDocTitle(target.type, target.targetId)}
                          onSelectDoc={onSelectDoc}
                        />
                        {target.type === 'event' && target.delayDays !== undefined ? (
                          <span className="meta"> (days={String(target.delayDays)})</span>
                        ) : null}
                      </>
                    ) : (
                      <span>{target.targetId}</span>
                    )}
                  </li>
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
            event.incomingEventIds.map((id) => (
              <li key={id}>
                <DocSelectionLink kind="event" id={id} label={getDocTitle('event', id)} onSelectDoc={onSelectDoc} />
              </li>
            ))
          ) : (
            <li>No incoming event links found.</li>
          )}
        </ul>
      </section>
    </article>
  )
}

function FocusSummary({
  focus,
  onSelectDoc,
  getDocTitle,
}: {
  focus: FocusDoc
  onSelectDoc: (docKey: string) => void
  getDocTitle: (kind: DocKind, id: string) => string
}) {
  const prerequisiteGroups = useMemo(() => {
    if (focus.prerequisiteFocusGroups && focus.prerequisiteFocusGroups.length > 0) {
      return focus.prerequisiteFocusGroups
    }

    if (focus.prerequisiteFocusIds.length > 0) {
      return focus.prerequisiteFocusIds.map((id) => [id])
    }

    return []
  }, [focus.prerequisiteFocusGroups, focus.prerequisiteFocusIds])

  const groupedReferences = useMemo(() => {
    const buckets = new Map<string, EventReference[]>()
    for (const reference of focus.references) {
      const key = reference.type
      const current = buckets.get(key) ?? []
      current.push(reference)
      buckets.set(key, current)
    }

    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [focus])

  return (
    <article className="event-detail">
      <header>
        <p className="eyebrow">Focus</p>
        <h2>{focus.title ?? focus.id}</h2>
        <p>{focus.description ? stripHoiFormatting(focus.description) : 'No localized description found.'}</p>
      </header>

      <section>
        <h3>Completion Reward Effects</h3>
        {focus.completionEffectTree && focus.completionEffectTree.length > 0 ? (
          <OptionEffectTree nodes={focus.completionEffectTree} />
        ) : focus.completionEffects.length > 0 ? (
          <ul className="effect-list">
            {focus.completionEffects.map((effect) => (
              <li key={`${focus.id}-${effect}`}>
                <span className="effect-key">{effect}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>None parsed.</p>
        )}
      </section>

      <section>
        <h3>Prerequisites</h3>
        {prerequisiteGroups.length > 0 ? (
          <ol>
            {prerequisiteGroups.map((group, index) => (
              <li key={`${focus.id}-prereq-group-${String(index)}`}>
                {group.length > 1 ? (
                  <span>
                    (
                    {group.map((id, groupIndex) => (
                      <span key={`${focus.id}-prereq-${String(index)}-${id}`}>
                        {groupIndex > 0 ? ' OR ' : ''}
                        <DocSelectionLink kind="focus" id={id} label={getDocTitle('focus', id)} onSelectDoc={onSelectDoc} />
                      </span>
                    ))}
                    )
                  </span>
                ) : (
                  <DocSelectionLink kind="focus" id={group[0]} label={getDocTitle('focus', group[0])} onSelectDoc={onSelectDoc} />
                )}
                {index < prerequisiteGroups.length - 1 ? <span className="meta"> AND</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p>No prerequisite focus links found.</p>
        )}
      </section>

      <section>
        <h3>Connected Content</h3>
        {groupedReferences.length > 0 ? (
          groupedReferences.map(([type, targets]) => (
            <div key={type} className="reference-group">
              <h4>{type}</h4>
              <ul>
                {targets.map((target, index) => (
                  <li key={`${type}-${target.targetId}-${String(index)}`}>
                    {target.type === 'event' || target.type === 'focus' || target.type === 'decision' ? (
                      <>
                        <DocSelectionLink
                          kind={target.type}
                          id={target.targetId}
                          label={getDocTitle(target.type, target.targetId)}
                          onSelectDoc={onSelectDoc}
                        />
                        {target.type === 'event' && target.delayDays !== undefined ? (
                          <span className="meta"> (days={String(target.delayDays)})</span>
                        ) : null}
                      </>
                    ) : (
                      <span>{target.targetId}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p>No connected content found.</p>
        )}
      </section>
    </article>
  )
}

function DecisionSummary({
  decision,
  onSelectDoc,
  getDocTitle,
}: {
  decision: DecisionDoc
  onSelectDoc: (docKey: string) => void
  getDocTitle: (kind: DocKind, id: string) => string
}) {
  const groupedReferences = useMemo(() => {
    const buckets = new Map<string, EventReference[]>()
    for (const reference of decision.references) {
      const key = reference.type
      const current = buckets.get(key) ?? []
      current.push(reference)
      buckets.set(key, current)
    }

    return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [decision])

  return (
    <article className="event-detail">
      <header>
        <p className="eyebrow">Decision</p>
        <h2>{decision.title ?? decision.id}</h2>
        <p>{decision.description ? stripHoiFormatting(decision.description) : 'No localized description found.'}</p>
      </header>

      {decision.properties && Object.keys(decision.properties).length > 0 ? (
        <section>
          <h3>Properties</h3>
          <ul className="effect-list">
            {Object.entries(decision.properties).map(([key, value]) => (
              <li key={key}>
                <span className="effect-key">{key}</span>
                <span className="meta"> = {value}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3>Effects</h3>
        {decision.effectTree && decision.effectTree.length > 0 ? (
          <OptionEffectTree nodes={decision.effectTree} />
        ) : decision.effects.length > 0 ? (
          <ul className="effect-list">
            {decision.effects.map((effect) => (
              <li key={`${decision.id}-${effect}`}>
                <span className="effect-key">{effect}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>None parsed.</p>
        )}
      </section>

      <section>
        <h3>Connected Content</h3>
        {groupedReferences.length > 0 ? (
          groupedReferences.map(([type, targets]) => (
            <div key={type} className="reference-group">
              <h4>{type}</h4>
              <ul>
                {targets.map((target, index) => (
                  <li key={`${type}-${target.targetId}-${String(index)}`}>
                    {target.type === 'event' || target.type === 'focus' || target.type === 'decision' ? (
                      <>
                        <DocSelectionLink
                          kind={target.type}
                          id={target.targetId}
                          label={getDocTitle(target.type, target.targetId)}
                          onSelectDoc={onSelectDoc}
                        />
                        {target.type === 'event' && target.delayDays !== undefined ? (
                          <span className="meta"> (days={String(target.delayDays)})</span>
                        ) : null}
                      </>
                    ) : (
                      <span>{target.targetId}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p>No connected content found.</p>
        )}
      </section>
    </article>
  )
}

function App() {
  const [artifact, setArtifact] = useState<DataArtifact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [query, setQuery] = useState('')
  const [selectedDocKey, setSelectedDocKey] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [filteredDocKeys, setFilteredDocKeys] = useState<string[] | null>(null)
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
        setFilteredDocKeys(null)
        setIsSearching(false)

        const fromUrl = readSelectionFromQuery(window.location.search)
        if (fromUrl) {
          const urlKey = makeDocKey(fromUrl.kind, fromUrl.id)
          const hasUrlKey =
            (fromUrl.kind === 'event' && data.events.some((event) => event.id === fromUrl.id)) ||
            (fromUrl.kind === 'focus' && data.focuses.some((focus) => focus.id === fromUrl.id)) ||
            (fromUrl.kind === 'decision' && data.decisions.some((decision) => decision.id === fromUrl.id))
          if (hasUrlKey) {
            setSelectedDocKey(urlKey)
            return
          }
        }

        const firstEvent = data.events.at(0)
        const firstFocus = data.focuses.at(0)
        const firstDecision = data.decisions.at(0)
        const fallbackKey = firstEvent
          ? makeDocKey('event', firstEvent.id)
          : firstFocus
            ? makeDocKey('focus', firstFocus.id)
            : firstDecision
              ? makeDocKey('decision', firstDecision.id)
            : null
        setSelectedDocKey(fallbackKey)
      })
      .catch((loadError: unknown) => {
        const message = loadError instanceof Error ? loadError.message : String(loadError)
        setError(message)
      })
  }, [])

  useEffect(() => {
    if (!artifact) {
      return
    }

    const syncSelectionFromUrl = (): void => {
      const fromUrl = readSelectionFromQuery(window.location.search)
      if (fromUrl) {
        const urlKey = makeDocKey(fromUrl.kind, fromUrl.id)
        const hasUrlKey =
          (fromUrl.kind === 'event' && artifact.events.some((event) => event.id === fromUrl.id)) ||
          (fromUrl.kind === 'focus' && artifact.focuses.some((focus) => focus.id === fromUrl.id)) ||
          (fromUrl.kind === 'decision' && artifact.decisions.some((decision) => decision.id === fromUrl.id))
        if (hasUrlKey) {
          setSelectedDocKey(urlKey)
          return
        }
      }

      const firstEvent = artifact.events.at(0)
      const firstFocus = artifact.focuses.at(0)
      const firstDecision = artifact.decisions.at(0)
      const fallbackKey = firstEvent
        ? makeDocKey('event', firstEvent.id)
        : firstFocus
          ? makeDocKey('focus', firstFocus.id)
          : firstDecision
            ? makeDocKey('decision', firstDecision.id)
          : null
      setSelectedDocKey(fallbackKey)
    }

    const onPopState = (): void => {
      syncSelectionFromUrl()
    }

    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [artifact])

  const deferredQuery = useDeferredValue(query)

  const docByKey = useMemo(() => {
    if (!artifact) {
      return new Map<string, BrowseItem>()
    }

    const rows: BrowseItem[] = [
      ...artifact.events.map(
        (event): BrowseEventItem => ({
          kind: 'event',
          key: makeDocKey('event', event.id),
          id: event.id,
          title: event.title ?? event.id,
          description: event.description,
          doc: event,
        }),
      ),
      ...artifact.focuses.map(
        (focus): BrowseFocusItem => ({
          kind: 'focus',
          key: makeDocKey('focus', focus.id),
          id: focus.id,
          title: focus.title ?? focus.id,
          description: focus.description,
          doc: focus,
        }),
      ),
      ...artifact.decisions.map(
        (decision): BrowseDecisionItem => ({
          kind: 'decision',
          key: makeDocKey('decision', decision.id),
          id: decision.id,
          title: decision.title ?? decision.id,
          description: decision.description,
          doc: decision,
        }),
      ),
    ]

    return new Map<string, BrowseItem>(rows.map((row) => [row.key, row]))
  }, [artifact])

  const allDocKeys = useMemo(() => {
    if (!artifact) {
      return []
    }

    return [
      ...artifact.events.map((event) => makeDocKey('event', event.id)),
      ...artifact.focuses.map((focus) => makeDocKey('focus', focus.id)),
      ...artifact.decisions.map((decision) => makeDocKey('decision', decision.id)),
    ]
  }, [artifact])

  const searchEntries = useMemo<SearchEntry[]>(() => {
    if (!artifact) {
      return []
    }

    const eventEntries = artifact.events.map((event) => ({
      key: makeDocKey('event', event.id),
      title: event.title,
    }))

    const focusEntries = artifact.focuses.map((focus) => ({
      key: makeDocKey('focus', focus.id),
      title: focus.title,
    }))

    const decisionEntries = artifact.decisions.map((decision) => ({
      key: makeDocKey('decision', decision.id),
      title: decision.title,
    }))

    return [...eventEntries, ...focusEntries, ...decisionEntries]
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

      setFilteredDocKeys(message.data.docKeys)
      setIsSearching(false)
    }

    const initMessage: SearchWorkerRequest = {
      type: 'init',
      entries: searchEntries,
    }
    worker.postMessage(initMessage)

    return () => {
      workerRef.current = null
      worker.terminate()
    }
  }, [artifact, searchEntries])

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

  const filteredKeys = useMemo(() => {
    return filteredDocKeys ?? allDocKeys
  }, [allDocKeys, filteredDocKeys])

  const visibleDocKeys = useMemo(() => {
    return filteredKeys.slice(0, visibleCount)
  }, [filteredKeys, visibleCount])

  const visibleItems = useMemo(() => {
    return visibleDocKeys.map((docKey) => docByKey.get(docKey)).filter((item): item is BrowseItem => item !== undefined)
  }, [docByKey, visibleDocKeys])

  const effectiveSelectedDocKey = useMemo(() => {
    if (selectedDocKey && docByKey.has(selectedDocKey)) {
      return selectedDocKey
    }

    return filteredKeys[0] ?? null
  }, [docByKey, filteredKeys, selectedDocKey])

  const selectedItem = useMemo(() => {
    if (!effectiveSelectedDocKey) {
      return null
    }

    return docByKey.get(effectiveSelectedDocKey) ?? null
  }, [docByKey, effectiveSelectedDocKey])

  const onSelectDoc = (docKey: string): void => {
    const parsed = parseDocKey(docKey)
    if (!parsed) {
      return
    }

    setSelectedDocKey(docKey)
    const nextQuery = writeSelectionToQuery(window.location.search, {
      kind: parsed.kind,
      id: parsed.id,
    })
    window.history.pushState(null, '', `${window.location.pathname}${nextQuery}`)
  }

  const getDocTitle = useCallback(
    (kind: DocKind, id: string): string => {
      return docByKey.get(makeDocKey(kind, id))?.title ?? id
    },
    [docByKey],
  )

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
          <h1>Content Browser</h1>
          <p className="meta">
            {artifact.stats.events} events, {artifact.stats.focuses} focuses, and {artifact.stats.decisions} decisions indexed
          </p>
        </header>
        <label htmlFor="event-search" className="search-label">
          Search events and focuses
        </label>
        <input
          id="event-search"
          value={inputValue}
          onChange={(event) => {
            setIsSearching(true)
            setFilteredDocKeys([])
            setInputValue(event.target.value)
            setVisibleCount(PAGE_SIZE)
          }}
          placeholder="Type an id, title, or effect"
          autoComplete="off"
        />

        <p className="meta">
          Showing {String(visibleItems.length)} of {String(filteredKeys.length)} matches
          {isSearching ? ' (searching...)' : ''}
        </p>

        <ul className="event-list" data-testid="event-list">
          {isSearching ? <li className="meta">Searching…</li> : null}
          {!isSearching && visibleItems.length === 0 ? <li className="meta">No matching content.</li> : null}
          {!isSearching
            ? visibleItems.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={item.key === selectedItem?.key ? 'event-link active' : 'event-link'}
                    onClick={() => onSelectDoc(item.key)}
                  >
                    <strong>{item.title}</strong>
                    <span>{item.kind}</span>
                  </button>
                </li>
              ))
            : null}
        </ul>

        {filteredKeys.length > visibleItems.length ? (
          <button
            type="button"
            className="event-link"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Load more
          </button>
        ) : null}
      </aside>

      <section className="panel panel-right">
        {selectedItem?.kind === 'event' ? (
          <EventSummary event={selectedItem.doc} onSelectDoc={onSelectDoc} getDocTitle={getDocTitle} />
        ) : null}
        {selectedItem?.kind === 'focus' ? (
          <FocusSummary focus={selectedItem.doc} onSelectDoc={onSelectDoc} getDocTitle={getDocTitle} />
        ) : null}
        {selectedItem?.kind === 'decision' ? (
          <DecisionSummary decision={selectedItem.doc} onSelectDoc={onSelectDoc} getDocTitle={getDocTitle} />
        ) : null}
        {!selectedItem ? <p>Select an event, focus, or decision from the list.</p> : null}
      </section>
    </main>
  )
}

export default App
