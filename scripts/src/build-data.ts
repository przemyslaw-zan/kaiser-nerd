import fs from 'node:fs/promises'
import path from 'node:path'

import dotenv from 'dotenv'

import { getFilesRecursive } from './fs-utils.js'
import { parseLocalizationFiles } from './localization.js'
import { buildIncomingEventLinks, collectScriptedEffectNames, parseEventFile } from './paradox-parser.js'
import type { DataArtifact } from './types.js'

const ENV_SCHEMA_HINT = 'Expected KAISERREICH_PATH in .env to point at the Kaiserreich mod root.'

function requireEnvPath(): string {
  const { parsed } = dotenv.config({ path: '.env' })
  const value = parsed?.KAISERREICH_PATH.trim()

  if (!value) {
    throw new Error(`Missing KAISERREICH_PATH in .env. ${ENV_SCHEMA_HINT}`)
  }

  return value.replace(/^"|"$/g, '')
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

function sortArtifact(artifact: DataArtifact): DataArtifact {
  const sortedEvents = artifact.events
    .map((event) => ({
      ...event,
      references: [...event.references].sort((a, b) => {
        const byType = a.type.localeCompare(b.type)
        if (byType !== 0) {
          return byType
        }
        const byId = a.targetId.localeCompare(b.targetId)
        if (byId !== 0) {
          return byId
        }
        return (a.delayDays ?? -1) - (b.delayDays ?? -1)
      }),
      options: event.options.map((option) => ({
        ...option,
        effects: [...option.effects].sort((a, b) => a.localeCompare(b)),
        effectTree: option.effectTree,
        references: [...option.references].sort((a, b) => a.targetId.localeCompare(b.targetId)),
      })),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  return {
    ...artifact,
    events: sortedEvents,
  }
}

export async function buildArtifactFromPath(sourcePath: string): Promise<DataArtifact> {
  const eventsDir = path.join(sourcePath, 'events')
  const localizationDir = path.join(sourcePath, 'localisation', 'english')
  const scriptedEffectsDir = path.join(sourcePath, 'common', 'scripted_effects')

  const [eventFiles, localizationFiles, scriptedEffectFiles] = await Promise.all([
    getFilesRecursive(eventsDir, '.txt'),
    getFilesRecursive(localizationDir, '.yml'),
    getFilesRecursive(scriptedEffectsDir, '.txt').catch(() => []),
  ])

  const localization = await parseLocalizationFiles(localizationFiles)
  const scriptedEffectNames = await collectScriptedEffectNames(scriptedEffectFiles)

  const parsedEvents = await Promise.all(
    eventFiles.map((filePath) => parseEventFile(filePath, localization, scriptedEffectNames, sourcePath)),
  )

  const eventsWithIncoming = buildIncomingEventLinks(parsedEvents.flat())
  const totalReferences = eventsWithIncoming.reduce((sum, event) => sum + event.references.length, 0)

  return sortArtifact({
    version: '1',
    generatedAt: new Date().toISOString(),
    stats: {
      events: eventsWithIncoming.length,
      localizationEntries: localization.size,
      references: totalReferences,
    },
    events: eventsWithIncoming,
  })
}

async function main(): Promise<void> {
  const sourcePath = requireEnvPath()
  const sourceStats = await fs.stat(sourcePath).catch(() => null)
  if (!sourceStats?.isDirectory()) {
    throw new Error(`KAISERREICH_PATH is not a readable directory: ${sourcePath}`)
  }

  const artifact = await buildArtifactFromPath(sourcePath)
  const outputDir = path.join(process.cwd(), 'public', 'data')
  const outputPath = path.join(outputDir, 'events-index.json')

  await ensureDirectory(outputDir)
  await fs.writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')

  // Keep output compact and explicit for CI logs.
  console.log(`Generated ${String(artifact.events.length)} events with ${String(artifact.stats.references)} references.`)
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
