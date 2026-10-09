import type { ToastMessage } from './toast-types'

export type ToastState = {
  queue: ToastMessage[]
}

export type ToastAction =
  | { type: 'enqueue'; message: ToastMessage }
  | { type: 'remove'; id: string }
  | { type: 'remove-head' }

export const initialToastState: ToastState = {
  queue: []
}

export function toastReducer(
  state: ToastState,
  action: ToastAction
): ToastState {
  switch (action.type) {
    case 'enqueue':
      if (
        action.message.dedupeKey &&
        state.queue.some(
          (message) => message.dedupeKey === action.message.dedupeKey
        )
      ) {
        return state
      }
      return {
        queue: [...state.queue, action.message]
      }
    case 'remove':
      return {
        queue: state.queue.filter((message) => message.id !== action.id)
      }
    case 'remove-head':
      return {
        queue: state.queue.slice(1)
      }
  }
}
