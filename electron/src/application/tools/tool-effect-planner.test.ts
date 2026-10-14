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
  it.each(['.env', '.env.local', '.ssh/id_rsa', '.aws/credentials', '.git/config'])(
    'marks %s as sensitive even inside the workspace', async path => {
      await mkdir(join(root, path, '..'), { recursive: true })
      await writeFile(join(root, path), 'private')
      expect(await planBuiltinToolEffects({
        handlerName: 'files.read', capabilities: ['filesystem.read'],
        arguments: { path }, scopeRoots: [root]
      })).toMatchObject({ outcome: 'planned', effects: [{ sensitivity: 'sensitive' }] })
    })

  it.each(['.git/config', '.realmflow/state.db', '.trae/rules/security.md', '.agents/skills/auth.md'])(
    'rejects raw mutation of protected path %s', async path => {
      expect(await planBuiltinToolEffects({
        handlerName: 'files.write', capabilities: ['filesystem.write'],
        arguments: { path }, scopeRoots: [root]
      })).toMatchObject({ outcome: 'unresolved' })
    })

  it('rejects an alias into a Main-owned protected directory', async () => {
    expect(await planBuiltinToolEffects({
      handlerName: 'files.write', capabilities: ['filesystem.write'],
      arguments: { path: join(outside, 'database.db') }, scopeRoots: [root]
    }, { protectedRoots: [outside] } as never)).toMatchObject({ outcome: 'unresolved' })
  })

  it('plans process.discover as a bounded read against the selected workspace root', async () => {
    const result = await planBuiltinToolEffects({
      handlerName: 'process.discover',
      capabilities: ['process.discover'],
      arguments: { names: ['node'] }, scopeRoots: [root]
    })
    expect(result).toMatchObject({
      outcome: 'planned',
      effects: [{ kind: 'process.inspect', workingDirectory: await realpath(root) }]
    })
  })

  it('plans process.list as an owner-scoped read without requiring a file scope root', async () => {
    await expect(planBuiltinToolEffects({
      handlerName: 'process.list',
      capabilities: ['process.inspect'],
      arguments: {},
      scopeRoots: [],
      context: {
        owner: { type: 'conversation', id: 'conversation-1' },
        correlationId: 'correlation',
        causationId: 'cause'
      }
    })).resolves.toEqual({
      outcome: 'planned',
      effects: [
        {
          kind: 'process.inspect',
          owner: { type: 'conversation', id: 'conversation-1' }
        }
      ]
    })
  })

  it('requires Main evidence that a stopped process belongs to the current Run', async () => {
    const input = { handlerName: 'process.stop', capabilities: ['process.manage'] as const,
      arguments: { processId: 'child-one', currentRun: true }, scopeRoots: [root],
      context: { owner: { type: 'conversation' as const, id: 'chat-1' }, parentExecutionId: 'run-1',
        correlationId: 'c', causationId: 'c' } }
    expect(await planBuiltinToolEffects(input)).toMatchObject({ outcome: 'unresolved' })
    expect(await planBuiltinToolEffects(input, {
      managedProcesses: { describeManaged: async () => ({ currentRun: true, fingerprint: 'a'.repeat(64) }) }
    } as never)).toMatchObject({ outcome: 'planned', effects: [{ kind: 'process.manage', currentRun: true }] })
  })

  it('uses Main page evidence for public browser reads and refuses model claimed evidence', async () => {
    const input = { handlerName: 'browser.snapshot', capabilities: ['computer.observe'] as const,
      arguments: { sessionId: 'browser-one', public: true }, scopeRoots: [root] }
    const dependencies = { browser: { describe: async () => ({
      url: 'https://example.com/', privateSession: false, targetDigest: 'a'.repeat(64), semantic: 'read'
    }) }, context: undefined }
    const plan = await planBuiltinToolEffects(input, dependencies as never)
    expect(plan).toMatchObject({ outcome: 'planned', effects: [{ kind: 'browser.page.read', privateSession: false }] })
    expect((await planBuiltinToolEffects(input)).outcome).toBe('unresolved')
  })

  it('plans a real submit target as external publication regardless of supplied safe label', async () => {
    const result = await planBuiltinToolEffects({
      handlerName: 'browser.click', capabilities: ['computer.control'],
      arguments: { sessionId: 'browser-one', ref: 'ref1', label: 'Read more' }, scopeRoots: [root]
    }, { browser: { describe: async () => ({
      url: 'https://example.com/pay', privateSession: true, targetDigest: 'b'.repeat(64), semantic: 'publish'
    }) } } as never)
    expect(result).toMatchObject({ outcome: 'planned', effects: [{ kind: 'browser.page.control', semantic: 'publish' }] })
  })

  it('uses trusted process isolation evidence instead of model supplied safety', async () => {
    const result = await planBuiltinToolEffects({
      handlerName: 'process.run', capabilities: ['process.execute'],
      arguments: { executable: 'node', arguments: ['--eval', 'deleteEverything()'],
        cwd: '', execution: 'sandboxed', commandClass: 'safe' },
      scopeRoots: [root]
    })
    expect(result).toMatchObject({ outcome: 'planned', effects: [{
      kind: 'process.execute', execution: 'host', commandClass: 'unknown'
    }] })
  })

  it.each([
    ['npm', ['test'], 'safe'],
    ['npm', ['run', 'build'], 'safe'],
    ['node', ['--eval', 'console.log(1)'], 'unknown'],
    ['sh', ['-c', 'rm -rf .'], 'dangerous'],
    ['git', ['push'], 'dangerous'],
    ['curl', ['https://example.com'], 'dangerous']
  ] as const)('classifies %s from Main evidence', async (executable, args, commandClass) => {
    const result = await planBuiltinToolEffects({
      handlerName: 'process.run', capabilities: ['process.execute'],
      arguments: { executable, arguments: [...args], cwd: '' }, scopeRoots: [root]
    }, { processIsolation: {
      describe: async () => ({ execution: 'sandboxed' })
    } })
    expect(result).toMatchObject({ outcome: 'planned', effects: [{
      kind: 'process.execute', execution: 'sandboxed', commandClass
    }] })
  })

  it('separates isolated browser creation from operating-system control', async () => {
    await expect(planBuiltinToolEffects({
      handlerName: 'browser.create', capabilities: ['computer.control'],
      arguments: {}, scopeRoots: [root],
    })).resolves.toEqual({
      outcome: 'planned',
      effects: [{ kind: 'browser.session.create', profile: 'isolated' }],
    })
  })

  it('plans local Git commit as a repository-local mutation', async () => {
    await mkdir(join(root, '.git'))

    await expect(planBuiltinToolEffects({
      handlerName: 'git.commit', capabilities: ['repository.modify'],
      arguments: {}, scopeRoots: [root],
    })).resolves.toEqual({
      outcome: 'planned',
      effects: [{ kind: 'repository.local_write', repositoryRoot: await realpath(root) }],
    })
  })

  it('rejects Git effects when the selected folder is not a repository', async () => {
    await expect(planBuiltinToolEffects({
      handlerName: 'git.status', capabilities: ['repository.read'],
      arguments: {}, scopeRoots: [root],
    })).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message: 'Tool effects could not be resolved',
        retryable: false
      },
    })
  })

  it('plans Git effects against the discovered nested repository top-level', async () => {
    const repository = join(root, 'repository')
    const selected = join(repository, 'src')
    await mkdir(join(repository, '.git'), { recursive: true })
    await mkdir(selected, { recursive: true })

    await expect(planBuiltinToolEffects({
      handlerName: 'git.status', capabilities: ['repository.read'],
      arguments: { scopeRoot: 'repository/src' }, scopeRoots: [root],
    })).resolves.toEqual({
      outcome: 'planned',
      effects: [{ kind: 'filesystem.read', path: await realpath(repository) }],
    })
  })

  it('rejects Git effects when the parent repository escapes the authorized root', async () => {
    const parentRepository = join(directory, 'parent-repository')
    const authorizedChild = join(parentRepository, 'child')
    await mkdir(join(parentRepository, '.git'), { recursive: true })
    await mkdir(authorizedChild, { recursive: true })

    await expect(planBuiltinToolEffects({
      handlerName: 'git.status', capabilities: ['repository.read'],
      arguments: {}, scopeRoots: [authorizedChild],
    })).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message:
          'Git repository is outside the authorized scope. Choose the repository folder as the scope root.',
        retryable: false
      },
    })
  })

  it('plans a public fetch without an external-write permission', async () => {
    await expect(planBuiltinToolEffects({
      handlerName: 'web.fetch', capabilities: ['network.connect'],
      arguments: { url: 'https://example.com/article' }, scopeRoots: [root],
    })).resolves.toEqual({
      outcome: 'planned',
      effects: [{ kind: 'network.public_read', origin: 'https://example.com', localDataEgress: false }],
    })
  })

  it('rejects private-network web fetch targets during effect planning', async () => {
    await expect(planBuiltinToolEffects({
      handlerName: 'web.fetch', capabilities: ['network.connect'],
      arguments: { url: 'http://127.0.0.1:8080/private' }, scopeRoots: [root],
    })).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message: 'Tool effects could not be resolved',
        retryable: false
      },
    })
  })

  it.each([
    'http://[::127.0.0.1]/private',
    'http://[64:ff9b::a9fe:a9fe]/metadata',
    'http://[2002:0a00:0001::]/private'
  ])('rejects IPv6 literal aliases for private web fetch targets %s', async (url) => {
    await expect(planBuiltinToolEffects({
      handlerName: 'web.fetch', capabilities: ['network.connect'],
      arguments: { url }, scopeRoots: [root],
    })).resolves.toEqual({
      outcome: 'unresolved',
      error: {
        code: 'tool_effects_unresolved',
        message: 'Tool effects could not be resolved',
        retryable: false
      },
    })
  })

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
          execution: 'host',
          commandClass: 'dangerous',
          argsFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
          workingDirectory: await realpath(root)
        }
      ]
    })
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('rejects embedded credentials in a public web fetch', async () => {
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
      outcome: 'unresolved',
      error: { code: 'tool_effects_unresolved', message: 'Tool effects could not be resolved', retryable: false },
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
          kind: 'network.public_read',
          localDataEgress: false,
          providerId: 'searxng',
          origin: 'https://search.example.com'
        }
      ]
    })
  })

  it('does not plan browser fallback effects when search provider is unconfigured', async () => {
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
        message: 'Web search provider is not configured',
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
