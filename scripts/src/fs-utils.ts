import fs from 'node:fs/promises'
import path from 'node:path'

export async function getFilesRecursive(rootDir: string, extension: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(rootDir, entry.name)
      if (entry.isDirectory()) {
        return getFilesRecursive(absolutePath, extension)
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(extension)) {
        return []
      }

      return [absolutePath]
    }),
  )

  return files.flat()
}

export function toPosixPath(filePath: string): string {
  return filePath.replaceAll('\\', '/')
}
