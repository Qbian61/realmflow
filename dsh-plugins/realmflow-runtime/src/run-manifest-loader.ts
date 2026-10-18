import { createHash, timingSafeEqual } from 'node:crypto'
import {
  ACP_SDK_VERSION,
  DSH_RUNTIME_PACKAGE,
  DSH_RUNTIME_VERSION,
  validateDshRunManifest,
  type DshRunManifest,
  type DshRunOwner
} from '../../../domain/dsh-run-manifest'

export type DshRuntimeCompatibility = {
  dshPackage: string
  dshVersion: string
  acpSdkVersion: string
}

export type RealmFlowPublisherAuthentication = {
  processId: number
  tokenDigest: string
}

export type RealmFlowPublisherAttempt = {
  processId: number
  token: string
}

export type DshRunManifestLoaderOptions = {
  publisher: RealmFlowPublisherAuthentication
  expectedRuntime?: DshRuntimeCompatibility
  now?: () => number
}

export type DshRunManifestLoadRequest = {
  manifest: unknown
  publisher: RealmFlowPublisherAttempt
  expectedOwner?: DshRunOwner
  expectedRunId?: string
  expectedSessionId?: string
}

export type AcceptedDshRunManifest = {
  digest: string
  manifest: DshRunManifest
  runtime: DshRuntimeCompatibility
  acceptedAt: number
  publisherProcessId: number
}

const PINNED_RUNTIME: DshRuntimeCompatibility = {
  dshPackage: DSH_RUNTIME_PACKAGE,
  dshVersion: DSH_RUNTIME_VERSION,
  acpSdkVersion: ACP_SDK_VERSION
}

export class DshRunManifestLoader {
  private readonly now: () => number
  private acceptedManifest: AcceptedDshRunManifest | undefined

  constructor(private readonly options: DshRunManifestLoaderOptions) {
    this.now = options.now ?? Date.now
  }

  load(request: DshRunManifestLoadRequest): AcceptedDshRunManifest {
    authenticatePublisher(this.options.publisher, request.publisher)
    const manifest = validateDshRunManifest(request.manifest)
    assertRuntimeCompatibility(
      this.options.expectedRuntime ?? PINNED_RUNTIME
    )
    assertExpectedIdentity(manifest, request)
    if (this.acceptedManifest !== undefined) {
      if (this.acceptedManifest.digest !== manifest.digest) {
        throw new Error('Cannot replace immutable accepted manifest for run segment')
      }
      return this.acceptedManifest
    }
    this.acceptedManifest = deepFreeze({
      digest: manifest.digest,
      manifest,
      runtime: { ...PINNED_RUNTIME },
      acceptedAt: this.now(),
      publisherProcessId: request.publisher.processId
    })
    return this.acceptedManifest
  }

  current(): AcceptedDshRunManifest | undefined {
    return this.acceptedManifest
  }
}

export function hashPublisherToken(token: string): string {
  if (token.length === 0) {
    throw new Error('Publisher token is required')
  }
  return createHash('sha256').update(token).digest('hex')
}

function authenticatePublisher(
  expected: RealmFlowPublisherAuthentication,
  actual: RealmFlowPublisherAttempt
): void {
  if (actual.processId !== expected.processId) {
    throw new Error('RealmFlow publisher authentication failed')
  }
  const actualDigest = hashPublisherToken(actual.token)
  if (!safeEqualHexDigest(actualDigest, expected.tokenDigest)) {
    throw new Error('RealmFlow publisher authentication failed')
  }
}

function safeEqualHexDigest(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

function assertRuntimeCompatibility(runtime: DshRuntimeCompatibility): void {
  if (
    runtime.dshPackage !== PINNED_RUNTIME.dshPackage
    || runtime.dshVersion !== PINNED_RUNTIME.dshVersion
    || runtime.acpSdkVersion !== PINNED_RUNTIME.acpSdkVersion
  ) {
    throw new Error('DSH runtime compatibility mismatch')
  }
}

function assertExpectedIdentity(
  manifest: DshRunManifest,
  request: DshRunManifestLoadRequest
): void {
  if (
    request.expectedOwner !== undefined
    && stableJson(request.expectedOwner) !== stableJson(manifest.owner)
  ) {
    throw new Error('Run manifest owner mismatch')
  }
  if (
    request.expectedRunId !== undefined
    && request.expectedRunId !== manifest.runId
  ) {
    throw new Error('Run manifest run mismatch')
  }
  if (
    request.expectedSessionId !== undefined
    && request.expectedSessionId !== manifest.sessionId
  ) {
    throw new Error('Run manifest session mismatch')
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.freeze(value)
  for (const child of Object.values(value)) {
    deepFreeze(child)
  }
  return value
}
