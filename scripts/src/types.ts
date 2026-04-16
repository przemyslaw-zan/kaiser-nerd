export interface EventReference {
  type: 'event' | 'focus' | 'decision' | 'scripted_effect'
  targetId: string
  delayDays?: number
  via: 'immediate' | 'option' | 'body'
}

export interface EventOption {
  index: number
  nameKey?: string
  name?: string
  effects: string[]
  effectTree?: EventEffectNode[]
  references: EventReference[]
}

export interface EventEffectNode {
  key: string
  value?: string
  children?: EventEffectNode[]
}

export interface EventDoc {
  id: string
  namespace: string
  sourceFile: string
  titleKey?: string
  descKey?: string
  title?: string
  description?: string
  immediateEffects: string[]
  options: EventOption[]
  references: EventReference[]
  incomingEventIds: string[]
}

export interface DataArtifact {
  version: string
  generatedAt: string
  stats: {
    events: number
    localizationEntries: number
    references: number
  }
  events: EventDoc[]
}
