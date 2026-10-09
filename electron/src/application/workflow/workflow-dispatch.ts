export function createAutomaticWorkflowDispatchId(
  executionId: string,
  nodeRunId: string
): string {
  return `${executionId}:auto:${nodeRunId}`
}

export function createRecoveryWorkflowDispatchId(
  executionId: string,
  nodeRunId: string,
  expectedNodeRunRevision: number
): string {
  if (
    !Number.isSafeInteger(expectedNodeRunRevision) ||
    expectedNodeRunRevision < 1
  ) {
    throw new Error('Recovery node run revision must be a positive integer')
  }
  return `${executionId}:recovery:${nodeRunId}:r${expectedNodeRunRevision}`
}

export function parseRecoveryWorkflowDispatchId(
  dispatchId: string
): { expectedNodeRunRevision: number } | undefined {
  const match = dispatchId.match(/:recovery:.+:r(\d+)$/)
  if (!match) return undefined
  const expectedNodeRunRevision = Number(match[1])
  if (
    !Number.isSafeInteger(expectedNodeRunRevision) ||
    expectedNodeRunRevision < 1
  ) {
    return undefined
  }
  return { expectedNodeRunRevision }
}
