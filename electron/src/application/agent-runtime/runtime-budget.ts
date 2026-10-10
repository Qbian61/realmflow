export type RuntimeBudgetCommand = {
  runId: string
  requestId: string
  fingerprint: string
  at: number
}

export type RuntimeBudgetReservation = RuntimeBudgetCommand & {
  allocations: Array<{ runId: string; toolCalls: number }>
}

export type RuntimeBudgetStatus = {
  availableToolCalls: number
  allocatedToolCalls: number
  consumedToolCalls: number
  remainingSubagents: number
}

export interface RuntimeBudgetStore {
  read(runId: string): RuntimeBudgetStatus
  consume(input: RuntimeBudgetCommand): void
  reserve(input: RuntimeBudgetReservation): void
}
