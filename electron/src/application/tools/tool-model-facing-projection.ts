import { createHash } from 'node:crypto'
import type {
  ToolCatalogItem,
  ToolCatalogState,
  ToolModelFacingMode
} from '../../../../domain/tool-catalog'
import type {
  ToolCapability,
  ToolDefinition,
  ToolDefinitionReference,
  ToolRisk
} from '../../../../domain/tool-definition'
import { DELEGATION_REQUEST_JSON_SCHEMA } from '../../../../domain/subagent'

export type { ToolModelFacingMode } from '../../../../domain/tool-catalog'

type FacadeDefinition = {
  id: string
  name: string
  description: string
  primitiveToolIds: string[]
}

type DirectoryControlDefinition = {
  id: 'tool_search' | 'tool_describe' | 'tool_call'
  name: string
  description: string
  inputSchema: ToolDefinition['inputSchema']
  outputSchema: ToolDefinition['outputSchema']
}

type RuntimeControlDefinition = {
  id:
    | 'ask_user'
    | 'secrets'
    | 'sessions'
    | 'subagents'
    | 'progress_card'
    | 'capabilities'
  name: string
  description: string
  inputSchema: ToolDefinition['inputSchema']
  outputSchema: ToolDefinition['outputSchema']
  capabilities: ToolCapability[]
  effects: string[]
  risk: ToolRisk
}

export type ModelFacingFacadeInvocation = {
  facadeDefinition: ToolDefinition
  primitiveDefinition: ToolDefinition
  primitiveInput: Record<string, unknown>
  metadata: {
    id: string
    name: string
    version: string
    definitionDigest: string
    action: string
    resolvedPrimitiveToolId: string
  }
}

const RISK_ORDER: Record<ToolRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

const MODEL_FACING_FACADES: FacadeDefinition[] = [
  {
    id: 'filesystem_read',
    name: 'Filesystem read',
    description: 'List, inspect, search, and read local files or documents.',
    primitiveToolIds: [
      'builtin.documents.read',
      'builtin.files.list',
      'builtin.files.read',
      'builtin.files.search',
      'builtin.files.stat'
    ]
  },
  {
    id: 'filesystem_write',
    name: 'Filesystem write',
    description: 'Create, patch, copy, move, write, or trash local files.',
    primitiveToolIds: [
      'builtin.files.apply_patch',
      'builtin.files.copy',
      'builtin.files.create_directory',
      'builtin.files.move',
      'builtin.files.trash',
      'builtin.files.write'
    ]
  },
  {
    id: 'filesystem_delete',
    name: 'Filesystem delete',
    description: 'Permanently delete local files after explicit approval.',
    primitiveToolIds: ['builtin.files.delete_permanently']
  },
  {
    id: 'git_read',
    name: 'Git read',
    description: 'Inspect repository status, history, branches, and diffs.',
    primitiveToolIds: [
      'builtin.git.diff',
      'builtin.git.file_history',
      'builtin.git.list_branches',
      'builtin.git.log',
      'builtin.git.show',
      'builtin.git.status'
    ]
  },
  {
    id: 'git_commit',
    name: 'Git commit',
    description: 'Create a repository commit after explicit user approval.',
    primitiveToolIds: ['builtin.git.commit']
  },
  {
    id: 'process',
    name: 'Process',
    description: 'Discover, run, start, list, and stop local processes.',
    primitiveToolIds: [
      'builtin.process.discover',
      'builtin.process.list',
      'builtin.process.run',
      'builtin.process.start',
      'builtin.process.stop'
    ]
  },
  {
    id: 'realmflow_context',
    name: 'RealmFlow context',
    description: 'Read spaces, requirements, workflow execution, artifacts, and attachment chunks.',
    primitiveToolIds: [
      'builtin.attachment.read_chunk',
      'builtin.realmflow.artifacts.list',
      'builtin.realmflow.artifacts.read',
      'builtin.realmflow.requirements.get',
      'builtin.realmflow.requirements.list',
      'builtin.realmflow.spaces.list',
      'builtin.realmflow.workflow.get_execution'
    ]
  },
  {
    id: 'realmflow_node_action',
    name: 'RealmFlow node action',
    description: 'Answer node questions, decide approvals, and manage node todos.',
    primitiveToolIds: [
      'builtin.realmflow.node.answer_question',
      'builtin.realmflow.node.decide_approval',
      'builtin.realmflow.node.todo.manage'
    ]
  },
  {
    id: 'document',
    name: 'Document',
    description: 'Create, inspect, edit, comment, save, export, and verify documents.',
    primitiveToolIds: [
      'builtin.artifact.verify',
      'builtin.document.comment_add',
      'builtin.document.comment_delete',
      'builtin.document.create',
      'builtin.document.export_pdf',
      'builtin.document.find',
      'builtin.document.insert_blocks',
      'builtin.document.inspect',
      'builtin.document.replace_text',
      'builtin.document.save',
      'builtin.document.table_insert',
      'builtin.document.table_write',
      'builtin.document.update_layout',
      'builtin.document.update_style'
    ]
  },
  {
    id: 'spreadsheet',
    name: 'Spreadsheet',
    description: 'Inspect, read, calculate, edit, style, chart, filter, sort, and save spreadsheets.',
    primitiveToolIds: [
      'builtin.spreadsheet.chart',
      'builtin.spreadsheet.delete_rows',
      'builtin.spreadsheet.filter',
      'builtin.spreadsheet.insert_rows',
      'builtin.spreadsheet.inspect',
      'builtin.spreadsheet.read_range',
      'builtin.spreadsheet.save',
      'builtin.spreadsheet.set_formula',
      'builtin.spreadsheet.set_style',
      'builtin.spreadsheet.sort',
      'builtin.spreadsheet.write_range'
    ]
  },
  {
    id: 'presentation',
    name: 'Presentation',
    description: 'Inspect, create, edit, reorder, and save presentation slides and shapes.',
    primitiveToolIds: [
      'builtin.presentation.add_chart',
      'builtin.presentation.add_image',
      'builtin.presentation.add_slide',
      'builtin.presentation.add_table',
      'builtin.presentation.add_text',
      'builtin.presentation.chart_write',
      'builtin.presentation.copy_slide',
      'builtin.presentation.delete_slide',
      'builtin.presentation.inspect',
      'builtin.presentation.reorder_shape',
      'builtin.presentation.reorder_slide',
      'builtin.presentation.replace_image',
      'builtin.presentation.save',
      'builtin.presentation.table_write',
      'builtin.presentation.update_size',
      'builtin.presentation.update_text'
    ]
  },
  {
    id: 'pdf',
    name: 'PDF',
    description: 'Inspect, split, merge, rotate, OCR, thumbnail, watermark, annotate, fill, and save PDFs.',
    primitiveToolIds: [
      'builtin.pdf.annotation_add',
      'builtin.pdf.form_fill',
      'builtin.pdf.inspect',
      'builtin.pdf.merge',
      'builtin.pdf.ocr',
      'builtin.pdf.rotate',
      'builtin.pdf.save',
      'builtin.pdf.split',
      'builtin.pdf.thumbnail',
      'builtin.pdf.watermark'
    ]
  },
  {
    id: 'image',
    name: 'Image',
    description: 'Inspect, OCR, crop, resize, rotate, convert, compress, composite, redact, and save images.',
    primitiveToolIds: [
      'builtin.image.composite',
      'builtin.image.compress',
      'builtin.image.convert',
      'builtin.image.crop',
      'builtin.image.inspect',
      'builtin.image.ocr',
      'builtin.image.redact',
      'builtin.image.remove_exif',
      'builtin.image.resize',
      'builtin.image.rotate',
      'builtin.image.save'
    ]
  },
  {
    id: 'archive',
    name: 'Archive',
    description: 'Create, extract, and list archive files.',
    primitiveToolIds: [
      'builtin.archives.create',
      'builtin.archives.extract',
      'builtin.archives.list'
    ]
  }
]

const MODEL_FACING_FACADE_ACTIONS: Record<string, Record<string, string>> = {
  filesystem_read: {
    list: 'builtin.files.list',
    read: 'builtin.files.read',
    read_document: 'builtin.documents.read',
    search: 'builtin.files.search',
    stat: 'builtin.files.stat'
  },
  filesystem_write: {
    apply_patch: 'builtin.files.apply_patch',
    copy: 'builtin.files.copy',
    create_directory: 'builtin.files.create_directory',
    move: 'builtin.files.move',
    trash: 'builtin.files.trash',
    write: 'builtin.files.write'
  },
  filesystem_delete: {
    delete_permanently: 'builtin.files.delete_permanently'
  },
  git_read: {
    diff: 'builtin.git.diff',
    file_history: 'builtin.git.file_history',
    list_branches: 'builtin.git.list_branches',
    log: 'builtin.git.log',
    show: 'builtin.git.show',
    status: 'builtin.git.status'
  },
  git_commit: {
    commit: 'builtin.git.commit'
  },
  process: {
    discover: 'builtin.process.discover',
    list: 'builtin.process.list',
    run: 'builtin.process.run',
    start: 'builtin.process.start',
    stop: 'builtin.process.stop'
  },
  realmflow_context: {
    list_spaces: 'builtin.realmflow.spaces.list',
    get_requirement: 'builtin.realmflow.requirements.get',
    list_requirements: 'builtin.realmflow.requirements.list',
    list_artifacts: 'builtin.realmflow.artifacts.list',
    read_artifact: 'builtin.realmflow.artifacts.read',
    read_attachment_chunk: 'builtin.attachment.read_chunk',
    get_workflow_execution: 'builtin.realmflow.workflow.get_execution'
  },
  realmflow_node_action: {
    answer_question: 'builtin.realmflow.node.answer_question',
    decide_approval: 'builtin.realmflow.node.decide_approval',
    manage_todo: 'builtin.realmflow.node.todo.manage'
  },
  document: {
    add_comment: 'builtin.document.comment_add',
    create: 'builtin.document.create',
    delete_comment: 'builtin.document.comment_delete',
    export_pdf: 'builtin.document.export_pdf',
    find: 'builtin.document.find',
    insert_blocks: 'builtin.document.insert_blocks',
    inspect: 'builtin.document.inspect',
    replace_text: 'builtin.document.replace_text',
    save: 'builtin.document.save',
    table_insert: 'builtin.document.table_insert',
    table_write: 'builtin.document.table_write',
    update_layout: 'builtin.document.update_layout',
    update_style: 'builtin.document.update_style',
    verify_artifact: 'builtin.artifact.verify'
  },
  spreadsheet: {
    chart: 'builtin.spreadsheet.chart',
    delete_rows: 'builtin.spreadsheet.delete_rows',
    filter: 'builtin.spreadsheet.filter',
    insert_rows: 'builtin.spreadsheet.insert_rows',
    inspect: 'builtin.spreadsheet.inspect',
    read_range: 'builtin.spreadsheet.read_range',
    save: 'builtin.spreadsheet.save',
    set_formula: 'builtin.spreadsheet.set_formula',
    set_style: 'builtin.spreadsheet.set_style',
    sort: 'builtin.spreadsheet.sort',
    write_range: 'builtin.spreadsheet.write_range'
  },
  presentation: {
    add_chart: 'builtin.presentation.add_chart',
    add_image: 'builtin.presentation.add_image',
    add_slide: 'builtin.presentation.add_slide',
    add_table: 'builtin.presentation.add_table',
    add_text: 'builtin.presentation.add_text',
    copy_slide: 'builtin.presentation.copy_slide',
    delete_slide: 'builtin.presentation.delete_slide',
    inspect: 'builtin.presentation.inspect',
    reorder_shape: 'builtin.presentation.reorder_shape',
    reorder_slide: 'builtin.presentation.reorder_slide',
    replace_image: 'builtin.presentation.replace_image',
    save: 'builtin.presentation.save',
    update_chart: 'builtin.presentation.chart_write',
    update_size: 'builtin.presentation.update_size',
    update_table: 'builtin.presentation.table_write',
    update_text: 'builtin.presentation.update_text'
  },
  pdf: {
    add_annotation: 'builtin.pdf.annotation_add',
    fill_form: 'builtin.pdf.form_fill',
    inspect: 'builtin.pdf.inspect',
    merge: 'builtin.pdf.merge',
    ocr: 'builtin.pdf.ocr',
    rotate: 'builtin.pdf.rotate',
    save: 'builtin.pdf.save',
    split: 'builtin.pdf.split',
    thumbnail: 'builtin.pdf.thumbnail',
    watermark: 'builtin.pdf.watermark'
  },
  image: {
    composite: 'builtin.image.composite',
    compress: 'builtin.image.compress',
    convert: 'builtin.image.convert',
    crop: 'builtin.image.crop',
    inspect: 'builtin.image.inspect',
    ocr: 'builtin.image.ocr',
    redact: 'builtin.image.redact',
    remove_exif: 'builtin.image.remove_exif',
    resize: 'builtin.image.resize',
    rotate: 'builtin.image.rotate',
    save: 'builtin.image.save'
  },
  archive: {
    create: 'builtin.archives.create',
    extract: 'builtin.archives.extract',
    list: 'builtin.archives.list'
  }
}

const DIRECTORY_TOOLS: DirectoryControlDefinition[] = [
  {
    id: 'tool_search',
    name: 'Tool search',
    description: 'Search the hidden tool directory after policy filtering.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 500 },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      }
    },
    outputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['candidates'],
      properties: {
        candidates: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'name', 'source', 'description', 'risk'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              source: {
                type: 'string',
                enum: ['builtin', 'facade', 'mcp', 'connector', 'capability']
              },
              description: { type: 'string' },
              risk: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'critical']
              },
              inputHint: { type: 'string' }
            }
          }
        }
      }
    }
  },
  {
    id: 'tool_describe',
    name: 'Tool describe',
    description: 'Read the full schema and risk metadata for a hidden tool.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 200 }
      }
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true
    }
  },
  {
    id: 'tool_call',
    name: 'Tool call',
    description: 'Invoke a hidden tool through primitive permission and audit paths.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'args'],
      properties: {
        id: { type: 'string', minLength: 1, maxLength: 200 },
        args: {
          type: 'object',
          additionalProperties: true
        }
      }
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true
    }
  }
]

const RUNTIME_TOOLS: RuntimeControlDefinition[] = [
  {
    id: 'ask_user',
    name: 'Ask user',
    description: 'Ask the user for a structured decision or missing input and suspend the current run until answered.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', minLength: 1, maxLength: 2000 },
        responseType: {
          type: 'string',
          enum: ['text', 'choice', 'confirmation'],
          default: 'text'
        },
        choices: {
          type: 'array',
          minItems: 1,
          maxItems: 10,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'label'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80 },
              label: { type: 'string', minLength: 1, maxLength: 160 },
              description: { type: 'string', maxLength: 500 }
            }
          }
        },
        allowFreeform: { type: 'boolean', default: true }
      }
    },
    outputSchema: { type: 'object', additionalProperties: true },
    capabilities: [],
    effects: ['runtime.wait_for_user'],
    risk: 'low'
  },
  {
    id: 'secrets',
    name: 'Secrets',
    description: 'Request or resolve a credential handle without exposing the secret value.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'name'],
      properties: {
        action: { type: 'string', enum: ['request', 'resolve'] },
        name: { type: 'string', minLength: 1, maxLength: 160 },
        service: { type: 'string', minLength: 1, maxLength: 160 },
        reason: { type: 'string', maxLength: 1000 }
      }
    },
    outputSchema: { type: 'object', additionalProperties: true },
    capabilities: ['credential.use'],
    effects: ['credential.handle.resolve'],
    risk: 'medium'
  },
  {
    id: 'sessions',
    name: 'Sessions',
    description: 'List, search, send to, spawn, or yield conversation sessions with compact metadata.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'search', 'send', 'spawn', 'yield']
        },
        query: { type: 'string', maxLength: 500 },
        sessionId: { type: 'string', maxLength: 120 },
        message: { type: 'string', maxLength: 12000 },
        title: { type: 'string', maxLength: 240 },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      }
    },
    outputSchema: { type: 'object', additionalProperties: true },
    capabilities: ['realmflow.read'],
    effects: ['realmflow.session.control'],
    risk: 'medium'
  },
  {
    id: 'subagents',
    name: 'Subagents',
    description: 'Delegate bounded work to child agents that share the root budget and cancellation policy.',
    inputSchema: DELEGATION_REQUEST_JSON_SCHEMA,
    outputSchema: { type: 'object', additionalProperties: true },
    capabilities: [],
    effects: ['runtime.subagent.delegate'],
    risk: 'medium'
  },
  {
    id: 'progress_card',
    name: 'Progress card',
    description: 'Create or update durable task progress visible to the user.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['cardId', 'status', 'message'],
      properties: {
        cardId: { type: 'string', minLength: 1, maxLength: 120 },
        title: { type: 'string', maxLength: 240 },
        status: {
          type: 'string',
          enum: ['pending', 'running', 'blocked', 'completed', 'failed']
        },
        message: { type: 'string', minLength: 1, maxLength: 2000 },
        completed: { type: 'integer', minimum: 0 },
        total: { type: 'integer', minimum: 0 }
      }
    },
    outputSchema: { type: 'object', additionalProperties: true },
    capabilities: [],
    effects: ['runtime.progress.update'],
    risk: 'low'
  },
  {
    id: 'capabilities',
    name: 'Capabilities',
    description: 'Search, inspect, install, enable, disable, upgrade, or rollback local capability packages.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'inspect', 'install', 'enable', 'disable', 'upgrade', 'rollback']
        },
        query: { type: 'string', maxLength: 500 },
        capabilityId: { type: 'string', maxLength: 160 },
        installationId: { type: 'string', maxLength: 160 },
        proposalId: { type: 'string', maxLength: 160 },
        targetVersion: { type: 'string', maxLength: 80 },
        expectedRevision: { type: 'integer', minimum: 1 },
        enable: { type: 'boolean' },
        limit: { type: 'integer', minimum: 1, maximum: 50 }
      }
    },
    outputSchema: { type: 'object', additionalProperties: true },
    capabilities: ['realmflow.read', 'realmflow.write'],
    effects: ['capability.catalog.manage'],
    risk: 'high'
  }
]

export function projectModelFacingToolCatalog(
  catalog: ToolCatalogState,
  mode: ToolModelFacingMode
): ToolCatalogState {
  if (mode === 'direct') {
    return {
      packages: [...catalog.packages],
      tools: catalog.tools.map((tool) => annotatePrimitive(tool, mode, 'direct')),
      skills: [...catalog.skills]
    }
  }

  if (mode === 'directory') {
    return {
      packages: [...catalog.packages],
      tools: [
        ...DIRECTORY_TOOLS.map((tool) => createDirectoryControlTool(tool, mode)),
        ...RUNTIME_TOOLS.map((tool) => createRuntimeControlTool(tool, mode)),
        ...catalog.tools.map((tool) =>
          annotatePrimitive(tool, mode, 'directory_only')
        )
      ],
      skills: [...catalog.skills]
    }
  }

  const byId = new Map(catalog.tools.map((tool) => [tool.id, tool]))
  const primitiveToFacade = new Map<string, string>()
  const facadeTools = MODEL_FACING_FACADES.map((facade) => {
    const covered = facade.primitiveToolIds
      .map((id) => byId.get(id))
      .filter((tool): tool is ToolCatalogItem => Boolean(tool))
    for (const tool of covered) primitiveToFacade.set(tool.id, facade.id)
    return createFacadeTool(facade, covered, mode)
  })

  return {
    packages: [...catalog.packages],
    tools: [
      ...RUNTIME_TOOLS.map((tool) => createRuntimeControlTool(tool, mode)),
      ...facadeTools,
      ...catalog.tools.map((tool) => {
        const facadeId = primitiveToFacade.get(tool.id)
        return facadeId
          ? annotatePrimitive(tool, mode, 'facade_backed', facadeId)
          : annotatePrimitive(tool, mode, 'direct')
      })
    ],
    skills: [...catalog.skills]
  }
}

function createRuntimeControlTool(
  control: RuntimeControlDefinition,
  mode: ToolModelFacingMode
): ToolCatalogItem {
  const definition = createRuntimeControlToolDefinition(control)
  return {
    kind: 'tool',
    id: control.id,
    version: definition.version,
    definitionDigest: definition.definitionDigest,
    definition,
    enabledPreference: true,
    status: 'enabled',
    dependencyIssues: [],
    revision: 0,
    updatedAt: 0,
    modelFacing: {
      mode,
      kind: 'facade',
      visibility: 'direct',
      coveredPrimitiveToolIds: [],
      maxRisk: control.risk
    }
  }
}

function createRuntimeControlToolDefinition(
  control: RuntimeControlDefinition
): ToolDefinition {
  const partial = {
    id: control.id,
    name: control.name,
    description: control.description,
    inputSchema: control.inputSchema,
    outputSchema: control.outputSchema,
    capabilities: control.capabilities,
    effects: control.effects,
    risk: control.risk
  }
  const definitionDigest = createHash('sha256')
    .update(JSON.stringify(partial))
    .digest('hex')
  return {
    schemaVersion: 1,
    id: control.id,
    version: '1.0.0',
    definitionDigest,
    package: {
      packageId: 'realmflow.assistant_runtime',
      packageVersion: '1.0.0',
      packageDigest: definitionDigest
    },
    origin: 'builtin',
    name: control.name,
    description: control.description,
    tags: ['assistant-runtime'],
    executor: {
      kind: 'builtin',
      handler: `runtime.${control.id}`,
      handlerVersion: '1.0.0'
    },
    inputSchema: control.inputSchema,
    outputSchema: control.outputSchema,
    capabilities: control.capabilities,
    effects: control.effects,
    risk: control.risk,
    invocation: {
      mode: 'unary',
      idempotency: 'required',
      cancellable: control.id === 'subagents',
      resumable: control.id === 'ask_user' || control.id === 'secrets'
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 1_048_576,
      maxAttempts: 1
    },
    discovery: {
      intents: [control.name.toLowerCase()],
      contexts: ['general', 'space', 'requirement', 'workflow', 'schedule']
    }
  }
}

export function resolveModelFacingFacadeInvocation(
  catalog: ToolCatalogState,
  reference: ToolDefinitionReference,
  input: Record<string, unknown>
): ModelFacingFacadeInvocation | undefined {
  const projected = projectModelFacingToolCatalog(catalog, 'facade')
  const facade = projected.tools.find(
    (candidate) =>
      candidate.id === reference.id &&
      candidate.version === reference.version &&
      candidate.definitionDigest === reference.digest &&
      candidate.status === 'enabled' &&
      candidate.modelFacing?.kind === 'facade'
  )
  if (!facade) return undefined
  const modelFacing = facade.modelFacing
  if (!modelFacing || modelFacing.kind !== 'facade') return undefined

  const action = typeof input.action === 'string' ? input.action : ''
  const actionMap = MODEL_FACING_FACADE_ACTIONS[facade.id]
  if (!actionMap) return undefined
  const primitiveToolId = actionMap[action]
  if (!primitiveToolId) {
    throw new Error(`Unsupported facade action: ${action || '<empty>'}`)
  }
  const coveredPrimitiveToolIds = modelFacing.coveredPrimitiveToolIds
  if (!coveredPrimitiveToolIds.includes(primitiveToolId)) {
    throw new Error(
      `Facade action ${action} resolves outside covered primitive tools`
    )
  }
  const primitive = catalog.tools.find(
    (candidate) =>
      candidate.id === primitiveToolId && candidate.status === 'enabled'
  )
  if (!primitive) {
    throw new Error(`Facade primitive Tool is unavailable: ${primitiveToolId}`)
  }
  const primitiveInput = input.arguments
  if (!isRecord(primitiveInput)) {
    throw new Error('Facade arguments must be an object')
  }
  return {
    facadeDefinition: facade.definition,
    primitiveDefinition: primitive.definition,
    primitiveInput,
    metadata: {
      id: facade.definition.id,
      name: facade.definition.name,
      version: facade.definition.version,
      definitionDigest: facade.definition.definitionDigest,
      action,
      resolvedPrimitiveToolId: primitive.definition.id
    }
  }
}

function annotatePrimitive(
  tool: ToolCatalogItem,
  mode: ToolModelFacingMode,
  visibility: 'direct' | 'facade_backed' | 'directory_only',
  facadeId?: string
): ToolCatalogItem {
  return {
    ...tool,
    modelFacing: {
      mode,
      kind: 'primitive',
      visibility,
      ...(facadeId ? { facadeId } : {})
    }
  }
}

function createFacadeTool(
  facade: FacadeDefinition,
  covered: ToolCatalogItem[],
  mode: ToolModelFacingMode
): ToolCatalogItem {
  const maxRisk = maximumRisk(covered)
  const capabilities = mergeCapabilities(covered)
  const effects = [...new Set(covered.flatMap(({ definition }) => definition.effects))].sort()
  const definition = createFacadeDefinition(facade, capabilities, effects, maxRisk)
  return {
    kind: 'tool',
    id: facade.id,
    version: definition.version,
    definitionDigest: definition.definitionDigest,
    definition,
    enabledPreference: covered.every(({ enabledPreference }) => enabledPreference),
    status: covered.every(({ status }) => status === 'enabled')
      ? 'enabled'
      : 'dependency_disabled',
    dependencyIssues: covered
      .filter(({ status }) => status !== 'enabled')
      .map(({ id }) => id)
      .sort(),
    revision: Math.max(0, ...covered.map(({ revision }) => revision)),
    updatedAt: Math.max(0, ...covered.map(({ updatedAt }) => updatedAt)),
    modelFacing: {
      mode,
      kind: 'facade',
      visibility: 'direct',
      coveredPrimitiveToolIds: [...facade.primitiveToolIds],
      maxRisk
    }
  }
}

function createDirectoryControlTool(
  control: DirectoryControlDefinition,
  mode: ToolModelFacingMode
): ToolCatalogItem {
  const definition = createDirectoryControlToolDefinition(control)
  return {
    kind: 'tool',
    id: control.id,
    version: definition.version,
    definitionDigest: definition.definitionDigest,
    definition,
    enabledPreference: true,
    status: 'enabled',
    dependencyIssues: [],
    revision: 0,
    updatedAt: 0,
    modelFacing: {
      mode,
      kind: 'facade',
      visibility: 'direct',
      coveredPrimitiveToolIds: [],
      maxRisk: 'low'
    }
  }
}

function createDirectoryControlToolDefinition(
  control: DirectoryControlDefinition
): ToolDefinition {
  const partial = {
    id: control.id,
    name: control.name,
    description: control.description,
    inputSchema: control.inputSchema,
    outputSchema: control.outputSchema,
    capabilities: [] as ToolCapability[],
    effects: [] as string[],
    risk: 'low' as ToolRisk
  }
  const definitionDigest = createHash('sha256')
    .update(JSON.stringify(partial))
    .digest('hex')
  return {
    schemaVersion: 1,
    id: control.id,
    version: '1.0.0',
    definitionDigest,
    package: {
      packageId: 'realmflow.model_facing_directory',
      packageVersion: '1.0.0',
      packageDigest: definitionDigest
    },
    origin: 'builtin',
    name: control.name,
    description: control.description,
    tags: ['directory'],
    executor: {
      kind: 'builtin',
      handler: `directory.${control.id}`,
      handlerVersion: '1.0.0'
    },
    inputSchema: control.inputSchema,
    outputSchema: control.outputSchema,
    capabilities: [],
    effects: [],
    risk: 'low',
    invocation: {
      mode: 'unary',
      idempotency: 'required',
      cancellable: false,
      resumable: false
    },
    resources: {
      timeoutMs: 30_000,
      maxOutputBytes: 1_048_576,
      maxAttempts: 1
    },
    discovery: {
      intents: [control.name.toLowerCase()],
      contexts: ['general', 'space', 'requirement', 'workflow', 'schedule']
    }
  }
}

function createFacadeDefinition(
  facade: FacadeDefinition,
  capabilities: ToolCapability[],
  effects: string[],
  risk: ToolRisk
): ToolDefinition {
  const partial = {
    id: facade.id,
    name: facade.name,
    description: facade.description,
    capabilities,
    effects,
    risk
  }
  const definitionDigest = createHash('sha256')
    .update(JSON.stringify(partial))
    .digest('hex')
  return {
    schemaVersion: 1,
    id: facade.id,
    version: '1.0.0',
    definitionDigest,
    package: {
      packageId: 'realmflow.model_facing_facades',
      packageVersion: '1.0.0',
      packageDigest: definitionDigest
    },
    origin: 'builtin',
    name: facade.name,
    description: facade.description,
    tags: ['facade'],
    executor: {
      kind: 'builtin',
      handler: 'tool.facade',
      handlerVersion: '1.0.0'
    },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'arguments'],
      properties: {
        action: {
          type: 'string',
          minLength: 1
        },
        arguments: {
          type: 'object',
          additionalProperties: true
        }
      }
    },
    outputSchema: {
      type: 'object',
      additionalProperties: true
    },
    capabilities,
    effects,
    risk,
    invocation: {
      mode: 'unary',
      idempotency: 'required',
      cancellable: true,
      resumable: false
    },
    resources: {
      timeoutMs: 120000,
      maxOutputBytes: 4194304,
      maxAttempts: 1
    },
    discovery: {
      intents: [facade.name.toLowerCase()],
      contexts: ['general', 'space', 'requirement', 'workflow', 'schedule']
    }
  }
}

function mergeCapabilities(tools: ToolCatalogItem[]): ToolCapability[] {
  return [...new Set(tools.flatMap(({ definition }) => definition.capabilities))]
    .sort()
}

function maximumRisk(tools: ToolCatalogItem[]): ToolRisk {
  return tools.reduce<ToolRisk>(
    (current, tool) =>
      RISK_ORDER[tool.definition.risk] > RISK_ORDER[current]
        ? tool.definition.risk
        : current,
    'low'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
