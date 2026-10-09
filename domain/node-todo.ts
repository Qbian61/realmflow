export type NodeTodoStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'blocked'
  | 'cancelled'

const ALLOWED_TRANSITIONS: Readonly<
  Record<NodeTodoStatus, readonly NodeTodoStatus[]>
> = {
  pending: ['in_progress', 'completed', 'blocked', 'cancelled'],
  in_progress: ['completed', 'blocked', 'cancelled'],
  blocked: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: []
}

export function getAllowedNodeTodoTransitions(
  status: NodeTodoStatus
): readonly NodeTodoStatus[] {
  return ALLOWED_TRANSITIONS[status]
}

export function transitionNodeTodoStatus(
  current: NodeTodoStatus,
  target: NodeTodoStatus
): {
  changed: boolean
  status: NodeTodoStatus
} {
  if (current === target) return { changed: false, status: current }
  if (!ALLOWED_TRANSITIONS[current].includes(target)) {
    throw new Error(`Node todo cannot transition from ${current} to ${target}`)
  }
  return { changed: true, status: target }
}
