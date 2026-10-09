export const nodeQuestionStatuses = [
  'open',
  'answered',
  'dismissed'
] as const

export type NodeQuestionStatus = (typeof nodeQuestionStatuses)[number]

export type NodeQuestionState = {
  required: boolean
  status: NodeQuestionStatus
}

export function transitionNodeQuestionStatus(
  current: NodeQuestionState,
  status: NodeQuestionStatus
): { changed: boolean; status: NodeQuestionStatus } {
  if (current.status === status) {
    return { changed: false, status }
  }
  if (current.status !== 'open') {
    throw new Error(
      `Node question cannot transition from ${current.status} to ${status}`
    )
  }
  if (current.required && status === 'dismissed') {
    throw new Error('Required node question cannot be dismissed')
  }
  if (status === 'open') {
    throw new Error('Resolved node question cannot be reopened')
  }
  return { changed: true, status }
}
