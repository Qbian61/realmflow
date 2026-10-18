import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DshCapabilityPackagePublisher,
  type DshCapabilityPackageSource
} from './dsh-capability-package-publisher'

let directory: string
let sourceRoot: string
let storeRoot: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-dsh-packages-'))
  sourceRoot = join(directory, 'source')
  storeRoot = join(directory, 'store')
  await mkdir(join(sourceRoot, 'adapters'), { recursive: true })
  await mkdir(join(sourceRoot, 'skills'), { recursive: true })
  await writeFile(join(sourceRoot, 'package.json'), '{"name":"demo"}\n')
  await writeFile(join(sourceRoot, 'adapters', 'read.js'), 'export default {}\n')
  await writeFile(join(sourceRoot, 'skills', 'summarize.md'), 'Summarize.\n')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('DshCapabilityPackagePublisher', () => {
  it('publishes only activated and verified packages into a read-only content-addressed runtime store', async () => {
    const publisher = new DshCapabilityPackagePublisher({ storeRoot })
    const source = await packageSource()

    const result = await publisher.publish([
      source,
      {
        ...source,
        packageId: 'realmflow.disabled',
        status: 'disabled'
      }
    ])

    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]).toMatchObject({
      packageId: 'realmflow.demo',
      packageDigest: source.packageDigest,
      mount: {
        readOnly: true
      },
      artifacts: [
        expect.objectContaining({
          kind: 'tool-adapter',
          capabilityId: 'builtin.demo.read'
        }),
        expect.objectContaining({
          kind: 'skill-instructions',
          capabilityId: 'builtin.demo.summarize'
        })
      ]
    })
    const packageFile = join(
      storeRoot,
      'packages',
      source.packageDigest,
      'package.json'
    )
    const adapterArtifact = result.packages[0].artifacts.find(
      ({ kind }) => kind === 'tool-adapter'
    )
    const skillArtifact = result.packages[0].artifacts.find(
      ({ kind }) => kind === 'skill-instructions'
    )
    expect(await readFile(packageFile, 'utf8')).toBe('{"name":"demo"}\n')
    expect(adapterArtifact).toBeDefined()
    expect(skillArtifact).toBeDefined()
    expect(await stat(adapterArtifact!.path)).toMatchObject({ mode: expect.any(Number) })
    expect((await stat(packageFile)).mode & 0o222).toBe(0)
    expect((await stat(adapterArtifact!.path)).mode & 0o222).toBe(0)
    expect((await stat(skillArtifact!.path)).mode & 0o222).toBe(0)
  })

  it('rejects unverified, incompatible, mismatched, or unsafe packages', async () => {
    const publisher = new DshCapabilityPackagePublisher({ storeRoot })
    const source = await packageSource()

    await expect(
      publisher.publish([
        {
          ...source,
          verification: {
            ...source.verification,
            signature: 'missing'
          }
        }
      ])
    ).rejects.toThrow(/signature/)
    await expect(
      publisher.publish([
        {
          ...source,
          packageDigest: '0'.repeat(64)
        }
      ])
    ).rejects.toThrow(/checksum/)
    await expect(
      publisher.publish([
        {
          ...source,
          verification: {
            ...source.verification,
            runtimeCompatibility: 'incompatible'
          }
        }
      ])
    ).rejects.toThrow(/runtime compatibility/)
    await expect(
      publisher.publish([
        {
          ...source,
          artifacts: [
            {
              kind: 'tool-adapter',
              capabilityId: 'builtin.demo.read',
              relativePath: '../outside.js'
            }
          ]
        }
      ])
    ).rejects.toThrow(/artifact path/)
  })

  it('garbage-collects only packages not referenced by active or resumable sessions', async () => {
    const publisher = new DshCapabilityPackagePublisher({ storeRoot })
    const source = await packageSource()
    const secondRoot = join(directory, 'source-two')
    await mkdir(secondRoot, { recursive: true })
    await writeFile(join(secondRoot, 'package.json'), '{"name":"second"}\n')
    const secondDigest = await digestDirectory(secondRoot)

    await publisher.publish([
      source,
      {
        ...source,
        packageId: 'realmflow.second',
        version: '1.0.0',
        packageDigest: secondDigest,
        sourcePath: secondRoot,
        artifacts: []
      }
    ])

    const removed = await publisher.garbageCollect({
      activePackageDigests: [source.packageDigest]
    })

    expect(removed).toEqual([secondDigest])
    await expect(stat(join(storeRoot, 'packages', source.packageDigest))).resolves.toBeTruthy()
    await expect(stat(join(storeRoot, 'packages', secondDigest))).rejects.toThrow()
  })
})

async function packageSource(): Promise<DshCapabilityPackageSource> {
  return {
    packageId: 'realmflow.demo',
    version: '1.0.0',
    packageDigest: await digestDirectory(sourceRoot),
    sourcePath: sourceRoot,
    status: 'enabled',
    verification: {
      signature: 'verified',
      checksum: 'verified',
      permissions: 'verified',
      runtimeCompatibility: 'compatible',
      dependencyLock: 'locked'
    },
    artifacts: [
      {
        kind: 'tool-adapter',
        capabilityId: 'builtin.demo.read',
        relativePath: 'adapters/read.js'
      },
      {
        kind: 'skill-instructions',
        capabilityId: 'builtin.demo.summarize',
        relativePath: 'skills/summarize.md'
      }
    ]
  }
}

async function digestDirectory(root: string): Promise<string> {
  const files = root === sourceRoot
    ? [
        ['adapters/read.js', await readFile(join(root, 'adapters', 'read.js'))],
        ['package.json', await readFile(join(root, 'package.json'))],
        ['skills/summarize.md', await readFile(join(root, 'skills', 'summarize.md'))]
      ]
    : [['package.json', await readFile(join(root, 'package.json'))]]
  const hash = createHash('sha256')
  for (const [path, content] of files) {
    hash.update(`${String(path).length}:${String(path)}`)
    hash.update(`${(content as Buffer).byteLength}:`)
    hash.update(content as Buffer)
  }
  return hash.digest('hex')
}
