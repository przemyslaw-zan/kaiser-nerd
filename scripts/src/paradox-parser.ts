import fs from 'node:fs/promises'
import path from 'node:path'

import type { EventDoc, EventOption, EventReference } from './types.js'

const EVENT_DECLARATION_RE = /\b(?:country_event|news_event|state_event)\s*=\s*\{/g
const EVENT_ID_RE = /\bid\s*=\s*([A-Za-z0-9_.:-]+)/
const TITLE_RE = /\btitle\s*=\s*([A-Za-z0-9_.:-]+)/
const DESC_RE = /\bdesc\s*=\s*([A-Za-z0-9_.:-]+)/
const OPTION_RE = /\boption\s*=\s*\{/g

const EVENT_CALL_BLOCK_RE = /\b(?:country_event|news_event|state_event)\s*=\s*\{([^{}]*)\}/g
const EVENT_CALL_DIRECT_RE = /\b(?:country_event|news_event|state_event)\s*=\s*([A-Za-z0-9_.:-]+)/g
const EVENT_ID_INNER_RE = /\bid\s*=\s*([A-Za-z0-9_.:-]+)/
const EVENT_DAYS_INNER_RE = /\bdays\s*=\s*(-?\d+)/

const FOCUS_REF_RE = /\b(?:complete_national_focus|set_national_focus|unlock_national_focus)\s*=\s*([A-Za-z0-9_.:-]+)/g
const DECISION_REF_RE = /\b(?:activate_decision|complete_decision|cancel_decision)\s*=\s*([A-Za-z0-9_.:-]+)/g
const KEY_ASSIGNMENT_RE = /\b([A-Za-z_][A-Za-z0-9_]*)\s*=/g
const EFFECT_COMMAND_RE = /^\s*([A-Za-z_][A-Za-z0-9_:.@-]*)\s*=/gm

const SKIP_EFFECT_KEYS = new Set([
  'id',
  'title',
  'desc',
  'name',
  'option',
  'trigger',
  'ai_chance',
  'limit',
  'if',
  'else',
  'hidden_effect',
  'effect_tooltip',
  'custom_effect_tooltip',
])

function findMatchingBrace(content: string, openingBraceIndex: number): number {
  let depth = 0
  for (let i = openingBraceIndex; i < content.length; i += 1) {
    const char = content[i]
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return i
      }
    }
  }

  return -1
}

function collectBlocks(content: string, declarationRegex: RegExp): string[] {
  const blocks: string[] = []

  for (const match of content.matchAll(declarationRegex)) {
    const start = match.index
    const openingBraceIndex = content.indexOf('{', start)
    if (openingBraceIndex === -1) {
      continue
    }

    const closingBraceIndex = findMatchingBrace(content, openingBraceIndex)
    if (closingBraceIndex === -1) {
      continue
    }

    blocks.push(content.slice(openingBraceIndex + 1, closingBraceIndex))
  }

  return blocks
}

function extractEffects(blockContent: string): string[] {
  const commands = new Set<string>()
  for (const match of blockContent.matchAll(EFFECT_COMMAND_RE)) {
    const key = match[1]
    if (SKIP_EFFECT_KEYS.has(key)) {
      continue
    }
    commands.add(key)
  }

  return Array.from(commands).sort((a, b) => a.localeCompare(b))
}

function extractReferences(
  blockContent: string,
  via: EventReference['via'],
  scriptedEffectNames: Set<string>,
): EventReference[] {
  const refs: EventReference[] = []

  for (const match of blockContent.matchAll(EVENT_CALL_BLOCK_RE)) {
    const inner = match[1]
    const idMatch = EVENT_ID_INNER_RE.exec(inner)
    const targetId = idMatch?.[1]
    if (!targetId) {
      continue
    }

    const delayRaw = EVENT_DAYS_INNER_RE.exec(inner)?.[1]
    const delayDays = delayRaw ? Number.parseInt(delayRaw, 10) : undefined

    refs.push({
      type: 'event',
      targetId,
      delayDays,
      via,
    })
  }

  for (const match of blockContent.matchAll(EVENT_CALL_DIRECT_RE)) {
    const targetId = match[1]
    if (!targetId) {
      continue
    }
    refs.push({ type: 'event', targetId, via })
  }

  for (const match of blockContent.matchAll(FOCUS_REF_RE)) {
    const targetId = match[1]
    if (!targetId) {
      continue
    }
    refs.push({ type: 'focus', targetId, via })
  }

  for (const match of blockContent.matchAll(DECISION_REF_RE)) {
    const targetId = match[1]
    if (!targetId) {
      continue
    }
    refs.push({ type: 'decision', targetId, via })
  }

  for (const match of blockContent.matchAll(KEY_ASSIGNMENT_RE)) {
    const key = match[1]
    if (!key || !scriptedEffectNames.has(key)) {
      continue
    }
    refs.push({ type: 'scripted_effect', targetId: key, via })
  }

  return dedupeReferences(refs)
}

function dedupeReferences(references: EventReference[]): EventReference[] {
  const byKey = new Map<string, EventReference>()

  for (const reference of references) {
    const key = `${reference.type}|${reference.targetId}|${String(reference.delayDays ?? '')}|${reference.via}`
    if (!byKey.has(key)) {
      byKey.set(key, reference)
    }
  }

  return Array.from(byKey.values())
}

function normalizeNamespace(eventId: string): string {
  const [namespace] = eventId.split('.')
  return namespace
}

function dedupeReferencesIgnoringVia(references: EventReference[]): EventReference[] {
  const byKey = new Map<string, EventReference>()

  for (const reference of references) {
    const key = `${reference.type}|${reference.targetId}|${String(reference.delayDays ?? '')}`
    const existing = byKey.get(key)

    if (!existing || (existing.via === 'body' && reference.via !== 'body')) {
      byKey.set(key, reference)
    }
  }

  return Array.from(byKey.values())
}

function collectOptionSlices(blockContent: string): string[] {
  return collectBlocks(blockContent, OPTION_RE)
}

function parseOption(
  optionBlock: string,
  index: number,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
): EventOption {
  const nameKey = /\bname\s*=\s*([A-Za-z0-9_.:-]+)/.exec(optionBlock)?.[1]

  return {
    index,
    nameKey,
    name: nameKey ? localization.get(nameKey) : undefined,
    effects: extractEffects(optionBlock),
    references: extractReferences(optionBlock, 'option', scriptedEffectNames),
  }
}

export async function parseEventFile(
  filePath: string,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
  modRootPath: string,
): Promise<EventDoc[]> {
  const content = await fs.readFile(filePath, 'utf8')
  const eventBlocks = collectBlocks(content, EVENT_DECLARATION_RE)

  const events: EventDoc[] = []
  for (const block of eventBlocks) {
    const id = EVENT_ID_RE.exec(block)?.[1]
    if (!id) {
      continue
    }

    const titleKey = TITLE_RE.exec(block)?.[1]
    const descKey = DESC_RE.exec(block)?.[1]
    if (!titleKey && !descKey) {
      continue
    }

    const optionBlocks = collectOptionSlices(block)
    const options = optionBlocks.map((optionBlock, index) =>
      parseOption(optionBlock, index, localization, scriptedEffectNames),
    )

    const bodyReferences = extractReferences(block, 'body', scriptedEffectNames)
    const optionReferences = options.flatMap((option) => option.references)
    const references = dedupeReferencesIgnoringVia([...bodyReferences, ...optionReferences])

    const eventDoc: EventDoc = {
      id,
      namespace: normalizeNamespace(id),
      sourceFile: path.relative(modRootPath, filePath).replaceAll('\\', '/'),
      titleKey,
      descKey,
      title: titleKey ? localization.get(titleKey) : undefined,
      description: descKey ? localization.get(descKey) : undefined,
      immediateEffects: extractEffects(block),
      options,
      references,
      incomingEventIds: [],
    }

    events.push(eventDoc)
  }

  return events
}

export async function collectScriptedEffectNames(filePaths: string[]): Promise<Set<string>> {
  const names = new Set<string>()

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, 'utf8')
    const topLevelAssignmentRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{/gm

    for (const match of content.matchAll(topLevelAssignmentRe)) {
      const name = match[1]
      if (name) {
        names.add(name)
      }
    }
  }

  return names
}

export function buildIncomingEventLinks(events: EventDoc[]): EventDoc[] {
  const incomingByEventId = new Map<string, Set<string>>()

  for (const event of events) {
    for (const reference of event.references) {
      if (reference.type !== 'event') {
        continue
      }
      const set = incomingByEventId.get(reference.targetId) ?? new Set<string>()
      set.add(event.id)
      incomingByEventId.set(reference.targetId, set)
    }
  }

  return events.map((event) => ({
    ...event,
    incomingEventIds: Array.from(incomingByEventId.get(event.id) ?? []).sort((a, b) => a.localeCompare(b)),
  }))
}
