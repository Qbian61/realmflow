import { createHash } from 'node:crypto'
import type { AgentRunScenarioId } from './agent-runtime'

export const CONVERSATION_PROCESSOR_STAGES = [
  'input',
  'context',
  'output'
] as const

export type ConversationProcessorStage =
  (typeof CONVERSATION_PROCESSOR_STAGES)[number]

export type ConversationEntityReference = {
  kind:
    | 'workspace'
    | 'requirement'
    | 'node'
    | 'node_run'
    | 'file'
    | 'capability'
    | 'question'
    | 'todo'
    | 'artifact'
  id: string
}

export type RetrievalQuery = {
  kind: 'original' | 'keyword' | 'semantic'
  query: string
  sourceMessageId: string
  processorVersion: string
  reason: string
}

export type SemanticUnderstanding = {
  sourceMessageId: string
  sourceDigest: string
  processorVersion: string
  generatedBy: 'deterministic'
  revision: number
  supersedesMessageId?: string
  intent: string
  objective: string
  entities: ConversationEntityReference[]
  constraints: string[]
  expectedOutput?: string
  acceptanceCriteria: string[]
  ambiguity: string[]
  riskLevel: 'low' | 'medium' | 'high'
  retrievalQueries: RetrievalQuery[]
  confidence: number
  differences?: {
    resolvedAmbiguity: string[]
    addedConstraints: string[]
  }
}

export type ExecutionBrief = {
  sourceMessageId: string
  semanticProcessorVersion: string
  objective: string
  entities: ConversationEntityReference[]
  constraints: string[]
  acceptanceCriteria: string[]
  riskLevel: SemanticUnderstanding['riskLevel']
  capabilityRestrictions: {
    allowWrites: boolean
    allowExternalSideEffects: boolean
  }
}

export type ConversationProcessingGate =
  | { status: 'continue' }
  | {
      status: 'clarification_required'
      question: string
      understoodObjective: string
      objects: ConversationEntityReference[]
      sideEffects: string[]
    }

export type ConversationProcessingInput = {
  messageId: string
  content: string
  scenarioId: AgentRunScenarioId
  bindings?: {
    workspaceId?: string
    requirementId?: string
    nodeId?: string
    nodeRunId?: string
    fileReferences?: string[]
    capabilityReferences?: string[]
    messageReferences?: {
      questionId?: string
      todoId?: string
      artifactId?: string
    }
    attachmentPaths?: string[]
  }
  locale?: string
  previousUnderstanding?: SemanticUnderstanding
  createdAt: number
}

export type ConversationProcessingDiagnostic = {
  processorId: string
  level: 'info' | 'degraded'
  message: string
}

export type ConversationProcessorTrace = {
  processorId: string
  processorVersion: string
  stage: ConversationProcessorStage
  order: number
  status: 'completed' | 'degraded' | 'skipped'
}

export type ConversationProcessingSnapshot = {
  schemaVersion: 1
  pipelineVersion: string
  rawUserInput: {
    messageId: string
    content: string
    contentDigest: string
    capturedAt: number
  }
  normalizedText: string
  slashCommand?: {
    name: string
    arguments: string
  }
  registeredInputs: {
    references: ConversationEntityReference[]
    attachmentPaths: string[]
  }
  sensitiveData: {
    labels: Array<'credential' | 'email' | 'phone'>
  }
  semanticUnderstanding: SemanticUnderstanding
  executionBrief: ExecutionBrief
  gate: ConversationProcessingGate
  locale: string
  contextEnvelope: {
    sourceMessageId: string
    retrievalQueries: RetrievalQuery[]
    entityReferences: ConversationEntityReference[]
  }
  knowledgeContext?: {
    content: string
    allowedReferenceIds: string[]
    insufficientKnowledge: boolean
  }
  outputPolicy: {
    validateCitations: boolean
    redactSensitiveEcho: boolean
    extractStructuredArtifacts: boolean
  }
  diagnostics: ConversationProcessingDiagnostic[]
  trace: ConversationProcessorTrace[]
}

type ConversationProcessingPatch = Partial<
  Omit<
    ConversationProcessingSnapshot,
    | 'schemaVersion'
    | 'pipelineVersion'
    | 'rawUserInput'
    | 'diagnostics'
    | 'trace'
  >
>

export type ConversationProcessor = {
  id: string
  version: string
  stage: ConversationProcessorStage
  order: number
  scenarios: readonly AgentRunScenarioId[]
  writes: readonly (keyof ConversationProcessingPatch)[]
  sideEffect: 'none' | 'command'
  failurePolicy: 'required' | 'optional'
  timeoutMs: number
  maxOutputBytes: number
  process: (
    input: Readonly<ConversationProcessingInput>,
    current: Readonly<ConversationProcessingSnapshot>,
    signal: AbortSignal
  ) => Promise<{
    patch: ConversationProcessingPatch
    diagnostics?: ConversationProcessingDiagnostic[]
  }>
}

const STAGE_ORDER = new Map(
  CONVERSATION_PROCESSOR_STAGES.map((stage, index) => [stage, index])
)

export class ConversationProcessorPipeline {
  readonly version: string
  private readonly processors: readonly ConversationProcessor[]

  constructor(processors: readonly ConversationProcessor[]) {
    this.processors = [...processors].sort(compareProcessors)
    assertProcessorDefinitions(this.processors)
    this.version = digest(
      this.processors
        .map(
          ({ id, version, stage, order, scenarios, writes, failurePolicy }) =>
            JSON.stringify({
              id,
              version,
              stage,
              order,
              scenarios: [...scenarios],
              writes: [...writes],
              failurePolicy
            })
        )
        .join('\n')
    )
  }

  async run(
    input: ConversationProcessingInput,
    signal: AbortSignal = new AbortController().signal
  ): Promise<ConversationProcessingSnapshot> {
    const immutableInput = deepFreeze(structuredClone(input))
    let current = initialSnapshot(immutableInput, this.version)
    for (const processor of this.processors) {
      if (!processor.scenarios.includes(input.scenarioId)) {
        current = appendTrace(current, processor, 'skipped')
        continue
      }
      if (signal.aborted) throw abortError()
      try {
        const result = await withTimeout(
          processor.process(immutableInput, current, signal),
          processor.timeoutMs,
          signal
        )
        const outputSize = new TextEncoder().encode(
          JSON.stringify(result.patch)
        ).byteLength
        if (outputSize > processor.maxOutputBytes) {
          throw new Error(
            `output exceeds ${processor.maxOutputBytes} bytes`
          )
        }
        current = deepFreeze({
          ...current,
          ...structuredClone(result.patch),
          diagnostics: [
            ...current.diagnostics,
            ...(result.diagnostics ?? [])
          ],
          trace: [
            ...current.trace,
            trace(processor, 'completed')
          ]
        })
      } catch (error) {
        if (signal.aborted) throw abortError()
        const message = errorMessage(error)
        if (processor.failurePolicy === 'required') {
          throw new Error(
            `Conversation processor ${processor.id} failed: ${message}`
          )
        }
        current = deepFreeze({
          ...current,
          diagnostics: [
            ...current.diagnostics,
            {
              processorId: processor.id,
              level: 'degraded' as const,
              message
            }
          ],
          trace: [...current.trace, trace(processor, 'degraded')]
        })
      }
    }
    return current
  }
}

export function createBuiltinConversationProcessors(): ConversationProcessor[] {
  const scenarios = [
    'general',
    'folder',
    'space',
    'requirement-node',
    'workflow-node',
    'scheduled',
    'sensitive',
    'management'
  ] as const
  return [
    definition({
      id: 'builtin.text-normalization',
      stage: 'input',
      order: 10,
      scenarios,
      writes: ['normalizedText'],
      process: async (input) => ({
        patch: { normalizedText: input.content.normalize('NFC').trim() }
      })
    }),
    definition({
      id: 'builtin.slash-command',
      stage: 'input',
      order: 20,
      scenarios,
      writes: ['slashCommand'],
      process: async (_input, current) => {
        const match = /^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/.exec(
          current.normalizedText
        )
        return {
          patch: {
            ...(match
              ? {
                  slashCommand: {
                    name: match[1].toLowerCase(),
                    arguments: match[2]?.trim() ?? ''
                  }
                }
              : {})
          }
        }
      }
    }),
    definition({
      id: 'builtin.input-registration',
      stage: 'input',
      order: 30,
      scenarios,
      writes: ['registeredInputs'],
      process: async (input) => ({
        patch: {
          registeredInputs: {
            references: mergeEntityReferences(
              input.previousUnderstanding?.entities ?? [],
              entityReferences(input)
            ),
            attachmentPaths: [
              ...(input.bindings?.attachmentPaths ?? [])
            ].sort()
          }
        }
      })
    }),
    definition({
      id: 'builtin.sensitive-data-detection',
      stage: 'input',
      order: 40,
      scenarios,
      writes: ['sensitiveData'],
      process: async (_input, current) => ({
        patch: {
          sensitiveData: {
            labels: sensitiveLabels(current.normalizedText)
          }
        }
      })
    }),
    definition({
      id: 'builtin.semantic-understanding',
      stage: 'input',
      order: 50,
      scenarios,
      writes: ['semanticUnderstanding', 'executionBrief', 'gate'],
      process: async (input, current) => {
        const semanticUnderstanding = understand(
          current,
          input.previousUnderstanding
        )
        return {
          patch: {
            semanticUnderstanding,
            executionBrief: executionBrief(semanticUnderstanding),
            gate: processingGate(semanticUnderstanding)
          }
        }
      }
    }),
    definition({
      id: 'builtin.locale-context',
      stage: 'context',
      order: 10,
      scenarios,
      writes: ['locale'],
      process: async (input, current) => ({
        patch: {
          locale:
            input.locale ??
            (/[\u3400-\u9fff]/u.test(current.normalizedText)
              ? 'zh-CN'
              : 'en-US')
        }
      })
    }),
    definition({
      id: 'builtin.context-envelope',
      stage: 'context',
      order: 20,
      scenarios,
      writes: ['contextEnvelope'],
      process: async (_input, current) => ({
        patch: {
          contextEnvelope: {
            sourceMessageId: current.rawUserInput.messageId,
            retrievalQueries: current.semanticUnderstanding.retrievalQueries,
            entityReferences: current.semanticUnderstanding.entities
          }
        }
      })
    }),
    definition({
      id: 'builtin.output-policy',
      stage: 'output',
      order: 10,
      scenarios,
      writes: ['outputPolicy'],
      process: async () => ({
        patch: {
          outputPolicy: {
            validateCitations: true,
            redactSensitiveEcho: true,
            extractStructuredArtifacts: true
          }
        }
      })
    })
  ]
}

function initialSnapshot(
  input: Readonly<ConversationProcessingInput>,
  pipelineVersion: string
): ConversationProcessingSnapshot {
  const raw = {
    messageId: input.messageId,
    content: input.content,
    contentDigest: digest(input.content),
    capturedAt: input.createdAt
  }
  const semantic = emptySemantic(raw.messageId, raw.contentDigest)
  return deepFreeze({
    schemaVersion: 1,
    pipelineVersion,
    rawUserInput: raw,
    normalizedText: input.content,
    registeredInputs: { references: [], attachmentPaths: [] },
    sensitiveData: { labels: [] },
    semanticUnderstanding: semantic,
    executionBrief: executionBrief(semantic),
    gate: { status: 'continue' },
    locale: input.locale ?? 'und',
    contextEnvelope: {
      sourceMessageId: input.messageId,
      retrievalQueries: [],
      entityReferences: []
    },
    outputPolicy: {
      validateCitations: false,
      redactSensitiveEcho: false,
      extractStructuredArtifacts: false
    },
    diagnostics: [],
    trace: []
  })
}

function emptySemantic(
  messageId: string,
  sourceDigest: string
): SemanticUnderstanding {
  return {
    sourceMessageId: messageId,
    sourceDigest,
    processorVersion: '1.0.0',
    generatedBy: 'deterministic',
    revision: 1,
    intent: 'unknown',
    objective: '',
    entities: [],
    constraints: [],
    acceptanceCriteria: [],
    ambiguity: [],
    riskLevel: 'low',
    retrievalQueries: [],
    confidence: 0
  }
}

function understand(
  current: ConversationProcessingSnapshot,
  previous?: SemanticUnderstanding
): SemanticUnderstanding {
  const text = current.normalizedText
  const currentConstraints = collectClauses(text, [
    /(?:只|仅)[^。！？!?]+/gu,
    /(?:不要|不得|禁止|无需|不能)[^。！？!?]+/gu,
    /(?:must|only|do not|don't|must not)\b[^.!?]*/giu
  ])
  const acceptanceCriteria = collectClauses(text, [
    /(?:确保|直到|验收(?:标准)?(?:是|为|：|:)?)[^。！？!?]+/gu,
    /(?:ensure|until|acceptance criteria(?: is|:)?)[^.!?]*/giu
  ])
  const readOnly = isReadOnlyRequest(text)
  const fileRequest =
    current.registeredInputs.references.some(({ kind }) => kind === 'file') ||
    /(?:文件|file)\b/iu.test(text)
  const vagueAction =
    /(?:处理一下|处理这个|搞一下|弄一下|handle (?:this|the))/iu.test(text)
  const explicitWrite = !readOnly && hasExplicitWrite(text)
  const highImpact = hasHighImpactAction(text)
  const capabilityIntent = inferCapabilityIntent(text)
  const capabilityScopeProvided =
    current.registeredInputs.references.some(({ kind }) =>
      kind === 'workspace' || kind === 'requirement' || kind === 'file'
    ) ||
    /(?:全局|当前空间|这个空间|当前需求|这个需求|global|current (?:workspace|requirement))/iu.test(
      text
    )
  const ambiguity = [
    ...(fileRequest && vagueAction && !readOnly && !explicitWrite
      ? ['未明确是只读分析还是修改文件']
      : []),
    ...(capabilityIntent?.startsWith('capability_') &&
    !capabilityScopeProvided
      ? ['未明确能力安装范围']
      : [])
  ]
  const riskLevel: SemanticUnderstanding['riskLevel'] =
    ambiguity.length > 0 || highImpact
      ? 'high'
      : explicitWrite
        ? 'medium'
        : 'low'
  const objective = previous?.objective ?? text
  const constraints = [
    ...new Set([
      ...(previous?.constraints ?? []),
      ...currentConstraints
    ])
  ]
  const resolvedAmbiguity = (previous?.ambiguity ?? []).filter(
    (item) =>
      (item === '未明确是只读分析还是修改文件' &&
        (readOnly || explicitWrite)) ||
      (item === '未明确能力安装范围' && capabilityScopeProvided)
  )
  const unresolvedPrevious = (previous?.ambiguity ?? []).filter(
    (item) => !resolvedAmbiguity.includes(item)
  )
  const effectiveAmbiguity = [
    ...new Set([...unresolvedPrevious, ...ambiguity])
  ]
  const effectiveRiskLevel: SemanticUnderstanding['riskLevel'] =
    effectiveAmbiguity.length > 0
      ? 'high'
      : readOnly
        ? 'low'
        : riskLevel
  const retrievalQueries: RetrievalQuery[] = [
    {
      kind: 'original',
      query: text,
      sourceMessageId: current.rawUserInput.messageId,
      processorVersion: '1.0.0',
      reason: '保留用户原始规范化查询'
    },
    {
      kind: 'keyword',
      query: keywordQuery(text),
      sourceMessageId: current.rawUserInput.messageId,
      processorVersion: '1.0.0',
      reason: '提取词法检索关键词'
    },
    {
      kind: 'semantic',
      query: objective,
      sourceMessageId: current.rawUserInput.messageId,
      processorVersion: '1.0.0',
      reason: '按结构化目标执行语义检索'
    }
  ]
  return {
    sourceMessageId: current.rawUserInput.messageId,
    sourceDigest: current.rawUserInput.contentDigest,
    processorVersion: '1.0.0',
    generatedBy: 'deterministic',
    revision: (previous?.revision ?? 0) + 1,
    ...(previous
      ? { supersedesMessageId: previous.sourceMessageId }
      : {}),
    intent:
      capabilityIntent ?? inferIntent(text, readOnly, explicitWrite),
    objective,
    entities: current.registeredInputs.references,
    constraints,
    ...(inferExpectedOutput(text)
      ? { expectedOutput: inferExpectedOutput(text) }
      : {}),
    acceptanceCriteria,
    ambiguity: effectiveAmbiguity,
    riskLevel: effectiveRiskLevel,
    retrievalQueries,
    confidence: effectiveAmbiguity.length > 0 ? 0.55 : 0.95,
    ...(previous
      ? {
          differences: {
            resolvedAmbiguity,
            addedConstraints: currentConstraints.filter(
              (constraint) => !previous.constraints.includes(constraint)
            )
          }
        }
      : {})
  }
}

function executionBrief(
  semantic: SemanticUnderstanding
): ExecutionBrief {
  const allowWrites =
    !semantic.constraints.some((constraint) =>
      /(?:不修改|不要修改|只分析|只读|do not (?:edit|modify)|read.?only)/iu.test(
        constraint
      )
    )
  return {
    sourceMessageId: semantic.sourceMessageId,
    semanticProcessorVersion: semantic.processorVersion,
    objective: semantic.objective,
    entities: semantic.entities,
    constraints: semantic.constraints,
    acceptanceCriteria: semantic.acceptanceCriteria,
    riskLevel: semantic.riskLevel,
    capabilityRestrictions: {
      allowWrites,
      allowExternalSideEffects:
        allowWrites && semantic.riskLevel !== 'high'
    }
  }
}

function processingGate(
  semantic: SemanticUnderstanding
): ConversationProcessingGate {
  if (semantic.ambiguity.length === 0) return { status: 'continue' }
  if (semantic.ambiguity.includes('未明确能力安装范围')) {
    return {
      status: 'clarification_required',
      question: '请确认能力应安装到全局、当前空间还是当前需求？',
      understoodObjective: semantic.objective,
      objects: semantic.entities,
      sideEffects: ['可能将能力安装到错误范围']
    }
  }
  return {
    status: 'clarification_required',
    question: '请确认：仅分析该文件，还是允许修改或覆盖该文件？',
    understoodObjective: semantic.objective,
    objects: semantic.entities,
    sideEffects: ['可能修改或覆盖文件']
  }
}

function entityReferences(
  input: ConversationProcessingInput
): ConversationEntityReference[] {
  const bindings = input.bindings
  const references: ConversationEntityReference[] = []
  if (bindings?.workspaceId) {
    references.push({ kind: 'workspace', id: bindings.workspaceId })
  }
  if (bindings?.requirementId) {
    references.push({ kind: 'requirement', id: bindings.requirementId })
  }
  if (bindings?.nodeId) {
    references.push({ kind: 'node', id: bindings.nodeId })
  }
  if (bindings?.nodeRunId) {
    references.push({ kind: 'node_run', id: bindings.nodeRunId })
  }
  for (const id of bindings?.fileReferences ?? []) {
    references.push({ kind: 'file', id })
  }
  for (const id of bindings?.capabilityReferences ?? []) {
    references.push({ kind: 'capability', id })
  }
  const message = bindings?.messageReferences
  if (message?.questionId) {
    references.push({ kind: 'question', id: message.questionId })
  }
  if (message?.todoId) references.push({ kind: 'todo', id: message.todoId })
  if (message?.artifactId) {
    references.push({ kind: 'artifact', id: message.artifactId })
  }
  return references
}

function mergeEntityReferences(
  left: readonly ConversationEntityReference[],
  right: readonly ConversationEntityReference[]
): ConversationEntityReference[] {
  const references = new Map<string, ConversationEntityReference>()
  for (const reference of [...left, ...right]) {
    references.set(`${reference.kind}:${reference.id}`, reference)
  }
  return [...references.values()]
}

function sensitiveLabels(
  text: string
): Array<'credential' | 'email' | 'phone'> {
  const labels: Array<'credential' | 'email' | 'phone'> = []
  if (
    /(?:api[_ -]?key|token|password|secret)\s*[:=]\s*\S+/iu.test(text)
  ) {
    labels.push('credential')
  }
  if (/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/iu.test(text)) labels.push('email')
  if (/(?:\+?\d[\d -]{7,}\d)/u.test(text)) labels.push('phone')
  return labels
}

function collectClauses(text: string, patterns: RegExp[]): string[] {
  const values = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map(([match]) => match.trim())
  )
  return [...new Set(values)]
}

function isReadOnlyRequest(text: string): boolean {
  return /(?:只分析|仅分析|不要修改|不修改|只读|read.?only|do not (?:edit|modify))/iu.test(
    text
  )
}

function hasExplicitWrite(text: string): boolean {
  return /(?:修改|覆盖|写入|编辑|重命名|创建|更新|edit|modify|overwrite|write|rename|create|update)/iu.test(
    text
  )
}

function hasHighImpactAction(text: string): boolean {
  return /(?:删除|安装|发送|发布|提交|付款|授权|delete|install|send|publish|submit|pay|grant)/iu.test(
    text
  )
}

function inferIntent(
  text: string,
  readOnly: boolean,
  explicitWrite: boolean
): string {
  if (readOnly) return 'analyze'
  if (hasHighImpactAction(text)) return 'high_impact_action'
  if (explicitWrite) return 'modify'
  if (/^(?:\/)?(?:查找|搜索|find|search)\b/iu.test(text)) return 'search'
  return 'answer'
}

function inferCapabilityIntent(text: string): string | undefined {
  const capability =
    /(?:能力|工具|技能|智能体|连接器|capabilit(?:y|ies)|tool|skill|agent|connector)/iu.test(
      text
    )
  if (!capability) return undefined
  if (
    /(?:每天|每周|每月|何时|什么时候|定时|触发|(?:上午|下午)?[一二三四五六七八九十\d]+点运行|when to run|schedule|every (?:day|week|month))/iu.test(
      text
    )
  ) {
    return 'configure_capability_trigger'
  }
  if (/(?:回滚|恢复到上一版本|rollback)/iu.test(text)) {
    return 'capability_rollback'
  }
  if (/(?:升级|更新版本|upgrade)/iu.test(text)) {
    return 'capability_upgrade'
  }
  if (/(?:安装|install)/iu.test(text)) return 'capability_install'
  if (/(?:创建|新增|生成|制作|create|generate|build)/iu.test(text)) {
    return 'capability_create'
  }
  return undefined
}

function inferExpectedOutput(text: string): string | undefined {
  if (/(?:风险清单|risk list)/iu.test(text)) return 'risk_list'
  if (/(?:表格|table)/iu.test(text)) return 'table'
  if (/(?:代码|code)/iu.test(text)) return 'code'
  return undefined
}

function keywordQuery(text: string): string {
  return text
    .replace(/[，。！？、,.!?;；:：()[\]{}"'“”‘’]/gu, ' ')
    .replace(/(?:请|一下|这个|那个|帮我|确保)/gu, '')
    .replace(/\b(?:please|this|that|the|a|an)\b/giu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

function definition(
  input: Omit<
    ConversationProcessor,
    | 'version'
    | 'sideEffect'
    | 'failurePolicy'
    | 'timeoutMs'
    | 'maxOutputBytes'
  >
): ConversationProcessor {
  return {
    ...input,
    version: '1.0.0',
    sideEffect: 'none',
    failurePolicy: 'required',
    timeoutMs: 1_000,
    maxOutputBytes: 128_000
  }
}

function assertProcessorDefinitions(
  processors: readonly ConversationProcessor[]
): void {
  const ids = new Set<string>()
  const owners = new Map<keyof ConversationProcessingPatch, string>()
  for (const processor of processors) {
    if (ids.has(processor.id)) {
      throw new Error(`Duplicate conversation processor: ${processor.id}`)
    }
    ids.add(processor.id)
    if (
      !Number.isInteger(processor.order) ||
      processor.order < 0 ||
      processor.timeoutMs <= 0 ||
      processor.maxOutputBytes <= 0
    ) {
      throw new Error(`Invalid conversation processor: ${processor.id}`)
    }
    for (const field of processor.writes) {
      const owner = owners.get(field)
      if (owner) {
        throw new Error(
          `Conversation processors ${owner} and ${processor.id} both write ${field}`
        )
      }
      owners.set(field, processor.id)
    }
  }
}

function compareProcessors(
  left: ConversationProcessor,
  right: ConversationProcessor
): number {
  return (
    (STAGE_ORDER.get(left.stage) ?? 0) -
      (STAGE_ORDER.get(right.stage) ?? 0) ||
    left.order - right.order ||
    left.id.localeCompare(right.id)
  )
}

function appendTrace(
  current: ConversationProcessingSnapshot,
  processor: ConversationProcessor,
  status: ConversationProcessorTrace['status']
): ConversationProcessingSnapshot {
  return deepFreeze({
    ...current,
    trace: [...current.trace, trace(processor, status)]
  })
}

function trace(
  processor: ConversationProcessor,
  status: ConversationProcessorTrace['status']
): ConversationProcessorTrace {
  return {
    processorId: processor.id,
    processorVersion: processor.version,
    stage: processor.stage,
    order: processor.order,
    status
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
    const abort = () => reject(abortError())
    signal.addEventListener('abort', abort, { once: true })
    promise.then(
      (value) => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error) => {
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}

function abortError(): Error {
  const error = new Error('Conversation processing cancelled')
  error.name = 'AbortError'
  return error
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  for (const item of Object.values(value)) deepFreeze(item)
  return Object.freeze(value)
}
