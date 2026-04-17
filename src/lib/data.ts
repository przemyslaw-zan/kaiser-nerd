import type { DataArtifact } from '@/types/artifact'

interface EventSummary {
  id: string
  namespace: string
  sourceFile: string
  titleKey?: string
  descKey?: string
  title?: string
}

interface EventDetails {
  description?: string
  immediateEffects: string[]
  immediateEffectTree?: DataArtifact['events'][number]['immediateEffectTree']
  options: DataArtifact['events'][number]['options']
  references: DataArtifact['events'][number]['references']
  incomingEventIds: string[]
}

interface FocusSummary {
  id: string
  treeId?: string
  sourceFile: string
  titleKey?: string
  descKey?: string
  title?: string
}

interface FocusDetails {
  description?: string
  prerequisiteFocusIds: string[]
  prerequisiteFocusGroups?: string[][]
  completionEffects: string[]
  completionEffectTree?: DataArtifact['focuses'][number]['completionEffectTree']
  references: DataArtifact['focuses'][number]['references']
}

interface DecisionSummary {
  id: string
  categoryId: string
  sourceFile: string
  titleKey?: string
  descKey?: string
  title?: string
}

interface DecisionDetails {
  description?: string
  properties?: Record<string, string>
  effects: string[]
  effectTree?: DataArtifact['decisions'][number]['effectTree']
  references: DataArtifact['decisions'][number]['references']
}

interface IdeaSummary {
  id: string
  categoryId: string
  sourceFile: string
  titleKey?: string
  descKey?: string
  title?: string
}

interface IdeaDetails {
  description?: string
  properties?: Record<string, string>
  effects: string[]
  effectTree?: DataArtifact['ideas'][number]['effectTree']
  references: DataArtifact['ideas'][number]['references']
}

interface DataArtifactIndex {
  version: string
  generatedAt: string
  stats: Omit<DataArtifact['stats'], 'ideas'> & { ideas?: number }
  events: EventSummary[]
  focuses: FocusSummary[]
  decisions: DecisionSummary[]
  ideas?: IdeaSummary[]
}

type EventDetailsMap = Partial<Record<string, EventDetails>>
type FocusDetailsMap = Partial<Record<string, FocusDetails>>
type DecisionDetailsMap = Partial<Record<string, DecisionDetails>>
type IdeaDetailsMap = Partial<Record<string, IdeaDetails>>

async function loadJson<T>(relativePath: string): Promise<T> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${relativePath}`)
  if (!response.ok) {
    throw new Error(`Failed to load ${relativePath}: ${String(response.status)}`)
  }

  return (await response.json()) as T
}

export async function loadArtifact(): Promise<DataArtifact> {
  const [index, eventDetails, focusDetails, decisionDetails, ideaDetails] = await Promise.all([
    loadJson<DataArtifactIndex>('events-index.json'),
    loadJson<EventDetailsMap>('event-details.json'),
    loadJson<FocusDetailsMap>('focus-details.json'),
    loadJson<DecisionDetailsMap>('decision-details.json'),
    loadJson<IdeaDetailsMap>('idea-details.json').catch((): IdeaDetailsMap => ({})),
  ])

  return {
    version: index.version,
    generatedAt: index.generatedAt,
    stats: {
      ...index.stats,
      ideas: index.stats.ideas ?? index.ideas?.length ?? 0,
    },
    events: index.events.map((event) => {
      const details = eventDetails[event.id]
      return {
        ...event,
        description: details?.description,
        immediateEffects: details?.immediateEffects ?? [],
        immediateEffectTree: details?.immediateEffectTree,
        options: details?.options ?? [],
        references: details?.references ?? [],
        incomingEventIds: details?.incomingEventIds ?? [],
      }
    }),
    focuses: index.focuses.map((focus) => {
      const details = focusDetails[focus.id]
      return {
        ...focus,
        description: details?.description,
        prerequisiteFocusIds: details?.prerequisiteFocusIds ?? [],
        prerequisiteFocusGroups: details?.prerequisiteFocusGroups,
        completionEffects: details?.completionEffects ?? [],
        completionEffectTree: details?.completionEffectTree,
        references: details?.references ?? [],
      }
    }),
    decisions: index.decisions.map((decision) => {
      const details = decisionDetails[decision.id]
      return {
        ...decision,
        description: details?.description,
        properties: details?.properties,
        effects: details?.effects ?? [],
        effectTree: details?.effectTree,
        references: details?.references ?? [],
      }
    }),
    ideas: (index.ideas ?? []).map((idea) => {
      const details = ideaDetails[idea.id]
      return {
        ...idea,
        description: details?.description,
        properties: details?.properties,
        effects: details?.effects ?? [],
        effectTree: details?.effectTree,
        references: details?.references ?? [],
      }
    }),
  }
}
