export type RequirementStageId =
  | 'analysis'
  | 'design'
  | 'implementation'
  | 'testing'
  | 'release'
  | 'retrospective'

export type WorkspaceEntryType = 'directory' | 'file'
export type WorkspaceFileKind = 'code' | 'markdown' | 'html' | 'image' | 'text'

export type WorkspaceBinding = {
  requirementId: string
  rootName: string
  rootPath: string
}

export type OpenedSessionFiles = {
  binding: WorkspaceBinding
  files: WorkspaceFile[]
}

export type WorkspaceEntry = {
  name: string
  path: string
  type: WorkspaceEntryType
}

export type WorkspaceFile = {
  name: string
  path: string
  content: string
  kind: WorkspaceFileKind
  language: string
  size: number
  modifiedAt: number
  version: string
}

export type WorkspaceArtifact = {
  path: string
  primary?: boolean
}

export type RequirementStageManifest = {
  artifacts: WorkspaceArtifact[]
}

export type RequirementManifest = {
  version: 1
  requirementId: string
  stages: Partial<Record<RequirementStageId, RequirementStageManifest>>
}

export type WriteWorkspaceFileInput = {
  requirementId: string
  path: string
  content: string
  expectedVersion: string
}

export interface WorkspaceApi {
  chooseFiles: () => Promise<OpenedSessionFiles | null>
  chooseFolder: () => Promise<WorkspaceBinding | null>
  chooseDirectory: (requirementId: string) => Promise<WorkspaceBinding | null>
  getBinding: (requirementId: string) => Promise<WorkspaceBinding | null>
  listDirectory: (
    requirementId: string,
    path?: string
  ) => Promise<WorkspaceEntry[]>
  readFile: (requirementId: string, path: string) => Promise<WorkspaceFile>
  writeFile: (input: WriteWorkspaceFileInput) => Promise<WorkspaceFile>
  readManifest: (requirementId: string) => Promise<RequirementManifest>
  writeManifest: (
    requirementId: string,
    manifest: RequirementManifest
  ) => Promise<RequirementManifest>
  getPreviewUrl: (requirementId: string, path: string) => Promise<string>
  showItem: (requirementId: string, path: string) => Promise<void>
}
