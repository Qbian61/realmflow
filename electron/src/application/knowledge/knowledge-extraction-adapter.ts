import type { ExtractedContentBundle } from '../../../../domain/content-extraction'
import type { FrozenKnowledgeSourceSnapshot } from './knowledge-index-coordinator'

export function mapExtractedBundleToKnowledgeDocuments(
  bundle: ExtractedContentBundle,
  sourceEntityId: string
): FrozenKnowledgeSourceSnapshot['documents'] {
  return bundle.units.map((unit) => ({
    documentKey: unit.key,
    sourceEntityId,
    title: unit.title,
    content: unit.text,
    checksum: unit.checksum,
    byteSize: unit.byteSize
  }))
}
