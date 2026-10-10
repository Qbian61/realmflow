import {
  BuiltinToolAdapter,
  type BuiltinToolHandlerInput
} from './builtin-tool-adapter'
import {
  createFileToolHandlers,
  type FileToolDependencies
} from './builtin-file-tool-handlers'
import { createDocumentToolHandlers } from './builtin-document-tool-handlers'
import type { DocumentTextExtractor } from '../documents/local-document-text-extractor'
import type { DocumentDeliveryService } from '../files/document-delivery-service'
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
import {
  createProcessToolHandlers,
  type ManagedProcessPort
} from './builtin-process-tool-handlers'
import { createWebToolHandlers } from './builtin-web-tool-handlers'
import { WebProviderRuntime } from '../web/web-provider-runtime'
import type { WebProviderConfigurationService } from '../web/web-provider-configuration-service'
import { createBrowserToolHandlers } from './builtin-browser-tool-handlers'
import type { BrowserRuntimeService } from '../browser/browser-runtime-service'
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
  'knowledge.note.save',
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
  browser?: Pick<BrowserRuntimeService, 'createSession' | 'attachSession' | 'closeSession' | 'execute'>
  resolveSessionPath?: (
    family: ToolSessionFamily,
    sessionId: string
  ) => Promise<string> | string
  files: FileToolDependencies
  documents: {
    extractor: DocumentTextExtractor
    delivery: Pick<DocumentDeliveryService, 'create' | 'exportPdf' | 'verify'>
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
      'open' | 'thumbnail' | 'ocr' | 'mutate' | 'save'
    >
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
      ...createGitToolHandlers(dependencies.git),
      ...createProcessToolHandlers(dependencies.processes),
      ...createBrowserToolHandlers(dependencies.browser),
      ...createWebToolHandlers(new WebProviderRuntime({
        resolveCredential: dependencies.web
          ? (handle, revision) => dependencies.web!.resolveCredential(handle, revision) : undefined
      })),
      ...applicationHandlers
    ],
    {
      resolveSessionPath: dependencies.resolveSessionPath,
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
    ...scopedInput,
    arguments: {
      ...scopedInput.arguments,
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
