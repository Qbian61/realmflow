import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_VECTOR_INDEX_PROFILE } from '../../../../domain/vector-index-profile'
import type { WorkflowNodeConfiguration } from '../../../../domain/workflow'
import {
  openRealmFlowDatabase,
  type RealmFlowDatabase
} from '../../infrastructure/sqlite/database'
import { createSqliteRepositories } from '../../infrastructure/sqlite/repositories'
import { SqliteVectorIndexRepository } from '../../infrastructure/sqlite/vector-index-repository'
import { WorkspaceService } from '../../workspace/workspace-service'
import { SqliteWorkspaceMetadataStore } from '../../workspace/workspace-metadata-store'
import {
  CreateSpaceUseCase,
  DeleteSpaceUseCase,
  RelocateSpaceUseCase,
  RestoreSpaceUseCase,
  SelectWorkRootUseCase,
  UpdateSpaceUseCase
} from './manage-workspaces'
import {
  CreateRequirementUseCase,
  DeleteRequirementUseCase,
  RestoreRequirementUseCase,
  UpdateRequirementUseCase
} from './manage-requirements'
import {
  RenameRequirementDirectoryUseCase,
  RenameSpaceDirectoryUseCase
} from './rename-managed-directories'
import {
  ListTrashItemsUseCase,
  PurgeRequirementUseCase,
  PurgeSpaceUseCase
} from './manage-trash'
import { ManageWorkflowTemplatesUseCase } from '../workflow/manage-workflow-templates'
import type { UnitOfWork } from '../ports/business-repositories'

function failAfterOperation(
  unitOfWork: UnitOfWork,
  message: string
): UnitOfWork {
  return {
    async execute<T>(operation: () => T | Promise<T>): Promise<T> {
      return unitOfWork.execute(async () => {
        await operation()
        throw new Error(message)
      })
    }
  }
}

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

  async function setupRequirementCreation() {
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
    let timestamp = 30
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.nodeTodos,
      repositories.unitOfWork,
      files,
      () => timestamp++
    )
    return { createRequirement, files, repositories, space }
  }

  it('does not persist a work root when directory initialization fails', async () => {
    const repositories = createSqliteRepositories(database)
    const selectRoot = new SelectWorkRootUseCase(
      repositories.workRoots,
      new WorkspaceService(new SqliteWorkspaceMetadataStore(database)),
      () => 10
    )

    await expect(
      selectRoot.execute({
        id: 'root-1',
        path: join(temporaryDirectory, 'missing'),
        expectedRevision: 0
      })
    ).rejects.toThrow()
    await expect(repositories.workRoots.list()).resolves.toEqual([])
  })

  it('rejects space creation when no current work root is configured', async () => {
    const repositories = createSqliteRepositories(database)
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      new WorkspaceService(new SqliteWorkspaceMetadataStore(database)),
      () => 20
    )

    await expect(
      createSpace.execute({
        id: 'space-1',
        name: 'Product Space'
      })
    ).rejects.toThrow('Select a work root before creating a space')
    await expect(repositories.workspaces.list()).resolves.toEqual([])
    await expect(readdir(rootPath)).resolves.toEqual([])
  })

  it('normalizes the display name before creating the space record and directory', async () => {
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
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      files,
      () => 20
    )

    const space = await createSpace.execute({
      id: 'space-1',
      name: '  Product Space  '
    })

    expect(space).toMatchObject({
      label: 'Product Space',
      directoryName: 'Product-Space--space-1'
    })
    await expect(
      readFile(join(space.path, '.realmflow', 'space.json'), 'utf8').then(
        JSON.parse
      )
    ).resolves.toMatchObject({
      version: 1,
      spaceId: 'space-1',
      rootPath: await realpath(rootPath)
    })
  })

  it('returns the existing space for an identical repeated create command', async () => {
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
    let timestamp = 20
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      files,
      () => timestamp
    )
    const command = {
      id: 'space-1',
      name: 'Product Space',
      description: 'Delivery workspace'
    }

    const created = await createSpace.execute(command)
    timestamp = 30
    const repeated = await createSpace.execute(command)

    expect(repeated).toEqual(created)
    await expect(repositories.workspaces.list()).resolves.toEqual([created])
    await expect(
      readdir(rootPath).then((entries) =>
        entries.filter((entry) => entry !== '.realmflow')
      )
    ).resolves.toEqual(['Product-Space--space-1'])
    await expect(readdir(join(rootPath, '.realmflow', 'tmp'))).resolves.toEqual(
      []
    )
  })

  it('rejects a repeated space id carrying different data', async () => {
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
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      files,
      () => 20
    )
    const created = await createSpace.execute({
      id: 'space-1',
      name: 'Product Space'
    })

    await expect(
      createSpace.execute({
        id: 'space-1',
        name: 'Different Space'
      })
    ).rejects.toThrow('Space id already exists with different data')
    await expect(repositories.workspaces.get('space-1')).resolves.toEqual(
      created
    )
    await expect(
      readdir(rootPath).then((entries) =>
        entries.filter((entry) => entry !== '.realmflow')
      )
    ).resolves.toEqual(['Product-Space--space-1'])
  })

  it('cleans the prepared directory when saving the space fails', async () => {
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
    const failingWorkspaces = new Proxy(repositories.workspaces, {
      get(target, property, receiver) {
        if (property === 'save') {
          return async () => {
            throw new Error('database unavailable')
          }
        }
        return Reflect.get(target, property, receiver)
      }
    })
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      failingWorkspaces,
      repositories.unitOfWork,
      files,
      () => 20
    )

    await expect(
      createSpace.execute({ id: 'space-1', name: 'Product Space' })
    ).rejects.toThrow('database unavailable')
    await expect(repositories.workspaces.list()).resolves.toEqual([])
    await expect(readdir(join(rootPath, '.realmflow', 'tmp'))).resolves.toEqual(
      []
    )
  })

  it('removes the committed space directory when SQLite commit fails', async () => {
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
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      failAfterOperation(repositories.unitOfWork, 'sqlite commit failed'),
      files,
      () => 20
    )

    await expect(
      createSpace.execute({ id: 'space-1', name: 'Product Space' })
    ).rejects.toThrow('sqlite commit failed')
    await expect(repositories.workspaces.list()).resolves.toEqual([])
    await expect(
      stat(join(rootPath, 'Product-Space--space-1'))
    ).rejects.toThrow()
    await expect(readdir(join(rootPath, '.realmflow', 'tmp'))).resolves.toEqual(
      []
    )
  })

  it('rolls back the space record when the final directory already exists', async () => {
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
    const occupiedPath = join(rootPath, 'Product-Space--space-1')
    await mkdir(occupiedPath)
    const createSpace = new CreateSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.unitOfWork,
      files,
      () => 20
    )

    await expect(
      createSpace.execute({ id: 'space-1', name: 'Product Space' })
    ).rejects.toThrow()
    await expect(repositories.workspaces.list()).resolves.toEqual([])
    expect((await stat(occupiedPath)).isDirectory()).toBe(true)
    await expect(readdir(join(rootPath, '.realmflow', 'tmp'))).resolves.toEqual(
      []
    )
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
      repositories.nodeTodos,
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
        expect.objectContaining({
          id: 'requirement-1:design',
          status: 'pending'
        }),
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

  it('blocks new requirements after archiving a template without changing existing instances', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()
    const existing = await createRequirement.execute({
      id: 'requirement-existing',
      workspaceId: space.id,
      title: 'Existing requirement',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const workflowBefore = await repositories.requirementWorkflows.get(
      existing.id
    )
    const templates = new ManageWorkflowTemplatesUseCase(
      repositories.workflowTemplates,
      () => 50
    )

    await templates.archive({ id: 'builtin-sdlc', expectedRevision: 0 })

    await expect(
      createRequirement.execute({
        id: 'requirement-new',
        workspaceId: space.id,
        title: 'New requirement',
        templateVersionId: 'builtin-sdlc-v1'
      })
    ).rejects.toThrow('Published workflow template was not found')
    await expect(
      repositories.requirementWorkflows.get(existing.id)
    ).resolves.toEqual(workflowBefore)
  })

  it('keeps existing requirements pinned when a later template version is published', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()
    const existing = await createRequirement.execute({
      id: 'requirement-on-v1',
      workspaceId: space.id,
      title: 'Version one requirement',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const workflowBefore = await repositories.requirementWorkflows.get(
      existing.id
    )
    const templates = new ManageWorkflowTemplatesUseCase(
      repositories.workflowTemplates,
      () => 50
    )

    let draft = await templates.createNextVersion({
      id: 'builtin-sdlc',
      sourceVersionId: 'builtin-sdlc-v1',
      expectedRevision: 0
    })
    for (const node of draft.currentVersion.nodes) {
      draft = await templates.configureNode({
        id: draft.id,
        expectedRevision: draft.revision,
        nodeId: node.id,
        configuration: publishableNodeConfiguration(node.stableKey)
      })
    }
    await templates.publish({
      id: draft.id,
      expectedRevision: draft.revision
    })
    const createdOnOldVersion = await createRequirement.execute({
      id: 'requirement-new-on-v1',
      workspaceId: space.id,
      title: 'Still version one',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const createdOnNewVersion = await createRequirement.execute({
      id: 'requirement-new-on-v2',
      workspaceId: space.id,
      title: 'Now version two',
      templateVersionId: 'builtin-sdlc-v2'
    })

    expect(createdOnOldVersion.workflowTemplateVersionId).toBe(
      'builtin-sdlc-v1'
    )
    expect(createdOnNewVersion.workflowTemplateVersionId).toBe(
      'builtin-sdlc-v2'
    )
    const newWorkflow = await repositories.requirementWorkflows.get(
      createdOnNewVersion.id
    )
    const newExecution =
      await repositories.workflowExecutions.getActiveByRequirement(
        createdOnNewVersion.id
      )
    const firstNodeRun = await repositories.nodeRuns.getLatestByNode(
      newExecution!.id,
      newWorkflow!.nodes[0].id
    )
    await expect(
      repositories.nodeTodos.listByNodeRun(firstNodeRun!.id)
    ).resolves.toEqual([
      expect.objectContaining({
        id: `${firstNodeRun!.id}:todo:1`,
        title: `Review ${newWorkflow!.nodes[0].id.split(':').at(-1)}`,
        required: true,
        status: 'pending',
        revision: 1
      })
    ])
    await expect(
      repositories.requirementWorkflows.get(existing.id)
    ).resolves.toEqual(workflowBefore)
  })

  it('normalizes the title before creating the requirement record and directory', async () => {
    const { createRequirement, space } = await setupRequirementCreation()

    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: '  Login Flow  ',
      templateVersionId: 'builtin-sdlc-v1'
    })

    expect(requirement).toMatchObject({
      title: 'Login Flow',
      directoryName: 'Login-Flow--requirement-1'
    })
  })

  it('renames a space without changing its managed directory binding', async () => {
    const { repositories, space } = await setupRequirementCreation()
    const updateSpace = new UpdateSpaceUseCase(
      repositories.workspaces,
      () => 40
    )

    const renamed = await updateSpace.execute({
      id: space.id,
      expectedRevision: space.revision,
      label: '  Renamed Product Space  '
    })

    expect(renamed).toMatchObject({
      label: 'Renamed Product Space',
      revision: space.revision + 1,
      updatedAt: 40,
      path: space.path,
      rootPath: space.rootPath,
      workRootId: space.workRootId,
      directoryName: space.directoryName
    })
    expect((await stat(space.path)).isDirectory()).toBe(true)
  })

  it('rejects invalid and stale space renames and keeps identical renames idempotent', async () => {
    const { repositories, space } = await setupRequirementCreation()
    let timestamp = 40
    const updateSpace = new UpdateSpaceUseCase(
      repositories.workspaces,
      () => timestamp++
    )

    await expect(
      updateSpace.execute({
        id: space.id,
        expectedRevision: space.revision,
        label: '   '
      })
    ).rejects.toThrow('Space name is required')

    const repeated = await updateSpace.execute({
      id: space.id,
      expectedRevision: space.revision,
      label: ` ${space.label} `
    })
    expect(repeated).toEqual(space)

    const renamed = await updateSpace.execute({
      id: space.id,
      expectedRevision: space.revision,
      label: 'Renamed Space'
    })
    await expect(
      updateSpace.execute({
        id: space.id,
        expectedRevision: space.revision,
        label: 'Stale Rename'
      })
    ).rejects.toThrow('Workspace revision conflict')
    await expect(repositories.workspaces.get(space.id)).resolves.toEqual(
      renamed
    )
  })

  it('renames a requirement without changing its workflow, execution, or directory', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const workflowBefore = await repositories.requirementWorkflows.get(
      requirement.id
    )
    const executionBefore =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    const updateRequirement = new UpdateRequirementUseCase(
      repositories.requirements,
      () => 40
    )

    const renamed = await updateRequirement.execute({
      id: requirement.id,
      expectedRevision: requirement.revision,
      title: '  Renamed Login Flow  '
    })

    expect(renamed).toMatchObject({
      title: 'Renamed Login Flow',
      revision: requirement.revision + 1,
      updatedAt: 40,
      workspaceId: requirement.workspaceId,
      workspaceRootPath: requirement.workspaceRootPath,
      workflowTemplateVersionId: requirement.workflowTemplateVersionId,
      directoryName: requirement.directoryName
    })
    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toEqual(workflowBefore)
    await expect(
      repositories.workflowExecutions.getActiveByRequirement(requirement.id)
    ).resolves.toEqual(executionBefore)
    expect(
      (await stat(requirement.workspaceRootPath as string)).isDirectory()
    ).toBe(true)
  })

  it('rejects invalid and stale requirement renames and persists an idempotent result', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    let timestamp = 40
    const updateRequirement = new UpdateRequirementUseCase(
      repositories.requirements,
      () => timestamp++
    )

    await expect(
      updateRequirement.execute({
        id: requirement.id,
        expectedRevision: requirement.revision,
        title: '   '
      })
    ).rejects.toThrow('Requirement title is required')

    const repeated = await updateRequirement.execute({
      id: requirement.id,
      expectedRevision: requirement.revision,
      title: ` ${requirement.title} `
    })
    expect(repeated).toEqual(requirement)

    const renamed = await updateRequirement.execute({
      id: requirement.id,
      expectedRevision: requirement.revision,
      title: 'Renamed Login Flow'
    })
    await expect(
      updateRequirement.execute({
        id: requirement.id,
        expectedRevision: requirement.revision,
        title: 'Stale Rename'
      })
    ).rejects.toThrow('Requirement revision conflict')

    database.close()
    database = openRealmFlowDatabase(join(temporaryDirectory, 'realmflow.db'))
    await expect(
      createSqliteRepositories(database).requirements.get(requirement.id)
    ).resolves.toEqual(renamed)
  })

  it('renames a space directory and transactionally cascades child paths', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const first = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const second = await createRequirement.execute({
      id: 'requirement-2',
      workspaceId: space.id,
      title: 'Billing Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const policy = { assertAllowed: vi.fn(async () => {}) }
    const rename = new RenameSpaceDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      policy,
      () => 50
    )

    const renamed = await rename.execute({
      id: space.id,
      name: '  Platform Space  ',
      expectedRevision: space.revision
    })

    const canonicalRootPath = await realpath(rootPath)
    expect(renamed).toMatchObject({
      path: join(canonicalRootPath, 'Platform-Space--space-1'),
      rootPath: join(canonicalRootPath, 'Platform-Space--space-1'),
      directoryName: 'Platform-Space--space-1',
      revision: space.revision + 1,
      updatedAt: 50
    })
    const requirements = await repositories.requirements.listByWorkspace(
      space.id
    )
    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          workspaceRootPath: join(renamed.path, first.directoryName as string)
        }),
        expect.objectContaining({
          id: second.id,
          workspaceRootPath: join(renamed.path, second.directoryName as string)
        })
      ])
    )
    expect((await stat(renamed.path)).isDirectory()).toBe(true)
    await expect(stat(space.path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(policy.assertAllowed).toHaveBeenCalledWith({
      path: space.path,
      entityType: 'space',
      entityId: space.id
    })

    database.close()
    database = openRealmFlowDatabase(join(temporaryDirectory, 'realmflow.db'))
    const reopened = createSqliteRepositories(database)
    await expect(reopened.workspaces.get(space.id)).resolves.toEqual(renamed)
    await expect(
      reopened.requirements.listByWorkspace(space.id)
    ).resolves.toEqual(requirements)
  })

  it('renames only the selected requirement directory and persists it', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const first = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const sibling = await createRequirement.execute({
      id: 'requirement-2',
      workspaceId: space.id,
      title: 'Billing Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const rename = new RenameRequirementDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      { assertAllowed: vi.fn(async () => {}) },
      () => 50
    )

    const renamed = await rename.execute({
      id: first.id,
      name: '  Authentication Flow  ',
      expectedRevision: first.revision
    })

    expect(renamed).toMatchObject({
      workspaceRootPath: join(space.path, 'Authentication-Flow--requirement-1'),
      directoryName: 'Authentication-Flow--requirement-1',
      revision: first.revision + 1,
      updatedAt: 50
    })
    await expect(repositories.requirements.get(sibling.id)).resolves.toEqual(
      sibling
    )
    expect(
      (await stat(renamed.workspaceRootPath as string)).isDirectory()
    ).toBe(true)
    await expect(stat(first.workspaceRootPath as string)).rejects.toMatchObject(
      {
        code: 'ENOENT'
      }
    )

    database.close()
    database = openRealmFlowDatabase(join(temporaryDirectory, 'realmflow.db'))
    await expect(
      createSqliteRepositories(database).requirements.get(first.id)
    ).resolves.toEqual(renamed)
  })

  it('rejects invalid, stale, active, and non-idempotent directory rename requests', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const policy = { assertAllowed: vi.fn(async () => {}) }
    const renameRequirement = new RenameRequirementDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      policy,
      () => 50
    )

    await expect(
      renameRequirement.execute({
        id: requirement.id,
        name: '   ',
        expectedRevision: requirement.revision
      })
    ).rejects.toThrow('Physical directory name is required')
    await expect(
      renameRequirement.execute({
        id: requirement.id,
        name: 'Stale Flow',
        expectedRevision: requirement.revision - 1
      })
    ).rejects.toThrow('Requirement revision conflict')

    const execution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    await repositories.workflowExecutions.save(
      { ...execution!, status: 'running', updatedAt: 45 },
      execution!.revision
    )
    await expect(
      renameRequirement.execute({
        id: requirement.id,
        name: 'Blocked Flow',
        expectedRevision: requirement.revision
      })
    ).rejects.toThrow('Requirement has an active workflow execution')
    expect(policy.assertAllowed).not.toHaveBeenCalled()

    await repositories.workflowExecutions.save(
      {
        ...(await repositories.workflowExecutions.getActiveByRequirement(
          requirement.id
        ))!,
        status: 'cancelled',
        updatedAt: 46,
        completedAt: 46
      },
      (await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      ))!.revision
    )
    const renamed = await renameRequirement.execute({
      id: requirement.id,
      name: 'Renamed Flow',
      expectedRevision: requirement.revision
    })
    const repeated = await renameRequirement.execute({
      id: requirement.id,
      name: ' Renamed Flow ',
      expectedRevision: requirement.revision
    })
    expect(repeated).toEqual(renamed)
  })

  it('guards space directory renames and keeps successful replays idempotent', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const policy = { assertAllowed: vi.fn(async () => {}) }
    const renameSpace = new RenameSpaceDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      policy,
      () => 50
    )

    await expect(
      renameSpace.execute({
        id: space.id,
        name: '   ',
        expectedRevision: space.revision
      })
    ).rejects.toThrow('Physical directory name is required')
    await expect(
      renameSpace.execute({
        id: space.id,
        name: 'Stale Space',
        expectedRevision: space.revision - 1
      })
    ).rejects.toThrow('Workspace revision conflict')

    const execution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    const runningResult = await repositories.workflowExecutions.save(
      { ...execution!, status: 'waiting_user', updatedAt: 45 },
      execution!.revision
    )
    const running = runningResult.entity
    await expect(
      renameSpace.execute({
        id: space.id,
        name: 'Blocked Space',
        expectedRevision: space.revision
      })
    ).rejects.toThrow('Workspace has an active workflow execution')
    expect(policy.assertAllowed).not.toHaveBeenCalled()

    await repositories.workflowExecutions.save(
      {
        ...running,
        status: 'cancelled',
        updatedAt: 46,
        completedAt: 46
      },
      running.revision
    )
    const renamed = await renameSpace.execute({
      id: space.id,
      name: 'Renamed Space',
      expectedRevision: space.revision
    })
    const repeated = await renameSpace.execute({
      id: space.id,
      name: ' Renamed Space ',
      expectedRevision: space.revision
    })
    expect(repeated).toEqual(renamed)
    expect(policy.assertAllowed).toHaveBeenCalledTimes(1)
  })

  it('rolls moved directories back when the SQLite transaction fails', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const policy = { assertAllowed: vi.fn(async () => {}) }
    const failingUnitOfWork = failAfterOperation(
      repositories.unitOfWork,
      'database unavailable'
    )
    const renameRequirement = new RenameRequirementDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      failingUnitOfWork,
      files,
      policy,
      () => 50
    )

    await expect(
      renameRequirement.execute({
        id: requirement.id,
        name: 'Renamed Flow',
        expectedRevision: requirement.revision
      })
    ).rejects.toThrow('database unavailable')
    expect(
      (await stat(requirement.workspaceRootPath as string)).isDirectory()
    ).toBe(true)
    await expect(
      stat(join(space.path, 'Renamed-Flow--requirement-1'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toEqual(requirement)

    const renameSpace = new RenameSpaceDirectoryUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      failingUnitOfWork,
      files,
      policy,
      () => 60
    )
    await expect(
      renameSpace.execute({
        id: space.id,
        name: 'Renamed Space',
        expectedRevision: space.revision
      })
    ).rejects.toThrow('database unavailable')
    expect((await stat(space.path)).isDirectory()).toBe(true)
    await expect(
      stat(join(rootPath, 'Renamed-Space--space-1'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(repositories.workspaces.get(space.id)).resolves.toEqual(space)
  })

  it('rejects an empty requirement title before creating state', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()

    await expect(
      createRequirement.execute({
        id: 'requirement-1',
        workspaceId: space.id,
        title: '   ',
        templateVersionId: 'builtin-sdlc-v1'
      })
    ).rejects.toThrow('Requirement title is required')
    await expect(
      repositories.requirements.listByWorkspace(space.id)
    ).resolves.toEqual([])
    await expect(
      readdir(space.path).then((entries) =>
        entries.filter((entry) => entry !== '.realmflow')
      )
    ).resolves.toEqual([])
  })

  it('returns the existing requirement for an identical repeated create command', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()
    const command = {
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    }

    const created = await createRequirement.execute(command)
    const repeated = await createRequirement.execute(command)

    expect(repeated).toEqual(created)
    await expect(
      repositories.requirements.listByWorkspace(space.id)
    ).resolves.toEqual([created])
    await expect(
      readdir(space.path).then((entries) =>
        entries.filter((entry) => entry !== '.realmflow')
      )
    ).resolves.toEqual(['Login-Flow--requirement-1'])
    await expect(
      readdir(join(space.path, '.realmflow', 'tmp'))
    ).resolves.toEqual([])
    await expect(
      repositories.workflowExecutions.listByStatus('created')
    ).resolves.toHaveLength(1)
    const workflow = await repositories.requirementWorkflows.get(created.id)
    for (const node of workflow!.nodes) {
      const stableNodeId = node.id.slice(node.id.lastIndexOf(':') + 1)
      await expect(
        repositories.nodeRuns.get(`${created.id}:node-run:${stableNodeId}:1`)
      ).resolves.toMatchObject({
        executionId: `${created.id}:execution:1`,
        nodeId: node.id,
        attempt: 1,
        revision: 1
      })
    }
  })

  it.each([
    ['workspace', { workspaceId: 'different-space' }],
    ['title', { title: 'Different Requirement' }],
    ['template', { templateVersionId: 'different-template' }],
    ['sync setting', { syncCompletedArtifactsToKnowledge: true }]
  ])(
    'rejects a repeated requirement id with a different %s',
    async (_field, changedInput) => {
      const { createRequirement, repositories, space } =
        await setupRequirementCreation()
      const command = {
        id: 'requirement-1',
        workspaceId: space.id,
        title: 'Login Flow',
        templateVersionId: 'builtin-sdlc-v1'
      }
      const created = await createRequirement.execute(command)

      await expect(
        createRequirement.execute({ ...command, ...changedInput })
      ).rejects.toThrow('Requirement id already exists with different data')
      await expect(
        repositories.requirements.get(created.id)
      ).resolves.toMatchObject({
        id: created.id,
        title: created.title,
        workspaceId: created.workspaceId,
        workflowTemplateVersionId: created.workflowTemplateVersionId,
        workspaceRootPath: created.workspaceRootPath,
        revision: created.revision
      })
      expect(
        (await stat(created.workspaceRootPath as string)).isDirectory()
      ).toBe(true)
    }
  )

  it('cleans the prepared requirement directory when saving fails', async () => {
    const { files, repositories, space } = await setupRequirementCreation()
    const failingRequirements = new Proxy(repositories.requirements, {
      get(target, property, receiver) {
        if (property === 'save') {
          return async () => {
            throw new Error('database unavailable')
          }
        }
        return Reflect.get(target, property, receiver)
      }
    })
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      failingRequirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.nodeTodos,
      repositories.unitOfWork,
      files,
      () => 30
    )

    await expect(
      createRequirement.execute({
        id: 'requirement-1',
        workspaceId: space.id,
        title: 'Login Flow',
        templateVersionId: 'builtin-sdlc-v1'
      })
    ).rejects.toThrow('database unavailable')
    await expect(
      repositories.requirements.listByWorkspace(space.id)
    ).resolves.toEqual([])
    await expect(
      readdir(join(space.path, '.realmflow', 'tmp'))
    ).resolves.toEqual([])
    await expect(
      stat(join(space.path, 'Login-Flow--requirement-1'))
    ).rejects.toThrow()
  })

  it('cleans the temporary requirement directory when manifest writing fails', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    vi.spyOn(
      files as unknown as {
        writeJsonAtomically: () => Promise<void>
      },
      'writeJsonAtomically'
    ).mockRejectedValueOnce(new Error('manifest write failed'))

    await expect(
      createRequirement.execute({
        id: 'requirement-1',
        workspaceId: space.id,
        title: 'Login Flow',
        templateVersionId: 'builtin-sdlc-v1'
      })
    ).rejects.toThrow('manifest write failed')
    await expect(
      repositories.requirements.listByWorkspace(space.id)
    ).resolves.toEqual([])
    await expect(
      readdir(join(space.path, '.realmflow', 'tmp'))
    ).resolves.toEqual([])
  })

  it('removes committed requirement state when SQLite commit fails', async () => {
    const { files, repositories, space } = await setupRequirementCreation()
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      repositories.nodeRuns,
      repositories.nodeTodos,
      failAfterOperation(repositories.unitOfWork, 'sqlite commit failed'),
      files,
      () => 30
    )

    await expect(
      createRequirement.execute({
        id: 'requirement-1',
        workspaceId: space.id,
        title: 'Login Flow',
        templateVersionId: 'builtin-sdlc-v1'
      })
    ).rejects.toThrow('sqlite commit failed')
    await expect(
      repositories.requirements.listByWorkspace(space.id)
    ).resolves.toEqual([])
    await expect(
      repositories.requirementWorkflows.get('requirement-1')
    ).resolves.toBeUndefined()
    await expect(
      repositories.workflowExecutions.getActiveByRequirement('requirement-1')
    ).resolves.toBeUndefined()
    await expect(
      stat(join(space.path, 'Login-Flow--requirement-1'))
    ).rejects.toThrow()
    await expect(
      readdir(join(space.path, '.realmflow', 'tmp'))
    ).resolves.toEqual([])
  })

  it('rolls back the complete requirement aggregate when a node run cannot be saved', async () => {
    const { files, repositories, space } = await setupRequirementCreation()
    const failingNodeRuns = new Proxy(repositories.nodeRuns, {
      get(target, property, receiver) {
        if (property === 'save') {
          return async () => {
            throw new Error('node run unavailable')
          }
        }
        return Reflect.get(target, property, receiver)
      }
    })
    const createRequirement = new CreateRequirementUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowTemplates,
      repositories.requirementWorkflows,
      repositories.workflowExecutions,
      failingNodeRuns,
      repositories.nodeTodos,
      repositories.unitOfWork,
      files,
      () => 30
    )

    await expect(
      createRequirement.execute({
        id: 'requirement-1',
        workspaceId: space.id,
        title: 'Login Flow',
        templateVersionId: 'builtin-sdlc-v1'
      })
    ).rejects.toThrow('node run unavailable')
    await expect(
      repositories.requirements.get('requirement-1')
    ).resolves.toBeUndefined()
    await expect(
      repositories.requirementWorkflows.get('requirement-1')
    ).resolves.toBeUndefined()
    await expect(
      repositories.workflowExecutions.getActiveByRequirement('requirement-1')
    ).resolves.toBeUndefined()
    await expect(
      repositories.nodeRuns.get('requirement-1:node-run:analysis:1')
    ).resolves.toBeUndefined()
    await expect(
      stat(join(space.path, 'Login-Flow--requirement-1'))
    ).rejects.toThrow()
    await expect(
      readdir(join(space.path, '.realmflow', 'tmp'))
    ).resolves.toEqual([])
  })

  it('preserves an occupied requirement directory and rolls back the record', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()
    const occupiedPath = join(space.path, 'Login-Flow--requirement-1')
    await mkdir(occupiedPath)

    await expect(
      createRequirement.execute({
        id: 'requirement-1',
        workspaceId: space.id,
        title: 'Login Flow',
        templateVersionId: 'builtin-sdlc-v1'
      })
    ).rejects.toThrow('Managed directory already exists')
    expect((await stat(occupiedPath)).isDirectory()).toBe(true)
    await expect(
      repositories.requirements.listByWorkspace(space.id)
    ).resolves.toEqual([])
  })

  it('reloads the complete requirement workflow aggregate from SQLite', async () => {
    const { createRequirement, repositories, space } =
      await setupRequirementCreation()
    const created = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const template =
      await repositories.workflowTemplates.getVersion('builtin-sdlc-v1')
    const workflow = await repositories.requirementWorkflows.get(created.id)
    const execution =
      await repositories.workflowExecutions.getActiveByRequirement(created.id)
    const nodeRuns = await Promise.all(
      workflow!.nodes.map((node) =>
        repositories.nodeRuns.getLatestByNode(execution!.id, node.id)
      )
    )

    database.close()
    database = openRealmFlowDatabase(join(temporaryDirectory, 'realmflow.db'))
    const reloadedRepositories = createSqliteRepositories(database)
    const reloaded = await reloadedRepositories.requirements.get(created.id)
    const reloadedWorkflow =
      await reloadedRepositories.requirementWorkflows.get(created.id)
    const reloadedExecution =
      await reloadedRepositories.workflowExecutions.getActiveByRequirement(
        created.id
      )
    const reloadedNodeRuns = await Promise.all(
      reloadedWorkflow!.nodes.map((node) =>
        reloadedRepositories.nodeRuns.getLatestByNode(
          reloadedExecution!.id,
          node.id
        )
      )
    )

    expect(reloaded).toEqual(created)
    expect(reloadedWorkflow).toEqual(workflow)
    expect(reloadedExecution).toEqual(execution)
    expect(reloadedNodeRuns).toEqual(nodeRuns)
    expect(reloadedWorkflow).toMatchObject({
      templateVersionId: template!.id,
      nodes: template!.nodes.map((node, index) =>
        expect.objectContaining({
          id: `${created.id}:${node.stableKey}`,
          ...(node.configuration ? { configuration: node.configuration } : {}),
          ...(node.executor ? { executor: node.executor } : {}),
          ...(node.completionGate
            ? { completionGate: node.completionGate }
            : {}),
          status: index === 0 ? 'ready' : 'pending'
        })
      ),
      edges: template!.edges.map((edge) => ({
        id: `${created.id}:${edge.id}`,
        sourceNodeId: `${created.id}:${
          template!.nodes.find((node) => node.id === edge.sourceNodeId)!
            .stableKey
        }`,
        targetNodeId: `${created.id}:${
          template!.nodes.find((node) => node.id === edge.targetNodeId)!
            .stableKey
        }`
      }))
    })
    expect(
      (await stat(reloaded!.workspaceRootPath as string)).isDirectory()
    ).toBe(true)
  })

  it('keeps existing spaces on their original root after switching roots', async () => {
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
    const nextRootPath = join(temporaryDirectory, 'next-work-root')
    await mkdir(nextRootPath)
    const canonicalRootPath = await realpath(rootPath)
    const canonicalNextRootPath = await realpath(nextRootPath)

    await selectRoot.execute({
      id: 'root-1',
      path: rootPath,
      expectedRevision: 0
    })
    const originalSpace = await createSpace.execute({
      id: 'space-old',
      name: 'Legacy Space'
    })

    await selectRoot.execute({
      id: 'root-2',
      path: nextRootPath,
      expectedRevision: 0
    })
    const newSpace = await createSpace.execute({
      id: 'space-new',
      name: 'Current Space'
    })

    await expect(
      repositories.workspaces.get(originalSpace.id)
    ).resolves.toEqual(originalSpace)
    expect(originalSpace.workRootId).toBe('root-1')
    expect(originalSpace.path.startsWith(canonicalRootPath)).toBe(true)
    expect(newSpace.workRootId).toBe('root-2')
    expect(newSpace.path.startsWith(canonicalNextRootPath)).toBe(true)
    expect((await stat(originalSpace.path)).isDirectory()).toBe(true)
    expect((await stat(newSpace.path)).isDirectory()).toBe(true)
  })

  it('relocates one space and transactionally refreshes requirement paths', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const relocatedPath = join(rootPath, 'Externally-Moved-Space')
    await rename(space.path, relocatedPath)
    const relocate = new RelocateSpaceUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    )

    const relocated = await relocate.execute({
      id: space.id,
      targetPath: relocatedPath,
      expectedRevision: space.revision
    })

    expect(relocated).toMatchObject({
      id: space.id,
      path: await realpath(relocatedPath),
      rootPath: await realpath(relocatedPath),
      directoryName: 'Externally-Moved-Space',
      workRootId: space.workRootId,
      relocatedAt: 50,
      relocationSource: 'user',
      revision: space.revision + 1
    })
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toMatchObject({
      workspaceRootPath: join(
        await realpath(relocatedPath),
        requirement.directoryName as string
      ),
      revision: requirement.revision + 1
    })
    expect((await stat(relocatedPath)).isDirectory()).toBe(true)
  })

  it('keeps relocation idempotent and rejects active executions', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const relocatedPath = join(rootPath, 'Externally-Moved-Space')
    await rename(space.path, relocatedPath)
    const relocate = new RelocateSpaceUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    )
    const execution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    await repositories.workflowExecutions.save(
      { ...execution!, status: 'running', updatedAt: 40 },
      execution!.revision
    )

    await expect(
      relocate.execute({
        id: space.id,
        targetPath: relocatedPath,
        expectedRevision: space.revision
      })
    ).rejects.toThrow('Space has an active workflow execution')
    await expect(repositories.workspaces.get(space.id)).resolves.toEqual(space)

    const latestExecution =
      await repositories.workflowExecutions.getActiveByRequirement(
        requirement.id
      )
    await repositories.workflowExecutions.save(
      { ...latestExecution!, status: 'paused', updatedAt: 41 },
      latestExecution!.revision
    )
    const relocated = await relocate.execute({
      id: space.id,
      targetPath: relocatedPath,
      expectedRevision: space.revision
    })
    await expect(
      relocate.execute({
        id: space.id,
        targetPath: relocatedPath,
        expectedRevision: space.revision
      })
    ).resolves.toEqual(relocated)
  })

  it('rejects relocation with a stale workspace revision', async () => {
    const { files, repositories, space } = await setupRequirementCreation()
    const relocatedPath = join(rootPath, 'Externally-Moved-Space')
    await rename(space.path, relocatedPath)
    const relocate = new RelocateSpaceUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    )

    await expect(
      relocate.execute({
        id: space.id,
        targetPath: relocatedPath,
        expectedRevision: space.revision + 1
      })
    ).rejects.toThrow('Workspace revision conflict')
    await expect(repositories.workspaces.get(space.id)).resolves.toEqual(space)
  })

  it('rejects relocation when another space is bound to the target path', async () => {
    const { files, repositories, space } = await setupRequirementCreation()
    const relocatedPath = join(rootPath, 'Externally-Moved-Space')
    const canonicalRelocatedPath = join(
      await realpath(rootPath),
      'Externally-Moved-Space'
    )
    await repositories.workspaces.save(
      {
        ...space,
        id: 'space-2',
        path: canonicalRelocatedPath,
        rootPath: canonicalRelocatedPath,
        directoryName: 'Externally-Moved-Space',
        createdAt: 30,
        updatedAt: 30
      },
      0
    )
    await rename(space.path, relocatedPath)
    const relocate = new RelocateSpaceUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    )

    await expect(
      relocate.execute({
        id: space.id,
        targetPath: relocatedPath,
        expectedRevision: space.revision
      })
    ).rejects.toThrow('Space directory is already bound')
    await expect(repositories.workspaces.get(space.id)).resolves.toEqual(space)
  })

  it('rejects relocation when a requirement directory binding is unavailable', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    await repositories.requirements.save(
      {
        ...requirement,
        directoryName: undefined,
        updatedAt: 40
      },
      requirement.revision
    )
    const relocatedPath = join(rootPath, 'Externally-Moved-Space')
    await rename(space.path, relocatedPath)
    const relocate = new RelocateSpaceUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    )

    await expect(
      relocate.execute({
        id: space.id,
        targetPath: relocatedPath,
        expectedRevision: space.revision
      })
    ).rejects.toThrow('Requirement directory binding is unavailable')
    await expect(repositories.workspaces.get(space.id)).resolves.toEqual(space)
  })

  it('rolls back all relocation bindings when SQLite commit fails', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-1',
      workspaceId: space.id,
      title: 'Login Flow',
      templateVersionId: 'builtin-sdlc-v1'
    })
    const relocatedPath = join(rootPath, 'Externally-Moved-Space')
    await rename(space.path, relocatedPath)
    const relocate = new RelocateSpaceUseCase(
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      failAfterOperation(repositories.unitOfWork, 'sqlite commit failed'),
      files,
      () => 50
    )

    await expect(
      relocate.execute({
        id: space.id,
        targetPath: relocatedPath,
        expectedRevision: space.revision
      })
    ).rejects.toThrow('sqlite commit failed')
    await expect(repositories.workspaces.get(space.id)).resolves.toEqual(space)
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toEqual(requirement)
    expect((await stat(relocatedPath)).isDirectory()).toBe(true)
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
      repositories.nodeTodos,
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
    expect(
      (await stat(requirement.workspaceRootPath as string)).isDirectory()
    ).toBe(true)

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
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toBeUndefined()
    await expect(
      stat(requirement.workspaceRootPath as string)
    ).rejects.toThrow()
    expect(await readdir(join(rootPath, '.realmflow', 'trash'))).toHaveLength(1)

    await expect(
      restoreRequirement.execute({ id: requirement.id })
    ).resolves.toBe(true)
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toMatchObject({
      id: requirement.id
    })
    expect(
      (await stat(requirement.workspaceRootPath as string)).isDirectory()
    ).toBe(true)

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

  it('revokes current index visibility and enqueues tenant cleanup in the workspace deletion transaction', async () => {
    const { files, repositories, space } = await setupRequirementCreation()
    const indexes = new SqliteVectorIndexRepository(database)
    await indexes.ensureActiveProfile(1)
    await indexes.createGeneration({
      id: 'generation-delete',
      scopeKind: 'workspace',
      scopeId: space.id,
      sourceKind: 'file',
      sourceId: 'source-delete',
      sourceVersion: 'file:v1',
      sourceChecksum: `sha256:${'a'.repeat(64)}`,
      profileId: DEFAULT_VECTOR_INDEX_PROFILE.id,
      status: 'staging',
      documentCount: 1,
      chunkCount: 1,
      createdAt: 2
    })
    await indexes.transitionGeneration({
      id: 'generation-delete',
      expectedStatus: 'staging',
      nextStatus: 'current',
      at: 3
    })
    database.exec(`
      CREATE TEMP TABLE workspace_delete_order (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        step TEXT NOT NULL
      );
      CREATE TEMP TRIGGER record_generation_visibility_revoked
      AFTER UPDATE OF status ON knowledge_index_generations
      WHEN OLD.status = 'current' AND NEW.status = 'retired'
      BEGIN
        INSERT INTO workspace_delete_order (step) VALUES ('visibility');
      END;
      CREATE TEMP TRIGGER record_workspace_deleted
      AFTER INSERT ON entity_deletions
      WHEN NEW.entity_type = 'workspace'
      BEGIN
        INSERT INTO workspace_delete_order (step) VALUES ('workspace');
      END;
    `)

    await new DeleteSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    ).execute({ id: space.id, expectedRevision: space.revision })

    await expect(
      indexes.listCurrentGenerations({
        scopeKind: 'workspace',
        scopeIds: [space.id],
        profileId: DEFAULT_VECTOR_INDEX_PROFILE.id
      })
    ).resolves.toEqual([])
    expect(
      database
        .prepare(
          `SELECT workspace_id, collection_name, status
           FROM workspace_qdrant_cleanup_jobs`
        )
        .get()
    ).toEqual({
      workspace_id: space.id,
      collection_name: DEFAULT_VECTOR_INDEX_PROFILE.workspaceCollection,
      status: 'pending'
    })
    expect(
      database
        .prepare('SELECT step FROM workspace_delete_order ORDER BY sequence')
        .pluck()
        .all()
    ).toEqual(['visibility', 'workspace'])
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
      repositories.nodeTodos,
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

    expect(
      (await stat(requirement.workspaceRootPath as string)).isDirectory()
    ).toBe(true)
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toMatchObject({
      id: requirement.id
    })
    await expect(
      readdir(join(rootPath, '.realmflow', 'trash'))
    ).resolves.toEqual([])
  })

  it('lists deleted items without exposing managed absolute paths', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-trash-list',
      workspaceId: space.id,
      title: 'Listed Requirement',
      templateVersionId: 'builtin-sdlc-v1'
    })
    await repositories.workflowExecutions.save(
      {
        ...(await repositories.workflowExecutions.getActiveByRequirement(
          requirement.id
        ))!,
        status: 'cancelled',
        updatedAt: 40,
        completedAt: 40
      },
      1
    )
    await new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    ).execute({ id: requirement.id, expectedRevision: requirement.revision })

    const items = await new ListTrashItemsUseCase(repositories.trash).execute()

    expect(items).toEqual([
      {
        entityType: 'requirement',
        entityId: requirement.id,
        displayName: requirement.title,
        workspaceId: space.id,
        deletedAt: 50,
        triggerSource: 'user',
        state: 'trashed'
      }
    ])
    expect(items[0]).not.toHaveProperty('originalPath')
    expect(items[0]).not.toHaveProperty('trashPath')
  })

  it('requires exact confirmation and permanently deletes a requirement', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-purge',
      workspaceId: space.id,
      title: 'Purge Requirement',
      templateVersionId: 'builtin-sdlc-v1'
    })
    await repositories.workflowExecutions.save(
      {
        ...(await repositories.workflowExecutions.getActiveByRequirement(
          requirement.id
        ))!,
        status: 'cancelled',
        updatedAt: 40,
        completedAt: 40
      },
      1
    )
    await new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    ).execute({ id: requirement.id, expectedRevision: requirement.revision })
    const purge = new PurgeRequirementUseCase(
      repositories.trash,
      repositories.unitOfWork,
      files
    )

    await expect(
      purge.execute({ id: requirement.id, confirmation: 'delete' })
    ).rejects.toThrow('Permanent deletion confirmation is required')
    await expect(
      repositories.trash.get({
        entityType: 'requirement',
        entityId: requirement.id
      })
    ).resolves.toMatchObject({ state: 'trashed' })

    await expect(
      purge.execute({
        id: requirement.id,
        confirmation: 'PERMANENTLY_DELETE'
      })
    ).resolves.toEqual({ status: 'purged' })
    await expect(
      repositories.requirements.get(requirement.id)
    ).resolves.toBeUndefined()
    await expect(
      repositories.requirementWorkflows.get(requirement.id)
    ).resolves.toBeUndefined()
    await expect(
      purge.execute({
        id: requirement.id,
        confirmation: 'PERMANENTLY_DELETE'
      })
    ).resolves.toEqual({ status: 'not_found' })
  })

  it('keeps failed permanent deletion resumable and blocks restore', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-resume-purge',
      workspaceId: space.id,
      title: 'Resume Purge',
      templateVersionId: 'builtin-sdlc-v1'
    })
    await repositories.workflowExecutions.save(
      {
        ...(await repositories.workflowExecutions.getActiveByRequirement(
          requirement.id
        ))!,
        status: 'cancelled',
        updatedAt: 40,
        completedAt: 40
      },
      1
    )
    await new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    ).execute({ id: requirement.id, expectedRevision: requirement.revision })
    let failRemoval = true
    const purge = new PurgeRequirementUseCase(
      repositories.trash,
      repositories.unitOfWork,
      {
        purgeManagedTrashDirectory: async (input) => {
          if (failRemoval) {
            failRemoval = false
            throw new Error('filesystem unavailable')
          }
          await files.purgeManagedTrashDirectory(input)
        }
      }
    )

    await expect(
      purge.execute({
        id: requirement.id,
        confirmation: 'PERMANENTLY_DELETE'
      })
    ).rejects.toThrow('filesystem unavailable')
    await expect(
      repositories.trash.get({
        entityType: 'requirement',
        entityId: requirement.id
      })
    ).resolves.toMatchObject({ state: 'purging' })
    await expect(
      new RestoreRequirementUseCase(
        repositories.requirements,
        repositories.unitOfWork,
        files
      ).execute({ id: requirement.id })
    ).rejects.toThrow('Requirement is being permanently deleted')

    await expect(
      purge.execute({
        id: requirement.id,
        confirmation: 'PERMANENTLY_DELETE'
      })
    ).resolves.toEqual({ status: 'purged' })
  })

  it('retries the final database purge after files were already removed', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-database-purge-retry',
      workspaceId: space.id,
      title: 'Database Purge Retry',
      templateVersionId: 'builtin-sdlc-v1'
    })
    await repositories.workflowExecutions.save(
      {
        ...(await repositories.workflowExecutions.getActiveByRequirement(
          requirement.id
        ))!,
        status: 'cancelled',
        updatedAt: 40,
        completedAt: 40
      },
      1
    )
    await new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    ).execute({ id: requirement.id, expectedRevision: requirement.revision })
    const deletion = await repositories.trash.get({
      entityType: 'requirement',
      entityId: requirement.id
    })
    let transactionCount = 0
    const failFinalTransaction: UnitOfWork = {
      execute: async <T>(operation: () => T | Promise<T>) => {
        transactionCount += 1
        if (transactionCount === 1) {
          return repositories.unitOfWork.execute(operation)
        }
        return failAfterOperation(
          repositories.unitOfWork,
          'final database commit failed'
        ).execute(operation)
      }
    }

    await expect(
      new PurgeRequirementUseCase(
        repositories.trash,
        failFinalTransaction,
        files
      ).execute({
        id: requirement.id,
        confirmation: 'PERMANENTLY_DELETE'
      })
    ).rejects.toThrow('final database commit failed')
    await expect(stat(deletion!.trashPath)).rejects.toThrow()
    await expect(
      repositories.trash.get({
        entityType: 'requirement',
        entityId: requirement.id
      })
    ).resolves.toMatchObject({ state: 'purging' })

    await expect(
      new PurgeRequirementUseCase(
        repositories.trash,
        repositories.unitOfWork,
        files
      ).execute({
        id: requirement.id,
        confirmation: 'PERMANENTLY_DELETE'
      })
    ).resolves.toEqual({ status: 'purged' })
  })

  it('permanently deletes a space and independently trashed requirements', async () => {
    const { createRequirement, files, repositories, space } =
      await setupRequirementCreation()
    const requirement = await createRequirement.execute({
      id: 'requirement-child-trash',
      workspaceId: space.id,
      title: 'Child Trash',
      templateVersionId: 'builtin-sdlc-v1'
    })
    await repositories.workflowExecutions.save(
      {
        ...(await repositories.workflowExecutions.getActiveByRequirement(
          requirement.id
        ))!,
        status: 'cancelled',
        updatedAt: 40,
        completedAt: 40
      },
      1
    )
    await new DeleteRequirementUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 50
    ).execute({ id: requirement.id, expectedRevision: requirement.revision })
    await new DeleteSpaceUseCase(
      repositories.workRoots,
      repositories.workspaces,
      repositories.requirements,
      repositories.workflowExecutions,
      repositories.unitOfWork,
      files,
      () => 60
    ).execute({ id: space.id, expectedRevision: space.revision })

    await expect(
      new PurgeSpaceUseCase(
        repositories.trash,
        repositories.unitOfWork,
        files
      ).execute({
        id: space.id,
        confirmation: 'PERMANENTLY_DELETE'
      })
    ).resolves.toEqual({ status: 'purged' })
    await expect(repositories.trash.list()).resolves.toEqual([])
    await expect(
      readdir(join(rootPath, '.realmflow', 'trash'))
    ).resolves.toEqual([])
  })
})

function publishableNodeConfiguration(
  stableKey: string
): WorkflowNodeConfiguration {
  return {
    input: {
      includeRequirementBody: true,
      predecessorArtifacts: 'direct',
      includeSpaceKnowledge: false,
      attachments: []
    },
    prompt: `Complete ${stableKey}.`,
    model: { strategy: 'inherit' },
    connectorIds: [],
    permissions: [],
    artifact: {
      required: true,
      relativePath: `artifacts/${stableKey}.md`,
      kind: 'markdown'
    },
    todos: [{ title: `Review ${stableKey}`, required: true }],
    completionGate: { requireApproval: false },
    retry: { maxAttempts: 1, backoffMs: 0 },
    skip: { allowed: false, requireReason: false }
  }
}
