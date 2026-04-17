import fs from 'node:fs/promises'
import path from 'node:path'

import type { EventDoc, EventEffectNode, EventOption, EventReference } from './types.js'

const EVENT_KEYS = new Set(['country_event', 'news_event', 'state_event'])
const FOCUS_REFERENCE_KEYS = new Set([
  'complete_national_focus',
  'set_national_focus',
  'unlock_national_focus',
])
const DECISION_REFERENCE_KEYS = new Set(['activate_decision', 'complete_decision', 'cancel_decision'])
const IDEA_REFERENCE_KEYS = new Set(['add_idea', 'add_ideas', 'remove_idea', 'remove_ideas'])

const SKIP_EFFECT_KEYS = new Set([
  'id',
  'title',
  'desc',
  'name',
  'log',
  'option',
  'trigger',
  'ai_chance',
  'limit',
  'if',
  'else',
  'hidden_effect',
  'effect_tooltip',
  'custom_effect_tooltip',
  'immediate',
])

const TREE_SKIP_KEYS = new Set([
  'title',
  'desc',
  'name',
  'log',
  'option',
  'trigger',
  'ai_chance',
  'immediate',
])

const NON_EFFECT_SUBTREE_KEYS = new Set([
  'trigger',
  'limit',
  'ai_chance',
  'modifier',
])

type TokenType = 'word' | 'number' | 'string' | 'equals' | 'lbrace' | 'rbrace'

interface Token {
  type: TokenType
  value?: string
}

interface ClausewitzAssignment {
  key: string
  value: ClausewitzValue
}

interface ClausewitzBlock {
  kind: 'block'
  assignments: ClausewitzAssignment[]
}

interface ClausewitzScalarValue {
  kind: 'scalar'
  raw: string
  scalarType: 'word' | 'number' | 'string'
}

type ClausewitzValue = ClausewitzBlock | ClausewitzScalarValue

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
}

function isWordChar(char: string): boolean {
  return /[A-Za-z0-9_:.@-]/.test(char)
}

function tokenizeClausewitz(content: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < content.length) {
    const char = content[index]
    if (!char) {
      break
    }

    if (isWhitespace(char)) {
      index += 1
      continue
    }

    if (char === '#') {
      while (index < content.length && content[index] !== '\n') {
        index += 1
      }
      continue
    }

    if (char === '{') {
      tokens.push({ type: 'lbrace' })
      index += 1
      continue
    }

    if (char === '}') {
      tokens.push({ type: 'rbrace' })
      index += 1
      continue
    }

    if (char === '=') {
      tokens.push({ type: 'equals' })
      index += 1
      continue
    }

    if (char === '"') {
      index += 1
      let value = ''

      while (index < content.length) {
        const current = content[index]
        if (!current) {
          break
        }

        if (current === '\\' && index + 1 < content.length) {
          value += content[index + 1] ?? ''
          index += 2
          continue
        }

        if (current === '"') {
          index += 1
          break
        }

        value += current
        index += 1
      }

      tokens.push({ type: 'string', value })
      continue
    }

    if (char === '-' && index + 1 < content.length && /[0-9]/.test(content[index + 1] ?? '')) {
      let end = index + 1
      while (end < content.length && /[0-9.]/.test(content[end] ?? '')) {
        end += 1
      }
      tokens.push({ type: 'number', value: content.slice(index, end) })
      index = end
      continue
    }

    if (/[0-9]/.test(char)) {
      let end = index + 1
      while (end < content.length && /[0-9.]/.test(content[end] ?? '')) {
        end += 1
      }
      tokens.push({ type: 'number', value: content.slice(index, end) })
      index = end
      continue
    }

    if (isWordChar(char)) {
      let end = index + 1
      while (end < content.length && isWordChar(content[end] ?? '')) {
        end += 1
      }
      tokens.push({ type: 'word', value: content.slice(index, end) })
      index = end
      continue
    }

    // Skip unsupported punctuation to keep parsing resilient.
    index += 1
  }

  return tokens
}

function parseValue(tokens: Token[], startAt: number): { value: ClausewitzValue; next: number } | null {
  const token = tokens.at(startAt)
  if (token === undefined) {
    return null
  }

  if (token.type === 'lbrace') {
    const parsedBlock = parseBlock(tokens, startAt + 1)
    return {
      value: parsedBlock.block,
      next: parsedBlock.next,
    }
  }

  if (token.type === 'word' || token.type === 'number' || token.type === 'string') {
    return {
      value: {
        kind: 'scalar',
        raw: token.value ?? '',
        scalarType: token.type,
      },
      next: startAt + 1,
    }
  }

  return null
}

function parseBlock(tokens: Token[], startAt: number): { block: ClausewitzBlock; next: number } {
  const assignments: ClausewitzAssignment[] = []
  let index = startAt

  while (index < tokens.length) {
    const current = tokens.at(index)
    if (current === undefined) {
      break
    }

    if (current.type === 'rbrace') {
      return {
        block: { kind: 'block', assignments },
        next: index + 1,
      }
    }

    if (current.type !== 'word' && current.type !== 'number' && current.type !== 'string') {
      index += 1
      continue
    }

    const equals = tokens.at(index + 1)
    if (equals?.type !== 'equals') {
      index += 1
      continue
    }

    const parsedValue = parseValue(tokens, index + 2)
    if (!parsedValue) {
      index += 2
      continue
    }

    assignments.push({
      key: current.value ?? '',
      value: parsedValue.value,
    })

    index = parsedValue.next
  }

  return {
    block: { kind: 'block', assignments },
    next: index,
  }
}

function parseDocument(content: string): ClausewitzBlock {
  const tokens = tokenizeClausewitz(content)
  return parseBlock(tokens, 0).block
}

function scalarToString(value: ClausewitzValue | undefined): string | undefined {
  if (value?.kind !== 'scalar') {
    return undefined
  }
  return value.raw
}

function getFirstAssignmentValue(block: ClausewitzBlock, key: string): ClausewitzValue | undefined {
  return block.assignments.find((assignment) => assignment.key === key)?.value
}

function getBlockAssignments(block: ClausewitzBlock, key: string): ClausewitzBlock[] {
  return block.assignments
    .filter((assignment) => assignment.key === key && assignment.value.kind === 'block')
    .map((assignment) => assignment.value as ClausewitzBlock)
}

function getScalarAssignment(block: ClausewitzBlock, key: string): string | undefined {
  return scalarToString(getFirstAssignmentValue(block, key))
}

function collectEffectsFromBlock(
  block: ClausewitzBlock,
  options?: {
    skipKeys?: Set<string>
    deep?: boolean
  },
): Set<string> {
  const effects = new Set<string>()
  const skipKeys = options?.skipKeys ?? SKIP_EFFECT_KEYS
  const deep = options?.deep ?? true

  for (const assignment of block.assignments) {
    if (!skipKeys.has(assignment.key)) {
      effects.add(assignment.key)
    }

    if (deep && assignment.value.kind === 'block' && !NON_EFFECT_SUBTREE_KEYS.has(assignment.key)) {
      const nested = collectEffectsFromBlock(assignment.value, options)
      for (const key of nested) {
        effects.add(key)
      }
    }
  }

  return effects
}

function buildEffectNode(assignment: ClausewitzAssignment): EventEffectNode {
  if (assignment.value.kind === 'scalar') {
    return {
      key: assignment.key,
      value: assignment.value.raw,
    }
  }

  const children = assignment.value.assignments
    .filter((childAssignment) => !TREE_SKIP_KEYS.has(childAssignment.key))
    .map((childAssignment) => buildEffectNode(childAssignment))

  return {
    key: assignment.key,
    children: children.length > 0 ? children : undefined,
  }
}

function buildOptionEffectTree(optionBlock: ClausewitzBlock): EventEffectNode[] {
  return optionBlock.assignments
    .filter((assignment) => !TREE_SKIP_KEYS.has(assignment.key))
    .map((assignment) => buildEffectNode(assignment))
}

function buildEventImmediateEffectTree(eventBlock: ClausewitzBlock): EventEffectNode[] {
  const nodes: EventEffectNode[] = []

  for (const immediateBlock of getBlockAssignments(eventBlock, 'immediate')) {
    nodes.push(...buildOptionEffectTree(immediateBlock))
  }

  for (const assignment of eventBlock.assignments) {
    if (assignment.key === 'option' || assignment.key === 'immediate' || TREE_SKIP_KEYS.has(assignment.key)) {
      continue
    }

    if (assignment.value.kind === 'block' && NON_EFFECT_SUBTREE_KEYS.has(assignment.key)) {
      continue
    }

    nodes.push(buildEffectNode(assignment))
  }

  return nodes
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

function buildEventReferencesFromAssignment(
  assignment: ClausewitzAssignment,
  via: EventReference['via'],
  scriptedEffectNames: Set<string>,
): EventReference[] {
  const refs: EventReference[] = []

  if (EVENT_KEYS.has(assignment.key)) {
    if (assignment.value.kind === 'scalar') {
      if (assignment.value.raw) {
        refs.push({ type: 'event', targetId: assignment.value.raw, via })
      }
    } else {
      const targetId = getScalarAssignment(assignment.value, 'id')
      if (targetId) {
        const delayRaw = getScalarAssignment(assignment.value, 'days')
        const parsedDelay = delayRaw ? Number.parseInt(delayRaw, 10) : undefined
        refs.push({
          type: 'event',
          targetId,
          delayDays: Number.isFinite(parsedDelay) ? parsedDelay : undefined,
          via,
        })
      }
    }
  }

  if (FOCUS_REFERENCE_KEYS.has(assignment.key) && assignment.value.kind === 'scalar' && assignment.value.raw) {
    refs.push({ type: 'focus', targetId: assignment.value.raw, via })
  }

  if (DECISION_REFERENCE_KEYS.has(assignment.key) && assignment.value.kind === 'scalar' && assignment.value.raw) {
    refs.push({ type: 'decision', targetId: assignment.value.raw, via })
  }

  if (IDEA_REFERENCE_KEYS.has(assignment.key) && assignment.value.kind === 'scalar' && assignment.value.raw) {
    refs.push({ type: 'idea', targetId: assignment.value.raw, via })
  }

  if (scriptedEffectNames.has(assignment.key)) {
    refs.push({ type: 'scripted_effect', targetId: assignment.key, via })
  }

  if (assignment.value.kind === 'block') {
    refs.push(...extractReferencesFromBlock(assignment.value, via, scriptedEffectNames))
  }

  return refs
}

function extractReferencesFromBlock(
  block: ClausewitzBlock,
  via: EventReference['via'],
  scriptedEffectNames: Set<string>,
): EventReference[] {
  const refs: EventReference[] = []

  for (const assignment of block.assignments) {
    refs.push(...buildEventReferencesFromAssignment(assignment, via, scriptedEffectNames))
  }

  return dedupeReferences(refs)
}

function extractReferencesFromEventBody(
  eventBlock: ClausewitzBlock,
  scriptedEffectNames: Set<string>,
): EventReference[] {
  const refs: EventReference[] = []

  for (const assignment of eventBlock.assignments) {
    if (assignment.key === 'option') {
      continue
    }

    if (assignment.key === 'immediate' && assignment.value.kind === 'block') {
      refs.push(...extractReferencesFromBlock(assignment.value, 'immediate', scriptedEffectNames))
      continue
    }

    refs.push(...buildEventReferencesFromAssignment(assignment, 'body', scriptedEffectNames))
  }

  return refs
}

function collectRootEffects(eventBlock: ClausewitzBlock): string[] {
  const effects = new Set<string>()

  for (const assignment of eventBlock.assignments) {
    if (assignment.key === 'option' || assignment.key === 'immediate') {
      continue
    }

    if (!SKIP_EFFECT_KEYS.has(assignment.key)) {
      effects.add(assignment.key)
    }

    if (assignment.value.kind === 'block' && !NON_EFFECT_SUBTREE_KEYS.has(assignment.key)) {
      const nested = collectEffectsFromBlock(assignment.value)
      for (const key of nested) {
        effects.add(key)
      }
    }
  }

  return Array.from(effects)
}

function collectImmediateEffects(eventBlock: ClausewitzBlock): string[] {
  const effects = new Set<string>()

  for (const immediateBlock of getBlockAssignments(eventBlock, 'immediate')) {
    const nested = collectEffectsFromBlock(immediateBlock)
    for (const key of nested) {
      effects.add(key)
    }
  }

  for (const key of collectRootEffects(eventBlock)) {
    effects.add(key)
  }

  return Array.from(effects).sort((a, b) => a.localeCompare(b))
}

function parseOption(
  optionBlock: ClausewitzBlock,
  index: number,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
): EventOption {
  const nameKey = getScalarAssignment(optionBlock, 'name')
  const effects = Array.from(collectEffectsFromBlock(optionBlock)).sort((a, b) => a.localeCompare(b))
  const effectTree = buildOptionEffectTree(optionBlock)

  return {
    index,
    nameKey,
    name: nameKey ? localization.get(nameKey) : undefined,
    effects,
    effectTree,
    references: extractReferencesFromBlock(optionBlock, 'option', scriptedEffectNames),
  }
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

function getEventBlocks(document: ClausewitzBlock): ClausewitzBlock[] {
  return document.assignments
    .filter((assignment) => EVENT_KEYS.has(assignment.key) && assignment.value.kind === 'block')
    .map((assignment) => assignment.value as ClausewitzBlock)
}

export async function parseEventFile(
  filePath: string,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
  modRootPath: string,
): Promise<EventDoc[]> {
  const content = await fs.readFile(filePath, 'utf8')
  const document = parseDocument(content)
  const eventBlocks = getEventBlocks(document)

  const events: EventDoc[] = []
  for (const eventBlock of eventBlocks) {
    const id = getScalarAssignment(eventBlock, 'id')
    if (!id) {
      continue
    }

    const titleKey = getScalarAssignment(eventBlock, 'title')
    const descKey = getScalarAssignment(eventBlock, 'desc')
    if (!titleKey && !descKey) {
      continue
    }

    const options = getBlockAssignments(eventBlock, 'option').map((optionBlock, index) =>
      parseOption(optionBlock, index, localization, scriptedEffectNames),
    )

    const bodyReferences = extractReferencesFromEventBody(eventBlock, scriptedEffectNames)
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
      immediateEffects: collectImmediateEffects(eventBlock),
      immediateEffectTree: buildEventImmediateEffectTree(eventBlock),
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
    const document = parseDocument(content)

    for (const assignment of document.assignments) {
      if (assignment.value.kind === 'block') {
        names.add(assignment.key)
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
