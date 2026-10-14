import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import type { ContextSource } from './context-snapshot'

export type ExtractedAttachmentContextSource = Pick<
  ContextSource,
  'kind' | 'id' | 'version' | 'documentKey' | 'checksum'
> & {
  content: string
}

export function mapExtractedAttachmentToContextSources(input: {
  path: string
  version: number
  bundle: ExtractedContentBundle
}): ExtractedAttachmentContextSource[] {
  return input.bundle.units.map((unit) => ({
    kind: 'attachment',
    id: `${input.path}#${unit.key}`,
    version: input.version,
    documentKey: unit.key,
    checksum: unit.checksum,
    content:
      `## Attachment: ${input.path}\n` +
      `### ${unit.title}\n${unit.text}\n\n`
  }))
}
