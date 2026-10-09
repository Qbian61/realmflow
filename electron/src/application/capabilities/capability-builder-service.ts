import { randomUUID } from 'node:crypto'
import {
  assertCapabilityApproval,
  createCapabilityGenerationSession,
  createCapabilitySpec,
  type CapabilityApproval,
  type CapabilityGenerationSession,
  type CapabilityInstalledResult,
  type CapabilitySpecSource
} from '../../../../domain/capability-builder'
import type { CapabilityAtomicInstaller } from './capability-atomic-installer'
import type { CapabilityDraftWorkspace } from './capability-draft-workspace'
import type {
  CapabilityPackageService,
  PreparedCapabilityPackage
} from './capability-package-service'
import type {
  CapabilitySpecCompiler
} from './capability-spec-compiler'

export type CapabilityBuilderSessionRepository = {
  create: (session: CapabilityGenerationSession) => Promise<void>
  get: (
    sessionId: string
  ) => Promise<CapabilityGenerationSession | undefined>
  save: (
    session: CapabilityGenerationSession,
    expectedRevision: number
  ) => Promise<void>
  saveInTransaction: (
    session: CapabilityGenerationSession,
    expectedRevision: number
  ) => void
}

type CapabilityBuilderServiceOptions = {
  sessions: CapabilityBuilderSessionRepository
  workspace: Pick<
    CapabilityDraftWorkspace,
    'publish' | 'resolve' | 'remove'
  >
  compiler: Pick<CapabilitySpecCompiler, 'compile'>
  packages: Pick<CapabilityPackageService, 'prepare'>
  installer: Pick<CapabilityAtomicInstaller, 'install'>
  createId?: () => string
  now?: () => number
}

export class CapabilityBuilderService {
  private readonly createId: () => string
  private readonly now: () => number

  constructor(private readonly options: CapabilityBuilderServiceOptions) {
    this.createId = options.createId ?? randomUUID
    this.now = options.now ?? Date.now
  }

  async createDraft(input: {
    conversationId?: string
    requestedBy?: string
    request: string
    spec: CapabilitySpecSource
  }): Promise<CapabilityGenerationSession> {
    const now = this.now()
    const id = this.createId()
    const draft = createCapabilityGenerationSession({
      id,
      conversationId: input.conversationId ?? `capability-builder:${id}`,
      requestedBy: input.requestedBy ?? 'local-user',
      request: input.request,
      spec: createCapabilitySpec(input.spec),
      status: 'draft',
      revision: 1,
      createdAt: now,
      updatedAt: now
    })
    await this.options.sessions.create(draft)
    return this.validate(draft)
  }

  async getSession(
    sessionId: string
  ): Promise<CapabilityGenerationSession> {
    return this.requireSession(sessionId)
  }

  async reviseDraft(input: {
    sessionId: string
    expectedRevision: number
    request: string
    spec: CapabilitySpecSource
  }): Promise<CapabilityGenerationSession> {
    const current = await this.requireSession(input.sessionId)
    if (current.revision !== input.expectedRevision) {
      throw new Error('Capability generation revision conflict')
    }
    if (
      current.status !== 'draft' &&
      current.status !== 'awaiting_approval'
    ) {
      throw new Error('Capability generation cannot be revised')
    }
    const draft = createCapabilityGenerationSession({
      ...current,
      request: input.request,
      spec: createCapabilitySpec(input.spec),
      status: 'draft',
      revision: current.revision + 1,
      proposal: undefined,
      diagnostics: undefined,
      updatedAt: this.now()
    })
    await this.options.sessions.save(draft, current.revision)
    return this.validate(draft)
  }

  async confirmInstall(
    command: CapabilityApproval & { sessionId: string }
  ): Promise<CapabilityInstalledResult> {
    const current = await this.requireSession(command.sessionId)
    const approval = approvalFrom(command)
    if (current.status === 'installed') {
      if (
        current.installedResult &&
        current.installedApproval &&
        approvalsEqual(current.installedApproval, approval)
      ) {
        return current.installedResult
      }
      throw new Error('Capability approval is unavailable')
    }
    assertCapabilityApproval(current, approval)
    const proposal = current.proposal!
    const draftPath = this.options.workspace.resolve(
      current.id,
      proposal.draftRevision
    )
    const prepared = await this.options.packages.prepare(draftPath, {
      source: 'generated',
      publishedAt: current.createdAt
    })
    if (
      prepared.packageDigest !== proposal.packageDigest ||
      prepared.definition.definitionDigest !== proposal.definitionDigest
    ) {
      await prepared.pending.rollback()
      throw new Error('Capability draft changed after validation')
    }
    try {
      let completed: CapabilityGenerationSession | undefined
      const installed = await this.options.installer.install({
        prepared,
        scope: approval.scope,
        enable: approval.enable,
        permissionCeiling: current.spec.permissions,
        onCatalogTransaction: (result) => {
          completed = createCapabilityGenerationSession({
            ...current,
            status: 'installed',
            revision: current.revision + 1,
            proposal: undefined,
            diagnostics: undefined,
            installedResult: result,
            installedApproval: approval,
            updatedAt: this.now()
          })
          this.options.sessions.saveInTransaction(
            completed,
            current.revision
          )
        }
      })
      if (!completed) {
        throw new Error('Capability installation transaction did not commit')
      }
      return installed
    } catch (error) {
      const failed = createCapabilityGenerationSession({
        ...current,
        status: 'failed',
        revision: current.revision + 1,
        proposal: undefined,
        diagnostics: [stableError(error)],
        updatedAt: this.now()
      })
      await this.options.sessions.save(failed, current.revision)
      throw error
    }
  }

  async cancel(input: {
    sessionId: string
    expectedRevision: number
  }): Promise<CapabilityGenerationSession> {
    const current = await this.requireSession(input.sessionId)
    if (current.revision !== input.expectedRevision) {
      throw new Error('Capability generation revision conflict')
    }
    if (
      current.status === 'installed' ||
      current.status === 'cancelled' ||
      current.status === 'failed'
    ) {
      throw new Error('Capability generation cannot be cancelled')
    }
    const cancelled = createCapabilityGenerationSession({
      ...current,
      status: 'cancelled',
      revision: current.revision + 1,
      proposal: undefined,
      diagnostics: undefined,
      updatedAt: this.now()
    })
    await this.options.sessions.save(cancelled, current.revision)
    await this.options.workspace.remove(current.id)
    return cancelled
  }

  private async validate(
    draft: CapabilityGenerationSession
  ): Promise<CapabilityGenerationSession> {
    const validating = createCapabilityGenerationSession({
      ...draft,
      status: 'validating',
      revision: draft.revision + 1,
      diagnostics: undefined,
      updatedAt: this.now()
    })
    await this.options.sessions.save(validating, draft.revision)
    let prepared: PreparedCapabilityPackage | undefined
    let rolledBack = false
    try {
      const compiled = this.options.compiler.compile(validating.spec)
      const draftPath = await this.options.workspace.publish({
        sessionId: validating.id,
        revision: draft.revision,
        files: compiled.files
      })
      prepared = await this.options.packages.prepare(draftPath, {
        source: 'generated',
        publishedAt: validating.createdAt
      })
      const proposal = {
        id: this.createId(),
        packageDigest: prepared.packageDigest,
        definitionDigest: prepared.definition.definitionDigest,
        scope: validating.spec.scope,
        draftRevision: draft.revision,
        definition: prepared.definition,
        validationReport: prepared.validationReport,
        fileNames: Object.keys(compiled.files).sort(),
        byteSize: prepared.byteSize,
        fileCount: prepared.fileCount,
        validatedAt: this.now()
      }
      await prepared.pending.rollback()
      rolledBack = true
      const approved = createCapabilityGenerationSession({
        ...validating,
        status: 'awaiting_approval',
        revision: validating.revision + 1,
        proposal,
        diagnostics: undefined,
        updatedAt: this.now()
      })
      await this.options.sessions.save(approved, validating.revision)
      return approved
    } catch (error) {
      if (prepared && !rolledBack) {
        await prepared.pending.rollback().catch(() => undefined)
      }
      const failedValidation = createCapabilityGenerationSession({
        ...validating,
        status: 'draft',
        revision: validating.revision + 1,
        proposal: undefined,
        diagnostics: [stableError(error)],
        updatedAt: this.now()
      })
      await this.options.sessions.save(
        failedValidation,
        validating.revision
      )
      return failedValidation
    }
  }

  private async requireSession(
    sessionId: string
  ): Promise<CapabilityGenerationSession> {
    const session = await this.options.sessions.get(sessionId)
    if (!session) throw new Error('Capability generation is unavailable')
    return session
  }
}

function approvalFrom(
  command: CapabilityApproval & { sessionId: string }
): CapabilityApproval {
  return {
    proposalId: command.proposalId,
    revision: command.revision,
    packageDigest: command.packageDigest,
    scope: structuredClone(command.scope),
    enable: command.enable
  }
}

function approvalsEqual(
  left: CapabilityApproval,
  right: CapabilityApproval
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function stableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 500)
}
