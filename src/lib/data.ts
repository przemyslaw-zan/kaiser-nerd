import type { DataArtifact } from '@/types/artifact'

export async function loadArtifact(): Promise<DataArtifact> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/events-index.json`)
  if (!response.ok) {
    throw new Error(`Failed to load data artifact: ${String(response.status)}`)
  }

  return (await response.json()) as DataArtifact
}
