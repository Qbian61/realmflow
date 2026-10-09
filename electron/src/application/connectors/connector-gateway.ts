import Ajv from 'ajv'
import type {
  ConnectorAction,
  ConnectorActionProtocol
} from '../../../../domain/connector-runtime'
import type {
  CapabilityPermissionDeclaration,
  CapabilityScope
} from '../../../../domain/capability'
import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import { sanitizeConnectorResult } from './connector-result-sanitizer'

export type EffectiveConnectorSnapshot = {
  capabilityId: string
  capabilityVersion: string
  capabilityDigest: string
  installationId: string
  scope: CapabilityScope
  action: ConnectorAction
  credentialHandles: Record<string, string>
  permissionCeiling: CapabilityPermissionDeclaration
}

export type ConnectorGatewayInvocation = {
  snapshot: EffectiveConnectorSnapshot
  arguments: JsonObject
  idempotencyKey?: string
  permissionGranted?: boolean
  correlationId: string
  causationId: string
  signal?: AbortSignal
}

export type ConnectorProtocolAdapter = {
  invoke(input: {
    snapshot: EffectiveConnectorSnapshot
    arguments: JsonObject
    idempotencyKey?: string
    correlationId: string
    causationId: string
    signal?: AbortSignal
  }): Promise<{ output: JsonObject }>
}

export type ConnectorGatewayResult =
  | { outcome: 'succeeded'; output: JsonObject }
  | {
      outcome: 'permission_required'
      permission: {
        capability: 'connector.use'
        effect: string
        actionId: string
      }
    }
  | {
      outcome: 'failed' | 'outcome_unknown'
      error: { code: string; message: string; retryable: boolean }
    }

type ConnectorGatewayDependencies = {
  adapters: Record<ConnectorActionProtocol['kind'], ConnectorProtocolAdapter>
  resolveAction?: (
    snapshot: EffectiveConnectorSnapshot,
    actionId: string
  ) => Promise<{
    snapshot: EffectiveConnectorSnapshot
    adapter: ConnectorProtocolAdapter
  }>
}

export class ConnectorGatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly dispatched = false
  ) {
    super(message)
  }
}

export class ConnectorGateway {
  private readonly ajv = new Ajv({
    allErrors: true,
    strict: false
  })

  constructor(private readonly dependencies: ConnectorGatewayDependencies) {}

  async execute(
    invocation: ConnectorGatewayInvocation
  ): Promise<ConnectorGatewayResult> {
    const action = invocation.snapshot.action
    if (action.operation === 'write' && !invocation.permissionGranted) {
      return {
        outcome: 'permission_required',
        permission: {
          capability: 'connector.use',
          effect: action.effects[0] ?? 'external.write',
          actionId: action.id
        }
      }
    }
    if (action.operation === 'write' && !invocation.idempotencyKey) {
      return failure(
        'connector_idempotency_required',
        'Connector write requires an idempotency key',
        false
      )
    }
    if (!this.ajv.validate(action.inputSchema, invocation.arguments)) {
      return failure(
        'connector_input_invalid',
        'Connector action input is invalid',
        false
      )
    }
    return this.invoke(
      invocation,
      this.dependencies.adapters[action.protocol.kind]
    )
  }

  async recoverUnknown(
    invocation: ConnectorGatewayInvocation
  ): Promise<ConnectorGatewayResult> {
    const recoveryActionId =
      invocation.snapshot.action.idempotency?.recoveryActionId
    if (!recoveryActionId || !this.dependencies.resolveAction) {
      return {
        outcome: 'outcome_unknown',
        error: {
          code: 'connector_outcome_unknown',
          message: 'Connector write outcome requires user review',
          retryable: false
        }
      }
    }
    const resolved = await this.dependencies.resolveAction(
      invocation.snapshot,
      recoveryActionId
    )
    return this.invoke(
      { ...invocation, snapshot: resolved.snapshot },
      resolved.adapter
    )
  }

  private async invoke(
    invocation: ConnectorGatewayInvocation,
    adapter: ConnectorProtocolAdapter
  ): Promise<ConnectorGatewayResult> {
    try {
      const result = await adapter.invoke({
        snapshot: invocation.snapshot,
        arguments: invocation.arguments,
        ...(invocation.idempotencyKey
          ? { idempotencyKey: invocation.idempotencyKey }
          : {}),
        correlationId: invocation.correlationId,
        causationId: invocation.causationId,
        ...(invocation.signal ? { signal: invocation.signal } : {})
      })
      if (
        !this.ajv.validate(
          invocation.snapshot.action.outputSchema,
          result.output
        )
      ) {
        return failure(
          'connector_output_invalid',
          'Connector action output is invalid',
          false
        )
      }
      return {
        outcome: 'succeeded',
        output: sanitizeConnectorResult(
          result.output,
          invocation.snapshot.action.maxOutputBytes
        )
      }
    } catch (error) {
      if (error instanceof ConnectorGatewayError) {
        if (
          invocation.snapshot.action.operation === 'write' &&
          error.dispatched
        ) {
          return {
            outcome: 'outcome_unknown',
            error: {
              code: 'connector_outcome_unknown',
              message: 'Connector write outcome is unknown',
              retryable: false
            }
          }
        }
        return failure(error.code, error.message, error.retryable)
      }
      return failure(
        'connector_execution_failed',
        'Connector action execution failed',
        true
      )
    }
  }
}

function failure(
  code: string,
  message: string,
  retryable: boolean
): ConnectorGatewayResult {
  return {
    outcome: 'failed',
    error: { code, message, retryable }
  }
}
