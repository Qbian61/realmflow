import { describe, expect, it, vi } from 'vitest'
import {
  createCapabilityDefinition,
  type CapabilityDefinition,
  type CapabilityInstallation
} from '../../../../domain/capability'
import type { PreparedCapabilityPackage } from './capability-package-service'
import { CapabilityAtomicInstaller } from './capability-atomic-installer'

describe('CapabilityAtomicInstaller', () => {
  it('commits a validated package as installed and disabled by default', async () => {
    const prepared = preparedPackage()
    const publishAndInstall = vi.fn(async () => undefined)
    const installer = new CapabilityAtomicInstaller({
      catalog: { publishAndInstall },
      createId: () => 'installation-1',
      now: () => 200
    })

    const result = await installer.install({
      prepared,
      scope: { kind: 'workspace', workspaceId: 'workspace-1' }
    })

    expect(prepared.pending.commit).toHaveBeenCalledOnce()
    expect(publishAndInstall).toHaveBeenCalledWith(
      prepared.definition,
      expect.objectContaining({
        id: 'installation-1',
        enabled: false,
        status: 'installed_disabled',
        revision: 1,
        installedAt: 200,
        updatedAt: 200
      }),
      prepared.packageDigest
    )
    expect(result.installation.status).toBe('installed_disabled')
  })

  it('does not write the Catalog when the file commit fails', async () => {
    const prepared = preparedPackage()
    vi.mocked(prepared.pending.commit).mockRejectedValueOnce(
      new Error('injected move failure')
    )
    const publishAndInstall = vi.fn(async () => undefined)
    const installer = new CapabilityAtomicInstaller({
      catalog: { publishAndInstall }
    })

    await expect(
      installer.install({
        prepared,
        scope: { kind: 'global' }
      })
    ).rejects.toThrow('injected move failure')

    expect(publishAndInstall).not.toHaveBeenCalled()
    expect(prepared.pending.rollback).toHaveBeenCalledOnce()
  })

  it('removes the committed package when the Catalog transaction fails', async () => {
    const prepared = preparedPackage()
    const installer = new CapabilityAtomicInstaller({
      catalog: {
        publishAndInstall: vi.fn(async () => {
          throw new Error('injected catalog failure')
        })
      }
    })

    await expect(
      installer.install({
        prepared,
        scope: { kind: 'global' }
      })
    ).rejects.toThrow('injected catalog failure')

    expect(prepared.pending.commit).toHaveBeenCalledOnce()
    expect(prepared.pending.rollback).toHaveBeenCalledOnce()
  })

  it('rolls back the package when the transaction state callback fails', async () => {
    const prepared = preparedPackage()
    const saveGeneration = vi.fn(() => {
      throw new Error('injected generation failure')
    })
    const publishAndInstall = vi.fn(
      async (
        _definition: CapabilityDefinition,
        _installation: CapabilityInstallation,
        _packageDigest: string,
        onTransaction?: () => void
      ) => {
        onTransaction?.()
      }
    )
    const installer = new CapabilityAtomicInstaller({
      catalog: { publishAndInstall }
    })

    await expect(
      installer.install({
        prepared,
        scope: { kind: 'global' },
        onCatalogTransaction: saveGeneration
      })
    ).rejects.toThrow('injected generation failure')

    expect(saveGeneration).toHaveBeenCalledOnce()
    expect(prepared.pending.commit).toHaveBeenCalledOnce()
    expect(prepared.pending.rollback).toHaveBeenCalledOnce()
  })
})

function preparedPackage(): PreparedCapabilityPackage {
  const definition = createCapabilityDefinition({
    id: 'com.example.files',
    kind: 'tool',
    version: '1.0.0',
    source: 'local_upload',
    manifestDigest: 'a'.repeat(64),
    name: 'Files',
    description: 'Read files.',
    runtime: { kind: 'tool', definitionId: 'files.read' },
    permissions: {
      capabilities: ['filesystem.read'],
      maximumRisk: 'low',
      pathPrefixes: ['/workspace'],
      networkTargets: []
    },
    dependencies: [],
    compatibility: {
      realmflowVersionRange: '>=0.1.0 <1.0.0',
      platforms: ['darwin']
    },
    testPlan: [],
    publishedAt: 100
  })
  return {
    definition,
    packageDigest: 'b'.repeat(64),
    validationReport: {
      compatible: true,
      dependencyStatus: 'resolved',
      tests: []
    },
    source: { type: 'directory', displayName: 'files' },
    byteSize: 100,
    fileCount: 2,
    managedRelativePath: `capabilities/packages/${'b'.repeat(64)}`,
    pending: {
      path: '/tmp/staging',
      directoryName: 'b'.repeat(64),
      commit: vi.fn(async () => ({
        path: '/tmp/final',
        directoryName: 'b'.repeat(64)
      })),
      rollback: vi.fn(async () => undefined)
    }
  }
}
