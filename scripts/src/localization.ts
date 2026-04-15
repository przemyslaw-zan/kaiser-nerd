import fs from 'node:fs/promises'

const LOCALIZATION_LINE_RE = /^\s*([^\s:#][^:]*):(?:\d+)?\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/

function decodeLocalizationValue(raw: string): string {
  return raw
    .replaceAll('\\"', '"')
    .replaceAll('\\n', '\n')
    .replaceAll('\\t', '\t')
}

export async function parseLocalizationFiles(filePaths: string[]): Promise<Map<string, string>> {
  const localization = new Map<string, string>()

  for (const filePath of filePaths) {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)

    for (const line of lines) {
      const match = LOCALIZATION_LINE_RE.exec(line)
      if (!match) {
        continue
      }

      const key = match[1].trim()
      const rawValue = match[2]
      if (!key) {
        continue
      }

      localization.set(key, decodeLocalizationValue(rawValue))
    }
  }

  return localization
}
