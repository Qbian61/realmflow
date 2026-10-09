import type { RunCheckpoint } from '../../../domain/agent-run-recovery'
import type { AgentRuntimeRun } from '../../../domain/agent-runtime'

export type AgentRunRecoveryConfiguration = {
  profileAvailable: boolean
  capabilitiesAvailable: boolean
  modelAvailable: boolean
  permissionValid: boolean
  credentialAvailable: boolean
}

type Dependencies = {
  runtime: {
    inspectRecoveryConfiguration(
      run: AgentRuntimeRun,
      checkpoint: RunCheckpoint,
    ): Promise<
      Pick<
        AgentRunRecoveryConfiguration,
        'profileAvailable' | 'capabilitiesAvailable' | 'permissionValid'
      >
    >
  }
  models: {
    resolveExecution(profileId: string): Promise<unknown>
  }
}

export class AgentRunRecoveryConfigurationValidator {
  constructor(private readonly dependencies: Dependencies) {}

  async validate(
    run: AgentRuntimeRun,
    checkpoint: RunCheckpoint,
  ): Promise<AgentRunRecoveryConfiguration> {
    const immutable = validateImmutableDigests(run, checkpoint)
    if (!immutable.profileAvailable || !immutable.capabilitiesAvailable) {
      return {
        ...immutable,
        modelAvailable: true,
        permissionValid: false,
        credentialAvailable: true,
      }
    }
    const [runtime, model] = await Promise.all([
      this.dependencies.runtime.inspectRecoveryConfiguration(run, checkpoint),
      this.validateModel(run.snapshot.modelProfileId),
    ])
    return {
      profileAvailable:
        immutable.profileAvailable && runtime.profileAvailable,
      capabilitiesAvailable:
        immutable.capabilitiesAvailable && runtime.capabilitiesAvailable,
      modelAvailable: model.modelAvailable,
      permissionValid:
        run.status !== 'waiting_permission' && runtime.permissionValid,
      credentialAvailable: model.credentialAvailable,
    }
  }

  private async validateModel(
    profileId: string | undefined,
  ): Promise<{
    modelAvailable: boolean
    credentialAvailable: boolean
  }> {
    if (!profileId) {
      return { modelAvailable: true, credentialAvailable: true }
    }
    try {
      await this.dependencies.models.resolveExecution(profileId)
      return { modelAvailable: true, credentialAvailable: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.toLowerCase().includes('credential')) {
        return { modelAvailable: true, credentialAvailable: false }
      }
      return { modelAvailable: false, credentialAvailable: true }
    }
  }
}

function validateImmutableDigests(
  run: AgentRuntimeRun,
  checkpoint: RunCheckpoint,
): Pick<
  AgentRunRecoveryConfiguration,
  'profileAvailable' | 'capabilitiesAvailable'
> {
  return {
    profileAvailable:
      checkpoint.configurationDigests.agentProfile ===
        run.snapshot.agentProfileDigest &&
      checkpoint.configurationDigests.prompt === run.snapshot.promptDigest &&
      checkpoint.configurationDigests.policy === run.snapshot.policyDigest,
    capabilitiesAvailable:
      checkpoint.configurationDigests.capabilityCatalog ===
        run.snapshot.capabilityCatalogDigest &&
      checkpoint.configurationDigests.capabilityBinding ===
        run.snapshot.capabilityBindingDigest,
  }
}
