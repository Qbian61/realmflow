import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { CONTENT_EXTRACTION_LIMITS } from '../../../../domain/content-extraction'
import {
  isForcedRepositoryExclusion,
  repositorySnapshotDocumentKey
} from '../../../../domain/repository-source'
import type { WorkspaceRepository } from '../ports/business-repositories'
import { SecurePathService } from '../../workspace/secure-path-service'
import type { LocalFileIngestionStore } from './local-file-ingestion-store'
import type { OnlineDocumentStore } from './online-document-store'
import type { RepositoryIngestionStore } from './repository-ingestion-store'
import type { FrozenKnowledgeSourceSnapshot } from './knowledge-index-coordinator'
import { mapExtractedBundleToKnowledgeDocuments } from './knowledge-extraction-adapter'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'

type SourceLookup = {
  get: (id: string) => Promise<
    | {
        id: string
        workspaceId: string
        name: string
        type: 'file' | 'document' | 'repository'
        revision: number
      }
    | undefined
  >
}

type ArtifactLookup = {
  getKnowledgeArtifact: (id: string) => Promise<
    | {
        artifact: {
          id: string
          requirementId: string
          nodeId: string
          relativePath: string
          checksum: string
          mediaType?: string
          version: number
          formal: boolean
        }
        workspaceId: string
      }
    | undefined
  >
  readSource: (artifact: {
    id: string
    requirementId: string
    nodeId: string
    relativePath: string
    checksum: string
    mediaType?: string
    version: number
    formal: boolean
  }) => Promise<{
    bytes: Uint8Array
    fileName: string
    mimeType?: string
  }>
}

type RequirementMemoryLookup = {
  getCurrent: (requirementId: string) => Promise<
    | {
        requirementId: string
        workspaceId: string
        completionVersion: number
        title: string
        content: string
        checksum: string
      }
    | undefined
  >
}

type KnowledgeNoteLookup = {
  get: (id: string) => Promise<
    | {
        note: {
          id: string
          workspaceId: string
          kind: 'conversation_note' | 'decision' | 'retrospective'
          requirementId?: string
          sessionId?: string
          currentVersion: number
          revision: number
          status: 'active' | 'archived'
        }
        currentVersion: {
          version: number
          title: string
          content: string
          checksum: string
        }
      }
    | undefined
  >
}

export type KnowledgeSourceIdentity = Pick<
  FrozenKnowledgeSourceSnapshot,
  | 'scopeKind'
  | 'scopeId'
  | 'sourceKind'
  | 'sourceId'
  | 'sourceRevision'
  | 'sourceVersion'
  | 'sourceChecksum'
>

export class MainKnowledgeIndexSourceReader {
  private readonly securePaths = new SecurePathService()

  constructor(
    private readonly dependencies: {
      sources: SourceLookup
      localFiles: LocalFileIngestionStore
      onlineDocuments: OnlineDocumentStore
      repositories: RepositoryIngestionStore
      workspaces: WorkspaceRepository
      artifacts?: ArtifactLookup
      requirementMemories?: RequirementMemoryLookup
      knowledgeNotes?: KnowledgeNoteLookup
      contentExtractor?: Pick<LocalContentExtractionService, 'extract'>
    }
  ) {}

  async readCurrent(
    sourceId: string
  ): Promise<FrozenKnowledgeSourceSnapshot> {
    const source = await this.dependencies.sources.get(sourceId)
    if (!source) throw new Error('Knowledge source not found')
    if (source.type === 'document') {
      const snapshot =
        await this.dependencies.onlineDocuments.getCurrentOnlineDocumentSnapshot(
          sourceId
        )
      if (!snapshot) throw new Error('Knowledge source has no current content')
      return {
        scopeKind: 'workspace',
        scopeId: source.workspaceId,
        sourceKind: source.type,
        sourceId,
        sourceRevision: source.revision,
        sourceVersion: `document:${snapshot.version}`,
        sourceChecksum: snapshot.contentChecksum,
        documents: snapshot.documents.map((document) => ({
          documentKey: document.unitKey,
          sourceEntityId: sourceId,
          title: document.title,
          content: document.content,
          checksum: document.checksum,
          byteSize: document.byteSize
        }))
      }
    }
    if (source.type === 'repository') {
      const snapshot =
        await this.dependencies.repositories.getCurrentRepositorySnapshot(sourceId)
      if (!snapshot) throw new Error('Knowledge source has no current content')
      return {
        scopeKind: 'workspace',
        scopeId: source.workspaceId,
        sourceKind: source.type,
        sourceId,
        sourceRevision: source.revision,
        sourceVersion: `repository:${snapshot.version}`,
        sourceChecksum: snapshot.manifestChecksum,
        documents: snapshot.documents
          .filter(
            (document) =>
              !isForcedRepositoryExclusion(document.sourcePath)
          )
          .map((document) => ({
            documentKey: repositorySnapshotDocumentKey(document),
            sourceEntityId: sourceId,
            title: document.title,
            content: document.content,
            checksum: document.checksum,
            byteSize: document.byteSize
          }))
      }
    }
    const local = await this.dependencies.localFiles.getLocalFileSource(sourceId)
    if (!local) throw new Error('Knowledge source has no current content')
    const path =
      local.storageMode === 'external_reference'
        ? (await this.securePaths.resolveExistingPath(
            await this.securePaths.canonicalizeDirectory(
              local.originalPath.replace(/[/\\][^/\\]+$/, '')
            ),
            local.originalPath.split(/[/\\]/).at(-1)!
          )).targetPath
        : await this.managedPath(local.workspaceId, local.managedRelativePath!)
    const before = await stat(path)
    const bytes = await readFile(path)
    const after = await stat(path)
    const contentChecksum = checksum(bytes)
    if (
      !before.isFile() ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      contentChecksum !== local.contentChecksum
    ) {
      throw new Error('Knowledge source changed during indexing')
    }
    const documents = this.dependencies.contentExtractor
      ? mapExtractedBundleToKnowledgeDocuments(
          await this.dependencies.contentExtractor.extract({
            bytes,
            fileName: basename(path),
            sourceChecksum: contentChecksum,
            policy: {
              consumer: 'knowledge_index',
              allowLocalOcr: true,
              allowLocalConversion: true,
              maxCharacters:
                CONTENT_EXTRACTION_LIMITS.maxExtractedCharacters,
              maxUnits: CONTENT_EXTRACTION_LIMITS.maxArchiveEntries
            },
            signal: new AbortController().signal,
            depth: 0
          }),
          sourceId
        )
      : [
          {
            documentKey: 'content',
            sourceEntityId: sourceId,
            title: source.name,
            content: decodeLocalFileContent(bytes)
          }
        ]
    return {
      scopeKind: 'workspace',
      scopeId: source.workspaceId,
      sourceKind: source.type,
      sourceId,
      sourceRevision: source.revision,
      sourceVersion: `file:${contentChecksum}`,
      sourceChecksum: contentChecksum,
      documents
    }
  }

  async readCurrentIdentity(
    sourceId: string
  ): Promise<KnowledgeSourceIdentity> {
    const source = await this.dependencies.sources.get(sourceId)
    if (!source) throw new Error('Knowledge source not found')
    if (source.type === 'document') {
      const snapshot =
        await this.dependencies.onlineDocuments.getCurrentOnlineDocumentSnapshot(
          sourceId
        )
      if (!snapshot) throw new Error('Knowledge source has no current content')
      return {
        scopeKind: 'workspace',
        scopeId: source.workspaceId,
        sourceKind: source.type,
        sourceId,
        sourceRevision: source.revision,
        sourceVersion: `document:${snapshot.version}`,
        sourceChecksum: snapshot.contentChecksum
      }
    }
    if (source.type === 'repository') {
      const snapshot =
        await this.dependencies.repositories.getCurrentRepositorySnapshot(sourceId)
      if (!snapshot) throw new Error('Knowledge source has no current content')
      return {
        scopeKind: 'workspace',
        scopeId: source.workspaceId,
        sourceKind: source.type,
        sourceId,
        sourceRevision: source.revision,
        sourceVersion: `repository:${snapshot.version}`,
        sourceChecksum: snapshot.manifestChecksum
      }
    }
    const local = await this.dependencies.localFiles.getLocalFileSource(sourceId)
    if (!local) throw new Error('Knowledge source has no current content')
    return {
      scopeKind: 'workspace',
      scopeId: source.workspaceId,
      sourceKind: source.type,
      sourceId,
      sourceRevision: source.revision,
      sourceVersion: `file:${local.contentChecksum}`,
      sourceChecksum: local.contentChecksum
    }
  }

  async hasCurrentDocument(
    sourceId: string,
    documentKey: string
  ): Promise<boolean> {
    const source = await this.dependencies.sources.get(sourceId)
    if (!source || source.type !== 'repository') return false
    const snapshot =
      await this.dependencies.repositories.getCurrentRepositorySnapshot(sourceId)
    return (
      snapshot?.documents.some(
        (document) =>
          repositorySnapshotDocumentKey(document) === documentKey
      ) === true
    )
  }

  async readFrozen(input: {
    sourceId: string
    sourceKind?: string
  }): Promise<FrozenKnowledgeSourceSnapshot> {
    if (input.sourceKind === 'artifact') {
      return this.readArtifact(input.sourceId)
    }
    if (input.sourceKind === 'requirement_memory') {
      return this.readRequirementMemory(input.sourceId)
    }
    if (
      input.sourceKind === 'conversation_note' ||
      input.sourceKind === 'decision' ||
      input.sourceKind === 'retrospective'
    ) {
      return this.readKnowledgeNote(input.sourceId, input.sourceKind)
    }
    return this.readCurrent(input.sourceId)
  }

  async isCurrent(
    snapshot: Pick<
      FrozenKnowledgeSourceSnapshot,
      | 'sourceId'
      | 'sourceKind'
      | 'sourceRevision'
      | 'sourceVersion'
      | 'sourceChecksum'
    >
  ): Promise<boolean> {
    try {
      const current = await this.readFrozen(snapshot)
      return (
        current.sourceRevision === snapshot.sourceRevision &&
        current.sourceVersion === snapshot.sourceVersion &&
        current.sourceChecksum === snapshot.sourceChecksum
      )
    } catch {
      return false
    }
  }

  private async managedPath(
    workspaceId: string,
    relativePath: string
  ): Promise<string> {
    const workspace = await this.dependencies.workspaces.get(workspaceId)
    if (!workspace) throw new Error('Workspace not found')
    const rootPath = workspace.rootPath?.trim()
    if (!rootPath) throw new Error('Workspace root is not configured')
    return (
      await this.securePaths.resolveExistingPath(rootPath, relativePath)
    ).targetPath
  }

  private async readArtifact(
    artifactId: string
  ): Promise<FrozenKnowledgeSourceSnapshot> {
    const lookup = this.dependencies.artifacts
    if (!lookup) throw new Error('Artifact knowledge reader is unavailable')
    const current = await lookup.getKnowledgeArtifact(artifactId)
    if (!current?.artifact.formal) {
      throw new Error('Knowledge artifact is not current')
    }
    const source = await lookup.readSource(current.artifact)
    if (checksum(source.bytes) !== current.artifact.checksum) {
      throw new Error('Knowledge artifact changed during indexing')
    }
    const contentExtractor = this.dependencies.contentExtractor
    if (!contentExtractor) {
      throw new Error('Artifact content extraction is unavailable')
    }
    const bundle = await contentExtractor.extract({
      bytes: source.bytes,
      fileName: source.fileName,
      ...(source.mimeType ? { mimeType: source.mimeType } : {}),
      sourceChecksum: current.artifact.checksum,
      policy: {
        consumer: 'artifact_sync',
        allowLocalOcr: true,
        allowLocalConversion: true,
        maxCharacters: CONTENT_EXTRACTION_LIMITS.maxExtractedCharacters,
        maxUnits: CONTENT_EXTRACTION_LIMITS.maxArchiveEntries
      },
      signal: new AbortController().signal,
      depth: 0
    })
    return {
      scopeKind: 'workspace',
      scopeId: current.workspaceId,
      sourceKind: 'artifact',
      sourceId: current.artifact.id,
      sourceRevision: current.artifact.version,
      sourceVersion: `artifact:${current.artifact.version}`,
      sourceChecksum: current.artifact.checksum,
      documents: mapExtractedBundleToKnowledgeDocuments(
        bundle,
        current.artifact.id
      )
    }
  }

  private async readRequirementMemory(
    requirementId: string
  ): Promise<FrozenKnowledgeSourceSnapshot> {
    const current =
      await this.dependencies.requirementMemories?.getCurrent(requirementId)
    if (!current) throw new Error('Requirement Memory is not current')
    return {
      scopeKind: 'workspace',
      scopeId: current.workspaceId,
      sourceKind: 'requirement_memory',
      sourceId: current.requirementId,
      sourceRevision: current.completionVersion,
      sourceVersion: `requirement-memory:${current.completionVersion}`,
      sourceChecksum: current.checksum,
      documents: [
        {
          documentKey: 'requirement-memory.md',
          sourceEntityId: current.requirementId,
          requirementId: current.requirementId,
          title: current.title,
          content: current.content
        }
      ]
    }
  }

  private async readKnowledgeNote(
    noteId: string,
    sourceKind: 'conversation_note' | 'decision' | 'retrospective'
  ): Promise<FrozenKnowledgeSourceSnapshot> {
    const current = await this.dependencies.knowledgeNotes?.get(noteId)
    if (
      !current ||
      current.note.status !== 'active' ||
      current.note.kind !== sourceKind
    ) {
      throw new Error('Knowledge Note is not current')
    }
    return {
      scopeKind: 'workspace',
      scopeId: current.note.workspaceId,
      sourceKind,
      sourceId: current.note.id,
      sourceRevision: current.note.revision,
      sourceVersion: `knowledge-note:${current.currentVersion.version}`,
      sourceChecksum: current.currentVersion.checksum,
      documents: [
        {
          documentKey: 'knowledge-note.md',
          sourceEntityId: current.note.id,
          ...(current.note.requirementId
            ? { requirementId: current.note.requirementId }
            : {}),
          ...(current.note.sessionId
            ? { sessionId: current.note.sessionId }
            : {}),
          title: current.currentVersion.title,
          content: current.currentVersion.content
        }
      ]
    }
  }
}

function checksum(content: Uint8Array): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function decodeLocalFileContent(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw Object.assign(
      new Error('Knowledge source format is unsupported'),
      { code: 'unsupported_format' as const }
    )
  }
}
