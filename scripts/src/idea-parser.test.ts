// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseIdeaFile } from './idea-parser.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe('parseIdeaFile', () => {
  it('extracts idea ids, effects, and references', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-idea-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'BUK ideas (Bukhara).txt')
    const content = `
ideas = {
  country = {
    BUK_reform_state = {
      removal_cost = -1
      modifier = {
        stability_factor = 0.05
      }
      on_add = {
        add_ideas = BUK_reform_state_2
        country_event = { id = buk_events.1 days = 5 }
        complete_national_focus = BUK_focus_reform
        activate_decision = BUK_emergency_measures
      }
    }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['BUK_reform_state', 'Reform the State'],
      ['BUK_reform_state_desc', 'A comprehensive internal reform.'],
    ])

    const parsed = await parseIdeaFile(filePath, localization, new Set<string>(), tempDir)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.id).toBe('BUK_reform_state')
    expect(parsed[0]?.categoryId).toBe('country')
    expect(parsed[0]?.title).toBe('Reform the State')
    expect(parsed[0]?.description).toBe('A comprehensive internal reform.')
    expect(parsed[0]?.properties).toEqual({ removal_cost: '-1' })
    expect(parsed[0]?.effects).toContain('stability_factor')

    const eventRef = parsed[0]?.references.find((ref) => ref.type === 'event')
    expect(eventRef?.targetId).toBe('buk_events.1')
    expect(eventRef?.delayDays).toBe(5)

    const focusRef = parsed[0]?.references.find((ref) => ref.type === 'focus')
    expect(focusRef?.targetId).toBe('BUK_focus_reform')

    const decisionRef = parsed[0]?.references.find((ref) => ref.type === 'decision')
    expect(decisionRef?.targetId).toBe('BUK_emergency_measures')

    const ideaRef = parsed[0]?.references.find((ref) => ref.type === 'idea')
    expect(ideaRef?.targetId).toBe('BUK_reform_state_2')
  })
})
