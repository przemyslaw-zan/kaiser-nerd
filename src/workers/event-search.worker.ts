/// <reference lib="webworker" />

import Fuse from 'fuse.js'

import type { EventDoc } from '../types/artifact'

interface SearchRow {
  id: string
  searchableTitle: string
  searchableDescription: string
  optionNames: string
}

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

let searchIndex: Fuse<SearchRow> | null = null

self.onmessage = (message: MessageEvent<SearchWorkerRequest>) => {
  if (message.data.type === 'init') {
    const rows: SearchRow[] = message.data.events.map((event) => ({
      id: event.id,
      searchableTitle: event.title ?? '',
      searchableDescription: event.description ?? '',
      optionNames: event.options.map((option) => option.name ?? '').join(' '),
    }))

    searchIndex = new Fuse(rows, {
      keys: ['id', 'searchableTitle', 'searchableDescription', 'optionNames'],
      threshold: 0.32,
      includeScore: true,
      ignoreLocation: true,
    })

    const response: SearchWorkerResponse = { type: 'ready' }
    self.postMessage(response)
    return
  }

  const trimmedQuery = message.data.query.trim()
  if (!trimmedQuery) {
    const response: SearchWorkerResponse = {
      type: 'result',
      requestId: message.data.requestId,
      eventIds: null,
    }
    self.postMessage(response)
    return
  }

  if (!searchIndex) {
    const response: SearchWorkerResponse = {
      type: 'result',
      requestId: message.data.requestId,
      eventIds: [],
    }
    self.postMessage(response)
    return
  }

  const eventIds = searchIndex.search(trimmedQuery).map((row) => row.item.id)
  const response: SearchWorkerResponse = {
    type: 'result',
    requestId: message.data.requestId,
    eventIds,
  }
  self.postMessage(response)
}

export {}