import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ComputerAction,
  NativeComputerTarget
} from './native-computer-host'

type ComputerPolicyDependencies = {
  grants: {
    isApplicationAuthorized(bundleId: string): Promise<boolean>
  }
  criticalGate: {
    isApproved(input: {
      executionId: string
      bundleId: string
      semantic: NonNullable<NativeComputerTarget['actionSemantic']>
    }): Promise<boolean>
  }
}

export type ComputerPolicyDecision =
  | { outcome: 'allow' }
  | {
      outcome: 'deny'
      code:
        | 'computer_application_not_authorized'
        | 'computer_secure_input_blocked'
        | 'computer_critical_action_requires_approval'
      message: string
    }

export class ComputerPolicy {
  constructor(private readonly dependencies: ComputerPolicyDependencies) {}

  async authorizeApplication(bundleId: string): Promise<ComputerPolicyDecision> {
    if (
      !bundleId ||
      !(await this.dependencies.grants.isApplicationAuthorized(bundleId))
    ) {
      return {
        outcome: 'deny',
        code: 'computer_application_not_authorized',
        message: 'Computer Use application is not authorized'
      }
    }
    return { outcome: 'allow' }
  }

  async authorizeAction(input: {
    executionId: string
    action: ComputerAction
    arguments: JsonObject
    target: NativeComputerTarget
  }): Promise<ComputerPolicyDecision> {
    const application = await this.authorizeApplication(input.target.bundleId)
    if (application.outcome === 'deny') return application
    if (input.action === 'type' && input.target.secureInput) {
      return {
        outcome: 'deny',
        code: 'computer_secure_input_blocked',
        message: 'Computer Use cannot type into a secure input'
      }
    }
    if (
      input.target.actionSemantic &&
      !(await this.dependencies.criticalGate.isApproved({
        executionId: input.executionId,
        bundleId: input.target.bundleId,
        semantic: input.target.actionSemantic
      }))
    ) {
      return {
        outcome: 'deny',
        code: 'computer_critical_action_requires_approval',
        message: 'Computer Use critical action requires approval'
      }
    }
    return { outcome: 'allow' }
  }
}
