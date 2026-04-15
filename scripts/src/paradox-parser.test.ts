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

  it('builds incoming event links', () => {
    const items = buildIncomingEventLinks([
      {
        id: 'a.1',
        namespace: 'a',
        sourceFile: 'events/a.txt',
        immediateEffects: [],
        options: [],
        references: [{ type: 'event', targetId: 'a.2', via: 'body' }],
        incomingEventIds: [],
      },
      {
        id: 'a.2',
        namespace: 'a',
        sourceFile: 'events/a.txt',
        immediateEffects: [],
        options: [],
        references: [],
        incomingEventIds: [],
      },
    ])

    expect(items[1]?.incomingEventIds).toEqual(['a.1'])
  })
})
