import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { planBuiltinToolEffects } from './tool-effect-planner'

let directory: string
let root: string
let outside: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-effect-plan-'))
  root = join(directory, 'workspace')
  outside = join(directory, 'outside')
  await mkdir(root)
  await mkdir(outside)
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('planBuiltinToolEffects', () => {
  it('expands every source and destination for file and archive operations', async () => {
    await writeFile(join(root, 'source.txt'), 'source')
    await writeFile(join(root, 'second.txt'), 'second')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'archives.create',
        capabilities: ['filesystem.write'],
        arguments: {
          outputPath: 'bundle.zip',
          sources: [
            { path: 'source.txt', expectedChecksum: 'a'.repeat(64) },
            { path: 'second.txt', expectedChecksum: 'b'.repeat(64) }
          ]
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.read',
          path: await realpath(join(root, 'source.txt'))
        },
        {
          kind: 'filesystem.read',
          path: await realpath(join(root, 'second.txt'))
        },
        {
          kind: 'filesystem.write',
          path: join(await realpath(root), 'bundle.zip')
        }
      ]
    })
  })

  it('uses the Main-owned session path and expands auxiliary image reads', async () => {
    const deck = join(root, 'deck.pptx')
    const image = join(root, 'photo.png')
    await writeFile(deck, 'deck')
    await writeFile(image, 'image')
    const resolveSessionPath = vi.fn().mockResolvedValue(deck)

    await expect(
      planBuiltinToolEffects(
        {
          handlerName: 'presentation.replace_image',
          capabilities: ['filesystem.write'],
          arguments: {
            sessionId: 'session-1',
            imagePath: 'photo.png'
          },
          scopeRoots: [root]
        },
        { resolveSessionPath }
      )
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        { kind: 'filesystem.write', path: await realpath(deck) },
        { kind: 'filesystem.read', path: await realpath(image) }
      ]
    })
    expect(resolveSessionPath).toHaveBeenCalledWith(
      'presentation',
      'session-1'
    )
  })

  it('preserves a canonical out-of-root write for authorization', async () => {
    const target = join(outside, 'result.txt')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.write',
        capabilities: ['filesystem.write'],
        arguments: { path: target },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.write',
          path: join(await realpath(outside), 'result.txt')
        }
      ]
    })
  })

  it('treats scopeRoot dot as the current bound workspace root', async () => {
    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.write',
        capabilities: ['filesystem.write'],
        arguments: {
          path: 'notes/result.txt',
          scopeRoot: '.'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.write',
          path: join(await realpath(root), 'notes/result.txt')
        }
      ]
    })
  })

  it('accepts an absolute scopeRoot that normalizes to the bound root', async () => {
    const canonicalRoot = await realpath(root)

    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.write',
        capabilities: ['filesystem.write'],
        arguments: {
          path: 'notes/result.txt',
          scopeRoot: canonicalRoot
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.write',
          path: join(canonicalRoot, 'notes/result.txt')
        }
      ]
    })
  })

  it('uses absolute in-root paths when scopeRoot is an unauthorized parent', async () => {
    const target = join(root, 'notes', 'result.txt')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.write',
        capabilities: ['filesystem.write'],
        arguments: {
          path: target,
          scopeRoot: directory
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.write',
          path: join(await realpath(root), 'notes', 'result.txt')
        }
      ]
    })
  })

  it('plans document delivery reads and writes explicitly', async () => {
    const source = join(root, 'source.docx')
    const artifact = join(root, 'artifact.pdf')
    await writeFile(source, 'source')
    await writeFile(artifact, 'artifact')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'document.create',
        capabilities: ['filesystem.write'],
        arguments: { outputPath: 'created.docx' },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.write',
          path: join(await realpath(root), 'created.docx')
        }
      ]
    })
    await expect(
      planBuiltinToolEffects({
        handlerName: 'document.export_pdf',
        capabilities: ['filesystem.write'],
        arguments: {
          sourcePath: 'source.docx',
          outputPath: 'export.pdf'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        { kind: 'filesystem.read', path: await realpath(source) },
        {
          kind: 'filesystem.write',
          path: join(await realpath(root), 'export.pdf')
        }
      ]
    })
    await expect(
      planBuiltinToolEffects({
        handlerName: 'artifact.verify',
        capabilities: ['filesystem.read'],
        arguments: { path: 'artifact.pdf' },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        { kind: 'filesystem.read', path: await realpath(artifact) }
      ]
    })
  })

  it('plans every path in a batch file stat request', async () => {
    await mkdir(join(root, 'notes'))
    await writeFile(join(root, 'notes', 'one.txt'), 'one')
    await writeFile(join(root, 'notes', 'two.txt'), 'two')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.stat',
        capabilities: ['filesystem.read'],
        arguments: {
          paths: ['notes/one.txt', 'notes/two.txt'],
          scopeRoot: '.'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.read',
          path: join(await realpath(root), 'notes/one.txt')
        },
        {
          kind: 'filesystem.read',
          path: join(await realpath(root), 'notes/two.txt')
        }
      ]
    })
  })

  it('plans missing paths in a batch file stat request so the handler can report per-path errors', async () => {
    await mkdir(join(root, 'notes'))
    await writeFile(join(root, 'notes', 'one.txt'), 'one')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.stat',
        capabilities: ['filesystem.read'],
        arguments: {
          paths: ['notes/one.txt', 'notes/missing.txt'],
          scopeRoot: '.'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.read',
          path: join(await realpath(root), 'notes', 'one.txt')
        },
        {
          kind: 'filesystem.read',
          path: join(await realpath(root), 'notes', 'missing.txt')
        }
      ]
    })
  })

  it('redacts process arguments into deterministic fingerprints', async () => {
    const result = await planBuiltinToolEffects({
      handlerName: 'process.run',
      capabilities: ['process.execute'],
      arguments: {
        executable: 'node',
        arguments: ['--token', 'secret'],
        cwd: ''
      },
      scopeRoots: [root]
    })

    expect(result).toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'process.execute',
          executableDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
          executableDisplayName: 'node',
          argsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          workingDirectory: await realpath(root)
        }
      ]
    })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('plans web fetch as a sanitized network connection', async () => {
    await expect(
      planBuiltinToolEffects({
        handlerName: 'web.fetch',
        capabilities: ['network.connect'],
        arguments: {
          url: 'https://user:pass@example.com/search?token=secret&q=realmflow'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'external',
          capability: 'network.connect',
          resourceKey: 'https://example.com'
        }
      ]
    })
  })

  it('plans web search against the configured provider origin', async () => {
    await expect(
      planBuiltinToolEffects(
        {
          handlerName: 'web.search',
          capabilities: ['network.connect'],
          arguments: {
            query: 'realmflow'
          },
          scopeRoots: [root],
          webConfiguration: {
            revision: 1, searchProvider: 'searxng', browserContinuation: false,
            hasBraveCredential: false,
            searxngBaseUrl: 'https://search.example.com/search'
          }
        }
      )
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'external',
          capability: 'network.connect',
          resourceKey: 'https://search.example.com'
        }
      ]
    })
  })

  it('reports missing web search provider configuration during planning', async () => {
    await expect(
      planBuiltinToolEffects({
        handlerName: 'web.search',
        capabilities: ['network.connect'],
        arguments: {
          query: 'realmflow'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'provider_unconfigured',
        message: 'Web search is disabled. Configure a search provider in Settings before using web search.',
        retryable: false
      }
    })
  })

  it('plans a workspace-scoped process when scopeRoot dot is provided', async () => {
    const result = await planBuiltinToolEffects({
      handlerName: 'process.run',
      capabilities: ['process.execute'],
      arguments: {
        executable: 'node',
        arguments: ['--version'],
        cwd: '.',
        scopeRoot: '.'
      },
      scopeRoots: [root]
    })

    expect(result).toMatchObject({
      outcome: 'planned',
      effects: [
        {
          kind: 'process.execute',
          executableDisplayName: 'node',
          workingDirectory: await realpath(root)
        }
      ]
    })
  })

  it('treats a relative scopeRoot as a child of the single bound workspace root', async () => {
    await mkdir(join(root, 'out'))
    await writeFile(join(root, 'out', 'resume.pdf'), 'pdf')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'pdf.inspect',
        capabilities: ['filesystem.read'],
        arguments: {
          path: 'resume.pdf',
          scopeRoot: 'out'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.read',
          path: join(await realpath(root), 'out', 'resume.pdf')
        }
      ]
    })
  })

  it('does not duplicate a relative scopeRoot already present in the requested path', async () => {
    await mkdir(join(root, 'out'))
    await writeFile(join(root, 'out', 'resume.pdf'), 'pdf')

    await expect(
      planBuiltinToolEffects({
        handlerName: 'pdf.inspect',
        capabilities: ['filesystem.read'],
        arguments: {
          path: 'out/resume.pdf',
          scopeRoot: 'out'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'filesystem.read',
          path: join(await realpath(root), 'out', 'resume.pdf')
        }
      ]
    })
  })

  it('does not let a relative scopeRoot escape the bound workspace root', async () => {
    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.write',
        capabilities: ['filesystem.write'],
        arguments: {
          path: 'result.txt',
          scopeRoot: '../outside'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message: expect.stringContaining(
          'Use scopeRoot "." or omit scopeRoot to use the current folder'
        ),
        retryable: false
      }
    })
  })

  it('fails closed when a user-addressable effect cannot be resolved', async () => {
    await expect(
      planBuiltinToolEffects({
        handlerName: 'unknown.write',
        capabilities: ['filesystem.write'],
        arguments: {},
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message: 'Tool effects could not be resolved',
        retryable: false
      }
    })
  })

  it('returns the safe scope planning reason when effects cannot be resolved', async () => {
    await expect(
      planBuiltinToolEffects({
        handlerName: 'files.write',
        capabilities: ['filesystem.write'],
        arguments: {
          path: 'notes/result.txt',
          scopeRoot: '../outside'
        },
        scopeRoots: [root]
      })
    ).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message: expect.stringContaining(
          'Use scopeRoot "." or omit scopeRoot to use the current folder'
        ),
        retryable: false
      }
    })
  })
})
