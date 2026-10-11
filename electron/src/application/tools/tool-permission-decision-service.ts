import type {
  PermissionDecisionCommand,
  ReusableToolPermissionView,
  ToolPermissionRequestProjection
} from '../../../../shared/tool-permissions'

export class ToolPermissionDecisionService {
  constructor(
    private readonly executions: {
      resolvePermission(
        command: PermissionDecisionCommand
      ): Promise<ToolPermissionRequestProjection>
      listReusablePermissions(): Promise<ReusableToolPermissionView[]>
      revokeReusablePermission(grantId: string): Promise<void>
    }
  ) {}

  listGrants(): Promise<ReusableToolPermissionView[]> {
    return this.executions.listReusablePermissions()
  }

  revokeGrant(grantId: string): Promise<void> {
    return this.executions.revokeReusablePermission(grantId)
  }

  resolve(
    command: PermissionDecisionCommand
  ): Promise<ToolPermissionRequestProjection> {
    return this.executions.resolvePermission(command)
  }
}
