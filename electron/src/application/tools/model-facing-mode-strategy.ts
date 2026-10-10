import type { ToolModelFacingMode } from '../../../../domain/tool-catalog'
import type { ToolDefinition } from '../../../../domain/tool-definition'

export class ModelFacingModeStrategy {
  select(tools: readonly ToolDefinition[], override: ToolModelFacingMode | 'auto' = 'auto'): ToolModelFacingMode {
    if (override !== 'auto') return override
    if (tools.some((tool) => tool.origin !== 'builtin' || tool.executor.kind === 'connector')) {
      return 'directory'
    }
    if (tools.length > 32 ||
      tools.reduce((bytes, tool) => bytes + Buffer.byteLength(JSON.stringify(tool.inputSchema)), 0) > 32 * 1024) {
      return 'directory'
    }
    return 'facade'
  }
}
