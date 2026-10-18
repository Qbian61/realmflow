import { DshRuntimeLocator } from '../infrastructure/dsh/dsh-runtime-locator'
import { DshRuntimeSupervisor } from '../infrastructure/dsh/dsh-runtime-supervisor'

export type DshRuntimeBootstrapInput = {
  isPackaged: boolean
  projectRoot: string
  resourcesPath: string
  userDataPath: string
  platform: NodeJS.Platform
  arch: string
  environment: Record<string, string | undefined>
  startRuntime: boolean
}

export type DshRuntimeBootstrap = {
  runtime: DshRuntimeSupervisor
  start(): Promise<void>
  stop(): Promise<void>
}

export function createDshRuntimeBootstrap(
  input: DshRuntimeBootstrapInput
): DshRuntimeBootstrap {
  const locator = new DshRuntimeLocator({
    isPackaged: input.isPackaged,
    projectRoot: input.projectRoot,
    resourcesPath: input.resourcesPath,
    userDataPath: input.userDataPath,
    platform: input.platform,
    arch: input.arch,
  })
  const runtime = new DshRuntimeSupervisor({
    locator,
    environment: input.environment,
  })

  return {
    runtime,
    start: async () => {
      if (input.startRuntime) await runtime.start()
    },
    stop: () => runtime.stop(),
  }
}
