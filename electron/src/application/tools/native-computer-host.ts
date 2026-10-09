import type { JsonObject } from '../../../../domain/tool-protocol-validation'

export const COMPUTER_ACTIONS = [
  'observe',
  'focus',
  'click',
  'type',
  'key',
  'scroll',
  'wait',
  'screenshot'
] as const

export type ComputerAction = (typeof COMPUTER_ACTIONS)[number]
export type ComputerActionSemantic =
  | 'submit'
  | 'send'
  | 'publish'
  | 'purchase'
  | 'delete'

export type NativeComputerHealth = {
  screenRecording: boolean
  accessibility: boolean
}

export type NativeComputerTarget = {
  bundleId: string
  secureInput: boolean
  actionSemantic?: ComputerActionSemantic
}

export type NativeComputerResult = {
  output: JsonObject
  screenshot?: {
    mediaType: 'image/png'
    bytes: Uint8Array
  }
}

export interface NativeComputerHost {
  health(): Promise<NativeComputerHealth>
  inspectTarget(bundleId: string): Promise<NativeComputerTarget>
  perform(input: {
    action: ComputerAction
    bundleId: string
    arguments: JsonObject
    signal: AbortSignal
  }): Promise<NativeComputerResult>
}

export class UnavailableNativeComputerHost implements NativeComputerHost {
  async health(): Promise<NativeComputerHealth> {
    return { screenRecording: false, accessibility: false }
  }

  async inspectTarget(_bundleId: string): Promise<NativeComputerTarget> {
    throw new Error('Computer Use native host is unavailable')
  }

  async perform(_input: {
    action: ComputerAction
    bundleId: string
    arguments: JsonObject
    signal: AbortSignal
  }): Promise<NativeComputerResult> {
    throw new Error('Computer Use native host is unavailable')
  }
}
