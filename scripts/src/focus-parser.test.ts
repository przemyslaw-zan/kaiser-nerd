// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseNationalFocusFile } from './focus-parser.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe('parseNationalFocusFile', () => {
  it('extracts focus ids, completion effects, and references', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-focus-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'PAL focus (Jerusalem).txt')
    const content = `
focus_tree = {
  id = PAL_focus_tree

  focus = {
    id = PAL_secure_jerusalem
    prerequisite = { focus = PAL_start }
    completion_reward = {
      add_stability = 0.05
      country_event = { id = palestine_events.1 days = 2 }
      complete_national_focus = PAL_follow_up
    }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['PAL_secure_jerusalem', 'Secure Jerusalem'],
      ['PAL_secure_jerusalem_desc', 'The city must be stabilized.'],
    ])

    const parsed = await parseNationalFocusFile(filePath, localization, new Set<string>(), tempDir)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.id).toBe('PAL_secure_jerusalem')
    expect(parsed[0]?.treeId).toBe('PAL_focus_tree')
    expect(parsed[0]?.title).toBe('Secure Jerusalem')
    expect(parsed[0]?.description).toBe('The city must be stabilized.')
    expect(parsed[0]?.prerequisiteFocusIds).toEqual(['PAL_start'])
    expect(parsed[0]?.prerequisiteFocusGroups).toEqual([['PAL_start']])
    expect(parsed[0]?.completionEffects).toContain('add_stability')

    const eventRef = parsed[0]?.references.find((ref) => ref.type === 'event')
    expect(eventRef?.targetId).toBe('palestine_events.1')
    expect(eventRef?.delayDays).toBe(2)

    const focusRef = parsed[0]?.references.find((ref) => ref.type === 'focus')
    expect(focusRef?.targetId).toBe('PAL_follow_up')
  })

  it('parses prerequisite blocks as OR groups and AND across groups', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-focus-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'POL grouped prereq.txt')
    const content = `
focus_tree = {
  id = POL_focus_tree

  focus = {
    id = POL_joint_prereq_focus
    prerequisite = {
      focus = POL_Loans_From_Foreign_Banks
      focus = POL_Nationalise_The_Bank_Of_Poland
    }
    prerequisite = {
      focus = POL_Marketplace_of_Mitteleuropa
      focus = POL_The_Statist_Approach
    }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const parsed = await parseNationalFocusFile(filePath, new Map<string, string>(), new Set<string>(), tempDir)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.prerequisiteFocusGroups).toEqual([
      ['POL_Loans_From_Foreign_Banks', 'POL_Nationalise_The_Bank_Of_Poland'],
      ['POL_Marketplace_of_Mitteleuropa', 'POL_The_Statist_Approach'],
    ])
    expect(parsed[0]?.prerequisiteFocusIds).toEqual([
      'POL_Loans_From_Foreign_Banks',
      'POL_Marketplace_of_Mitteleuropa',
      'POL_Nationalise_The_Bank_Of_Poland',
      'POL_The_Statist_Approach',
    ])
  })
})
