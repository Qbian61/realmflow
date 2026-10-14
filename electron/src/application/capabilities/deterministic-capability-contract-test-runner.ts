import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { parse } from 'yaml'
import {
  createCapabilityDefinition,
  type CapabilityDefinition
} from '../../../../domain/capability'
import { CapabilityContractValidator } from './capability-contract-validator'

type CapabilityTest = CapabilityDefinition['testPlan'][number]
type TestResult = {
  id: string
  status: 'passed' | 'failed'
  detail?: string
}

export class DeterministicCapabilityContractTestRunner {
  private readonly validator = new CapabilityContractValidator()

  async run(test: CapabilityTest, stagingPath: string): Promise<TestResult> {
    try {
      const manifestContent = await readFile(
        resolve(stagingPath, 'capability.yaml'),
        'utf8'
      )
      const manifest = asRecord(parse(manifestContent))
      if (!manifest) throw new Error('Capability manifest is invalid')
      const definition = createCapabilityDefinition({
        ...(manifest as Omit<
          CapabilityDefinition,
          'source' | 'manifestDigest' | 'definitionDigest' | 'publishedAt'
        >),
        source: 'generated',
        manifestDigest: createHash('sha256')
          .update(manifestContent)
          .digest('hex'),
        publishedAt: 0
      })
      if (test.command === 'realmflow:contract:http-connector') {
        validateHttpConnector(definition, this.validator)
      } else if (test.command === 'realmflow:contract:instruction-skill') {
        await validateInstructionSkill(definition, stagingPath)
      } else if (test.command === 'realmflow:contract:agent-profile') {
        await validateAgent(definition, stagingPath)
      } else {
        throw new Error('Capability contract command is unsupported')
      }
      return {
        id: test.id,
        status: 'passed',
        detail: 'Deterministic package contract passed'
      }
    } catch (error) {
      return {
        id: test.id,
        status: 'failed',
        detail:
          error instanceof Error
            ? error.message.slice(0, 500)
            : 'Capability contract failed'
      }
    }
  }
}

function validateHttpConnector(
  definition: CapabilityDefinition,
  validator: CapabilityContractValidator
): void {
  if (
    definition.kind !== 'connector' ||
    definition.runtime.kind !== 'connector' ||
    definition.runtime.connectorKind !== 'http'
  ) {
    throw new Error('HTTP Connector contract is invalid')
  }
  try {
    validator.assert(definition)
  } catch (error) {
    throw new Error(`Capability contract failed: ${stableError(error)}`)
  }
}

async function validateInstructionSkill(
  definition: CapabilityDefinition,
  stagingPath: string
): Promise<void> {
  const runtime = definition.runtime
  if (
    definition.kind !== 'skill' ||
    runtime.kind !== 'skill' ||
    runtime.executable !== false
  ) {
    throw new Error('Instruction Skill contract is invalid')
  }
  await requireNonEmptyResource(stagingPath, runtime.instructionsPath)
}

async function validateAgent(
  definition: CapabilityDefinition,
  stagingPath: string
): Promise<void> {
  const runtime = definition.runtime
  if (
    definition.kind !== 'agent' ||
    runtime.kind !== 'agent'
  ) {
    throw new Error('Agent profile contract is invalid')
  }
  const delegation = asRecord(runtime.delegation)
  if (
    !delegation ||
    delegation.allowed !== false ||
    delegation.maximumDepth !== 0
  ) {
    throw new Error('Agent profile contract is invalid')
  }
  await requireNonEmptyResource(stagingPath, runtime.promptPath)
}

function stableError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : 'Capability contract is invalid'
}

async function requireNonEmptyResource(
  stagingPath: string,
  relativePath: string
): Promise<void> {
  const root = resolve(stagingPath)
  const path = resolve(root, relativePath)
  if (path === root || !path.startsWith(`${root}${sep}`)) {
    throw new Error('Capability contract resource path is invalid')
  }
  if (!(await readFile(path, 'utf8')).trim()) {
    throw new Error('Capability contract resource is empty')
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
