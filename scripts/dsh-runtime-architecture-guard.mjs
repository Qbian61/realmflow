import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_SOURCE_ROOTS = [
  'src',
  'shared',
  'domain',
  'electron/src',
  'dsh-plugins'
]
const SOURCE_FILE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs'
])
const DSH_INFRASTRUCTURE_IMPORTS = [
  'electron/src/infrastructure/dsh',
  '/infrastructure/dsh/',
  'electron/src/application/dsh',
  '/application/dsh/',
  'dsh-plugins/'
]
const PRODUCT_DOMAIN_CONTROL_PLANE_ROOTS = [
  'src/',
  'electron/src/application/backup/',
  'electron/src/application/capabilities/',
  'electron/src/application/commands/',
  'electron/src/application/content-extraction/',
  'electron/src/application/documents/',
  'electron/src/application/files/',
  'electron/src/application/knowledge/',
  'electron/src/application/permissions/',
  'electron/src/application/plugins/',
  'electron/src/application/schedules/',
  'electron/src/application/skills/',
  'electron/src/application/support/',
  'electron/src/application/transactions/',
  'electron/src/application/web/',
  'electron/src/application/workbench-hub/',
  'electron/src/application/workflow/'
]
const CONCRETE_RUNTIME_EXECUTION_IMPORTS = [
  'electron/src/application/agent-runtime/',
  '/application/agent-runtime/',
  '../agent-runtime/',
  '../../agent-runtime/',
  '../../../agent-runtime/',
  'electron/src/application/dsh/',
  '/application/dsh/',
  '../dsh/',
  '../../dsh/',
  '../../../dsh/',
  'electron/src/infrastructure/dsh/',
  '/infrastructure/dsh/',
  '../infrastructure/dsh/',
  '../../infrastructure/dsh/',
  '../../../infrastructure/dsh/',
  '/ai-run/infrastructure/dsh-ai-run-gateway'
]
const RENDERER_CONCRETE_RUNTIME_EXECUTION_IMPORTS = [
  'electron/src/application/agent-runtime/',
  '/application/agent-runtime/'
]
const LEGACY_AGENT_RUNTIME_TOKENS = [
  'AgentToolLoopCoordinator',
  'agent-tool-loop-coordinator',
  'ToolExecutionApplicationService',
  'tool-execution-application-service'
]
const REMOVED_LEGACY_AGENT_SCHEDULING_FILES = new Set([
  'electron/src/ai-run/application/agent-tool-loop-coordinator.ts',
  'electron/src/ai-run/application/subagent-runtime.ts',
  'electron/src/network/gateway-run-adapter.ts'
])
const REMOVED_REALMFLOW_SIDECAR_FILES = new Set([
  'electron/src/sidecar/client.ts',
  'electron/src/sidecar/manager.ts'
])
const REMOVED_CAPABILITY_EXECUTION_FILES = new Set([
  'electron/src/application/browser/browser-runtime-service.ts',
  'electron/src/application/tools/computer-tool-adapter.ts',
  'electron/src/application/tools/connector-tool-adapter.ts',
  'electron/src/application/tools/mcp-tool-adapter.ts',
  'electron/src/application/tools/node-local-process-service.ts',
  'electron/src/application/tools/pending-tool-invocation-checkpoint-store.ts',
  'electron/src/application/tools/runtime-resource-lease-service.ts',
  'electron/src/application/tools/skill-runtime-application-service.ts',
  'electron/src/application/tools/tool-execution-application-service.ts',
  'electron/src/application/tools/tool-outbox-dispatcher.ts',
  'electron/src/infrastructure/sqlite/tool-outbox-repository.ts'
])
const REALMFLOW_SIDECAR_RUNTIME_TOKENS = [
  'SidecarManager',
  'new SidecarManager',
  'sidecar.start()',
  'sidecar.stop()',
  'sidecar.getClient()'
]
const LEGACY_CHECKPOINT_RECOVERY_TOKENS = [
  'createRunCheckpoint',
  'decideAgentRunRecovery'
]
const DIRECT_RUNTIME_ADAPTER_TOKENS = [
  'SkillRuntimeApplicationService',
  'ConnectorGateway',
  'ConnectorService',
  'McpServerService',
  'McpToolAdapter',
  'SubagentRuntime',
  'BrowserRuntimeService',
  'ComputerToolAdapter',
  'NodeLocalProcessService',
  'skill-runtime-application-service',
  'connector-gateway',
  'connector-service',
  'mcp-server-service',
  'mcp-tool-adapter',
  'subagent-runtime',
  'browser-runtime-service',
  'computer-tool-adapter',
  'node-local-process-service',
  'builtin-browser-tool-handlers',
  'builtin-process-tool-handlers'
]
const MAIN_LEGACY_CAPABILITY_RUNTIME_TOKENS = [
  'ToolExecutionApplicationService',
  'ToolOutboxDispatcher',
  'NodeLocalProcessService',
  'new ToolExecutionApplicationService',
  'toolOutboxDispatcher.dispatchBatch()'
]
const LEGACY_CAPABILITY_RUNTIME_TABLES = [
  'tool_outbox',
  'tool_projection_checkpoints',
  'runtime_resource_leases'
]
const LEGACY_PROVIDER_RUN_LOOKUP_TOKENS = [
  'ProviderRunId',
  'getByProviderRunId'
]
const DIRECT_PRODUCT_MUTATION_IMPORTS = [
  'electron/src/application/commands/',
  'electron/src/application/workflow/',
  'electron/src/application/conversation/',
  '/application/commands/',
  '/application/workflow/',
  '/application/conversation/'
]
const PRODUCT_COMMAND_TOKENS = [
  'DshProductCommand',
  'dsh-product-command',
  'productCommand'
]
const CREDENTIAL_BROKER_TOKENS = [
  'DshCredentialBroker',
  'DshCredentialBrokerRequest',
  'dsh-credential-broker',
  'credentialBroker'
]
const CREDENTIAL_REQUEST_PATTERN =
  /\b(?:credentialRef|secretRef|apiKey|accessToken|process\.env\.[A-Z0-9_]*(?:KEY|TOKEN|SECRET))\b/
const DSH_TELEMETRY_UPLOAD_ENABLE_PATTERNS = [
  /\bDSH_TELEMETRY_DISABLED\b\s*[:=]\s*['"](?:0|false)['"]/i,
  /\bDSH_SESSION_LOG_UPLOAD_DISABLED\b\s*[:=]\s*['"](?:0|false)['"]/i,
  /\bdelete\s+process\.env\.DSH_(?:TELEMETRY_DISABLED|SESSION_LOG_UPLOAD_DISABLED)\b/
]
const DSH_SCOPE_AUTHORIZATION_BYPASS_PATTERNS = [
  /\bdshScope\s*\.\s*(?:authorize|authorized|isAuthorized)\b/,
  /\bauthorizeWithDshScope\s*\(/,
  /\btrustedDshScope\b/
]
const PER_SPACE_DSH_RUNTIME_PATTERNS = [
  /\bnew\s+Map\s*<\s*string\s*,\s*DshRuntimeSupervisor\s*>/,
  /\bRecord\s*<\s*string\s*,\s*DshRuntimeSupervisor\s*>/,
  /\bfor\s*\([^)]*(?:space|workspace)[^)]*\)[\s\S]{0,240}\bnew\s+DshRuntimeSupervisor\b/,
  /\b(?:spaceId|workspaceId)\b[\s\S]{0,200}\bnew\s+DshRuntimeSupervisor\b/
]
const WORKER_PROCESS_ENV_INHERIT_PATTERN =
  /\benv\s*:\s*\{[\s\S]{0,320}\.\.\.\s*process\.env\b/
const WORKER_UNBOUNDED_GRANT_PATTERNS = [
  /\ballowed(?:Read|Write|Workspace)Roots\s*:\s*\[\s*['"]\/['"]\s*\]/,
  /\bnetwork\s*:\s*['"]allow-all['"]/,
  /\b(?:credentials|credentialRefs|productCommands|qdrantCollections|collections)\s*:\s*\[\s*['"]\*['"]\s*\]/
]

export function analyzeDshRuntimeArchitecture(files) {
  const diagnostics = []

  for (const input of files) {
    const file = normalizePath(input.path)
    if (!isProductionSourceFile(file)) continue

    const source = input.source
    const imports = extractImportSpecifiers(source)

    if (REMOVED_LEGACY_AGENT_SCHEDULING_FILES.has(file)) {
      diagnostics.push({
        code: 'legacy_agent_scheduling_file_retained',
        file,
        line: 1,
        message:
          'Legacy Agent scheduling implementation files must be deleted after DSH entry point cutover.'
      })
      continue
    }

    if (REMOVED_CAPABILITY_EXECUTION_FILES.has(file)) {
      diagnostics.push({
        code: 'legacy_capability_execution_file_retained',
        file,
        line: 1,
        message:
          'RealmFlow capability execution implementation files must be deleted; DSH owns Tool, Skill, MCP, Connector, Browser, Computer, and process execution.'
      })
      continue
    }

    if (REMOVED_REALMFLOW_SIDECAR_FILES.has(file)) {
      diagnostics.push({
        code: 'realmflow_sidecar_file_retained',
        file,
        line: 1,
        message:
          'The long-running RealmFlow Sidecar client and manager must be deleted; use bounded DSH/private workers instead.'
      })
      continue
    }

    for (const token of REALMFLOW_SIDECAR_RUNTIME_TOKENS) {
      pushTokenDiagnostic({
        diagnostics,
        code: 'realmflow_sidecar_runtime_retained',
        file,
        source,
        token,
        message:
          'Production code must not start, stop, or call the long-running RealmFlow Sidecar.'
      })
    }

    pushPatternDiagnostics({
      diagnostics,
      code: 'dsh_telemetry_upload_enabled',
      file,
      source,
      patterns: DSH_TELEMETRY_UPLOAD_ENABLE_PATTERNS,
      message:
        'DSH telemetry and session-log upload must remain disabled in RealmFlow.'
    })
    pushPatternDiagnostics({
      diagnostics,
      code: 'dsh_scope_authorization_bypass',
      file,
      source,
      patterns: DSH_SCOPE_AUTHORIZATION_BYPASS_PATTERNS,
      message:
        'DSH in-process scope is not proof of authorization; enforce accepted manifest grants and leases.'
    })
    pushPatternDiagnostics({
      diagnostics,
      code: 'per_space_dsh_runtime_topology',
      file,
      source,
      patterns: PER_SPACE_DSH_RUNTIME_PATTERNS,
      message:
        'Default topology is one supervised DSH Host per local profile, not one DSH Runtime per space or workspace.'
    })
    pushPatternDiagnostics({
      diagnostics,
      code: 'worker_unbounded_grant',
      file,
      source,
      patterns: WORKER_UNBOUNDED_GRANT_PATTERNS,
      message:
        'High-risk Workers must derive bounded filesystem, network, credential, Qdrant, and Product Command grants from the accepted manifest.'
    })
    pushPatternDiagnostics({
      diagnostics,
      code: 'worker_inherits_process_environment',
      file,
      source,
      patterns: [WORKER_PROCESS_ENV_INHERIT_PATTERN],
      message:
        'High-risk Worker processes must not inherit the host process environment; pass a sanitized, secret-free environment.'
    })

    if (isRendererFile(file)) {
      pushImportDiagnostics({
        diagnostics,
        code: 'renderer_dsh_infrastructure_import',
        file,
        imports,
        fragments: DSH_INFRASTRUCTURE_IMPORTS,
        message:
          'Renderer cannot import DSH infrastructure; use typed shared contracts and Main IPC projection.'
      })
    }

    if (isProductDomainControlPlaneFile(file)) {
      pushImportDiagnostics({
        diagnostics,
        code: 'product_domain_direct_runtime_import',
        file,
        imports,
        fragments: productDomainRuntimeImportFragments(file),
        message:
          'Product-domain control-plane modules must use typed product ports, shared projections, or approved Agent entry points instead of importing concrete DSH or Agent runtime execution modules.'
      })
    }

    if (isDshRuntimeFile(file)) {
      pushImportDiagnostics({
        diagnostics,
        code: 'dsh_sqlite_import',
        file,
        imports,
        fragments: ['electron/src/infrastructure/sqlite', '/infrastructure/sqlite/', 'better-sqlite3'],
        message:
          'DSH runtime code cannot import RealmFlow SQLite repositories or SQLite drivers.'
      })
      pushTokenDiagnostic({
        diagnostics,
        code: 'dsh_sqlite_import',
        file,
        source,
        token: 'better-sqlite3',
        message:
          'DSH runtime code cannot import RealmFlow SQLite repositories or SQLite drivers.'
      })
      pushImportDiagnostics({
        diagnostics,
        code: 'dsh_credential_vault_import',
        file,
        imports,
        fragments: ['credential-vault', 'CredentialVault'],
        message:
          'DSH plugins cannot import the durable credential vault; request call-scoped leases through the Credential Broker.'
      })
      pushTokenDiagnostic({
        diagnostics,
        code: 'dsh_credential_vault_import',
        file,
        source,
        token: 'CredentialVault',
        message:
          'DSH plugins cannot import the durable credential vault; request call-scoped leases through the Credential Broker.'
      })

      if (
        imports.some(({ specifier }) =>
          DIRECT_PRODUCT_MUTATION_IMPORTS.some((fragment) =>
            specifier.includes(fragment)
          )
        ) &&
        !containsAny(source, PRODUCT_COMMAND_TOKENS)
      ) {
        diagnostics.push({
          code: 'dsh_product_command_required',
          file,
          line: lineOfFirstMatchingImport(imports, DIRECT_PRODUCT_MUTATION_IMPORTS),
          message:
            'DSH product mutations must use registered Product Commands instead of importing RealmFlow application services.'
        })
      }

      if (
        CREDENTIAL_REQUEST_PATTERN.test(source) &&
        !containsAny(source, CREDENTIAL_BROKER_TOKENS)
      ) {
        diagnostics.push({
          code: 'dsh_credential_broker_required',
          file,
          line: lineOfPattern(source, CREDENTIAL_REQUEST_PATTERN),
          message:
            'DSH credential requests must go through the Credential Broker contract.'
        })
      }
    }

    for (const token of LEGACY_CAPABILITY_RUNTIME_TABLES) {
      pushTokenDiagnostic({
        diagnostics,
        code: 'legacy_capability_runtime_table_retained',
        file,
        source,
        token,
        message:
          'Legacy RealmFlow capability runtime tables must be removed; RealmFlow stores DSH event projections instead.'
      })
    }

    for (const token of LEGACY_PROVIDER_RUN_LOOKUP_TOKENS) {
      pushTokenDiagnostic({
        diagnostics,
        code: 'legacy_provider_run_lookup_retained',
        file,
        source,
        token,
        message:
          'Runtime lookup must use RealmFlow run IDs and DSH session bindings instead of legacy provider-run IDs.'
      })
    }

    if (file === 'electron/src/main.ts') {
      for (const token of MAIN_LEGACY_CAPABILITY_RUNTIME_TOKENS) {
        pushTokenDiagnostic({
          diagnostics,
          code: 'main_legacy_capability_runtime_retained',
          file,
          source,
          token,
          message:
            'Electron Main must not compose RealmFlow capability side-effect runtimes; DSH owns capability execution.'
        })
      }
    }

    if (isAgentEntrypointFile(file)) {
      const runtimeSearchSource = stripTypeOnlyImports(source)
      for (const token of LEGACY_AGENT_RUNTIME_TOKENS) {
        pushTokenDiagnostic({
          diagnostics,
          code: 'agent_entrypoint_legacy_runtime_import',
          file,
          source: runtimeSearchSource,
          token,
          message:
            'Agent entry points must target the DSH gateway and cannot import legacy RealmFlow Agent or Tool executors.'
        })
      }
      for (const token of LEGACY_CHECKPOINT_RECOVERY_TOKENS) {
        pushTokenDiagnostic({
          diagnostics,
          code: 'agent_entrypoint_legacy_checkpoint_recovery',
          file,
          source: runtimeSearchSource,
          token,
          message:
            'Agent entry points must recover through DSH session history and Product Command idempotency instead of legacy RealmFlow checkpoints.'
        })
      }
      for (const token of DIRECT_RUNTIME_ADAPTER_TOKENS) {
        pushTokenDiagnostic({
          diagnostics,
          code: 'agent_entrypoint_direct_runtime_adapter',
          file,
          source: runtimeSearchSource,
          token,
          message:
            'Agent entry points cannot invoke RealmFlow Skill, Connector, MCP, Subagent, Browser, Computer, or process runtime adapters directly.'
        })
      }
    }
  }

  return uniqueDiagnostics(diagnostics)
}

export function formatDshRuntimeArchitectureDiagnostics(diagnostics) {
  return diagnostics
    .map(({ code, file, line, message }) =>
      `${code}: ${file}:${line ?? 1}: ${message}`
    )
    .join('\n')
}

export function collectDshRuntimeArchitectureFiles(root = process.cwd()) {
  return DEFAULT_SOURCE_ROOTS.flatMap((sourceRoot) => {
    const absoluteRoot = resolve(root, sourceRoot)
    if (!existsSync(absoluteRoot)) return []
    return collectFiles(absoluteRoot)
      .filter((file) => SOURCE_FILE_EXTENSIONS.has(extensionOf(file)))
      .map((file) => ({
        path: normalizePath(relative(root, file)),
        source: readFileSync(file, 'utf8')
      }))
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = collectDshRuntimeArchitectureFiles()
  const diagnostics = analyzeDshRuntimeArchitecture(files)

  if (diagnostics.length > 0) {
    console.error(
      [
        'DSH runtime architecture guard failed.',
        formatDshRuntimeArchitectureDiagnostics(diagnostics)
      ].join('\n')
    )
    process.exitCode = 1
  } else {
    console.log(
      `DSH runtime architecture guard passed: ${files.length} source files.`
    )
  }
}

function normalizePath(path) {
  return path.replace(/\\/g, '/')
}

function extensionOf(file) {
  const match = file.match(/(\.[cm]?[jt]sx?)$/)
  return match?.[1] ?? ''
}

function isProductionSourceFile(file) {
  return (
    SOURCE_FILE_EXTENSIONS.has(extensionOf(file)) &&
    !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) &&
    !file.includes('/__tests__/')
  )
}

function isRendererFile(file) {
  return file.startsWith('src/')
}

function isProductDomainControlPlaneFile(file) {
  return PRODUCT_DOMAIN_CONTROL_PLANE_ROOTS.some((root) =>
    file.startsWith(root)
  )
}

function productDomainRuntimeImportFragments(file) {
  return isRendererFile(file)
    ? RENDERER_CONCRETE_RUNTIME_EXECUTION_IMPORTS
    : CONCRETE_RUNTIME_EXECUTION_IMPORTS
}

function isDshRuntimeFile(file) {
  return file.startsWith('dsh-plugins/') || file.startsWith('resources/dsh/')
}

function isAgentEntrypointFile(file) {
  if (!file.startsWith('electron/src/')) return false
  return (
    file.startsWith('electron/src/ai-run/') ||
    file.startsWith('electron/src/application/capabilities/') ||
    file.startsWith('electron/src/application/capabilities/') ||
    file.startsWith('electron/src/application/conversation/') ||
    file.startsWith('electron/src/application/workflow/') ||
    file.startsWith('electron/src/application/schedules/') ||
    file.startsWith('electron/src/application/analytics/') ||
    file.startsWith('electron/src/application/agent-runtime/')
  )
}

function stripTypeOnlyImports(source) {
  return source.replace(
    /^import\s+type[\s\S]*?\s+from\s+['"][^'"]+['"]\s*;?\n?/gm,
    (match) => '\n'.repeat(match.split('\n').length - 1)
  )
}

function extractImportSpecifiers(source) {
  const imports = []
  const patterns = [
    /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.push({
        specifier: match[1],
        line: lineOfIndex(source, match.index ?? 0)
      })
    }
  }

  return imports
}

function pushImportDiagnostics({
  diagnostics,
  code,
  file,
  imports,
  fragments,
  message
}) {
  for (const importSpecifier of imports) {
    if (
      fragments.some((fragment) => importSpecifier.specifier.includes(fragment))
    ) {
      diagnostics.push({
        code,
        file,
        line: importSpecifier.line,
        message
      })
    }
  }
}

function pushTokenDiagnostic({
  diagnostics,
  code,
  file,
  source,
  token,
  message
}) {
  const index = source.indexOf(token)
  if (index === -1) return
  diagnostics.push({
    code,
    file,
    line: lineOfIndex(source, index),
    message
  })
}

function pushPatternDiagnostics({
  diagnostics,
  code,
  file,
  source,
  patterns,
  message
}) {
  for (const pattern of patterns) {
    const match = pattern.exec(source)
    pattern.lastIndex = 0
    if (match === null) continue
    diagnostics.push({
      code,
      file,
      line: lineOfIndex(source, match.index ?? 0),
      message
    })
  }
}

function containsAny(source, tokens) {
  return tokens.some((token) => source.includes(token))
}

function lineOfFirstMatchingImport(imports, fragments) {
  return (
    imports.find(({ specifier }) =>
      fragments.some((fragment) => specifier.includes(fragment))
    )?.line ?? 1
  )
}

function lineOfPattern(source, pattern) {
  const match = pattern.exec(source)
  pattern.lastIndex = 0
  return lineOfIndex(source, match?.index ?? 0)
}

function lineOfIndex(source, index) {
  return source.slice(0, index).split('\n').length
}

function uniqueDiagnostics(diagnostics) {
  const seen = new Set()
  return diagnostics.filter((diagnostic) => {
    const key = [
      diagnostic.code,
      diagnostic.file,
      diagnostic.line,
      diagnostic.message
    ].join('\0')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function collectFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory)) {
    if (
      entry === 'node_modules' ||
      entry === 'out' ||
      entry === 'dist' ||
      entry === 'coverage'
    ) {
      continue
    }
    const absolute = resolve(directory, entry)
    const stats = statSync(absolute)
    if (stats.isDirectory()) {
      files.push(...collectFiles(absolute))
    } else if (stats.isFile()) {
      files.push(absolute)
    }
  }
  return files
}
