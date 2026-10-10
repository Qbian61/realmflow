import type { AgentRunScenarioId } from '../domain/agent-runtime'
import type { ToolModelFacingMode } from '../domain/tool-catalog'
import type { ToolPolicyContext, ToolPolicyLayer, ToolPolicyReason } from '../domain/tool-policy'

export type ToolPolicyQuery = {
  scenarioId: AgentRunScenarioId
  source: 'user' | 'workspace'
  workspaceId?: string
  providerId?: string
  mode?: ToolModelFacingMode
}

export type ToolPolicyConfiguration = {
  revision: string | null
  layers: ToolPolicyLayer[]
  modelFacingMode: ToolModelFacingMode | 'auto'
}

export type ToolPolicyPreview = {
  digest: string
  mode: ToolModelFacingMode
  directoryByteLength: number
  providerId: string
  context: ToolPolicyContext
  entries: Array<{
    id: string
    name: string
    visibility: 'direct' | 'deferred' | 'denied' | 'required'
    reason: ToolPolicyReason | 'disabled' | 'profile_restricted' | 'facade_unavailable' | 'presentation_hidden'
  }>
}

export type SaveToolPolicyCommand = ToolPolicyQuery & {
  expectedRevision: string | null
  layers: ToolPolicyLayer[]
  modelFacingMode?: ToolModelFacingMode | 'auto'
}

export interface ToolPolicyApi {
  get(query: ToolPolicyQuery): Promise<ToolPolicyConfiguration>
  save(command: SaveToolPolicyCommand): Promise<ToolPolicyConfiguration>
  preview(query: ToolPolicyQuery): Promise<ToolPolicyPreview>
}
