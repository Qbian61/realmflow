import { describe, expect, it } from 'vitest'
import {
  ACP_SDK_VERSION,
  DSH_RUNTIME_PACKAGE,
  DSH_RUNTIME_VERSION
} from '../../../domain/dsh-run-manifest'
import { createDshRunManifest } from './test-manifest-fixture'
import {
  DshRunManifestLoader,
  hashPublisherToken
} from './run-manifest-loader'

describe('DshRunManifestLoader', () => {
  it('accepts only an authenticated RealmFlow publisher and freezes a compatible manifest', () => {
    const manifest = createDshRunManifest()
    const loader = new DshRunManifestLoader({
      publisher: {
        processId: 42,
        tokenDigest: hashPublisherToken('publisher-secret')
      },
      expectedRuntime: {
        dshPackage: DSH_RUNTIME_PACKAGE,
        dshVersion: DSH_RUNTIME_VERSION,
        acpSdkVersion: ACP_SDK_VERSION
      },
      now: () => 1_700
    })

    const accepted = loader.load({
      manifest,
      publisher: {
        processId: 42,
        token: 'publisher-secret'
      },
      expectedOwner: manifest.owner,
      expectedRunId: manifest.runId,
      expectedSessionId: manifest.sessionId
    })

    expect(accepted).toMatchObject({
      digest: manifest.digest,
      acceptedAt: 1_700,
      publisherProcessId: 42,
      runtime: {
        dshPackage: DSH_RUNTIME_PACKAGE,
        dshVersion: DSH_RUNTIME_VERSION,
        acpSdkVersion: ACP_SDK_VERSION
      }
    })
    expect(accepted.manifest).toEqual(manifest)
    expect(loader.current()).toBe(accepted)
    expect(Object.isFrozen(accepted)).toBe(true)
    expect(Object.isFrozen(accepted.manifest)).toBe(true)
    expect(() => {
      ;(accepted.manifest as { runId: string }).runId = 'run-mutated'
    }).toThrow()
  })

  it('rejects unauthenticated publishers before trusting the manifest payload', () => {
    const loader = new DshRunManifestLoader({
      publisher: {
        processId: 42,
        tokenDigest: hashPublisherToken('publisher-secret')
      }
    })

    expect(() =>
      loader.load({
        manifest: { digest: 'not-a-manifest' },
        publisher: {
          processId: 42,
          token: 'wrong-secret'
        }
      })
    ).toThrow(/publisher authentication/i)

    expect(loader.current()).toBeUndefined()
  })

  it('rejects digest, owner, session, and runtime compatibility mismatches', () => {
    const manifest = createDshRunManifest()
    const loader = trustedLoader()

    expect(() =>
      loader.load({
        manifest: {
          ...manifest,
          runId: 'run-tampered'
        },
        publisher: trustedPublisher()
      })
    ).toThrow(/digest mismatch/i)

    expect(() =>
      trustedLoader().load({
        manifest,
        publisher: trustedPublisher(),
        expectedOwner: {
          workspaceId: 'workspace-other'
        }
      })
    ).toThrow(/owner/i)

    expect(() =>
      trustedLoader().load({
        manifest,
        publisher: trustedPublisher(),
        expectedSessionId: 'session-other'
      })
    ).toThrow(/session/i)

    expect(() =>
      new DshRunManifestLoader({
        publisher: trustedPublisherConfig(),
        expectedRuntime: {
          dshPackage: DSH_RUNTIME_PACKAGE,
          dshVersion: '0.0.0',
          acpSdkVersion: ACP_SDK_VERSION
        }
      }).load({
        manifest,
        publisher: trustedPublisher()
      })
    ).toThrow(/runtime compatibility/i)
  })

  it('keeps the accepted manifest immutable for the run segment', () => {
    const first = createDshRunManifest()
    const second = createDshRunManifest({
      manifestId: 'manifest-2'
    })
    const loader = trustedLoader()

    const accepted = loader.load({
      manifest: first,
      publisher: trustedPublisher()
    })

    expect(
      loader.load({
        manifest: first,
        publisher: trustedPublisher()
      })
    ).toBe(accepted)
    expect(() =>
      loader.load({
        manifest: second,
        publisher: trustedPublisher()
      })
    ).toThrow(/immutable accepted manifest/i)
  })
})

function trustedLoader(): DshRunManifestLoader {
  return new DshRunManifestLoader({
    publisher: trustedPublisherConfig()
  })
}

function trustedPublisherConfig() {
  return {
    processId: 42,
    tokenDigest: hashPublisherToken('publisher-secret')
  }
}

function trustedPublisher() {
  return {
    processId: 42,
    token: 'publisher-secret'
  }
}
