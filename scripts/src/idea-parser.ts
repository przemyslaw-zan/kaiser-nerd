import fs from 'node:fs/promises'
import path from 'node:path'

import type { EventEffectNode, EventReference, IdeaDoc } from './types.js'

const EVENT_KEYS = new Set(['country_event', 'news_event', 'state_event'])
const FOCUS_REFERENCE_KEYS = new Set([
  'complete_national_focus',
  'set_national_focus',
  'unlock_national_focus',
])
const DECISION_REFERENCE_KEYS = new Set(['activate_decision', 'complete_decision', 'cancel_decision'])
const IDEA_REFERENCE_KEYS = new Set(['add_idea', 'add_ideas', 'remove_idea', 'remove_ideas'])

const IDEA_GROUP_META_KEYS = new Set(['picture', 'icon', 'priority', 'allowed', 'visible'])

const IDEA_SKIP_EFFECT_KEYS = new Set([
  'picture',
  'icon',
  'removal_cost',
  'allowed_civil_war',
  'available',
  'allowed',
  'visible',
  'cancel',
  'allowed_to_remove',
  'rule',
  'ledger',
  'traits',
  'level',
  'cost',
  'targeted_modifier',
  'targeted_modifier_rule',
  'targeted_modifier_remove_trigger',
  'targeted_modifier_rule_remove_trigger',
  'targeted_decision_option',
  'on_map_mode',
  'state_target',
  'target_array',
  'target_root_trigger',
  'target_trigger',
  'if',
  'else',
  'trigger',
  'limit',
  'log',
])

const NON_EFFECT_SUBTREE_KEYS = new Set([
  'trigger',
  'limit',
  'modifier',
  'available',
  'visible',
  'allowed',
  'cancel',
  'allowed_to_remove',
  'target_root_trigger',
  'target_trigger',
])

const IDEA_EFFECT_BLOCK_KEYS = new Set(['modifier', 'research_bonus', 'on_add', 'on_remove', 'on_apply'])

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

function getScalarAssignment(block: ClausewitzBlock, key: string): string | undefined {
  return scalarToString(getFirstAssignmentValue(block, key))
}

function getBlockAssignments(block: ClausewitzBlock, key: string): ClausewitzBlock[] {
  return block.assignments
    .filter((assignment) => assignment.key === key && assignment.value.kind === 'block')
    .map((assignment) => assignment.value as ClausewitzBlock)
}

function collectEffectsFromBlock(block: ClausewitzBlock): Set<string> {
  const effects = new Set<string>()

  for (const assignment of block.assignments) {
    if (!IDEA_SKIP_EFFECT_KEYS.has(assignment.key)) {
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
    .filter((childAssignment) => !IDEA_SKIP_EFFECT_KEYS.has(childAssignment.key))
    .map((childAssignment) => buildEffectNode(childAssignment))

  return {
    key: assignment.key,
    children: children.length > 0 ? children : undefined,
  }
}

function buildEffectTree(block: ClausewitzBlock): EventEffectNode[] {
  return block.assignments
    .filter((assignment) => !IDEA_SKIP_EFFECT_KEYS.has(assignment.key))
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
    refs.push(...buildReferencesFromAssignment(assignment, via, scriptedEffectNames))
  }

  return dedupeReferences(refs)
}

const IDEA_SCALAR_PROPERTY_KEYS = new Set(['removal_cost', 'allowed_civil_war', 'ledger', 'level', 'cost'])

const IDEA_BLOCK_PROPERTY_KEYS = new Set(['allowed', 'available', 'visible', 'allowed_to_remove'])

function extractIdeaProperties(ideaBlock: ClausewitzBlock): Record<string, string> {
  const properties: Record<string, string> = {}

  for (const assignment of ideaBlock.assignments) {
    if (IDEA_SCALAR_PROPERTY_KEYS.has(assignment.key) && assignment.value.kind === 'scalar') {
      properties[assignment.key] = assignment.value.raw
    } else if (IDEA_BLOCK_PROPERTY_KEYS.has(assignment.key) && assignment.value.kind === 'block') {
      properties[assignment.key] = '(conditional)'
    }
  }

  return Object.keys(properties).length > 0 ? properties : {}
}

function parseIdeaBlock(
  ideaId: string,
  categoryId: string,
  ideaBlock: ClausewitzBlock,
  sourceFile: string,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
): IdeaDoc {
  const titleKey = ideaId
  const descKey = `${ideaId}_desc`

  const effects = new Set<string>()
  const effectTree: EventEffectNode[] = []

  for (const key of IDEA_EFFECT_BLOCK_KEYS) {
    for (const effectBlock of getBlockAssignments(ideaBlock, key)) {
      for (const effectName of collectEffectsFromBlock(effectBlock)) {
        effects.add(effectName)
      }

      effectTree.push(...buildEffectTree(effectBlock))
    }
  }

  const properties = extractIdeaProperties(ideaBlock)

  return {
    id: ideaId,
    categoryId,
    sourceFile,
    titleKey,
    descKey,
    title: localization.get(titleKey),
    description: localization.get(descKey),
    properties: Object.keys(properties).length > 0 ? properties : undefined,
    effects: Array.from(effects).sort((a, b) => a.localeCompare(b)),
    effectTree: effectTree.length > 0 ? effectTree : undefined,
    references: extractReferencesFromBlock(ideaBlock, 'body', scriptedEffectNames),
  }
}

function getIdeaCategoryAssignments(document: ClausewitzBlock): ClausewitzAssignment[] {
  const categories: ClausewitzAssignment[] = []

  for (const assignment of document.assignments) {
    if (assignment.value.kind !== 'block') {
      continue
    }

    if (assignment.key === 'ideas') {
      for (const inner of assignment.value.assignments) {
        if (inner.value.kind === 'block') {
          categories.push(inner)
        }
      }
      continue
    }

    categories.push(assignment)
  }

  return categories
}

export async function parseIdeaFile(
  filePath: string,
  localization: Map<string, string>,
  scriptedEffectNames: Set<string>,
  modRootPath: string,
): Promise<IdeaDoc[]> {
  const content = await fs.readFile(filePath, 'utf8')
  const document = parseDocument(content)
  const sourceFile = path.relative(modRootPath, filePath).replaceAll('\\', '/')

  const docs: IdeaDoc[] = []

  for (const categoryAssignment of getIdeaCategoryAssignments(document)) {
    if (categoryAssignment.value.kind !== 'block') {
      continue
    }

    const categoryId = categoryAssignment.key
    const categoryBlock = categoryAssignment.value

    for (const ideaAssignment of categoryBlock.assignments) {
      if (IDEA_GROUP_META_KEYS.has(ideaAssignment.key) || ideaAssignment.value.kind !== 'block') {
        continue
      }

      docs.push(
        parseIdeaBlock(
          ideaAssignment.key,
          categoryId,
          ideaAssignment.value,
          sourceFile,
          localization,
          scriptedEffectNames,
        ),
      )
    }
  }

  return docs
}
