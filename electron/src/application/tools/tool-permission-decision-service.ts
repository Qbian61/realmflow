import type {
  PermissionDecisionCommand,
  ToolPermissionRequestProjection
} from '../../../../shared/tool-permissions'

export class ToolPermissionDecisionService {
  constructor(
    private readonly executions: {
      resolvePermission(
        command: PermissionDecisionCommand
      ): Promise<ToolPermissionRequestProjection>
    }
  ) {}

  resolve(
    command: PermissionDecisionCommand
  ): Promise<ToolPermissionRequestProjection> {
    return this.executions.resolvePermission(command)
  }
}
