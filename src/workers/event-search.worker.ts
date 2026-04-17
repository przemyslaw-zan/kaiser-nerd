/// <reference lib="webworker" />

import Fuse from 'fuse.js'

interface SearchEntry {
  key: string
  title?: string
  description?: string
  secondaryText?: string
}

interface SearchRow {
  key: string
  searchableTitle: string
  searchableDescription: string
  secondaryText: string
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

let searchIndex: Fuse<SearchRow> | null = null

self.onmessage = (message: MessageEvent<SearchWorkerRequest>) => {
  if (message.data.type === 'init') {
    const rows: SearchRow[] = message.data.entries.map((entry) => ({
      key: entry.key,
      searchableTitle: entry.title ?? '',
      searchableDescription: entry.description ?? '',
      secondaryText: entry.secondaryText ?? '',
    }))

    searchIndex = new Fuse(rows, {
      keys: ['key', 'searchableTitle', 'searchableDescription', 'secondaryText'],
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
      docKeys: null,
    }
    self.postMessage(response)
    return
  }

  if (!searchIndex) {
    const response: SearchWorkerResponse = {
      type: 'result',
      requestId: message.data.requestId,
      docKeys: [],
    }
    self.postMessage(response)
    return
  }

  const docKeys = searchIndex.search(trimmedQuery).map((row) => row.item.key)
  const response: SearchWorkerResponse = {
    type: 'result',
    requestId: message.data.requestId,
    docKeys,
  }
  self.postMessage(response)
}

export {}