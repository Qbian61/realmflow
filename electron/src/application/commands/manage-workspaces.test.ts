import { mkdtemp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openRealmFlowDatabase, type RealmFlowDatabase } from '../../infrastructure/sqlite/database'
import { createSqliteRepositories } from '../../infrastructure/sqlite/repositories'
import { WorkspaceService } from '../../workspace/workspace-service'
import { SqliteWorkspaceMetadataStore } from '../../workspace/workspace-metadata-store'
import {
  CreateSpaceUseCase,
  DeleteSpaceUseCase,
  RestoreSpaceUseCase,
  SelectWorkRootUseCase
} from './manage-workspaces'
import {
  CreateRequirementUseCase,
  DeleteRequirementUseCase,
  RestoreRequirementUseCase
} from './manage-requirements'

describe('workspace and requirement commands', () => {
  let temporaryDirectory: string
  let rootPath: string
  let database: RealmFlowDatabase

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'realmflow-commands-'))
    rootPath = join(temporaryDirectory, 'work-root')
    await mkdir(rootPath)
    database = openRealmFlowDatabase(join(temporaryDirectory, 'realmflow.db'))
  })

  afterEach(async () => {
    database.close()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  it('creates spaces and requirements through intent-specific commands', async () => {
    const repositories = createSqliteRepositories(database)
    const files = new WorkspaceService(
      new SqliteWorkspaceMetadataStore(database)
    )
    const selectRoot = new SelectWorkRootUseCase(
      repositories.workRoots,
      files,
      () => 10
    )
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      files,
      () => 20
    )
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.unitOfWork,
      files,
      () => 30
    )

    await selectRoot.execute({
      id: 'root-1',
      path: rootPath,
      expectedRevision: 0
    })
    const space = await createSpace.execute({
      id: 'space-1',
      name: 'Product Space',
      description: 'Delivery workspace'
    })
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1',
      syncCompletedArtifactsToKnowledge: true
    })

    expect(space).toMatchObject({
      workRootId: 'root-1',
      directoryName: 'Product-Space--space-1',
      revision: 1
    })
    expect(requirement).toMatchObject({
      workflowTemplateVersionId: 'builtin-sdlc-v1',
      directoryName: 'Login-Flow--requirement-1',
      revision: 1
    })
    expect((await stat(space.path)).isDirectory()).toBe(true)
    expect(
      (await stat(requirement.workspaceRootPath as string)).isDirectory()
    ).toBe(true)
    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toMatchObject({
      revision: 1,
      nodes: [
        expect.objectContaining({
          id: 'requirement-1:analysis',
          status: 'ready'
        }),
        expect.objectContaining({ id: 'requirement-1:design', status: 'pending' }),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Object)
      ]
    })
    const execution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    expect(execution).toMatchObject({
      id: 'requirement-1:execution:1',
      requirementId: requirement.id,
      status: 'created',
      currentNodeId: 'requirement-1:analysis',
      revision: 1
    })
    await expect(
      repositories.nodeRuns.getLatestByNode(
        execution!.id,
        'requirement-1:analysis'
      )
    ).resolves.toMatchObject({
      id: 'requirement-1:node-run:analysis:1',
      status: 'ready',
      revision: 1
    })
    await expect(
      repositories.nodeRuns.getLatestByNode(
        execution!.id,
        'requirement-1:design'
      )
    ).resolves.toMatchObject({
      id: 'requirement-1:node-run:design:1',
      status: 'pending',
      revision: 1
    })
  })

  it('blocks active deletions and restores requirements and spaces from trash', async () => {
    const repositories = createSqliteRepositories(database)
    const files = new WorkspaceService(
      new SqliteWorkspaceMetadataStore(database)
    )
    const selectRoot = new SelectWorkRootUseCase(
      repositories.workRoots,
      files,
      () => 10
    )
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      files,
      () => 20
    )
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.unitOfWork,
      files,
      () => 30
    )
    const deleteRequirement = new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 40
    )
    const restoreRequirement = new RestoreRequirementUseCase(
      repositories.requirements,
      repositories.unitOfWork,
      files
    )
    const deleteSpace = new DeleteSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    )
    const restoreSpace = new RestoreSpaceUseCase(
      repositories.workspaces,
      repositories.unitOfWork,
      files
    )

    await selectRoot.execute({
      id: 'root-1',
      path: rootPath,
      expectedRevision: 0
    })
    const space = await createSpace.execute({
      id: 'space-1',
      name: 'Product Space'
    })
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const runningExecution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    await repositories.workflowExecutions.save(
      {
        ...runningExecution!,
        status: 'running',
        updatedAt: 35
      },
      runningExecution!.revision
    )

    await expect(
      deleteRequirement.execute({
        id: requirement.id,
        expectedRevision: requirement.revision
      })
    ).rejects.toThrow('Requirement has an active workflow execution')
    expect((await stat(requirement.workspaceRootPath as string)).isDirectory()).toBe(
      true
    )

    const execution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    await repositories.workflowExecutions.save(
      {
        ...execution!,
        status: 'cancelled',
        updatedAt: 35,
        completedAt: 35
      },
      execution!.revision
    )

    await expect(
      deleteRequirement.execute({
        id: requirement.id,
        expectedRevision: requirement.revision
      })
    ).resolves.toBe(true)
    await expect(repositories.requirements.get(requirement.id)).resolves.toBeUndefined()
    await expect(stat(requirement.workspaceRootPath as string)).rejects.toThrow()
    expect(
      await readdir(join(rootPath, '.realmflow', 'trash'))
    ).toHaveLength(1)

    await expect(
      restoreRequirement.execute({ id: requirement.id })
    ).resolves.toBe(true)
    await expect(repositories.requirements.get(requirement.id)).resolves.toMatchObject({
      id: requirement.id
    })
    expect((await stat(requirement.workspaceRootPath as string)).isDirectory()).toBe(
      true
    )

    await expect(
      deleteSpace.execute({
        id: space.id,
        expectedRevision: space.revision
      })
    ).resolves.toBe(true)
    await expect(repositories.workspaces.get(space.id)).resolves.toBeUndefined()
    await expect(stat(space.rootPath as string)).rejects.toThrow()

    await expect(restoreSpace.execute({ id: space.id })).resolves.toBe(true)
    await expect(repositories.workspaces.get(space.id)).resolves.toMatchObject({
      id: space.id
    })
    expect((await stat(space.rootPath as string)).isDirectory()).toBe(true)
  })

  it('moves the directory back when recording the tombstone fails', async () => {
    const repositories = createSqliteRepositories(database)
    const files = new WorkspaceService(
      new SqliteWorkspaceMetadataStore(database)
    )
    await new SelectWorkRootUseCase(
      repositories.workRoots,
      files,
      () => 10
    ).execute({
      id: 'root-1',
      path: rootPath,
      expectedRevision: 0
    })
    const space = await new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      files,
      () => 20
    ).execute({
      id: 'space-1',
      name: 'Product Space'
    })
    const requirement = await new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.unitOfWork,
      files,
      () => 30
    ).execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const execution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    await repositories.workflowExecutions.save(
      {
        ...execution!,
        status: 'cancelled',
        updatedAt: 35,
        completedAt: 35
      },
      execution!.revision
    )
    const deleteRequirement = new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      {
        execute: async () => {
          throw new Error('database unavailable')
        }
      },
      files,
      () => 40
    )

    await expect(
      deleteRequirement.execute({
        id: requirement.id,
        expectedRevision: requirement.revision
      })
    ).rejects.toThrow('database unavailable')

    expect((await stat(requirement.workspaceRootPath as string)).isDirectory()).toBe(
      true
    )
    await expect(repositories.requirements.get(requirement.id)).resolves.toMatchObject({
      id: requirement.id
    })
    await expect(readdir(join(rootPath, '.realmflow', 'trash'))).resolves.toEqual(
      []
    )
  })
})
