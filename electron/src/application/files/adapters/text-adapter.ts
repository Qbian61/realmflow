import { extname } from 'node:path'
import { XMLValidator } from 'fast-xml-parser'
import { parse as parseToml } from 'smol-toml'
import { parseDocument } from 'yaml'

export class TextFileValidationError extends Error {
  readonly name = 'TextFileValidationError'
  readonly code = 'file_invalid_format'
}

export function validateTextFileContent(path: string, content: string): void {
  const extension = extname(path).toLowerCase()
  try {
    if (extension === '.json' || extension === '.jsonl') {
      validateJson(content, extension === '.jsonl')
    } else if (extension === '.yaml' || extension === '.yml') {
      const document = parseDocument(content)
      if (document.errors.length > 0) throw document.errors[0]
    } else if (extension === '.xml') {
      if (XMLValidator.validate(content) !== true) {
        throw new Error('invalid XML')
      }
    } else if (extension === '.toml') {
      parseToml(content)
    }
  } catch {
    throw new TextFileValidationError(
      `File content is invalid ${formatName(extension)}`
    )
  }
}

function validateJson(content: string, lines: boolean): void {
  if (!lines) {
    JSON.parse(content)
    return
  }
  const records = content.split(/\r?\n/).filter((line) => line.trim())
  for (const record of records) JSON.parse(record)
}

function formatName(extension: string): string {
  if (extension === '.yml' || extension === '.yaml') return 'YAML'
  return extension.slice(1).toUpperCase()
}
