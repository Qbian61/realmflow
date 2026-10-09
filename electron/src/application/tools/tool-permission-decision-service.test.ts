import { describe, expect, it, vi } from 'vitest'
import { ToolPermissionDecisionService } from './tool-permission-decision-service'

describe('ToolPermissionDecisionService', () => {
  it('delegates only the typed optimistic decision command', async () => {
    const resolvePermission = vi.fn().mockResolvedValue({
      id: 'request-1',
      executionId: 'execution-1',
      status: 'approved'
    })
    const service = new ToolPermissionDecisionService({ resolvePermission })
    const command = {
      requestId: 'request-1',
      expectedRevision: 1,
      decision: 'allow_once' as const
    }

    await expect(service.resolve(command)).resolves.toMatchObject({
      status: 'approved'
    })
    expect(resolvePermission).toHaveBeenCalledWith(command)
  })
})
