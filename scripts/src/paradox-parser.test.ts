// @vitest-environment node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildIncomingEventLinks, parseEventFile } from './paradox-parser.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe('parseEventFile', () => {
  it('extracts event ids, options, and references', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'sample.txt')
    const content = `
country_event = {
  id = poland_events.5
  title = poland_events.5.t
  desc = poland_events.5.d
  complete_national_focus = POL_emergency
  option = {
    name = poland_events.5.a
    country_event = { id = poland_events.6 days = 2 }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['poland_events.5.t', 'The Emergency Session'],
      ['poland_events.5.d', 'Description'],
      ['poland_events.5.a', 'Approve decree'],
    ])

    const parsed = await parseEventFile(filePath, localization, new Set<string>(), tempDir)

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.id).toBe('poland_events.5')
    expect(parsed[0]?.title).toBe('The Emergency Session')
    expect(parsed[0]?.options[0]?.name).toBe('Approve decree')

    const eventRef = parsed[0]?.references.find((ref) => ref.type === 'event')
    expect(eventRef?.targetId).toBe('poland_events.6')
    expect(eventRef?.delayDays).toBe(2)
  })

  it('keeps immediate and option scopes separate', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'scope-test.txt')
    const content = `
country_event = {
  id = test_events.1
  title = test_events.1.t
  desc = test_events.1.d

  immediate = {
    add_stability = 0.05
    country_event = { id = test_events.2 days = 4 }
  }

  option = {
    name = test_events.1.a
    add_political_power = 25
    country_event = test_events.3
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['test_events.1.t', 'Test Event'],
      ['test_events.1.d', 'Description'],
      ['test_events.1.a', 'Choose option'],
    ])

    const parsed = await parseEventFile(filePath, localization, new Set<string>(), tempDir)
    expect(parsed).toHaveLength(1)

    const first = parsed[0]
    expect(first.immediateEffects).toContain('add_stability')
    expect(first.immediateEffects).not.toContain('add_political_power')
    const immediateNode = first.immediateEffectTree?.find((entry) => entry.key === 'add_stability')
    expect(immediateNode?.value).toBe('0.05')
    const immediateEventNode = first.immediateEffectTree?.find((entry) => entry.key === 'country_event')
    expect(immediateEventNode?.children?.find((entry) => entry.key === 'id')?.value).toBe('test_events.2')
    expect(immediateEventNode?.children?.find((entry) => entry.key === 'days')?.value).toBe('4')

    expect(first.options[0]?.effects).toContain('add_political_power')
    const powerNode = first.options[0]?.effectTree?.find((entry) => entry.key === 'add_political_power')
    expect(powerNode?.value).toBe('25')
    const eventNode = first.options[0]?.effectTree?.find((entry) => entry.key === 'country_event')
    expect(eventNode?.value).toBe('test_events.3')

    const immediateRef = first.references.find((ref) => ref.targetId === 'test_events.2')
    expect(immediateRef?.via).toBe('immediate')

    const optionRef = first.references.find((ref) => ref.targetId === 'test_events.3')
    expect(optionRef?.via).toBe('option')
  })

  it('does not include trigger keys as immediate effects', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'trigger-scope-test.txt')
    const content = `
country_event = {
  id = germany_easter_egg_events.1
  title = germany_easter_egg_events.1.t
  desc = germany_easter_egg_events.1.d

  immediate = {
    if = {
      limit = {
        GER_is_schleicher_path = yes
      }
      set_country_flag = GER_path_checked
    }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['germany_easter_egg_events.1.t', 'Test Event'],
      ['germany_easter_egg_events.1.d', 'Description'],
    ])

    const parsed = await parseEventFile(filePath, localization, new Set<string>(), tempDir)
    expect(parsed).toHaveLength(1)

    const first = parsed[0]
    expect(first.immediateEffects).toContain('set_country_flag')
    expect(first.immediateEffects).not.toContain('GER_is_schleicher_path')
  })

  it('does not include top-level trigger keys as immediate effects', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'root-trigger-scope-test.txt')
    const content = `
country_event = {
  id = germany_easter_egg_events.1
  title = germany_easter_egg_events.1.t
  desc = germany_easter_egg_events.1.d

  trigger = {
    GER_is_schleicher_path = yes
  }

  immediate = {
    set_country_flag = GER_path_checked
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['germany_easter_egg_events.1.t', 'Test Event'],
      ['germany_easter_egg_events.1.d', 'Description'],
    ])

    const parsed = await parseEventFile(filePath, localization, new Set<string>(), tempDir)
    expect(parsed).toHaveLength(1)

    const first = parsed[0]
    expect(first.immediateEffects).toContain('set_country_flag')
    expect(first.immediateEffects).not.toContain('GER_is_schleicher_path')
  })

  it('parses nested option effect objects recursively', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'nested-effect-tree-test.txt')
    const content = `
country_event = {
  id = nested_events.1
  title = nested_events.1.t
  desc = nested_events.1.d

  option = {
    name = nested_events.1.a
    add_popularity = {
      ideology = social_democrat
      popularity = 0.05
    }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['nested_events.1.t', 'Nested Event'],
      ['nested_events.1.d', 'Description'],
      ['nested_events.1.a', 'Option A'],
    ])

    const parsed = await parseEventFile(filePath, localization, new Set<string>(), tempDir)
    expect(parsed).toHaveLength(1)

    const popularityNode = parsed[0]?.options[0]?.effectTree?.find((entry) => entry.key === 'add_popularity')
    expect(popularityNode).toBeDefined()
    expect(popularityNode?.children?.find((entry) => entry.key === 'ideology')?.value).toBe('social_democrat')
    expect(popularityNode?.children?.find((entry) => entry.key === 'popularity')?.value).toBe('0.05')
  })

  it('parses nested immediate effect objects recursively', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kr-parser-'))
    tempDirs.push(tempDir)

    const filePath = path.join(tempDir, 'nested-immediate-effect-tree-test.txt')
    const content = `
country_event = {
  id = nested_events.2
  title = nested_events.2.t
  desc = nested_events.2.d

  immediate = {
    hidden_effect = {
      if = {
        limit = {
          has_government = democratic
        }
        country_event = {
          id = nested_events.3
          days = 5
        }
      }
    }
  }
}
`

    await fs.writeFile(filePath, content, 'utf8')

    const localization = new Map<string, string>([
      ['nested_events.2.t', 'Nested Immediate Event'],
      ['nested_events.2.d', 'Description'],
    ])

    const parsed = await parseEventFile(filePath, localization, new Set<string>(), tempDir)
    expect(parsed).toHaveLength(1)

    const hiddenEffectNode = parsed[0]?.immediateEffectTree?.find((entry) => entry.key === 'hidden_effect')
    expect(hiddenEffectNode).toBeDefined()
    const ifNode = hiddenEffectNode?.children?.find((entry) => entry.key === 'if')
    expect(ifNode).toBeDefined()
    const limitNode = ifNode?.children?.find((entry) => entry.key === 'limit')
    expect(limitNode?.children?.find((entry) => entry.key === 'has_government')?.value).toBe('democratic')
    const eventNode = ifNode?.children?.find((entry) => entry.key === 'country_event')
    expect(eventNode?.children?.find((entry) => entry.key === 'id')?.value).toBe('nested_events.3')
    expect(eventNode?.children?.find((entry) => entry.key === 'days')?.value).toBe('5')
  })

  it('builds incoming event links', () => {
    const items = buildIncomingEventLinks([
      {
        id: 'a.1',
        namespace: 'a',
        sourceFile: 'events/a.txt',
        immediateEffects: [],
        immediateEffectTree: [],
        options: [],
        references: [{ type: 'event', targetId: 'a.2', via: 'body' }],
        incomingEventIds: [],
      },
      {
        id: 'a.2',
        namespace: 'a',
        sourceFile: 'events/a.txt',
        immediateEffects: [],
        immediateEffectTree: [],
        options: [],
        references: [],
        incomingEventIds: [],
      },
    ])

    expect(items[1]?.incomingEventIds).toEqual(['a.1'])
  })
})
