import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import dotenv from 'dotenv'

import { getArtifactFileContents, getArtifactFilePaths } from './artifact-files.js'
import {
  ARTIFACT_FAILURE_SIZE_MB,
  ARTIFACT_WARNING_SIZE_MB,
  formatArtifactSize,
  getArtifactFileSize,
  getArtifactSizeStatus,
} from './artifact-size.js'
import { parseDecisionFile } from './decision-parser.js'
import { parseNationalFocusFile } from './focus-parser.js'
import { getFilesRecursive } from './fs-utils.js'
import { parseIdeaFile } from './idea-parser.js'
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

  const sortedFocuses = artifact.focuses
    .map((focus) => ({
      ...focus,
      prerequisiteFocusIds: [...focus.prerequisiteFocusIds].sort((a, b) => a.localeCompare(b)),
      completionEffects: [...focus.completionEffects].sort((a, b) => a.localeCompare(b)),
      references: [...focus.references].sort((a, b) => {
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
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const sortedDecisions = artifact.decisions
    .map((decision) => ({
      ...decision,
      effects: [...decision.effects].sort((a, b) => a.localeCompare(b)),
      references: [...decision.references].sort((a, b) => {
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
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const sortedIdeas = artifact.ideas
    .map((idea) => ({
      ...idea,
      effects: [...idea.effects].sort((a, b) => a.localeCompare(b)),
      references: [...idea.references].sort((a, b) => {
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
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

  return {
    ...artifact,
    events: sortedEvents,
    focuses: sortedFocuses,
    decisions: sortedDecisions,
    ideas: sortedIdeas,
  }
}

export async function buildArtifactFromPath(sourcePath: string): Promise<DataArtifact> {
  const eventsDir = path.join(sourcePath, 'events')
  const nationalFocusesDir = path.join(sourcePath, 'common', 'national_focus')
  const decisionsDir = path.join(sourcePath, 'common', 'decisions')
  const ideasDir = path.join(sourcePath, 'common', 'ideas')
  const localizationDir = path.join(sourcePath, 'localisation', 'english')
  const scriptedEffectsDir = path.join(sourcePath, 'common', 'scripted_effects')

  const [eventFiles, focusFiles, decisionFiles, ideaFiles, localizationFiles, scriptedEffectFiles] = await Promise.all([
    getFilesRecursive(eventsDir, '.txt'),
    getFilesRecursive(nationalFocusesDir, '.txt').catch(() => []),
    getFilesRecursive(decisionsDir, '.txt').catch(() => []),
    getFilesRecursive(ideasDir, '.txt').catch(() => []),
    getFilesRecursive(localizationDir, '.yml'),
    getFilesRecursive(scriptedEffectsDir, '.txt').catch(() => []),
  ])

  const localization = await parseLocalizationFiles(localizationFiles)
  const scriptedEffectNames = await collectScriptedEffectNames(scriptedEffectFiles)

  const parsedEvents = await Promise.all(
    eventFiles.map((filePath) => parseEventFile(filePath, localization, scriptedEffectNames, sourcePath)),
  )
  const parsedFocuses = await Promise.all(
    focusFiles.map((filePath) => parseNationalFocusFile(filePath, localization, scriptedEffectNames, sourcePath)),
  )
  const parsedDecisions = await Promise.all(
    decisionFiles.map((filePath) => parseDecisionFile(filePath, localization, scriptedEffectNames, sourcePath)),
  )
  const parsedIdeas = await Promise.all(
    ideaFiles.map((filePath) => parseIdeaFile(filePath, localization, scriptedEffectNames, sourcePath)),
  )

  const eventsWithIncoming = buildIncomingEventLinks(parsedEvents.flat())
  const focusDocs = parsedFocuses.flat()
  const decisionDocs = parsedDecisions.flat()
  const ideaDocs = parsedIdeas.flat()
  const eventReferenceCount = eventsWithIncoming.reduce((sum, event) => sum + event.references.length, 0)
  const focusReferenceCount = focusDocs.reduce((sum, focus) => sum + focus.references.length, 0)
  const decisionReferenceCount = decisionDocs.reduce((sum, decision) => sum + decision.references.length, 0)
  const ideaReferenceCount = ideaDocs.reduce((sum, idea) => sum + idea.references.length, 0)
  const totalReferences = eventReferenceCount + focusReferenceCount + decisionReferenceCount + ideaReferenceCount

  return sortArtifact({
    version: '1',
    generatedAt: new Date().toISOString(),
    stats: {
      events: eventsWithIncoming.length,
      focuses: focusDocs.length,
      decisions: decisionDocs.length,
      ideas: ideaDocs.length,
      localizationEntries: localization.size,
      references: totalReferences,
    },
    events: eventsWithIncoming,
    focuses: focusDocs,
    decisions: decisionDocs,
    ideas: ideaDocs,
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
  const outputPaths = getArtifactFilePaths(process.cwd())
  const fileContents = getArtifactFileContents(artifact)

  await ensureDirectory(outputDir)
  await Promise.all(
    Object.entries(fileContents).map(([filename, content]) => fs.writeFile(outputPaths[filename], content, 'utf8')),
  )

  const fileSizes = await Promise.all(
    Object.keys(fileContents).map(async (filename) => {
      const filePath = outputPaths[filename]
      const sizeBytes = await getArtifactFileSize(filePath)
      return {
        filename,
        sizeBytes,
        sizeLabel: formatArtifactSize(sizeBytes),
        status: getArtifactSizeStatus(sizeBytes),
      }
    }),
  )

  const largestFile = fileSizes.reduce((largest, next) => (next.sizeBytes > largest.sizeBytes ? next : largest), fileSizes[0])

  // Keep output compact and explicit for CI logs.
  console.log(
    `Generated ${String(artifact.events.length)} events, ${String(artifact.focuses.length)} focuses, ${String(artifact.decisions.length)} decisions, and ${String(artifact.ideas.length)} ideas with ${String(artifact.stats.references)} references.`,
  )
  for (const fileSize of fileSizes) {
    console.log(`Wrote public/data/${fileSize.filename} (${fileSize.sizeLabel})`)
  }

  if (largestFile.status === 'failure') {
    console.warn(
      `Warning: largest artifact file (${largestFile.filename}) exceeds the ${String(ARTIFACT_FAILURE_SIZE_MB)}MB safety limit.`,
    )
  } else if (largestFile.status === 'warning') {
    console.warn(
      `Warning: largest artifact file (${largestFile.filename}) exceeds the ${String(ARTIFACT_WARNING_SIZE_MB)}MB warning threshold.`,
    )
  }
}

const isDirectExecution =
  typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
