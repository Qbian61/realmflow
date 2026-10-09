export type LocalFileStorageMode = 'managed_copy' | 'external_reference'

export type LocalFileSource = {
  sourceId: string
  workspaceId: string
  storageMode: LocalFileStorageMode
  originalPath: string
  managedRelativePath?: string
  contentChecksum: string
  byteSize: number
  modifiedAt: number
  checkedAt: number
}

export type LocalFileSourceView = LocalFileSource & {
  locator: string
}

export function createLocalFileSource(
  input: LocalFileSource
): LocalFileSourceView {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.contentChecksum)) {
    throw new Error('Local file checksum is invalid')
  }
  if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0) {
    throw new Error('Local file size is invalid')
  }
  for (const value of [input.modifiedAt, input.checkedAt]) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Local file timestamp is invalid')
    }
  }
  if (input.storageMode === 'managed_copy' && !input.managedRelativePath) {
    throw new Error('Managed file path is required')
  }
  if (
    input.storageMode === 'external_reference' &&
    input.managedRelativePath !== undefined
  ) {
    throw new Error('External references cannot have a managed file path')
  }

  return {
    ...input,
    locator: localFileLocator(
      input.storageMode,
      input.sourceId,
      input.managedRelativePath
    )
  }
}

export function localFileLocator(
  storageMode: LocalFileStorageMode,
  sourceId: string,
  managedRelativePath?: string
): string {
  if (storageMode === 'managed_copy') {
    if (!managedRelativePath) throw new Error('Managed file path is required')
    return `managed:${managedRelativePath}`
  }
  return `external:${sourceId}`
}
