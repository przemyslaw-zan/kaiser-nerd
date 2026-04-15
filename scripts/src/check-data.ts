import fs from 'node:fs/promises'
import path from 'node:path'

import dotenv from 'dotenv'

import { buildArtifactFromPath } from './build-data.js'

async function main(): Promise<void> {
  const { parsed } = dotenv.config({ path: '.env' })
  const sourcePath = parsed?.KAISERREICH_PATH.replace(/^"|"$/g, '')
  if (!sourcePath) {
    throw new Error('Missing KAISERREICH_PATH in .env')
  }

  const expectedPath = path.join(process.cwd(), 'public', 'data', 'events-index.json')
  const currentFile = await fs.readFile(expectedPath, 'utf8')
  const nextArtifact = await buildArtifactFromPath(sourcePath)
  const nextFile = `${JSON.stringify(nextArtifact, null, 2)}\n`

  if (currentFile !== nextFile) {
    throw new Error('Data artifact is stale. Run pnpm data:build and commit public/data/events-index.json.')
  }

  console.log('Data artifact is up to date.')
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
