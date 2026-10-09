import { ManagedDirectoryRenamePolicyService } from './managed-directory-rename-policy'

describe('ManagedDirectoryRenamePolicyService', () => {
  const input = {
    path: '/repo/spaces/product/requirement',
    entityType: 'requirement' as const,
    entityId: 'requirement-1'
  }

  it('allows a managed directory outside a Git work tree', async () => {
    const runGit = vi.fn(async () => {
      throw Object.assign(new Error('not a git repository'), { code: 128 })
    })
    const policy = new ManagedDirectoryRenamePolicyService(
      { hasActiveWrites: async () => false },
      runGit
    )

    await expect(policy.assertAllowed(input)).resolves.toBeUndefined()
    expect(runGit).toHaveBeenCalledWith([
      '-C',
      input.path,
      'rev-parse',
      '--show-toplevel'
    ])
  })

  it('allows a clean scoped Git path using read-only commands', async () => {
    const runGit = vi
      .fn<(arguments_: string[]) => Promise<string>>()
      .mockResolvedValueOnce('/repo\n')
      .mockResolvedValueOnce('')
    const policy = new ManagedDirectoryRenamePolicyService(
      { hasActiveWrites: async () => false },
      runGit
    )

    await expect(policy.assertAllowed(input)).resolves.toBeUndefined()
    expect(runGit).toHaveBeenNthCalledWith(2, [
      '-C',
      '/repo',
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--',
      'spaces/product/requirement'
    ])
  })

  it('rejects uncommitted changes scoped to the managed directory', async () => {
    const runGit = vi
      .fn<(arguments_: string[]) => Promise<string>>()
      .mockResolvedValueOnce('/repo\n')
      .mockResolvedValueOnce(' M spaces/product/requirement/file.md\n')
    const policy = new ManagedDirectoryRenamePolicyService(
      { hasActiveWrites: async () => false },
      runGit
    )

    await expect(policy.assertAllowed(input)).rejects.toThrow(
      'Managed directory has uncommitted Git changes'
    )
  })

  it('rejects an active RealmFlow write before probing Git', async () => {
    const runGit = vi.fn<(arguments_: string[]) => Promise<string>>()
    const policy = new ManagedDirectoryRenamePolicyService(
      { hasActiveWrites: async () => true },
      runGit
    )

    await expect(policy.assertAllowed(input)).rejects.toThrow(
      'Managed directory has active file writes'
    )
    expect(runGit).not.toHaveBeenCalled()
  })

  it('propagates Git probe failures other than not-a-repository', async () => {
    const failure = Object.assign(new Error('git unavailable'), { code: 2 })
    const policy = new ManagedDirectoryRenamePolicyService(
      { hasActiveWrites: async () => false },
      vi.fn(async () => {
        throw failure
      })
    )

    await expect(policy.assertAllowed(input)).rejects.toBe(failure)
  })
})
