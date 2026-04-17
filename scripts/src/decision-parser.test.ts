// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseDecisionFile } from './decision-parser.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe('parseDecisionFile', () => {
  it('extracts decision ids, effects, and references', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-decision-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'ENG decisions (Union of Britain).txt')
    const content = `
decision_categories = {
  ENG_workers_council = {
    icon = generic_decisions

    ENG_appoint_factory_commissars = {
      cost = 50
      available = {
        has_war = no
      }

      complete_effect = {
        add_political_power = 25
        country_event = { id = eng_events.10 days = 3 }
        complete_national_focus = ENG_focus_branch
        add_ideas = ENG_industrial_drive
      }

      remove_effect = {
        activate_decision = ENG_emergency_committee
      }
    }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['ENG_appoint_factory_commissars', 'Appoint Factory Commissars'],
      ['ENG_appoint_factory_commissars_desc', 'Place loyal commissars in key factories.'],
    ])

    const parsed = await parseDecisionFile(filePath, localization, new Set<string>(), tempDir)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.id).toBe('ENG_appoint_factory_commissars')
    expect(parsed[0]?.categoryId).toBe('ENG_workers_council')
    expect(parsed[0]?.title).toBe('Appoint Factory Commissars')
    expect(parsed[0]?.description).toBe('Place loyal commissars in key factories.')
    expect(parsed[0]?.effects).toContain('add_political_power')

    const eventRef = parsed[0]?.references.find((ref) => ref.type === 'event')
    expect(eventRef?.targetId).toBe('eng_events.10')
    expect(eventRef?.delayDays).toBe(3)

    const focusRef = parsed[0]?.references.find((ref) => ref.type === 'focus')
    expect(focusRef?.targetId).toBe('ENG_focus_branch')

    const decisionRef = parsed[0]?.references.find((ref) => ref.type === 'decision')
    expect(decisionRef?.targetId).toBe('ENG_emergency_committee')

    const ideaRef = parsed[0]?.references.find((ref) => ref.type === 'idea')
    expect(ideaRef?.targetId).toBe('ENG_industrial_drive')
  })
})
