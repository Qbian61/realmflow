import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  BackupStatusDto,
  BusinessApi,
  RestorePreviewDto
} from '../../../shared/business'
import type { BackupErrorCode, BackupOperation } from '../../../domain/backup'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { ToastProvider } from '../toast/ToastProvider'
import { BackupSettings } from './BackupSettings'

const backupOperation: BackupOperation = {
  requestId: '00000000-0000-4000-8000-000000000001',
  kind: 'backup',
  status: 'succeeded',
  bundleName: 'realmflow-2026-09-28.realmflow-backup',
  bundleChecksum: `sha256:${'a'.repeat(64)}`,
  formatVersion: 1,
  schemaVersion: 12,
  fileCount: 8,
  byteSize: 2048,
  createdAt: Date.UTC(2026, 8, 28, 8),
  completedAt: Date.UTC(2026, 8, 28, 8, 1)
}

const preview: RestorePreviewDto = {
  previewId: 'preview-1',
  formatVersion: 1,
  applicationVersion: '0.1.0',
  schemaVersion: 12,
  createdAt: '2026-09-28T08:00:00.000Z',
  bundleChecksum: `sha256:${'b'.repeat(64)}`,
  summary: {
    workRootCount: 2,
    spaceCount: 3,
    requirementCount: 5,
    formalArtifactCount: 7,
    fileCount: 11,
    byteSize: 4096
  }
}

function createBusiness(status: BackupStatusDto = {}): BusinessApi {
  return {
    getBackupStatus: vi.fn().mockResolvedValue(status),
    chooseBackupDestination: vi.fn().mockResolvedValue(backupOperation),
    chooseRestoreBundle: vi.fn().mockResolvedValue(preview),
    prepareRestore: vi.fn().mockResolvedValue({
      ...backupOperation,
      kind: 'restore',
      status: 'restore_pending'
    }),
    restartForRestore: vi.fn().mockResolvedValue(true)
  } as unknown as BusinessApi
}

function renderSettings(
  business: BusinessApi,
  locale: 'zh-CN' | 'en' | 'ja' = 'zh-CN'
) {
  const storage = {
    getItem: vi.fn(() =>
      locale === 'zh-CN' ? null : JSON.stringify({ version: 1, locale })
    ),
    setItem: vi.fn()
  } as unknown as Storage
  return render(
    <LocalizationProvider storage={storage}>
      <ToastProvider>
        <BackupSettings business={business} />
      </ToastProvider>
    </LocalizationProvider>
  )
}

describe('BackupSettings', () => {
  it('loads and displays the latest persisted operations', async () => {
    const business = createBusiness({
      latestBackup: backupOperation,
      latestRestore: {
        ...backupOperation,
        requestId: '00000000-0000-4000-8000-000000000002',
        kind: 'restore',
        status: 'restored',
        createdAt: Date.UTC(2026, 8, 29, 8)
      }
    })

    renderSettings(business)

    expect(screen.getAllByText('正在加载…')).toHaveLength(2)
    expect(await screen.findByText('备份成功')).toBeVisible()
    expect(screen.getByText('恢复完成')).toBeVisible()
    expect(screen.getAllByText('8 个文件')).toHaveLength(2)
    expect(screen.getAllByText('2 KB')).toHaveLength(2)
    expect(business.getBackupStatus).toHaveBeenCalledOnce()
  })

  it('creates a backup and keeps cancellation as a no-op', async () => {
    const business = createBusiness()
    vi.mocked(business.chooseBackupDestination)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(backupOperation)
    renderSettings(business)
    await screen.findByText('尚无备份记录')

    fireEvent.click(screen.getByRole('button', { name: '创建备份' }))
    await waitFor(() =>
      expect(business.chooseBackupDestination).toHaveBeenCalledTimes(1)
    )
    expect(screen.getByText('尚无备份记录')).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '创建备份' }))
    expect(await screen.findByText('备份成功')).toBeVisible()
    expect(screen.getByText(backupOperation.bundleName)).toBeVisible()
  })

  it('previews counts and checksum before asking for confirmation', async () => {
    const business = createBusiness()
    renderSettings(business)
    await screen.findByText('尚无备份记录')

    fireEvent.click(screen.getByRole('button', { name: '选择备份并检查' }))

    expect(await screen.findByText('3 个空间')).toBeVisible()
    expect(screen.getByText('5 个需求')).toBeVisible()
    expect(screen.getByText('7 个正式产物')).toBeVisible()
    expect(screen.getByText('11 个文件')).toBeVisible()
    expect(screen.getByText('4 KB')).toBeVisible()
    expect(screen.getByText(preview.bundleChecksum)).toBeVisible()
    expect(business.prepareRestore).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '恢复此备份' }))
    expect(
      screen.getByRole('dialog', { name: '确认恢复数据' })
    ).toBeVisible()
  })

  it('requires confirmation, stages restore, and restarts explicitly', async () => {
    const business = createBusiness()
    renderSettings(business)
    await screen.findByText('尚无备份记录')
    fireEvent.click(screen.getByRole('button', { name: '选择备份并检查' }))
    await screen.findByText('3 个空间')
    fireEvent.click(screen.getByRole('button', { name: '恢复此备份' }))

    const dialog = screen.getByRole('dialog', { name: '确认恢复数据' })
    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--compact')
    expect(dialog.querySelector('.ui-dialog__body')).toBeInTheDocument()
    expect(within(dialog).getByText(/替换当前业务数据/)).toBeVisible()
    const confirm = within(dialog).getByRole('button', { name: '确认恢复' })
    expect(confirm).toHaveClass('ui-button', 'ui-button--danger')
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(business.prepareRestore).toHaveBeenCalledWith({
        requestId: expect.any(String),
        previewId: preview.previewId,
        expectedChecksum: preview.bundleChecksum
      })
    )
    expect(await screen.findByText('恢复已准备，需要重启')).toBeVisible()
    expect(business.restartForRestore).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '重启并恢复' }))
    await waitFor(() =>
      expect(business.restartForRestore).toHaveBeenCalledOnce()
    )
  })

  it('keeps restore selection cancellation as a no-op', async () => {
    const business = createBusiness()
    vi.mocked(business.chooseRestoreBundle).mockResolvedValue(null)
    renderSettings(business)
    await screen.findByText('尚无备份记录')

    fireEvent.click(screen.getByRole('button', { name: '选择备份并检查' }))

    await waitFor(() =>
      expect(business.chooseRestoreBundle).toHaveBeenCalledOnce()
    )
    expect(screen.queryByText('恢复此备份')).not.toBeInTheDocument()
  })

  it('keeps backup status load failures inline', async () => {
    const business = createBusiness()
    vi.mocked(business.getBackupStatus).mockRejectedValue({
      code: 'storage_unavailable'
    })

    renderSettings(business)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('本地存储当前不可用，请重试')
    expect(alert).toHaveClass(
      'ui-inline-alert',
      'ui-inline-alert--danger',
      'backup-error'
    )
    expect(document.querySelector('.toast-message')).toBeNull()
  })

  it.each<[BackupErrorCode, string]>([
    ['destination_conflict', '目标位置已存在备份，请选择其他位置'],
    ['source_changed', '备份期间源数据发生变化，请重新创建备份'],
    ['bundle_corrupt', '备份包已损坏或不完整'],
    ['unsafe_bundle', '备份包包含不安全的文件结构'],
    ['schema_too_new', '备份来自更新版本，当前版本无法恢复'],
    ['root_unavailable', '备份记录的原工作文件夹不可用或不可写'],
    ['bundle_changed', '备份包在检查后发生变化，请重新选择'],
    ['storage_unavailable', '本地存储当前不可用，请重试'],
    ['restore_failed', '恢复失败，原有数据已保留']
  ])('localizes the stable %s error', async (code, message) => {
    const business = createBusiness()
    vi.mocked(business.chooseBackupDestination).mockRejectedValue({ code })
    renderSettings(business)
    await screen.findByText('尚无备份记录')

    fireEvent.click(screen.getByRole('button', { name: '创建备份' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(alert).toHaveClass('toast-message')
    expect(document.querySelector('.backup-error')).toBeNull()
  })

  it('extracts a stable code from an Electron invoke error message', async () => {
    const business = createBusiness()
    vi.mocked(business.chooseRestoreBundle).mockRejectedValue(
      new Error(
        "Error invoking remote method 'restore:choose-bundle': Error: bundle_corrupt"
      )
    )
    renderSettings(business)
    await screen.findByText('尚无备份记录')

    fireEvent.click(screen.getByRole('button', { name: '选择备份并检查' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      '备份包已损坏或不完整'
    )
    expect(alert).toHaveClass('toast-message')
    expect(screen.queryByText(/restore:choose-bundle/)).not.toBeInTheDocument()
    expect(document.querySelector('.backup-error')).toBeNull()
  })

  it('uses stable English and Japanese labels', async () => {
    const english = createBusiness()
    const { unmount } = renderSettings(english, 'en')
    expect(await screen.findByText('No backup recorded')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Create backup' })
    ).toBeVisible()
    unmount()

    const japanese = createBusiness()
    renderSettings(japanese, 'ja')
    expect(await screen.findByText('バックアップ履歴はありません')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'バックアップを作成' })
    ).toBeVisible()
  })
})
