import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import type { WorkflowTemplateVersionRecord } from '../ports/business-repositories'

type WorkflowTemplateNode = WorkflowTemplateVersionRecord['nodes'][number]

export function normalizeNodeConfiguration(
  value: WorkflowNodeConfiguration,
  nodeType: WorkflowTemplateNode['type']
): WorkflowNodeConfiguration {
  if (!value || typeof value !== 'object') {
    throw new Error('Workflow node configuration is required')
  }
  const input = value.input
  if (!input || typeof input !== 'object') {
    throw new Error('Workflow node input configuration is required')
  }
  const predecessorArtifacts = input.predecessorArtifacts
  if (!['none', 'direct', 'all'].includes(predecessorArtifacts)) {
    throw new Error('Workflow node predecessor artifact scope is invalid')
  }
  const prompt = requireConfigurationString(value.prompt, 'prompt', {
    allowEmpty: nodeType !== 'ai_generate' && nodeType !== 'tool'
  })
  const reasoning = normalizeReasoningPolicy(value.reasoning)
  const model = normalizeModelStrategy(value.model)
  const connectorIds = normalizeUniqueStrings(
    value.connectorIds,
    'connector references'
  )
  const permissions = normalizePermissions(value.permissions)
  const artifact = normalizeArtifact(value.artifact, nodeType)
  const todos = normalizeTodos(value.todos)
  const completionGate = normalizeCompletionGate(value.completionGate)
  const retry = normalizeRetry(value.retry)
  const skip = normalizeSkip(value.skip)

  return {
    input: {
      includeRequirementBody: requireBoolean(
        input.includeRequirementBody,
        'include requirement body'
      ),
      predecessorArtifacts,
      includeSpaceKnowledge: requireBoolean(
        input.includeSpaceKnowledge,
        'include space knowledge'
      ),
      attachments: normalizeUniquePaths(input.attachments, 'attachment paths')
    },
    prompt,
    reasoning,
    model,
    connectorIds,
    permissions,
    artifact,
    todos,
    completionGate,
    retry,
    skip
  }
}

function normalizeReasoningPolicy(
  value: WorkflowNodeConfiguration['reasoning']
): NonNullable<WorkflowNodeConfiguration['reasoning']> {
  if (value === undefined) return 'inherit'
  if (['inherit', 'off', 'low', 'medium', 'high'].includes(value)) {
    return value
  }
  throw new Error('Workflow node reasoning policy is invalid')
}

function normalizeModelStrategy(
  model: WorkflowNodeConfiguration['model']
): WorkflowNodeConfiguration['model'] {
  if (model?.strategy === 'inherit') return { strategy: 'inherit' }
  if (model?.strategy === 'fixed') {
    return {
      strategy: 'fixed',
      profileId: requireConfigurationString(
        model.profileId,
        'fixed model profile'
      )
    }
  }
  if (model?.strategy === 'capability') {
    if (
      !Number.isInteger(model.minimumContextWindow) ||
      model.minimumContextWindow < 1
    ) {
      throw new Error(
        'Workflow node model context window must be a positive integer'
      )
    }
    if (!Array.isArray(model.requiredCapabilities)) {
      throw new Error('Workflow node model capabilities are invalid')
    }
    const knownCapabilities = new Set([
      'text',
      'vision',
      'toolCalling',
      'structuredOutput'
    ])
    if (
      model.requiredCapabilities.some(
        (capability) => !knownCapabilities.has(capability)
      )
    ) {
      throw new Error('Workflow node model capability is invalid')
    }
    if (
      new Set(model.requiredCapabilities).size !==
      model.requiredCapabilities.length
    ) {
      throw new Error('Workflow node model capabilities must be unique')
    }
    return {
      strategy: 'capability',
      requiredCapabilities: [
        'text',
        ...model.requiredCapabilities.filter(
          (capability) => capability !== 'text'
        )
      ],
      minimumContextWindow: model.minimumContextWindow
    }
  }
  throw new Error('Workflow node model strategy is invalid')
}

function normalizeArtifact(
  artifact: WorkflowNodeConfiguration['artifact'],
  nodeType: WorkflowTemplateNode['type']
): WorkflowNodeConfiguration['artifact'] {
  if (!artifact || typeof artifact !== 'object') {
    throw new Error('Workflow node artifact configuration is required')
  }
  const required = requireBoolean(artifact.required, 'artifact required')
  if (nodeType === 'ai_generate' && !required) {
    throw new Error('Workflow node AI generation artifact is required')
  }
  const relativePath = artifact.relativePath.trim()
  const kind = artifact.kind.trim()
  if (required && !relativePath) {
    throw new Error('Workflow node artifact path is required')
  }
  if (required && !kind) {
    throw new Error('Workflow node artifact kind is required')
  }
  if (relativePath) {
    requireSafeRelativePath(relativePath, 'artifact path')
    if (!relativePath.startsWith('artifacts/')) {
      throw new Error('Workflow node artifact path is invalid')
    }
  }
  return { required, relativePath, kind }
}

function normalizePermissions(
  permissions: WorkflowNodeConfiguration['permissions']
): WorkflowNodeConfiguration['permissions'] {
  if (!Array.isArray(permissions)) {
    throw new Error('Workflow node permissions are invalid')
  }
  const capabilities = new Set([
    'filesystem.read',
    'filesystem.write',
    'process.execute',
    'repository.modify'
  ])
  const scopes = new Set(['requirement', 'space'])
  const seen = new Set<string>()
  return permissions.map((permission) => {
    if (!capabilities.has(permission?.capability)) {
      throw new Error('Workflow node permission capability is invalid')
    }
    if (!scopes.has(permission.scope)) {
      throw new Error('Workflow node permission scope is invalid')
    }
    const key = `${permission.capability}:${permission.scope}`
    if (seen.has(key)) {
      throw new Error('Workflow node permissions must be unique')
    }
    seen.add(key)
    return { ...permission }
  })
}

function normalizeTodos(
  todos: WorkflowNodeConfiguration['todos']
): WorkflowNodeConfiguration['todos'] {
  if (!Array.isArray(todos)) {
    throw new Error('Workflow node todos are invalid')
  }
  const seen = new Set<string>()
  return todos.map((todo) => {
    const title = requireConfigurationString(todo?.title, 'todo title')
    const key = title.toLocaleLowerCase()
    if (seen.has(key)) throw new Error('Workflow node todos must be unique')
    seen.add(key)
    return {
      title,
      required: requireBoolean(todo.required, 'todo required')
    }
  })
}

function normalizeCompletionGate(
  gate: WorkflowNodeConfiguration['completionGate']
): WorkflowNodeConfiguration['completionGate'] {
  if (!gate || typeof gate !== 'object') {
    throw new Error('Workflow node completion gate is required')
  }
  const customGateId = gate.customGateId?.trim()
  return {
    requireApproval: requireBoolean(
      gate.requireApproval,
      'approval requirement'
    ),
    ...(customGateId ? { customGateId } : {})
  }
}

function normalizeRetry(
  retry: WorkflowNodeConfiguration['retry']
): WorkflowNodeConfiguration['retry'] {
  if (
    !retry ||
    !Number.isInteger(retry.maxAttempts) ||
    retry.maxAttempts < 1 ||
    retry.maxAttempts > 10
  ) {
    throw new Error('Workflow node retry attempts must be between 1 and 10')
  }
  if (
    !Number.isInteger(retry.backoffMs) ||
    retry.backoffMs < 0 ||
    retry.backoffMs > 300_000
  ) {
    throw new Error('Workflow node retry backoff must be between 0 and 300000')
  }
  return { maxAttempts: retry.maxAttempts, backoffMs: retry.backoffMs }
}

function normalizeSkip(
  skip: WorkflowNodeConfiguration['skip']
): WorkflowNodeConfiguration['skip'] {
  if (!skip || typeof skip !== 'object') {
    throw new Error('Workflow node skip configuration is required')
  }
  const allowed = requireBoolean(skip.allowed, 'skip allowed')
  const requireReason = requireBoolean(skip.requireReason, 'skip reason')
  if (!allowed && requireReason) {
    throw new Error('Workflow node skip reason cannot be required')
  }
  return { allowed, requireReason }
}

function normalizeUniqueStrings(values: string[], label: string): string[] {
  if (!Array.isArray(values)) {
    throw new Error(`Workflow node ${label} are invalid`)
  }
  const normalized = values.map((value) =>
    requireConfigurationString(value, label.slice(0, -1))
  )
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Workflow node ${label} must be unique`)
  }
  return normalized
}

function normalizeUniquePaths(values: string[], label: string): string[] {
  const normalized = normalizeUniqueStrings(values, label)
  for (const path of normalized)
    requireSafeRelativePath(path, 'attachment path')
  return normalized
}

function requireConfigurationString(
  value: string,
  label: string,
  options: { allowEmpty?: boolean } = {}
): string {
  if (typeof value !== 'string') {
    throw new Error(`Workflow node ${label} is required`)
  }
  const normalized = value.trim()
  if (!normalized && !options.allowEmpty) {
    throw new Error(`Workflow node ${label} is required`)
  }
  return normalized
}

function requireBoolean(value: boolean, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Workflow node ${label} must be a boolean`)
  }
  return value
}

function requireSafeRelativePath(value: string, label: string): void {
  if (
    value.startsWith('/') ||
    /^[a-zA-Z]:/.test(value) ||
    value.includes('\\') ||
    value
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error(`Workflow node ${label} is invalid`)
  }
}
