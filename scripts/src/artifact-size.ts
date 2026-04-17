import fs from 'node:fs/promises'

export const ARTIFACT_WARNING_SIZE_MB = 50
export const ARTIFACT_FAILURE_SIZE_MB = 90

const BYTES_PER_MEGABYTE = 1024 * 1024

export type ArtifactSizeStatus = 'ok' | 'warning' | 'failure'

export function getArtifactSizeMegabytes(sizeBytes: number): number {
  return sizeBytes / BYTES_PER_MEGABYTE
}

export function formatArtifactSize(sizeBytes: number): string {
  return `${getArtifactSizeMegabytes(sizeBytes).toFixed(1)}MB`
}

export async function getArtifactFileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath)
  return stats.size
}

export function getArtifactSizeStatus(sizeBytes: number): ArtifactSizeStatus {
  const sizeMegabytes = getArtifactSizeMegabytes(sizeBytes)

  if (sizeMegabytes >= ARTIFACT_FAILURE_SIZE_MB) {
    return 'failure'
  }

  if (sizeMegabytes >= ARTIFACT_WARNING_SIZE_MB) {
    return 'warning'
  }

  return 'ok'
}

export function getArtifactSizeMessage(sizeBytes: number): string {
  const sizeLabel = formatArtifactSize(sizeBytes)
  const status = getArtifactSizeStatus(sizeBytes)

  if (status === 'failure') {
    return `Artifact size ${sizeLabel} exceeds the ${String(ARTIFACT_FAILURE_SIZE_MB)}MB safety limit.`
  }

  if (status === 'warning') {
    return `Artifact size ${sizeLabel} exceeds the ${String(ARTIFACT_WARNING_SIZE_MB)}MB warning threshold.`
  }

  return `Artifact size ${sizeLabel} is within the configured budget.`
}