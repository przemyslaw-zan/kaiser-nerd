import path from 'node:path'

import type {
  DataArtifact,
  DecisionDoc,
  EventDoc,
  FocusDoc,
} from './types.js'

export const ARTIFACT_INDEX_FILE = 'events-index.json'
export const EVENT_DETAILS_FILE = 'event-details.json'
export const FOCUS_DETAILS_FILE = 'focus-details.json'
export const DECISION_DETAILS_FILE = 'decision-details.json'

export const ARTIFACT_FILENAMES = [
  ARTIFACT_INDEX_FILE,
  EVENT_DETAILS_FILE,
  FOCUS_DETAILS_FILE,
  DECISION_DETAILS_FILE,
] as const

export type EventSummary = Pick<EventDoc, 'id' | 'namespace' | 'sourceFile' | 'titleKey' | 'descKey' | 'title'>
export type EventDetails = Pick<
  EventDoc,
  'description' | 'immediateEffects' | 'immediateEffectTree' | 'options' | 'references' | 'incomingEventIds'
>

export type FocusSummary = Pick<FocusDoc, 'id' | 'treeId' | 'sourceFile' | 'titleKey' | 'descKey' | 'title'>
export type FocusDetails = Pick<
  FocusDoc,
  'description' | 'prerequisiteFocusIds' | 'prerequisiteFocusGroups' | 'completionEffects' | 'completionEffectTree' | 'references'
>

export type DecisionSummary = Pick<DecisionDoc, 'id' | 'categoryId' | 'sourceFile' | 'titleKey' | 'descKey' | 'title'>
export type DecisionDetails = Pick<DecisionDoc, 'description' | 'properties' | 'effects' | 'effectTree' | 'references'>

export interface DataArtifactIndex {
  version: string
  generatedAt: string
  stats: DataArtifact['stats']
  events: EventSummary[]
  focuses: FocusSummary[]
  decisions: DecisionSummary[]
}

export interface DataArtifactDetails {
  events: Record<string, EventDetails>
  focuses: Record<string, FocusDetails>
  decisions: Record<string, DecisionDetails>
}

export interface ArtifactSplit {
  index: DataArtifactIndex
  details: DataArtifactDetails
}

export function splitArtifact(artifact: DataArtifact): ArtifactSplit {
  const index: DataArtifactIndex = {
    version: artifact.version,
    generatedAt: artifact.generatedAt,
    stats: artifact.stats,
    events: artifact.events.map((event) => ({
      id: event.id,
      namespace: event.namespace,
      sourceFile: event.sourceFile,
      titleKey: event.titleKey,
      descKey: event.descKey,
      title: event.title,
    })),
    focuses: artifact.focuses.map((focus) => ({
      id: focus.id,
      treeId: focus.treeId,
      sourceFile: focus.sourceFile,
      titleKey: focus.titleKey,
      descKey: focus.descKey,
      title: focus.title,
    })),
    decisions: artifact.decisions.map((decision) => ({
      id: decision.id,
      categoryId: decision.categoryId,
      sourceFile: decision.sourceFile,
      titleKey: decision.titleKey,
      descKey: decision.descKey,
      title: decision.title,
    })),
  }

  const details: DataArtifactDetails = {
    events: Object.fromEntries(
      artifact.events.map((event) => [
        event.id,
        {
          description: event.description,
          immediateEffects: event.immediateEffects,
          immediateEffectTree: event.immediateEffectTree,
          options: event.options,
          references: event.references,
          incomingEventIds: event.incomingEventIds,
        },
      ]),
    ),
    focuses: Object.fromEntries(
      artifact.focuses.map((focus) => [
        focus.id,
        {
          description: focus.description,
          prerequisiteFocusIds: focus.prerequisiteFocusIds,
          prerequisiteFocusGroups: focus.prerequisiteFocusGroups,
          completionEffects: focus.completionEffects,
          completionEffectTree: focus.completionEffectTree,
          references: focus.references,
        },
      ]),
    ),
    decisions: Object.fromEntries(
      artifact.decisions.map((decision) => [
        decision.id,
        {
          description: decision.description,
          properties: decision.properties,
          effects: decision.effects,
          effectTree: decision.effectTree,
          references: decision.references,
        },
      ]),
    ),
  }

  return { index, details }
}

export function getArtifactFileContents(artifact: DataArtifact): Record<string, string> {
  const split = splitArtifact(artifact)
  return {
    [ARTIFACT_INDEX_FILE]: `${JSON.stringify(split.index)}\n`,
    [EVENT_DETAILS_FILE]: `${JSON.stringify(split.details.events)}\n`,
    [FOCUS_DETAILS_FILE]: `${JSON.stringify(split.details.focuses)}\n`,
    [DECISION_DETAILS_FILE]: `${JSON.stringify(split.details.decisions)}\n`,
  }
}

export function getArtifactFilePaths(rootDir: string): Record<string, string> {
  const dataDir = path.join(rootDir, 'public', 'data')
  return Object.fromEntries(ARTIFACT_FILENAMES.map((filename) => [filename, path.join(dataDir, filename)]))
}
