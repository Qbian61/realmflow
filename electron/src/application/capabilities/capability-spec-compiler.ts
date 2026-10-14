import { stringify } from 'yaml'
import type { CapabilitySpec } from '../../../../domain/capability-builder'
import type {
  CapabilityPackageManifestSource
} from './capability-package-service'

export type CompiledCapabilityDraft = {
  specDigest: string
  files: Record<string, string>
}

export class CapabilitySpecCompiler {
  compile(spec: CapabilitySpec): CompiledCapabilityDraft {
    const runtime = compileRuntime(spec)
    const manifest: CapabilityPackageManifestSource = {
      schemaVersion: 1,
      id: spec.id,
      kind: spec.kind,
      version: spec.version,
      name: spec.name,
      description: spec.description,
      runtime,
      permissions: spec.permissions,
      dependencies: spec.dependencies,
      compatibility: spec.compatibility,
      testPlan: [{ id: 'contract', command: contractCommand(spec) }]
    }
    const files: Record<string, string> = {
      'capability.yaml': stringify(manifest, {
        sortMapEntries: true,
        lineWidth: 0
      }),
      'README.md': readme(spec)
    }
    if (spec.runtime.kind === 'skill') {
      files['SKILL.md'] = `${spec.runtime.instructions.trim()}\n`
    }
    if (spec.runtime.kind === 'agent') {
      files['PROMPT.md'] = `${spec.runtime.prompt.trim()}\n`
    }
    return {
      specDigest: spec.specDigest,
      files: Object.fromEntries(
        Object.entries(files).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      )
    }
  }
}

function contractCommand(spec: CapabilitySpec): string {
  if (spec.kind === 'connector') {
    return 'realmflow:contract:http-connector'
  }
  if (spec.kind === 'skill') {
    return 'realmflow:contract:instruction-skill'
  }
  return 'realmflow:contract:agent-profile'
}

function compileRuntime(
  spec: CapabilitySpec
): CapabilityPackageManifestSource['runtime'] {
  if (spec.runtime.kind === 'skill') {
    return {
      kind: 'skill',
      instructionsPath: 'SKILL.md',
      executable: false
    }
  }
  if (spec.runtime.kind === 'agent') {
    return {
      kind: 'agent',
      promptPath: 'PROMPT.md',
      modelCapabilities: spec.runtime.modelCapabilities,
      reasoningModes: spec.runtime.reasoningModes,
      delegation: spec.runtime.delegation
    }
  }
  const operation = spec.runtime.externalWrite ? 'write' : 'read'
  const credentialRef = spec.runtime.credentialRefs[0]
  const pathParameters = httpPathParameterNames(spec.runtime.path)
  return {
    kind: 'connector',
    connectorKind: 'http',
    credentialRefs: spec.runtime.credentialRefs,
    configurationSchema: {
      type: 'object',
      description: 'Configuration accepted by this generated Connector.',
      additionalProperties: false,
      properties: {},
      examples: [{}]
    },
    actions: [
      {
        id: 'invoke',
        name: spec.name,
        description: spec.description,
        operation,
        risk: spec.permissions.maximumRisk,
        effects: [
          operation === 'write' ? 'external.write' : 'external.read'
        ],
        timeoutMs: 30_000,
        maxOutputBytes: 1_048_576,
        inputSchema: httpInputSchema(spec.name, pathParameters),
        outputSchema: {
          type: 'object',
          description: `JSON object returned by the ${spec.name} HTTP action.`,
          additionalProperties: true
        },
        ...(operation === 'write'
          ? {
              idempotency: {
                mode: 'required' as const,
                headerName: 'Idempotency-Key'
              }
            }
          : {}),
        protocol: {
          kind: 'http',
          baseUrl: spec.runtime.baseUrl,
          method: spec.runtime.method,
          pathTemplate: spec.runtime.path,
          authentication: credentialRef
            ? {
                type: 'bearer',
                credentialRef
              }
            : { type: 'none' },
          allowedRedirectOrigins: []
        }
      }
    ]
  }
}

function httpInputSchema(
  name: string,
  pathParameters: readonly string[]
): {
  type: 'object'
  description: string
  additionalProperties: false
  properties: Record<
    string,
    { type: 'string'; minLength: 1; description: string }
  >
  required: string[]
  examples: Array<Record<string, string>>
} {
  return {
    type: 'object',
    description: `Arguments accepted by the ${name} HTTP action.`,
    additionalProperties: false,
    properties: Object.fromEntries(
      pathParameters.map((parameter) => [
        parameter,
        {
          type: 'string',
          minLength: 1,
          description: `Required. HTTP path parameter "${parameter}" taken from the user request or selected external record.`
        }
      ])
    ),
    required: [...pathParameters],
    examples: [
      Object.fromEntries(
        pathParameters.map((parameter) => [
          parameter,
          `example-${parameter}`
        ])
      )
    ]
  }
}

function httpPathParameterNames(pathTemplate: string): string[] {
  return [
    ...new Set(
      [...pathTemplate.matchAll(/\{([A-Za-z0-9._:-]+)\}/g)].map(
        (match) => match[1]
      )
    )
  ].sort((left, right) => left.localeCompare(right))
}

function readme(spec: CapabilitySpec): string {
  return [
    `# ${spec.name}`,
    '',
    spec.description,
    '',
    'Generated by RealmFlow Capability Builder.',
    `Spec digest: ${spec.specDigest}`,
    ''
  ].join('\n')
}
