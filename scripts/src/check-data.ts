import fs from 'node:fs/promises'

import dotenv from 'dotenv'

import {
  ARTIFACT_FILENAMES,
  ARTIFACT_INDEX_FILE,
  type DataArtifactIndex,
  getArtifactFileContents,
  getArtifactFilePaths,
} from './artifact-files.js'
import {
  ARTIFACT_FAILURE_SIZE_MB,
  ARTIFACT_WARNING_SIZE_MB,
  formatArtifactSize,
  getArtifactFileSize,
  getArtifactSizeStatus,
} from './artifact-size.js'
import { buildArtifactFromPath } from './build-data.js'

async function main(): Promise<void> {
  const { parsed } = dotenv.config({ path: '.env' })
  const sourcePath = parsed?.KAISERREICH_PATH.replace(/^"|"$/g, '')
  if (!sourcePath) {
    throw new Error('Missing KAISERREICH_PATH in .env')
  }

  const artifactPaths = getArtifactFilePaths(process.cwd())
  const currentFiles = await Promise.all(
    ARTIFACT_FILENAMES.map(async (filename) => ({
      filename,
      content: await fs.readFile(artifactPaths[filename], 'utf8'),
    })),
  )

  const nextArtifact = await buildArtifactFromPath(sourcePath)
  const currentIndex = JSON.parse(currentFiles.find((file) => file.filename === ARTIFACT_INDEX_FILE)?.content ?? '{}') as
    | DataArtifactIndex
    | undefined
  if (currentIndex?.generatedAt) {
    nextArtifact.generatedAt = currentIndex.generatedAt
  }
  const nextFiles = getArtifactFileContents(nextArtifact)

  for (const currentFile of currentFiles) {
    if (currentFile.content !== nextFiles[currentFile.filename]) {
      throw new Error(
        `Data artifacts are stale. Run pnpm data:build and commit public/data/${currentFile.filename} and related artifact files.`,
      )
    }
  }

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

  if (largestFile.status === 'failure') {
    throw new Error(
      `Artifact file ${largestFile.filename} (${largestFile.sizeLabel}) exceeds the ${String(ARTIFACT_FAILURE_SIZE_MB)}MB safety limit. Split or reduce data before pushing.`,
    )
  }

  console.log(`Data artifacts are up to date. Largest file: ${largestFile.filename} (${largestFile.sizeLabel}).`)

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
