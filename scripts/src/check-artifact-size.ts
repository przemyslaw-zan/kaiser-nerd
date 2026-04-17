import {
  ARTIFACT_FILENAMES,
  getArtifactFilePaths,
} from './artifact-files.js'
import {
  ARTIFACT_FAILURE_SIZE_MB,
  ARTIFACT_WARNING_SIZE_MB,
  formatArtifactSize,
  getArtifactFileSize,
  getArtifactSizeStatus,
} from './artifact-size.js'

async function main(): Promise<void> {
  const artifactPaths = getArtifactFilePaths(process.cwd())
  const fileSizes = await Promise.all(
    ARTIFACT_FILENAMES.map(async (filename) => {
      const sizeBytes = await getArtifactFileSize(artifactPaths[filename])
      return {
        filename,
        sizeBytes,
        sizeLabel: formatArtifactSize(sizeBytes),
        status: getArtifactSizeStatus(sizeBytes),
      }
    }),
  )

  const largestFile = fileSizes.reduce((largest, next) => (next.sizeBytes > largest.sizeBytes ? next : largest), fileSizes[0])

  for (const fileSize of fileSizes) {
    console.log(`Artifact file size: ${fileSize.filename} (${fileSize.sizeLabel})`)
  }

  if (largestFile.status === 'failure') {
    throw new Error(
      `Artifact file ${largestFile.filename} (${largestFile.sizeLabel}) exceeds the ${String(ARTIFACT_FAILURE_SIZE_MB)}MB safety limit. Split or reduce data before pushing.`,
    )
  }

  if (largestFile.status === 'warning') {
    console.warn(
      `Warning: largest artifact file exceeds the ${String(ARTIFACT_WARNING_SIZE_MB)}MB warning threshold and is trending toward GitHub's 100MB hard limit.`,
    )
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})