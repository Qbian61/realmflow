import { createHash } from 'node:crypto'
import {
  BuiltinToolAdapter,
  type BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  createFileToolHandlers,
  type FileToolDependencies
} from './builtin-file-tool-handlers'
import { createDocumentToolHandlers } from './builtin-document-tool-handlers'
import type { LocalContentExtractionService } from '../content-extraction/local-content-extraction-service'
import type { DocumentDeliveryService } from '../files/document-delivery-service'
import type { PdfGenerationService } from '../files/pdf-generation-service'
import type { LocalSpreadsheetSessionService } from '../files/local-spreadsheet-session-service'
import { createSpreadsheetToolHandlers } from './builtin-spreadsheet-tool-handlers'
import type { LocalWordSessionService } from '../files/local-word-session-service'
import { createWordToolHandlers } from './builtin-word-tool-handlers'
import type { LocalImageSessionService } from '../files/local-image-session-service'
import { createImageToolHandlers } from './builtin-image-tool-handlers'
import type { LocalPdfSessionService } from '../files/local-pdf-session-service'
import { createPdfToolHandlers } from './builtin-pdf-tool-handlers'
import type { LocalPresentationSessionService } from '../files/local-presentation-session-service'
import { createPresentationToolHandlers } from './builtin-presentation-tool-handlers'
import type { LegacyOfficeImportService } from '../files/legacy-office-import-service'
import { createLegacyOfficeToolHandlers } from './builtin-legacy-office-tool-handlers'
import type { OfficeSafeCopyService } from '../files/office-safe-copy-service'
import { createOfficeSafeCopyToolHandlers } from './builtin-office-safe-copy-tool-handlers'
import type { OfficeReadOnlySessionService } from '../files/office-read-only-session-service'
import { createOfficeReadOnlyToolHandlers } from './builtin-office-read-only-tool-handlers'
import type { ArchiveService } from '../files/archive-service'
import { createArchiveToolHandlers } from './builtin-archive-tool-handlers'
import type { FixedLayoutService } from '../files/fixed-layout-service'
import { createFixedLayoutToolHandlers } from './builtin-fixed-layout-tool-handlers'
import {
  createGitToolHandlers,
  type GitCommandPort
} from './builtin-git-tool-handlers'
import { GitCommandRepositoryResolver } from './git-repository-resolver'
import {
  createProcessToolHandlers,
  type ManagedProcessPort
} from './builtin-process-tool-handlers'
import { createWebToolHandlers } from './builtin-web-tool-handlers'
import { WebProviderRuntime } from '../web/web-provider-runtime'
import type { WebProviderConfigurationService } from '../web/web-provider-configuration-service'
import { createBrowserToolHandlers } from './builtin-browser-tool-handlers'
import type { BrowserToolRuntimePort } from '../browser/browser-runtime-port'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type { ToolSessionFamily } from './tool-effect-planner'

export const APPLICATION_TOOL_HANDLER_NAMES = [
  'realmflow.spaces.list',
  'realmflow.requirements.list',
  'realmflow.requirements.get',
  'realmflow.workflow.get_execution',
  'realmflow.node.answer_question',
  'realmflow.node.decide_approval',
  'realmflow.node.todo.manage',
  'realmflow.artifacts.list',
  'realmflow.artifacts.read',
  'knowledge.search',
  'knowledge.source.read',
  'knowledge.note.create',
  'knowledge.note.edit',
  'knowledge.index.refresh',
  'attachment.read_chunk'
] as const

export type ApplicationToolHandlerName =
  (typeof APPLICATION_TOOL_HANDLER_NAMES)[number]

const CONTEXT_ARGUMENT_KEYS = [
  'workspaceId',
  'requirementId',
  'nodeRunId',
  'conversationId',
  'scheduleRunId'
] as const

export type BuiltinToolRuntimeDependencies = {
  protectedRoots?: readonly string[]
  browser?: BrowserToolRuntimePort
  resolveSessionPath?: (
    family: ToolSessionFamily,
    sessionId: string
  ) => Promise<string> | string
  files: FileToolDependencies
  documents: {
    extractor: Pick<LocalContentExtractionService, 'extract'>
    delivery: Pick<DocumentDeliveryService, 'create' | 'exportPdf' | 'verify'>
    pdfGeneration?: Pick<PdfGenerationService, 'generate'>
  }
  spreadsheets: {
    sessions: Pick<
      LocalSpreadsheetSessionService,
      'open' | 'execute' | 'save'
    >
  }
  wordDocuments: {
    sessions: Pick<LocalWordSessionService, 'open' | 'execute' | 'save'>
  }
  images: {
    sessions: Pick<
      LocalImageSessionService,
      'open' | 'transform' | 'ocr' | 'save'
    >
  }
  pdf: {
    sessions: Pick<
      LocalPdfSessionService,
      'open' | 'thumbnail' | 'ocr' | 'mutate' | 'save' | 'exportRevision'
    >
    pdfGeneration?: Pick<PdfGenerationService, 'generate'>
  }
  presentations: {
    sessions: Pick<
      LocalPresentationSessionService,
      'open' | 'execute' | 'save'
    >
  }
  legacyOffice: {
    importer: Pick<LegacyOfficeImportService, 'import'>
  }
  officeSafeCopy: {
    safeCopy: Pick<OfficeSafeCopyService, 'create'>
  }
  officeReadOnly: {
    sessions: Pick<OfficeReadOnlySessionService, 'open'>
  }
  archives: {
    archives: Pick<ArchiveService, 'list' | 'extract' | 'create'>
  }
  fixedLayout: {
    fixedLayout: Pick<FixedLayoutService, 'inspect' | 'ocr'>
  }
  git: GitCommandPort
  processes: ManagedProcessPort
  web?: Pick<WebProviderConfigurationService, 'get' | 'resolveCredential'>
  application: Record<
    ApplicationToolHandlerName,
    (input: BuiltinToolHandlerInput) => Promise<unknown>
  >
}

export function createBuiltinToolAdapter(
  dependencies: BuiltinToolRuntimeDependencies
): BuiltinToolAdapter {
  const gitRepositoryResolver = new GitCommandRepositoryResolver(
    dependencies.git
  )
  const applicationHandlers = APPLICATION_TOOL_HANDLER_NAMES.map((name) => ({
    name,
    version: '1.0.0',
    execute: async (input: BuiltinToolHandlerInput) =>
      normalizeJsonObject(
        await dependencies.application[name](
          scopedApplicationInput(name, input)
        )
      )
  }))
  return new BuiltinToolAdapter(
    [
      ...createFileToolHandlers(dependencies.files),
      ...createDocumentToolHandlers(dependencies.documents),
      ...createWordToolHandlers(dependencies.wordDocuments),
      ...createSpreadsheetToolHandlers(dependencies.spreadsheets),
      ...createImageToolHandlers(dependencies.images),
      ...createPdfToolHandlers(dependencies.pdf),
      ...createPresentationToolHandlers(dependencies.presentations),
      ...createLegacyOfficeToolHandlers(dependencies.legacyOffice),
      ...createOfficeSafeCopyToolHandlers(dependencies.officeSafeCopy),
      ...createOfficeReadOnlyToolHandlers(dependencies.officeReadOnly),
      ...createArchiveToolHandlers(dependencies.archives),
      ...createFixedLayoutToolHandlers(dependencies.fixedLayout),
      ...createGitToolHandlers(dependencies.git, gitRepositoryResolver),
      ...createProcessToolHandlers(dependencies.processes),
      ...createBrowserToolHandlers(dependencies.browser),
      ...createWebToolHandlers(
        new WebProviderRuntime({
          resolveCredential: dependencies.web
            ? (handle, revision) =>
                dependencies.web!.resolveCredential(handle, revision)
            : undefined
        })
      ),
      ...applicationHandlers
    ],
    {
      protectedRoots: dependencies.protectedRoots,
      gitRepositoryResolver,
      resolveSessionPath: dependencies.resolveSessionPath,
      ...(dependencies.processes.describeManaged ? {
        managedProcesses: { describeManaged: input => dependencies.processes.describeManaged!(input) }
      } : {}),
      ...(dependencies.browser?.describe ? {
        browser: { describe: (id, action, args, call) => {
          if (!call) throw new Error('Browser execution context unavailable')
          return dependencies.browser!.describe!(id, action, args, call)
        } }
      } : {}),
      ...(dependencies.processes.describe ? {
        processIsolation: { describe: input => dependencies.processes.describe!(input) }
      } : {}),
      webConfiguration: dependencies.web
    }
  )
}

function scopedApplicationInput(
  name: ApplicationToolHandlerName,
  input: BuiltinToolHandlerInput
): BuiltinToolHandlerInput {
  const modelArguments = { ...input.arguments }
  for (const key of CONTEXT_ARGUMENT_KEYS) delete modelArguments[key]
  if (name === 'knowledge.note.create') {
    return knowledgeNoteCreateInput(input, modelArguments)
  }
  if (name === 'knowledge.note.edit') {
    return knowledgeNoteEditInput(input, modelArguments)
  }
  const scopedInput = {
    ...input,
    arguments: {
      ...modelArguments,
      ...(input.context.workspaceId
        ? { workspaceId: input.context.workspaceId }
        : {}),
      ...(input.context.requirementId
        ? { requirementId: input.context.requirementId }
        : {}),
      ...(input.context.nodeRunId
        ? { nodeRunId: input.context.nodeRunId }
        : {}),
      ...(input.context.conversationId
        ? { conversationId: input.context.conversationId }
        : {}),
      ...(input.context.scheduleRunId
        ? { scheduleRunId: input.context.scheduleRunId }
        : {})
    }
  }
  if (
    name !== 'knowledge.search' &&
    name !== 'knowledge.source.read'
  ) {
    return scopedInput
  }
  if (!input.context.workspaceId) {
    throw new Error('Knowledge Tool workspace is unavailable')
  }
  if (name === 'knowledge.source.read') return scopedInput
  return {
    ...input,
    arguments: {
      ...knowledgeSearchModelArguments(modelArguments),
      scope: {
        kind: 'workspace',
        workspaceId: input.context.workspaceId
      },
      ...(input.context.requirementId
        ? { requirementId: input.context.requirementId }
        : {})
    }
  }
}

function knowledgeNoteCreateInput(
  input: BuiltinToolHandlerInput,
  args: JsonObject
): BuiltinToolHandlerInput {
  if (
    !input.context.workspaceId ||
    !input.context.conversationId ||
    input.context.scheduleRunId
  ) {
    throw new Error('Knowledge Note conversation is unavailable')
  }
  return {
    ...input,
    arguments: {
      id: stableKnowledgeNoteId('knowledge-note', input),
      versionId: stableKnowledgeNoteId('knowledge-note-version', input),
      workspaceId: input.context.workspaceId,
      sessionId: input.context.conversationId,
      ...(args.kind === undefined ? {} : { kind: args.kind }),
      ...(args.sourceMessageIds === undefined
        ? {}
        : { sourceMessageIds: args.sourceMessageIds }),
      ...(args.title === undefined ? {} : { title: args.title }),
      ...(args.content === undefined ? {} : { content: args.content })
    }
  }
}

function knowledgeNoteEditInput(
  input: BuiltinToolHandlerInput,
  args: JsonObject
): BuiltinToolHandlerInput {
  return {
    ...input,
    arguments: {
      ...(args.noteId === undefined ? {} : { noteId: args.noteId }),
      ...(args.expectedRevision === undefined
        ? {}
        : { expectedRevision: args.expectedRevision }),
      versionId: stableKnowledgeNoteId('knowledge-note-version', input),
      ...(args.title === undefined ? {} : { title: args.title }),
      ...(args.content === undefined ? {} : { content: args.content })
    }
  }
}

function stableKnowledgeNoteId(
  prefix: 'knowledge-note' | 'knowledge-note-version',
  input: BuiltinToolHandlerInput
): string {
  const seed = input.idempotencyKey ?? input.executionId
  if (!seed) throw new Error('Knowledge Note idempotency key is unavailable')
  return `${prefix}-${createHash('sha256')
    .update(`${prefix}:${seed}`)
    .digest('hex')
    .slice(0, 24)}`
}

function knowledgeSearchModelArguments(
  args: JsonObject
): JsonObject {
  return {
    ...(args.query === undefined ? {} : { query: args.query }),
    ...(args.topK === undefined ? {} : { topK: args.topK }),
    ...(args.sourceKinds === undefined ? {} : { sourceKinds: args.sourceKinds })
  }
}

function normalizeJsonObject(value: unknown): JsonObject {
  try {
    const normalized = JSON.parse(JSON.stringify(value)) as unknown
    if (
      typeof normalized !== 'object' ||
      normalized === null ||
      Array.isArray(normalized)
    ) {
      throw new Error()
    }
    return normalized as JsonObject
  } catch {
    throw new Error('Application Tool returned an invalid JSON object')
  }
}
