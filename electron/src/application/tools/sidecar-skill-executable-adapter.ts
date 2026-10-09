import { resolve, sep } from 'node:path'
import type { SkillDefinition } from '../../../../domain/skill-definition'
import { SidecarSkillError, type SidecarClient } from '../../sidecar/client'
import type { SidecarSkillConnectorGrant } from '../../network/network-gateway'
import type { SkillRuntimeCommand } from './skill-runtime-application-service'

type ExecutableCommand = SkillRuntimeCommand & { executionId: string }

type Dependencies = {
  packages: {
    resolveRoot(packageDigest: string): Promise<string>
  }
  scopes: {
    resolve(context: SkillRuntimeCommand['context']): Promise<string[]>
  }
  connectors: {
    resolve(input: {
      services: string[]
      bindings?: unknown[]
      context: SkillRuntimeCommand['context']
      executionId: string
    }): Promise<SidecarSkillConnectorGrant[]>
    release(grants: SidecarSkillConnectorGrant[]): void
  }
  sidecar: Pick<SidecarClient, 'executeSkill' | 'cancelSkillExecution'>
}

export class SidecarSkillExecutableAdapter {
  constructor(private readonly dependencies: Dependencies) {}

  async execute(command: ExecutableCommand, signal: AbortSignal) {
    const runtime = executableRuntime(command.definition)
    const packageRoot = await this.dependencies.packages.resolveRoot(
      command.definition.package.packageDigest,
    )
    const entryPath = resolve(packageRoot, runtime.entryPath)
    if (
      entryPath === packageRoot ||
      !entryPath.startsWith(`${packageRoot}${sep}`)
    ) {
      throw new SidecarSkillError(
        'skill_execution_failed',
        'Skill entry is unavailable',
      )
    }
    const network = await this.dependencies.connectors.resolve({
      services: runtime.connectorServices,
      ...(command.connectorBindings
        ? { bindings: command.connectorBindings }
        : {}),
      context: command.context,
      executionId: command.executionId,
    })
    try {
      assertConnectorGrants(runtime.connectorServices, network)
      return await this.dependencies.sidecar.executeSkill(
        {
          executionId: command.executionId,
          entryType: 'python',
          packageRoot,
          entryPath,
          input: structuredClone(command.input),
          capabilities: [...runtime.capabilities],
          scopeRoots: await this.dependencies.scopes.resolve(command.context),
          network,
          timeoutMs: command.definition.limits.timeoutMs,
          maxMemoryMb: runtime.resources.maxMemoryMb,
          maxOutputBytes: runtime.resources.maxOutputBytes,
        },
        signal,
      )
    } finally {
      this.dependencies.connectors.release(network)
    }
  }

  cancel(executionId: string): Promise<boolean> {
    return this.dependencies.sidecar.cancelSkillExecution(executionId)
  }
}

function executableRuntime(definition: SkillDefinition) {
  if (definition.runtime.kind !== 'executable') {
    throw new SidecarSkillError(
      'skill_execution_failed',
      'Skill is not executable',
    )
  }
  return definition.runtime
}

function assertConnectorGrants(
  declaredServices: string[],
  grants: SidecarSkillConnectorGrant[],
): void {
  const declared = new Set(declaredServices)
  const granted = new Set(grants.map(({ service }) => service))
  if (
    grants.some(({ service }) => !declared.has(service)) ||
    declaredServices.some((service) => !granted.has(service)) ||
    granted.size !== grants.length
  ) {
    throw new SidecarSkillError(
      'skill_connector_unavailable',
      'Skill Connector grant is unavailable',
    )
  }
}
