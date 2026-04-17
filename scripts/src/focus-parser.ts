import fs from 'node:fs/promises'
import path from 'node:path'

import type { EventEffectNode, EventReference, FocusDoc } from './types.js'

const EVENT_KEYS = new Set(['country_event', 'news_event', 'state_event'])
const FOCUS_REFERENCE_KEYS = new Set([
  'complete_national_focus',
  'set_national_focus',
  'unlock_national_focus',
])
const DECISION_REFERENCE_KEYS = new Set(['activate_decision', 'complete_decision', 'cancel_decision'])

const SKIP_EFFECT_KEYS = new Set([
  'id',
  'icon',
  'x',
  'y',
  'cost',
  'relative_position_id',
  'continue_if_invalid',
  'cancel_if_invalid',
  'cancelable',
  'available_if_capitulated',
  'allow_branch',
  'allow',
  'ai_will_do',
  'search_filters',
  'prerequisite',
  'mutually_exclusive',
  'available',
  'bypass',
  'cancel',
  'completion_reward',
  'select_effect',
  'complete_tooltip',
  'trigger',
  'limit',
  'if',
  'else',
  'hidden_effect',
  'effect_tooltip',
  'custom_effect_tooltip',
  'log',
])

const NON_EFFECT_SUBTREE_KEYS = new Set([
  'trigger',
  'limit',
  'modifier',
  'prerequisite',
  'mutually_exclusive',
  'available',
  'bypass',
  'cancel',
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

function collectEffectsFromBlock(block: ClausewitzBlock): Set<string> {
  const effects = new Set<string>()

  for (const assignment of block.assignments) {
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
    .filter((childAssignment) => !SKIP_EFFECT_KEYS.has(childAssignment.key))
    .map((childAssignment) => buildEffectNode(childAssignment))

  return {
    key: assignment.key,
    children: children.length > 0 ? children : undefined,
  }
}

function buildEffectTree(block: ClausewitzBlock): EventEffectNode[] {
  return block.assignments
    .filter((assignment) => !SKIP_EFFECT_KEYS.has(assignment.key))
    .map((assignment) => buildEffectNode(assignment))
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

function buildReferencesFromAssignment(
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
    refs.push(...buildReferencesFromAssignment(assignment, via, scriptedEffectNames))
  }

  return dedupeReferences(refs)
}

function parsePrerequisiteFocusGroups(focusBlock: ClausewitzBlock): string[][] {
  const groups: string[][] = []

  for (const prerequisiteBlock of getBlockAssignments(focusBlock, 'prerequisite')) {
    const groupIds: string[] = []

    for (const assignment of prerequisiteBlock.assignments) {
      if (assignment.key !== 'focus' || assignment.value.kind !== 'scalar' || !assignment.value.raw) {
        continue
      }

      if (!groupIds.includes(assignment.value.raw)) {
        groupIds.push(assignment.value.raw)
      }
    }

    if (groupIds.length > 0) {
      groups.push(groupIds)
    }
  }

  return groups
}

function parseFocusBlock(
  focusBlock: ClausewitzBlock,
  treeId: string | undefined,
  sourceFile: string,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
): FocusDoc | null {
  const id = getScalarAssignment(focusBlock, 'id')
  if (!id) {
    return null
  }

  const titleKey = id
  const descKey = `${id}_desc`

  const completionEffects = new Set<string>()
  const completionEffectTree: EventEffectNode[] = []
  const prerequisiteFocusGroups = parsePrerequisiteFocusGroups(focusBlock)
  const prerequisiteFocusIds = Array.from(new Set(prerequisiteFocusGroups.flat())).sort((a, b) => a.localeCompare(b))

  for (const completionRewardBlock of getBlockAssignments(focusBlock, 'completion_reward')) {
    const effects = collectEffectsFromBlock(completionRewardBlock)
    for (const effect of effects) {
      completionEffects.add(effect)
    }

    completionEffectTree.push(...buildEffectTree(completionRewardBlock))
  }

  return {
    id,
    treeId,
    sourceFile,
    titleKey,
    descKey,
    title: localization.get(titleKey),
    description: localization.get(descKey),
    prerequisiteFocusIds,
    prerequisiteFocusGroups: prerequisiteFocusGroups.length > 0 ? prerequisiteFocusGroups : undefined,
    completionEffects: Array.from(completionEffects).sort((a, b) => a.localeCompare(b)),
    completionEffectTree: completionEffectTree.length > 0 ? completionEffectTree : undefined,
    references: extractReferencesFromBlock(focusBlock, 'body', scriptedEffectNames),
  }
}

export async function parseNationalFocusFile(
  filePath: string,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
  modRootPath: string,
): Promise<FocusDoc[]> {
  const content = await fs.readFile(filePath, 'utf8')
  const document = parseDocument(content)
  const sourceFile = path.relative(modRootPath, filePath).replaceAll('\\', '/')

  const docs: FocusDoc[] = []
  for (const treeBlock of getBlockAssignments(document, 'focus_tree')) {
    const treeId = getScalarAssignment(treeBlock, 'id')
    const focusBlocks = getBlockAssignments(treeBlock, 'focus')

    for (const focusBlock of focusBlocks) {
      const parsed = parseFocusBlock(focusBlock, treeId, sourceFile, localization, scriptedEffectNames)
      if (parsed) {
        docs.push(parsed)
      }
    }
  }

  return docs
}
