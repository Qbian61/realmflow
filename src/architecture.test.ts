import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const sourceRoot = resolve('src')
const sourceFiles = collectSourceFiles(sourceRoot)
const sharedRoot = resolve('shared')
const sharedFiles = collectSourceFiles(sharedRoot)
const electronRoot = resolve('electron/src')
const electronFiles = collectSourceFiles(electronRoot)
const pythonRoot = resolve('python-service')
const pythonFiles = collectSourceFiles(pythonRoot, /\.py$/)

describe('renderer architecture boundaries', () => {
  it('keeps Runtime governance writes in Main and evaluation isolated from conversation repositories', () => {
    const rendererViolations = sourceFiles.flatMap((file) =>
      importsOf(file)
        .filter(
          (specifier) =>
            specifier.includes('runtime-governance-repository') ||
            specifier.includes('runtime_evaluation_runs')
        )
        .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
    )
    const pythonViolations = pythonFiles
      .filter((file) =>
        /runtime_governance_(?:events|revisions)|runtime_evaluation_runs/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(pythonRoot, file))
    const evaluationService = readFileSync(
      resolve(
        electronRoot,
        'application/analytics/runtime-governance-service.ts'
      ),
      'utf8'
    )

    expect(rendererViolations).toEqual([])
    expect(pythonViolations).toEqual([])
    expect(evaluationService).not.toContain('/application/conversation/')
    expect(evaluationService).not.toContain('../conversation/')
  })

  it('requires capability kinds to expose governance metadata contracts', () => {
    const capability = readFileSync(resolve('domain/capability.ts'), 'utf8')
    const tool = readFileSync(resolve('domain/tool-definition.ts'), 'utf8')
    const skill = readFileSync(resolve('domain/skill-definition.ts'), 'utf8')
    const agent = readFileSync(resolve('domain/agent-profile.ts'), 'utf8')

    expect(capability).toContain(
      'export const CAPABILITY_GOVERNANCE_METADATA_FIELDS'
    )
    expect(capability).toContain('testPlan:')
    expect(tool).toContain('effects:')
    expect(tool).toContain('resources:')
    expect(skill).toContain('activation:')
    expect(skill).toContain('limits:')
    expect(agent).toContain('capabilityPolicy:')
  })

  it('mounts the global tooltip provider in standard and native overlay roots', () => {
    const appSource = readFileSync(resolve(sourceRoot, 'App.tsx'), 'utf8')
    const mainSource = readFileSync(resolve(sourceRoot, 'main.tsx'), 'utf8')

    expect(appSource).toContain('TooltipProvider')
    expect(mainSource).toContain('<TooltipProvider>')
    expect(mainSource).toContain('<NativeWorkbenchMenu')
  })

  it('gives labelled buttons concise operation tooltips', () => {
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .flatMap((file) => {
        const source = readFileSync(file, 'utf8')
        const titleViolations = [...source.matchAll(/<button\b[\s\S]*?<\/button>/g)]
          .filter(([button]) => /title=\{t\([^)]*,\s*\{/.test(button))
          .map(
            (_, index) =>
              `${relative(sourceRoot, file)} titled button ${index + 1} interpolates an object name`
          )

        return [...titleViolations, ...iconButtonTooltipViolations(file)]
      })

    expect(violations).toEqual([])
  })

  it('rebuilds native dependencies for Electron development and Node tests', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve('package.json'), 'utf8')
    ) as { scripts?: Record<string, string> }

    expect(packageJson.scripts?.dev).toMatch(/^npm run rebuild:native && /)
    expect(packageJson.scripts?.['rebuild:native']).toContain(
      'electron-rebuild -f'
    )
    expect(packageJson.scripts?.test).toMatch(
      /^npm run rebuild:test-native && /
    )
  })

  it('keeps renderer modules focused enough to review independently', () => {
    const oversizedModules = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) => !file.includes('/localization/messages/'))
      .map((file) => ({
        file: relative(sourceRoot, file),
        lines: readFileSync(file, 'utf8').split('\n').length
      }))
      .filter(({ lines }) => lines > 700)

    expect(oversizedModules).toEqual([])
  })

  it('uses the stale-response-safe controller on the requirement detail page', () => {
    const page = readFileSync(
      resolve(sourceRoot, 'pages/RequirementDetailPage.tsx'),
      'utf8'
    )

    expect(page).toContain('useRequirementExecutionWorkbench(')
    expect(page).not.toContain('executionViewRequest')
  })

  it('keeps domain modules independent from UI and infrastructure layers', () => {
    const violations = importsMatching('domain/', [
      '/pages/',
      '/features/',
      '/components/',
      '/infrastructure/',
      '/app/',
      '/shared/'
    ])

    expect(violations).toEqual([])
  })

  it('keeps application modules independent from pages and components', () => {
    const violations = importsMatching('application/', [
      '/pages/',
      '/components/',
      '/infrastructure/'
    ])

    expect(violations).toEqual([])
  })

  it('keeps application modules independent from React', () => {
    const violations = sourceFiles
      .filter((file) => file.includes('/application/'))
      .flatMap((file) => [
        ...(file.endsWith('.tsx')
          ? [`${relative(sourceRoot, file)} is a React module`]
          : []),
        ...importsOf(file)
          .filter(
            (specifier) =>
              specifier === 'react' || specifier.startsWith('react/')
          )
          .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
      ])

    expect(violations).toEqual([])
  })

  it('keeps shared UI primitives independent from features and runtime layers', () => {
    const uiRoot = resolve(sourceRoot, 'components/ui')
    const violations = collectSourceFiles(uiRoot)
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .flatMap((file) =>
        importsOf(file)
          .filter(
            (specifier) =>
              specifier.includes('/features/') ||
              specifier.includes('/application/') ||
              specifier.includes('/infrastructure/') ||
              specifier.includes('/electron/') ||
              specifier.includes('/shared/') ||
              specifier.startsWith('@shared')
          )
          .map((specifier) => `${relative(uiRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps shared contracts independent from renderer source modules', () => {
    const violations = sharedFiles.flatMap((file) =>
      importsOf(file)
        .filter((specifier) => specifier.includes('/src/'))
        .map((specifier) => `${relative(sharedRoot, file)} -> ${specifier}`)
    )

    expect(violations).toEqual([])
  })

  it('requires Electron IPC adapters to select query or command channels explicitly', () => {
    const violations = electronFiles
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) =>
        /\bIPC_INVOKE_CHANNELS\b/.test(readFileSync(file, 'utf8'))
      )
      .map((file) => relative(electronRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps pages independent from concrete infrastructure adapters', () => {
    const violations = importsMatching('pages/', ['/infrastructure/'])

    expect(violations).toEqual([])
  })

  it('keeps template migration Renderer code on typed shared contracts', () => {
    const migrationFiles = sourceFiles.filter((file) =>
      file.includes('TemplateMigration')
    )
    const violations = migrationFiles.flatMap((file) =>
      importsOf(file)
        .filter(
          (specifier) =>
            specifier === 'electron' ||
            specifier.startsWith('node:') ||
            specifier.includes('/electron/') ||
            specifier.includes('/infrastructure/') ||
            specifier.includes('repository')
        )
        .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
    )

    expect(violations).toEqual([])
  })

  it('does not use page modules as shared type providers', () => {
    const violations = sourceFiles
      .filter(
        (file) =>
          !file.includes('/pages/') && !file.endsWith('/app/AppRoutes.tsx')
      )
      .flatMap((file) =>
        importsOf(file)
          .filter((specifier) => specifier.includes('/pages/'))
          .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps Electron and Node capabilities out of renderer production code', () => {
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .flatMap((file) =>
        importsOf(file)
          .filter(
            (specifier) =>
              specifier === 'electron' || specifier.startsWith('node:')
          )
          .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('prevents renderer production code from connecting to the Sidecar directly', () => {
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return (
          /\bfetch\s*\(/.test(source) ||
          importsOf(file).some((specifier) =>
            specifier.includes('electron/src/sidecar')
          )
        )
      })
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps Agent Run checkpoint writes inside the Main coordinator boundary', () => {
    const rendererLeaks = [...sourceFiles, ...sharedFiles]
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) =>
        /AgentRunCheckpointRepository|agent-run-checkpoint-repository/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(resolve('.'), file))
    const sidecarLeaks = pythonFiles
      .filter((file) =>
        /agent_run_checkpoints|RunCheckpointRepository/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(resolve('.'), file))

    expect(rendererLeaks).toEqual([])
    expect(sidecarLeaks).toEqual([])
  })

  it('keeps Qdrant runtime details inside the Electron Main boundary', () => {
    const exposedRuntimeDetails = [...sourceFiles, ...sharedFiles]
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) => /\bqdrant\b/i.test(readFileSync(file, 'utf8')))
      .map((file) => relative(resolve('.'), file))
    const runtimeTypes = [
      'QdrantProcessManager',
      'QdrantHttpClient',
      'QdrantCollectionManager'
    ]
    const constructors = Object.fromEntries(
      runtimeTypes.map((runtimeType) => [
        runtimeType,
        electronFiles
          .filter((file) => !file.endsWith('.test.ts'))
          .filter((file) =>
            new RegExp(`\\bnew\\s+${runtimeType}\\s*\\(`).test(
              readFileSync(file, 'utf8')
            )
          )
          .map((file) => relative(electronRoot, file))
      ])
    )
    const preloadFiles = electronFiles.filter((file) =>
      /(?:^|\/)preload(?:-api)?\.ts$/.test(relative(electronRoot, file))
    )
    const preloadLeaks = preloadFiles
      .filter((file) =>
        /\b(?:QdrantConnection|QdrantClientPort|QdrantRuntimeHealth)\b/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(electronRoot, file))

    expect(exposedRuntimeDetails).toEqual([])
    expect(constructors).toEqual({
      QdrantProcessManager: ['main.ts'],
      QdrantHttpClient: ['main.ts'],
      QdrantCollectionManager: ['main.ts']
    })
    expect(preloadLeaks).toEqual([])
  })

  it('keeps connector networking and credential storage out of renderer code', () => {
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .flatMap((file) =>
        importsOf(file)
          .filter(
            (specifier) =>
              specifier.includes('electron/src/network') ||
              specifier.includes('credential-vault')
          )
          .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps model networking, credentials, and SQLite repositories out of Renderer code', () => {
    const forbidden = [
      'electron/src/network',
      'credential-vault',
      'infrastructure/sqlite',
      'better-sqlite3',
      'ModelProtocolAdapter',
      'CredentialVault'
    ]
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) =>
        forbidden.some((token) => readFileSync(file, 'utf8').includes(token))
      )
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps provider-specific authentication logic out of the Sidecar', () => {
    const violations = pythonFiles
      .filter((file) => !file.includes('/tests/'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return (
          /\bx-api-key\b/i.test(source) ||
          /\banthropic-version\b/i.test(source) ||
          /\bsk-ant-[a-z0-9_-]+\b/i.test(source)
        )
      })
      .map((file) => relative(pythonRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps Skill package and storage adapters out of renderer code', () => {
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .flatMap((file) =>
        importsOf(file)
          .filter(
            (specifier) =>
              specifier.includes('electron/src/application/skills') ||
              specifier.includes('electron/src/infrastructure/sqlite/skill')
          )
          .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps Skill persistence and package access out of the Sidecar', () => {
    const violations = pythonFiles
      .filter((file) => !file.includes('/tests/'))
      .filter((file) =>
        /\b(skill_versions|skill_version_integrity|skill_commands|userData\/skills)\b/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(pythonRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps permission persistence and services out of renderer production code', () => {
    const forbidden = [
      'permission-store',
      'permission-repository',
      'CapabilityPermissionService',
      'SqlitePermissionRepository',
      'permission_grants',
      'permission_events',
      'permission_commands'
    ]
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) =>
        forbidden.some((token) => readFileSync(file, 'utf8').includes(token))
      )
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('does not register legacy Tool Runtime repositories in production', () => {
    const mainSource = readFileSync(resolve(electronRoot, 'main.ts'), 'utf8')
    const forbidden = [
      'SqliteSkillRepository',
      'SqliteSkillExecutionRepository',
      'SqlitePermissionRepository'
    ]
    const violations = forbidden.filter((token) => mainSource.includes(token))

    expect(violations).toEqual([])
  })

  it('keeps Skill execution infrastructure behind typed Main IPC', () => {
    const forbidden = [
      'skill-execution-store',
      'skill-execution-repository',
      'SkillExecutionService',
      'CapabilityPermissionService',
      'electron/src/sidecar'
    ]
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) =>
        forbidden.some((token) => readFileSync(file, 'utf8').includes(token))
      )
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('does not construct the legacy Skill execution service', () => {
    const constructors = electronFiles
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) =>
        /\bnew\s+SkillExecutionService\s*\(/.test(readFileSync(file, 'utf8'))
      )
      .map((file) => relative(electronRoot, file))

    expect(constructors).toEqual([])
  })

  it('keeps Cron scheduling and trigger persistence in Electron Main', () => {
    const forbidden = [
      'cron-schedule-scheduler',
      'schedule_trigger_cursors',
      'claimScheduledRun',
      'reconcileTriggers'
    ]
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) =>
        forbidden.some((token) => readFileSync(file, 'utf8').includes(token))
      )
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('owns the Cron scheduler lifecycle in the Main composition root', () => {
    const constructors = electronFiles
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) =>
        /\bnew\s+CronScheduleScheduler\s*\(/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(electronRoot, file))
    const mainSource = readFileSync(resolve('electron/src/main.ts'), 'utf8')
    const recovery = mainSource.indexOf('await schedules.recoverInterrupted()')
    const start = mainSource.indexOf('await scheduleScheduler.start()')
    const recoverMissed = mainSource.indexOf(
      'await schedules.recoverMissed()'
    )
    const refresh = mainSource.indexOf('await scheduleScheduler.refresh()')
    const stop = mainSource.indexOf('scheduleScheduler?.stop()')
    const close = mainSource.indexOf('database?.close()')

    expect(constructors).toEqual(['main.ts'])
    expect(recovery).toBeGreaterThan(-1)
    expect(start).toBeGreaterThan(recovery)
    expect(recoverMissed).toBeGreaterThan(start)
    expect(refresh).toBeGreaterThan(recoverMissed)
    expect(stop).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(stop)
  })

  it('never launches Python Skill processes through a shell', () => {
    const violations = pythonFiles
      .filter((file) => !file.includes('/tests/'))
      .filter((file) =>
        /\b(create_subprocess_shell|os\.system)\s*\(|\bshell\s*=\s*True\b/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(pythonRoot, file))

    expect(violations).toEqual([])
  })

  it('reuses the bounded capability type in workflow declarations', () => {
    const workflowSource = readFileSync(
      resolve('domain/workflow.ts'),
      'utf8'
    )

    expect(workflowSource).toMatch(/\bToolCapability\b/)
    expect(workflowSource).toContain('capability: ToolCapability')
  })

  it('does not expose an unbounded all-permissions capability', () => {
    const contractFiles = [
      resolve('domain/capability-permission.ts'),
      ...sharedFiles
    ]
    const violations = contractFiles
      .filter((file) =>
        /\ball[_-]?permissions?\b/i.test(readFileSync(file, 'utf8'))
      )
      .map((file) => relative(resolve('.'), file))

    expect(violations).toEqual([])
  })

  it('uses immutable Skill version references in production workflow code', () => {
    const productionFiles = [
      ...collectSourceFiles(resolve('domain')),
      ...sharedFiles,
      ...sourceFiles,
      ...electronFiles
    ].filter(
      (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
    )
    const violations = productionFiles
      .filter((file) => /\bskillIds\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(resolve('.'), file))

    expect(violations).toEqual([])
  })

  it('prevents renderer production code from writing business aggregates through legacy persistence', () => {
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) =>
        /\b(?:window\.realmflow\??\.persistence|persistence)\.save\s*\(/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps SQLite access in Electron Main infrastructure only', () => {
    const rendererViolations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) =>
        /better-sqlite3|sqlite3|realmflow\.db/.test(readFileSync(file, 'utf8'))
      )
      .map((file) => relative(sourceRoot, file))
    const pythonViolations = pythonFiles
      .filter((file) => !file.includes('/tests/'))
      .filter((file) =>
        /(^|\n)\s*(import sqlite3|from sqlite3|from sqlalchemy|import sqlalchemy)/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(pythonRoot, file))

    expect([...rendererViolations, ...pythonViolations]).toEqual([])
  })

  it('keeps AI run IPC adapters independent from concrete infrastructure', () => {
    const ipcRoot = resolve('electron/src/ai-run/ipc')
    const violations = collectSourceFiles(ipcRoot)
      .filter((file) => !file.endsWith('.test.ts'))
      .flatMap((file) =>
        importsOf(file)
          .filter((specifier) => specifier.includes('/infrastructure/'))
          .map((specifier) => `${relative(ipcRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps Agent Runtime lifecycle authority out of Renderer modules', () => {
    const authorityTokens =
      /transitionAgentRunLifecycle|AgentRuntimeRunRepository|agent_runtime_runs|SubagentRuntime|validateDelegationRequest|rf_delegate_research/
    const violations = sourceFiles
      .filter(
        (file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx')
      )
      .filter((file) => authorityTokens.test(readFileSync(file, 'utf8')))
      .map((file) => relative(sourceRoot, file))

    expect(violations).toEqual([])
  })

  it('routes direct Sidecar run creation through the network gateway adapter', () => {
    const violations = electronFiles
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => {
        const source = readFileSync(file, 'utf8')
        return (
          /getSidecarClient\(\)\.createRun\(/.test(source) &&
          !file.endsWith('/network/gateway-run-adapter.ts')
        )
      })
      .map((file) => relative(electronRoot, file))
    const main = readFileSync(resolve(electronRoot, 'main.ts'), 'utf8')

    expect(violations).toEqual([])
    expect(main).toContain('runtimeRuns: agentRuntimeRuns')
  })

  it('keeps Agent Runtime dependent only on resolved Profile snapshots', () => {
    const rawProfileTokens =
      /\b(?:AgentProfile|CapabilityPolicy|createAgentProfile|getBuiltinAgentProfile|resolveEffectiveAgentProfile)\b/
    const violations = electronFiles
      .filter((file) => !file.endsWith('.test.ts'))
      .filter(
        (file) =>
          file.endsWith('/agent-tool-loop-coordinator.ts') ||
          file.includes('/application/schedules/') &&
            file.endsWith('-runtime.ts')
      )
      .filter((file) => rawProfileTokens.test(readFileSync(file, 'utf8')))
      .map((file) => relative(electronRoot, file))

    expect(violations).toEqual([])
  })

  it('keeps Conversation Processors independent from Renderer and network infrastructure', () => {
    const processorFiles = [...sourceFiles, ...electronFiles]
      .filter((file) => !file.endsWith('.test.ts'))
      .filter((file) => file.includes('conversation-processor'))
    const violations = processorFiles.flatMap((file) =>
      importsOf(file)
        .filter(
          (specifier) =>
            specifier.includes('/src/features/') ||
            specifier.includes('/src/pages/') ||
            specifier.includes('/electron/src/network/') ||
            specifier.includes('/sidecar/')
        )
        .map((specifier) => `${relative(resolve('.'), file)} -> ${specifier}`)
    )

    expect(violations).toEqual([])
  })

  it('keeps Trigger outside the Capability Catalog vocabulary', () => {
    const capabilityDomain = readFileSync(
      resolve('domain/capability.ts'),
      'utf8'
    )

    expect(capabilityDomain).toContain(
      "export const CAPABILITY_KINDS = [\n  'tool',\n  'skill',\n  'agent',\n  'connector'\n] as const"
    )
    expect(capabilityDomain).not.toMatch(
      /CAPABILITY_KINDS[\s\S]{0,120}['"]trigger['"]/
    )
  })

  it('keeps capability installation authority in Electron Main', () => {
    const rendererViolations = sourceFiles
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'))
      .filter((file) =>
        /capability-package:install|CapabilityAtomicInstaller|publishAndInstall/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(sourceRoot, file))
    const sidecarViolations = collectSourceFiles(
      resolve('python-service'),
      /\.py$/
    )
      .filter((file) => !file.includes('/tests/'))
      .filter((file) =>
        /capability-package:install|CapabilityAtomicInstaller|publishAndInstall/.test(
          readFileSync(file, 'utf8')
        )
      )
      .map((file) => relative(resolve('python-service'), file))

    expect([...rendererViolations, ...sidecarViolations]).toEqual([])
  })

  it('does not load uploaded capability code into Electron Main', () => {
    const importer = readFileSync(
      resolve(
        electronRoot,
        'application/capabilities/capability-package-service.ts'
      ),
      'utf8'
    )

    expect(importer).not.toMatch(
      /from\s+['"]node:(?:child_process|vm|worker_threads)['"]/
    )
    expect(importer).not.toMatch(/\bimport\s*\(/)
  })

  it('closes model-managed local processes before the Sidecar on shutdown', () => {
    const main = readFileSync(resolve(electronRoot, 'main.ts'), 'utf8')
    const closeProcesses = main.indexOf(
      'await localToolProcesses?.close()'
    )
    const stopSidecar = main.indexOf('await sidecar.stop()')

    expect(closeProcesses).toBeGreaterThan(-1)
    expect(stopSidecar).toBeGreaterThan(closeProcesses)
  })

  it('keeps trigger repositories independent from capability installation', () => {
    const violations = electronFiles
      .filter((file) => /trigger.*repository/i.test(file))
      .flatMap((file) =>
        importsOf(file)
          .filter((specifier) =>
            /capabilit.*(?:package|installer)/i.test(specifier)
          )
          .map((specifier) => `${relative(electronRoot, file)} -> ${specifier}`)
      )

    expect(violations).toEqual([])
  })

  it('keeps WorkbenchProvider as composition instead of an effect container', () => {
    const provider = resolve(
      sourceRoot,
      'features/workbench/WorkbenchProvider.tsx'
    )
    const hooks = [
      'use-workbench-commands.ts',
      'use-workbench-geometry.ts',
      'use-native-workbench-sync.ts',
      'use-terminal-sessions.ts'
    ].map((file) => resolve(sourceRoot, 'features/workbench/hooks', file))

    expect(
      readFileSync(provider, 'utf8').split('\n').length
    ).toBeLessThanOrEqual(260)
    expect(hooks.filter((file) => !existsSync(file))).toEqual([])
  })
})

function importsMatching(
  directory: string,
  forbiddenFragments: string[]
): string[] {
  return sourceFiles
    .filter((file) => file.includes(`/${directory}`))
    .flatMap((file) =>
      importsOf(file)
        .filter((specifier) =>
          forbiddenFragments.some((fragment) => specifier.includes(fragment))
        )
        .map((specifier) => `${relative(sourceRoot, file)} -> ${specifier}`)
    )
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(
    (match) => match[1]
  )
}

function collectSourceFiles(
  directory: string,
  extensionPattern = /\.(ts|tsx)$/
): string[] {
  return readdirSync(directory)
    .filter((entry) => entry !== 'node_modules' && entry !== '.venv')
    .map((entry) => resolve(directory, entry))
    .flatMap((entry) =>
      statSync(entry).isDirectory()
        ? collectSourceFiles(entry, extensionPattern)
        : entry
    )
    .filter((file) => extensionPattern.test(file))
}

function iconButtonTooltipViolations(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )
  const lucideIcons = new Set<string>()
  const violations: string[] = []

  sourceFile.forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === 'lucide-react'
    ) {
      node.importClause?.namedBindings &&
        ts.isNamedImports(node.importClause.namedBindings) &&
        node.importClause.namedBindings.elements.forEach((element) => {
          lucideIcons.add(element.name.text)
        })
    }
  })

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.tagName.getText(sourceFile) === 'button' &&
      isIconOnlyButton(node, sourceFile, lucideIcons)
    ) {
      const attributes = node.openingElement.attributes.properties
      const hasAttribute = (name: string): boolean =>
        attributes.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText(sourceFile) === name
        )
      if (hasAttribute('aria-label') && !hasAttribute('title')) {
        const line =
          sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
            .line + 1
        violations.push(
          `${relative(sourceRoot, file)}:${line} icon button has no title`
        )
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return violations
}

function isIconOnlyButton(
  button: ts.JsxElement,
  sourceFile: ts.SourceFile,
  lucideIcons: Set<string>
): boolean {
  let hasIcon = false
  let hasVisibleText = false

  const inspect = (node: ts.Node): void => {
    if (ts.isJsxText(node) && node.text.trim()) {
      hasVisibleText = true
      return
    }
    if (ts.isCallExpression(node) && node.expression.getText(sourceFile) === 't') {
      hasVisibleText = true
      return
    }
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isNumericLiteral(node)) &&
      node.text
    ) {
      hasVisibleText = true
      return
    }
    if (
      (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) &&
      lucideIcons.has(
        (ts.isJsxElement(node)
          ? node.openingElement.tagName
          : node.tagName
        ).getText(sourceFile)
      )
    ) {
      hasIcon = true
      return
    }
    ts.forEachChild(node, inspect)
  }

  button.children.forEach(inspect)
  return hasIcon && !hasVisibleText
}
