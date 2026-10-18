import {
  normalizeDshProductCommandEnvelope,
  redactDshProductCommandText,
  type DshProductCommandEnvelope,
  type DshProductCommandResult
} from '../../../shared/dsh-product-command-contract'

export type DshProductCommandServerOptions = {
  registry: {
    execute(input: DshProductCommandEnvelope): Promise<DshProductCommandResult>
  }
}

export class DshProductCommandServer {
  constructor(private readonly options: DshProductCommandServerOptions) {}

  async execute(input: unknown): Promise<DshProductCommandResult> {
    try {
      return await this.options.registry.execute(
        normalizeDshProductCommandEnvelope(input)
      )
    } catch (error) {
      throw new Error(redactDshProductCommandText(errorMessage(error)))
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
