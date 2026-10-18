import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModelExecutionConfig } from '../../../../domain/model'
import { DshRuntimeSupervisor, type DshRuntimeChildProcess, type DshRuntimeLaunchDescriptor, type DshRuntimeProcessPort, type DshRuntimeSupervisorOptions } from './dsh-runtime-supervisor'
import type { DshRuntimeLocation, DshRuntimeLocatorPort } from './dsh-runtime-locator'
import { AcpTestServer } from './acp-test-server'

let servers: AcpTestServer[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.allSettled(servers.map((server) => server.close()))
  servers = []
})

describe('DshRuntimeSupervisor', () => {
  it('launches the pinned ACP runtime with a sanitized environment and waits for initialize before becoming ready', async () => {
    const server = trackServer(new AcpTestServer())
    const port = new FakeDshProcessPort([server])
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(),
      processPort: port,
      environment: {
        HOME: '/user/home',
        OPENAI_API_KEY: 'sk-secret',
        PATH: '/usr/bin'
      }
    })

    await supervisor.start()

    expect(supervisor.status()).toBe('ready')
    expect(port.launches).toHaveLength(1)
    expect(port.launches[0]).toMatchObject({
      executable: runtimeLocation.nodeBinaryPath,
      args: [
        runtimeLocation.dshEntrypointPath,
        '--profile',
        'acp'
      ],
      cwd: runtimeLocation.runtimeRoot,
      env: {
        DSH_HOME: runtimeLocation.dshHome,
        DSH_TELEMETRY_DISABLED: '1',
        REALMFLOW_DSH_PROVIDER_ID: 'deepseek-official',
        REALMFLOW_DSH_MODEL_ID: 'deepseek-flash',
        REALMFLOW_DSH_SESSION_ROOT: `${runtimeLocation.dshHome}/sessions`,
        REALMFLOW_DSH_RUNTIME_ID: runtimeLocation.runtimeId
      },
      sandbox: {
        allowedReadRoots: [runtimeLocation.assetsRoot],
        allowedWriteRoots: [runtimeLocation.dshHome]
      }
    })
    expect(JSON.stringify(port.launches[0].env)).not.toContain('sk-secret')
    expect(JSON.stringify(port.launches[0].env)).not.toContain('OPENAI_API_KEY')
  })

  it('ignores legacy model credential environment fields when launching the child process', async () => {
    const server = trackServer(new AcpTestServer())
    const port = new FakeDshProcessPort([server])
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(),
      processPort: port,
      environment: {
        DEEPSEEK_API_KEY: 'parent-secret',
        PATH: '/usr/bin'
      },
      credentialEnvironment: {
        resolve: async () => ({
          DEEPSEEK_API_KEY: 'stored-secret'
        })
      }
    } as DshRuntimeSupervisorOptions & {
      credentialEnvironment: {
        resolve(): Promise<Record<string, string>>
      }
    })

    await supervisor.start()

    expect(port.launches[0].env.DEEPSEEK_API_KEY).toBeUndefined()
    expect(JSON.stringify(port.launches[0].env)).not.toContain('parent-secret')
    expect(JSON.stringify(port.launches[0].env)).not.toContain('stored-secret')
  })

  it('syncs supported model credentials into the DSH local credential store without exposing them through process env', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'realmflow-dsh-home-'))
    const location = {
      ...runtimeLocation,
      dshHome
    }
    const server = trackServer(new AcpTestServer())
    const port = new FakeDshProcessPort([server], { exitOnSigkill: true })
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(location),
      processPort: port,
      environment: {
        PATH: '/usr/bin'
      },
      shutdownTimeoutMs: 20
    })

    try {
      await supervisor.syncModelCredentials({
        providerId: 'builtin-deepseek',
        providerType: 'openai_completions',
        catalogProviderId: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        modelProfileId: 'builtin-deepseek:deepseek-flash',
        modelId: 'deepseek-flash',
        timeoutMs: 120_000,
        maxRetries: 2,
        maxConcurrency: 2,
        apiKey: 'sk-test-deepseek',
        capabilities: {
          text: true,
          vision: true,
          toolCalling: true,
          structuredOutput: true
        }
      })

      const credentialPath = join(dshHome, '.credentials.yaml')
      const credentialText = await readFile(credentialPath, 'utf8')
      expect(credentialText).toContain('version: 1')
      expect(credentialText).toContain('DEEPSEEK_API_KEY: sk-test-deepseek')
      expect((await stat(credentialPath)).mode & 0o077).toBe(0)

      await supervisor.start()

      expect(JSON.stringify(port.launches[0].env)).not.toContain('sk-test-deepseek')
      expect(port.launches[0].env.DEEPSEEK_API_KEY).toBeUndefined()
    } finally {
      await supervisor.stop().catch(() => undefined)
      await rm(dshHome, { recursive: true, force: true })
    }
  })

  it('restarts once with a non-secret route when a custom vision model replaces the active model', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'realmflow-dsh-home-'))
    const location = {
      ...runtimeLocation,
      dshHome
    }
    const firstServer = trackServer(new AcpTestServer())
    const secondServer = trackServer(new AcpTestServer())
    const port = new FakeDshProcessPort(
      [firstServer, secondServer],
      { exitOnSigkill: true }
    )
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(location),
      processPort: port,
      environment: {
        PATH: '/usr/bin'
      },
      shutdownTimeoutMs: 20
    })
    const model: ModelExecutionConfig = {
      providerId: 'test-mock-vision-provider',
      providerType: 'openai_completions',
      baseUrl: 'http://127.0.0.1:43117/v1',
      modelProfileId: 'test-mock-vision-profile',
      modelId: 'mock-vision-1',
      displayName: 'Mock Vision',
      timeoutMs: 120_000,
      maxRetries: 2,
      maxConcurrency: 2,
      apiKey: 'sk-test-vision',
      capabilities: {
        text: true,
        vision: true,
        toolCalling: true,
        structuredOutput: false
      }
    }

    try {
      await supervisor.start()
      await supervisor.syncModelCredentials(model)

      expect(port.launches).toHaveLength(2)
      expect(port.launches[1].env).toMatchObject({
        REALMFLOW_DSH_PROVIDER_ID: 'realmflow-model',
        REALMFLOW_DSH_MODEL_ID: 'mock-vision-1'
      })
      expect(
        JSON.parse(port.launches[1].env.REALMFLOW_DSH_PI_AI_PROVIDERS)
      ).toEqual({
        'realmflow-model': {
          apiKeyEnv: 'REALMFLOW_DSH_MODEL_API_KEY',
          displayName: 'Mock Vision',
          api: 'openai-completions',
          baseURL: 'http://127.0.0.1:43117/v1',
          models: [
            {
              id: 'mock-vision-1',
              name: 'Mock Vision',
              input: ['text', 'image']
            }
          ],
          timeoutMs: 120_000,
          retryPolicy: {
            mode: 'normal',
            maxRetries: 2
          }
        }
      })
      expect(JSON.stringify(port.launches[1].env)).not.toContain('sk-test-vision')
      await expect(
        readFile(join(dshHome, '.credentials.yaml'), 'utf8')
      ).resolves.toContain(
        'REALMFLOW_DSH_MODEL_API_KEY: sk-test-vision'
      )

      await supervisor.syncModelCredentials(model)

      expect(port.launches).toHaveLength(2)
    } finally {
      await supervisor.stop().catch(() => undefined)
      await rm(dshHome, { recursive: true, force: true })
    }
  })

  it('replays stored parent inbox updates for subagent completion projection', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'realmflow-dsh-home-'))
    const location = {
      ...runtimeLocation,
      dshHome
    }
    const sessionId = 'parent-session-1'
    const sessionDir = join(dshHome, 'sessions', 'workspace-root', sessionId)
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      join(sessionDir, 'session.v4.jsonl.zstd'),
      [
        JSON.stringify({
          type: 'tool/call',
          seq: 14,
          time: 1_800,
          data: {
            callId: 'call_subagent',
            name: 'subagent'
          }
        }),
        JSON.stringify({
          type: 'agent/inbox/spliced',
          seq: 19,
          time: 2_400,
          data: {
            inserted: [
              {
                source: {
                  kind: 'agent-message',
                  senderSessionId: 'child-session-1'
                },
                content: [
                  {
                    type: 'text',
                    text: 'child completed'
                  }
                ]
              }
            ]
          }
        })
      ].join('\n')
    )
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(location),
      processPort: new FakeDshProcessPort([])
    })

    try {
      await expect(supervisor.readSessionUpdates({
        sessionId,
        afterSequence: 0,
        limit: 10
      })).resolves.toMatchObject({
        updates: [
          {
            sessionUpdate: 'tool/call',
            seq: 14
          },
          {
            sessionUpdate: 'agent/inbox/spliced',
            seq: 19,
            data: {
              inserted: [
                {
                  source: {
                    kind: 'agent-message',
                    senderSessionId: 'child-session-1'
                  }
                }
              ]
            }
          }
        ],
        nextAfterSequence: 19,
        hasMore: false
      })
    } finally {
      await rm(dshHome, { recursive: true, force: true })
    }
  })

  it('replays stored subagent catalog updates for cancellation projection', async () => {
    const dshHome = await mkdtemp(join(tmpdir(), 'realmflow-dsh-home-'))
    const location = {
      ...runtimeLocation,
      dshHome
    }
    const sessionId = 'parent-session-cancel'
    const sessionDir = join(dshHome, 'sessions', 'workspace-root', sessionId)
    await mkdir(sessionDir, { recursive: true })
    await writeFile(
      join(sessionDir, 'session.v4.jsonl.zstd'),
      [
        JSON.stringify({
          type: 'tool/call',
          seq: 11,
          time: 2_000,
          data: {
            callId: 'call_subagent_cancel',
            name: 'subagent'
          }
        }),
        JSON.stringify({
          type: 'subagent/catalog',
          seq: 12,
          time: 2_100,
          data: {
            childId: 'child-session-cancel',
            childCreatedAt: 2_050,
            mode: 'continuable',
            label: 'Long cancellable child task'
          }
        })
      ].join('\n')
    )
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(location),
      processPort: new FakeDshProcessPort([])
    })

    try {
      await expect(supervisor.readSessionUpdates({
        sessionId,
        afterSequence: 0,
        limit: 10
      })).resolves.toMatchObject({
        updates: [
          {
            sessionUpdate: 'tool/call',
            seq: 11
          },
          {
            sessionUpdate: 'subagent/catalog',
            seq: 12,
            data: {
              childId: 'child-session-cancel',
              label: 'Long cancellable child task'
            }
          }
        ],
        nextAfterSequence: 12,
        hasMore: false
      })
    } finally {
      await rm(dshHome, { recursive: true, force: true })
    }
  })

  it('forwards ACP permission requests through the configured interaction handler', async () => {
    const server = trackServer(new AcpTestServer())
    const port = new FakeDshProcessPort([server])
    const permissionHandler = vi.fn(async () => ({
      outcome: {
        outcome: 'selected' as const,
        optionId: 'allow_once'
      }
    }))
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(),
      processPort: port,
      onRequestPermission: permissionHandler
    })

    await supervisor.start()
    const session = await supervisor.newSession({ cwd: '/workspace/one' })
    const response = await server.requestPermission({
      sessionId: session.sessionId,
      toolCall: {
        toolCallId: 'tool-call-1',
        title: 'Write file'
      },
      options: [
        {
          optionId: 'deny',
          name: 'Deny',
          kind: 'reject'
        },
        {
          optionId: 'allow_once',
          name: 'Allow once',
          kind: 'allow'
        }
      ]
    })

    expect(permissionHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: session.sessionId,
        toolCall: expect.objectContaining({
          toolCallId: 'tool-call-1',
          title: 'Write file'
        })
      })
    )
    expect(response).toEqual({
      outcome: {
        outcome: 'selected',
        optionId: 'allow_once'
      }
    })
  })

  it('rejects in-flight ACP requests on unexpected exit and restarts with bounded backoff', async () => {
    vi.useFakeTimers()
    const firstServer = trackServer(new AcpTestServer())
    const secondServer = trackServer(new AcpTestServer())
    const port = new FakeDshProcessPort([firstServer, secondServer])
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(),
      processPort: port,
      restart: {
        maxRestarts: 1,
        initialBackoffMs: 25,
        maxBackoffMs: 25
      }
    })

    await supervisor.start()
    const session = await supervisor.newSession({ cwd: '/workspace/one' })
    const prompt = supervisor.prompt({
      sessionId: session.sessionId,
      prompt: [{ type: 'text', text: 'wait' }]
    })
    await firstServer.waitForRequest('session/prompt', session.sessionId)

    port.children[0].emitExit(1, null)

    await expect(prompt).rejects.toThrow(/ACP connection is closed/)
    expect(supervisor.status()).toBe('restarting')
    await vi.advanceTimersByTimeAsync(25)
    await Promise.resolve()

    expect(port.launches).toHaveLength(2)
    expect(supervisor.status()).toBe('ready')
  })

  it('closes active sessions and ACP before terminating the child, escalating to hard kill after timeout', async () => {
    vi.useFakeTimers()
    const server = trackServer(new AcpTestServer())
    const port = new FakeDshProcessPort([server], { exitOnSigkill: true })
    const supervisor = new DshRuntimeSupervisor({
      locator: locator(),
      processPort: port,
      shutdownTimeoutMs: 20
    })

    await supervisor.start()
    const first = await supervisor.newSession({ cwd: '/workspace/one' })
    const second = await supervisor.newSession({ cwd: '/workspace/two' })

    const stop = supervisor.stop()
    await server.waitForRequest('session/close', first.sessionId)
    await server.waitForRequest('session/close', second.sessionId)
    await vi.advanceTimersByTimeAsync(20)
    await stop

    expect(server.closedSessionIds).toEqual([first.sessionId, second.sessionId])
    expect(port.children[0].killSignals).toEqual(['SIGTERM', 'SIGKILL'])
    expect(supervisor.status()).toBe('stopped')
  })
})

const runtimeLocation: DshRuntimeLocation = {
  assetsRoot: '/app/resources/dsh',
  dshEntrypointPath: '/app/resources/dsh/runtime/darwin-arm64/dsh/apps/cli/lib/bin.js',
  dshHome: '/user-data/dsh/home',
  manifestPath: '/app/resources/dsh/runtime-manifest.json',
  nodeBinaryPath: '/app/resources/dsh/runtime/darwin-arm64/node/bin/node',
  profilePath: '/app/resources/dsh/profile/package.json',
  runtimeBuildDigest: 'a'.repeat(64),
  runtimeId: 'dsh-v0.2.1-alpha.3-16-g571902028a',
  runtimeRoot: '/app/resources/dsh/runtime/darwin-arm64',
  target: 'darwin-arm64'
}

function locator(location: DshRuntimeLocation = runtimeLocation): DshRuntimeLocatorPort {
  return {
    resolve: async () => location
  }
}

function trackServer(server: AcpTestServer): AcpTestServer {
  servers.push(server)
  return server
}

class FakeDshProcessPort implements DshRuntimeProcessPort {
  readonly launches: DshRuntimeLaunchDescriptor[] = []
  readonly children: FakeDshChildProcess[] = []
  private index = 0

  constructor(
    private readonly plannedServers: AcpTestServer[],
    private readonly options: { exitOnSigkill?: boolean } = {}
  ) {}

  spawn(descriptor: DshRuntimeLaunchDescriptor): DshRuntimeChildProcess {
    const server = this.plannedServers[this.index++]
    if (server === undefined) throw new Error('No fake DSH server planned')
    const transport = server.transport()
    const child = new FakeDshChildProcess(
      transport.stdin,
      transport.stdout,
      transport.stderr ?? new PassThrough(),
      this.options
    )
    this.launches.push(descriptor)
    this.children.push(child)
    return child
  }
}

class FakeDshChildProcess extends EventEmitter implements DshRuntimeChildProcess {
  readonly killSignals: string[] = []

  constructor(
    readonly stdin: DshRuntimeChildProcess['stdin'],
    readonly stdout: DshRuntimeChildProcess['stdout'],
    readonly stderr: DshRuntimeChildProcess['stderr'],
    private readonly options: { exitOnSigkill?: boolean }
  ) {
    super()
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killSignals.push(String(signal ?? 'SIGTERM'))
    if (signal === 'SIGKILL' && this.options.exitOnSigkill === true) {
      this.emitExit(null, 'SIGKILL')
    }
    return true
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.emit('exit', code, signal)
  }
}
