import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  analyzeDshRuntimeArchitecture,
  formatDshRuntimeArchitectureDiagnostics
} from './dsh-runtime-architecture-guard.mjs'

const sourceFile = (path, source) => ({ path, source })

const codesOf = (files) =>
  analyzeDshRuntimeArchitecture(files).map((diagnostic) => diagnostic.code)

describe('DSH runtime architecture guard registration', () => {
  it('ships a standalone guard script', () => {
    expect(
      existsSync(resolve('scripts/dsh-runtime-architecture-guard.mjs'))
    ).toBe(true)
  })

  it('exposes the guard through package scripts', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

    expect(packageJson.scripts?.['verify:dsh-runtime-architecture']).toBe(
      'node scripts/dsh-runtime-architecture-guard.mjs'
    )
  })

  it('exports a testable analyzer contract', async () => {
    const guard = await import('./dsh-runtime-architecture-guard.mjs')

    expect(typeof guard.analyzeDshRuntimeArchitecture).toBe('function')
    expect(typeof guard.formatDshRuntimeArchitectureDiagnostics).toBe(
      'function'
    )
  })
})

describe('DSH runtime architecture guard rules', () => {
  it('rejects Renderer imports from DSH infrastructure', () => {
    const diagnostics = analyzeDshRuntimeArchitecture([
      sourceFile(
        'src/features/conversation/RuntimePanel.tsx',
        "import { DshRuntimeSupervisor } from '../../electron/src/infrastructure/dsh/dsh-runtime-supervisor'\n"
      )
    ])

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: 'renderer_dsh_infrastructure_import',
        file: 'src/features/conversation/RuntimePanel.tsx',
        line: 1
      })
    ])
  })

  it('keeps product-domain control-plane modules off concrete runtime execution imports', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/application/workbench-hub/manage-task-tables.ts',
          "import { DshSessionLifecycleService } from '../dsh/dsh-session-lifecycle-service'"
        ),
        sourceFile(
          'electron/src/application/commands/manage-workspaces.ts',
          "import { DshRuntimeSupervisor } from '../../infrastructure/dsh/dsh-runtime-supervisor'"
        ),
        sourceFile(
          'src/pages/CapabilitiesPage.tsx',
          "import { AgentRuntimeOrchestrator } from '../../electron/src/application/agent-runtime/agent-runtime-orchestrator'"
        )
      ])
    ).toEqual([
      'product_domain_direct_runtime_import',
      'product_domain_direct_runtime_import',
      'product_domain_direct_runtime_import'
    ])
  })

  it('allows product-domain modules to use gateway ports and shared runtime projections', () => {
    expect(
      analyzeDshRuntimeArchitecture([
        sourceFile(
          'electron/src/application/workflow/execute-workflow-node.ts',
          [
            "import type { RunRepository } from '../../ai-run/application/ports'",
            "import type { AgentRuntimeApi } from '../../../../shared/agent-runtime-state'",
            'export class ExecuteWorkflowNodeUseCase {}'
          ].join('\n')
        ),
        sourceFile(
          'src/pages/RequirementDetailPage.tsx',
          [
            "import type { AgentRuntimeApi } from '../../shared/agent-runtime-state'",
            "import { useRequirementExecutionWorkbench } from '../app/hooks/use-requirement-execution-workbench'",
            'export function RequirementDetailPage() { return null }'
          ].join('\n')
        )
      ])
    ).toEqual([])
  })

  it('rejects DSH plugin access to SQLite and durable credentials', () => {
    expect(
      codesOf([
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/bad-runtime.ts',
          [
            "import { SqliteRequirementRepository } from '../../../electron/src/infrastructure/sqlite/repositories'",
            "import { CredentialVault } from '../../../electron/src/models/credential-vault'"
          ].join('\n')
        )
      ])
    ).toEqual(['dsh_sqlite_import', 'dsh_credential_vault_import'])
  })

  it('rejects Agent entry points that import legacy Agent or Tool executors', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/application/conversation/send-conversation-message.ts',
          [
            "import { AgentToolLoopCoordinator } from '../../ai-run/application/agent-tool-loop-coordinator'",
            "import { ToolExecutionApplicationService } from '../tools/tool-execution-application-service'"
          ].join('\n')
        )
      ])
    ).toEqual([
      'agent_entrypoint_legacy_runtime_import',
      'agent_entrypoint_legacy_runtime_import'
    ])
  })

  it('treats Capability Builder as an Agent entry point boundary', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/application/capabilities/capability-builder-service.ts',
          "import { AgentToolLoopCoordinator } from '../../ai-run/application/agent-tool-loop-coordinator'"
        )
      ])
    ).toEqual(['agent_entrypoint_legacy_runtime_import'])
  })

  it('rejects Agent entry points that depend on legacy checkpoint recovery decisions', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/application/analytics/runtime-evaluation-runner.ts',
          "import { decideAgentRunRecovery } from '../../../../domain/agent-run-recovery'"
        )
      ])
    ).toEqual(['agent_entrypoint_legacy_checkpoint_recovery'])
  })

  it('reports retained legacy runtime implementation files without duplicate entry point import diagnostics', () => {
    expect(
      analyzeDshRuntimeArchitecture([
        sourceFile(
          'electron/src/ai-run/application/agent-tool-loop-coordinator.ts',
          [
            'export class AgentToolLoopCoordinator {}',
            'const runtime = new SubagentRuntime()'
          ].join('\n')
        )
      ])
    ).toEqual([
      expect.objectContaining({
        code: 'legacy_agent_scheduling_file_retained',
        file: 'electron/src/ai-run/application/agent-tool-loop-coordinator.ts'
      })
    ])
  })

  it('rejects retained legacy Agent scheduling implementation files', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/ai-run/application/agent-tool-loop-coordinator.ts',
          'export class AgentToolLoopCoordinator {}'
        ),
        sourceFile(
          'electron/src/ai-run/application/subagent-runtime.ts',
          'export class SubagentRuntime {}'
        ),
        sourceFile(
          'electron/src/network/gateway-run-adapter.ts',
          'export function createGatewayRunAdapter() {}'
        )
      ])
    ).toEqual([
      'legacy_agent_scheduling_file_retained',
      'legacy_agent_scheduling_file_retained',
      'legacy_agent_scheduling_file_retained'
    ])
  })

  it('rejects long-running RealmFlow Sidecar production wiring', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/main.ts',
          [
            "import { SidecarManager } from './sidecar/manager'",
            'const sidecar = new SidecarManager()',
            'await sidecar.start()'
          ].join('\n')
        ),
        sourceFile(
          'electron/src/sidecar/manager.ts',
          'export class SidecarManager {}'
        ),
        sourceFile(
          'electron/src/sidecar/client.ts',
          'export class SidecarClient {}'
        )
      ])
    ).toEqual([
      'realmflow_sidecar_runtime_retained',
      'realmflow_sidecar_runtime_retained',
      'realmflow_sidecar_runtime_retained',
      'realmflow_sidecar_file_retained',
      'realmflow_sidecar_file_retained'
    ])
  })

  it('rejects Agent entry points that invoke RealmFlow runtime adapters directly', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/application/workflow/execute-workflow-node.ts',
          [
            "import { SkillRuntimeApplicationService } from '../tools/skill-runtime-application-service'",
            "import { ConnectorGateway } from '../connectors/connector-gateway'",
            'const runtime = new BrowserRuntimeService()'
          ].join('\n')
        )
      ])
    ).toEqual([
      'agent_entrypoint_direct_runtime_adapter',
      'agent_entrypoint_direct_runtime_adapter',
      'agent_entrypoint_direct_runtime_adapter'
    ])
  })

  it('rejects retained RealmFlow capability execution implementation files', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/application/tools/tool-execution-application-service.ts',
          'export class ToolExecutionApplicationService {}'
        ),
        sourceFile(
          'electron/src/application/tools/skill-runtime-application-service.ts',
          'export class SkillRuntimeApplicationService {}'
        ),
        sourceFile(
          'electron/src/application/tools/tool-outbox-dispatcher.ts',
          'export class ToolOutboxDispatcher {}'
        ),
        sourceFile(
          'electron/src/infrastructure/sqlite/tool-outbox-repository.ts',
          'export class SqliteToolOutboxRepository {}'
        ),
        sourceFile(
          'electron/src/application/tools/pending-tool-invocation-checkpoint-store.ts',
          'export class EncryptedPendingToolInvocationCheckpointStore {}'
        ),
        sourceFile(
          'electron/src/application/tools/mcp-tool-adapter.ts',
          'export class McpToolAdapter {}'
        ),
        sourceFile(
          'electron/src/application/tools/connector-tool-adapter.ts',
          'export class ConnectorToolAdapter {}'
        ),
        sourceFile(
          'electron/src/application/tools/computer-tool-adapter.ts',
          'export class ComputerToolAdapter {}'
        ),
        sourceFile(
          'electron/src/application/browser/browser-runtime-service.ts',
          'export class BrowserRuntimeService {}'
        ),
        sourceFile(
          'electron/src/application/tools/node-local-process-service.ts',
          'export class NodeLocalProcessService {}'
        ),
        sourceFile(
          'electron/src/application/tools/runtime-resource-lease-service.ts',
          'export class RuntimeResourceLeaseService {}'
        )
      ])
    ).toEqual([
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained',
      'legacy_capability_execution_file_retained'
    ])
  })

  it('rejects legacy capability runtime tables and provider-run lookups', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/infrastructure/sqlite/migrations.ts',
          [
            'CREATE TABLE tool_outbox (id TEXT PRIMARY KEY);',
            'CREATE TABLE tool_projection_checkpoints (id TEXT PRIMARY KEY);',
            'CREATE TABLE runtime_resource_leases (id TEXT PRIMARY KEY);'
          ].join('\n')
        ),
        sourceFile(
          'electron/src/infrastructure/sqlite/agent-runtime-run-repository.ts',
          [
            'export class SqliteAgentRuntimeRunRepository {',
            '  async getByProviderRunId(providerRunId: string) {}',
            '}'
          ].join('\n')
        )
      ])
    ).toEqual([
      'legacy_capability_runtime_table_retained',
      'legacy_capability_runtime_table_retained',
      'legacy_capability_runtime_table_retained',
      'legacy_provider_run_lookup_retained'
    ])
  })

  it('rejects Main-side capability side-effect runtime composition', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/main.ts',
          [
            "import { ToolExecutionApplicationService } from './application/tools/tool-execution-application-service'",
            "import { ToolOutboxDispatcher } from './application/tools/tool-outbox-dispatcher'",
            "import { NodeLocalProcessService } from './application/tools/node-local-process-service'",
            'const processes = new NodeLocalProcessService()',
            'const runtime = new ToolExecutionApplicationService()',
            'await toolOutboxDispatcher.dispatchBatch()',
            'await agentRuntimeRuns.getByProviderRunId(id)'
          ].join('\n')
        )
      ])
    ).toEqual([
      'legacy_provider_run_lookup_retained',
      'main_legacy_capability_runtime_retained',
      'main_legacy_capability_runtime_retained',
      'main_legacy_capability_runtime_retained',
      'main_legacy_capability_runtime_retained',
      'main_legacy_capability_runtime_retained'
    ])
  })

  it('allows control-plane capability catalog, package, and policy services', () => {
    expect(
      analyzeDshRuntimeArchitecture([
        sourceFile(
          'electron/src/application/tools/tool-catalog-service.ts',
          'export class ToolCatalogService { list() {} setActivation() {} }'
        ),
        sourceFile(
          'electron/src/application/tools/extension-package-service.ts',
          'export class ExtensionPackageService { publish() {} rollback() {} }'
        ),
        sourceFile(
          'electron/src/application/tools/tool-policy-configuration-service.ts',
          'export class ToolPolicyConfigurationService { save() {} preview() {} }'
        )
      ])
    ).toEqual([])
  })

  it('requires DSH product mutations to use registered Product Commands', () => {
    expect(
      codesOf([
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/product-tool.ts',
          [
            "import { manageRequirements } from '../../../electron/src/application/commands/manage-requirements'",
            'export async function run() {',
            "  await manageRequirements({ type: 'create' })",
            '}'
          ].join('\n')
        )
      ])
    ).toEqual(['dsh_product_command_required'])
  })

  it('requires DSH credential requests to use the Credential Broker', () => {
    expect(
      codesOf([
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/model-tool.ts',
          [
            'export async function run(input) {',
            '  const token = process.env.OPENAI_API_KEY ?? input.credentialRef',
            '  return token',
            '}'
          ].join('\n')
        )
      ])
    ).toEqual(['dsh_credential_broker_required'])
  })

  it('rejects DSH security boundary bypasses and upload enablement', () => {
    expect(
      codesOf([
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/unsafe-telemetry.ts',
          [
            "process.env.DSH_TELEMETRY_DISABLED = '0'",
            "process.env.DSH_SESSION_LOG_UPLOAD_DISABLED = 'false'"
          ].join('\n')
        ),
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/unsafe-scope.ts',
          [
            'export function canUseFilesystem(dshScope) {',
            '  return dshScope.authorize("filesystem.write")',
            '}'
          ].join('\n')
        )
      ])
    ).toEqual([
      'dsh_telemetry_upload_enabled',
      'dsh_telemetry_upload_enabled',
      'dsh_scope_authorization_bypass'
    ])
  })

  it('rejects per-space DSH runtime topology and unbounded worker grants', () => {
    expect(
      codesOf([
        sourceFile(
          'electron/src/bootstrap/per-space-dsh-runtime.ts',
          [
            'const runtimes = new Map<string, DshRuntimeSupervisor>()',
            'for (const space of spaces) {',
            '  runtimes.set(space.id, new DshRuntimeSupervisor({ locator, environment }))',
            '}'
          ].join('\n')
        ),
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/worker-grants.ts',
          [
            'export const grants = {',
            "  allowedReadRoots: ['/'],",
            "  network: 'allow-all',",
            "  productCommands: ['*']",
            '}'
          ].join('\n')
        )
      ])
    ).toEqual([
      'per_space_dsh_runtime_topology',
      'per_space_dsh_runtime_topology',
      'worker_unbounded_grant',
      'worker_unbounded_grant',
      'worker_unbounded_grant'
    ])
  })

  it('rejects worker processes that inherit the host process environment', () => {
    expect(
      codesOf([
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/embedding/local-embedding-process-worker.ts',
          [
            'spawn(pythonExecutable, [workerScript], {',
            '  env: {',
            '    ...process.env,',
            "    PYTHONUNBUFFERED: '1'",
            '  }',
            '})'
          ].join('\n')
        ),
        sourceFile(
          'electron/src/application/files/private-python-worker-client.ts',
          [
            'spawn(pythonExecutable, [workerScript], {',
            '  env: {',
            '    ...process.env,',
            '    ...env',
            '  }',
            '})'
          ].join('\n')
        )
      ])
    ).toEqual([
      'worker_inherits_process_environment',
      'worker_inherits_process_environment'
    ])
  })

  it('accepts DSH plugins that use only narrow control-plane contracts', () => {
    expect(
      analyzeDshRuntimeArchitecture([
        sourceFile(
          'dsh-plugins/realmflow-runtime/src/allowed.ts',
          [
            "import { DshProductCommand } from '../../../shared/dsh-product-command-contract'",
            "import { DshCredentialBrokerRequest } from '../../../shared/dsh-credential-broker-contract'",
            'export const command: DshProductCommand = { name: "requirement.get", input: {} }',
            'export const credential: DshCredentialBrokerRequest = { ref: "model:default", purpose: "model_call" }'
          ].join('\n')
        )
      ])
    ).toEqual([])
  })

  it('formats diagnostics with code, file, line and message', () => {
    expect(
      formatDshRuntimeArchitectureDiagnostics([
        {
          code: 'renderer_dsh_infrastructure_import',
          file: 'src/App.tsx',
          line: 3,
          message: 'Renderer cannot import DSH infrastructure.'
        }
      ])
    ).toBe(
      'renderer_dsh_infrastructure_import: src/App.tsx:3: Renderer cannot import DSH infrastructure.'
    )
  })

  it('does not package the long-running RealmFlow Python Sidecar', () => {
    const builderConfig = readFileSync(
      resolve('build/electron-builder.yml'),
      'utf8'
    )
    const installerScript = readFileSync(
      resolve('scripts/build-mac-installer.sh'),
      'utf8'
    )

    expect(builderConfig).not.toContain('to: python-service')
    expect(builderConfig).not.toContain('from: resources/sidecar')
    expect(builderConfig).toContain('to: dsh/python-workers/realmflow-runtime')
    expect(existsSync(resolve('scripts/build-python.sh'))).toBe(false)
    expect(installerScript).not.toContain('build-python.sh')
  })
})
