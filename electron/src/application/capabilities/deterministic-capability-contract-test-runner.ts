import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { parse } from 'yaml'
import type { CapabilityDefinition } from '../../../../domain/capability'

type CapabilityTest = CapabilityDefinition['testPlan'][number]
type TestResult = {
  id: string
  status: 'passed' | 'failed'
  detail?: string
}

export class DeterministicCapabilityContractTestRunner {
  async run(test: CapabilityTest, stagingPath: string): Promise<TestResult> {
    try {
      const manifest = asRecord(
        parse(await readFile(resolve(stagingPath, 'capability.yaml'), 'utf8'))
      )
      if (!manifest) throw new Error('Capability manifest is invalid')
      const runtime = asRecord(manifest.runtime)
      if (!runtime) throw new Error('Capability runtime is unavailable')
      if (test.command === 'realmflow:contract:http-connector') {
        validateHttpConnector(runtime)
      } else if (test.command === 'realmflow:contract:instruction-skill') {
        await validateInstructionSkill(runtime, stagingPath)
      } else if (test.command === 'realmflow:contract:agent-profile') {
        await validateAgent(runtime, stagingPath)
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

function validateHttpConnector(runtime: Record<string, unknown>): void {
  if (
    runtime.kind !== 'connector' ||
    runtime.connectorKind !== 'http' ||
    !Array.isArray(runtime.actions) ||
    runtime.actions.length === 0
  ) {
    throw new Error('HTTP Connector contract is invalid')
  }
  for (const value of runtime.actions) {
    const action = asRecord(value)
    const protocol = asRecord(action?.protocol)
    if (
      !action ||
      !protocol ||
      protocol.kind !== 'http' ||
      typeof protocol.baseUrl !== 'string' ||
      new URL(protocol.baseUrl).protocol !== 'https:' ||
      typeof protocol.method !== 'string' ||
      typeof protocol.pathTemplate !== 'string' ||
      !protocol.pathTemplate.startsWith('/')
    ) {
      throw new Error('HTTP Connector action contract is invalid')
    }
  }
}

async function validateInstructionSkill(
  runtime: Record<string, unknown>,
  stagingPath: string
): Promise<void> {
  if (
    runtime.kind !== 'skill' ||
    runtime.executable !== false ||
    typeof runtime.instructionsPath !== 'string'
  ) {
    throw new Error('Instruction Skill contract is invalid')
  }
  await requireNonEmptyResource(stagingPath, runtime.instructionsPath)
}

async function validateAgent(
  runtime: Record<string, unknown>,
  stagingPath: string
): Promise<void> {
  const delegation = asRecord(runtime.delegation)
  if (
    runtime.kind !== 'agent' ||
    typeof runtime.promptPath !== 'string' ||
    !delegation ||
    delegation.allowed !== false ||
    delegation.maximumDepth !== 0
  ) {
    throw new Error('Agent profile contract is invalid')
  }
  await requireNonEmptyResource(stagingPath, runtime.promptPath)
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
