import type { JsonObject } from '../../../../domain/tool-protocol-validation'
import type {
  ComputerAction,
  NativeComputerHost,
  NativeComputerResult,
  NativeComputerTarget
} from './native-computer-host'

export type MacOsComputerDriver = {
  inspectTarget(bundleId: string): Promise<NativeComputerTarget>
  observe(bundleId: string, signal: AbortSignal): Promise<JsonObject>
  capture(
    bundleId: string,
    signal: AbortSignal
  ): Promise<{ bytes: Uint8Array; width: number; height: number }>
  control(input: {
    action: Exclude<ComputerAction, 'observe' | 'screenshot' | 'wait'>
    bundleId: string
    arguments: JsonObject
    signal: AbortSignal
  }): Promise<JsonObject>
  wait(input: {
    bundleId: string
    arguments: JsonObject
    signal: AbortSignal
  }): Promise<JsonObject>
}

type MacOsNativeComputerHostDependencies = {
  permissions: {
    screenRecording(): boolean
    accessibility(): boolean
  }
  driver: MacOsComputerDriver
}

export class MacOsNativeComputerHost implements NativeComputerHost {
  constructor(
    private readonly dependencies: MacOsNativeComputerHostDependencies
  ) {}

  async health() {
    return {
      screenRecording: this.dependencies.permissions.screenRecording(),
      accessibility: this.dependencies.permissions.accessibility()
    }
  }

  inspectTarget(bundleId: string): Promise<NativeComputerTarget> {
    return this.dependencies.driver.inspectTarget(bundleId)
  }

  async perform(input: {
    action: ComputerAction
    bundleId: string
    arguments: JsonObject
    signal: AbortSignal
  }): Promise<NativeComputerResult> {
    const target = await this.dependencies.driver.inspectTarget(input.bundleId)
    if (target.bundleId !== input.bundleId) {
      throw new Error('Computer Use target application changed')
    }
    if (input.action === 'observe') {
      const [output, capture] = await Promise.all([
        this.dependencies.driver.observe(input.bundleId, input.signal),
        this.dependencies.driver.capture(input.bundleId, input.signal)
      ])
      return {
        output,
        screenshot: {
          mediaType: 'image/png',
          bytes: capture.bytes
        }
      }
    }
    if (input.action === 'screenshot') {
      const capture = await this.dependencies.driver.capture(
        input.bundleId,
        input.signal
      )
      return {
        output: {
          width: capture.width,
          height: capture.height
        },
        screenshot: {
          mediaType: 'image/png',
          bytes: capture.bytes
        }
      }
    }
    if (input.action === 'wait') {
      return {
        output: await this.dependencies.driver.wait({
          bundleId: input.bundleId,
          arguments: input.arguments,
          signal: input.signal
        })
      }
    }
    return {
      output: await this.dependencies.driver.control({
        action: input.action,
        bundleId: input.bundleId,
        arguments: input.arguments,
        signal: input.signal
      })
    }
  }
}
