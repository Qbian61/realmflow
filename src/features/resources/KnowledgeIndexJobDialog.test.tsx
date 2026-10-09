import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { KnowledgeIndexViewDto } from '../../../shared/business'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { KnowledgeIndexJobDialog } from './KnowledgeIndexJobDialog'

const source: KnowledgeIndexViewDto['source'] = {
  id: 'repository-1',
  workspaceId: 'space-1',
  name: 'developers-server',
  type: 'repository',
  locator: 'local-repository:repository-1',
  detail: '本地仓库',
  sortOrder: 0,
  status: 'indexed',
  revision: 2,
  createdAt: 1,
  updatedAt: 2
}

describe('KnowledgeIndexJobDialog', () => {
  it('shows status, trigger, times, and a failed job reason', () => {
    render(
      <LocalizationProvider>
        <KnowledgeIndexJobDialog
          name="developers-server"
          view={{
            source,
            health: 'failed',
            job: {
              id: 'job-1',
              status: 'failed',
              triggerSource: 'manual',
              createdAt: Date.UTC(2026, 9, 2, 1, 2),
              updatedAt: Date.UTC(2026, 9, 2, 1, 3),
              completedAt: Date.UTC(2026, 9, 2, 1, 3),
              errorCode: 'qdrant_timeout'
            }
          }}
          loading={false}
          onClose={vi.fn()}
        />
      </LocalizationProvider>
    )

    const dialog = screen.getByRole('dialog', {
      name: 'developers-server 的最近索引任务'
    })
    expect(dialog).toBeVisible()
    expect(dialog).toHaveClass('ui-dialog', 'ui-dialog--default')
    expect(dialog.querySelector('.ui-dialog__body')).toBeInTheDocument()
    expect(screen.getByText('失败')).toBeVisible()
    expect(screen.getByText('手动触发')).toBeVisible()
    expect(screen.getByText('本地向量数据库响应超时')).toBeVisible()
    expect(screen.getByText('创建时间')).toBeVisible()
    expect(screen.getByText('完成时间')).toBeVisible()
  })

  it('shows empty and query failure states and can be closed', () => {
    const onClose = vi.fn()
    const onRetry = vi.fn()
    const { rerender } = render(
      <LocalizationProvider>
        <KnowledgeIndexJobDialog
          name="developers-server"
          loading={false}
          onClose={onClose}
        />
      </LocalizationProvider>
    )

    expect(screen.getByText('暂无索引任务')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledOnce()

    rerender(
      <LocalizationProvider>
        <KnowledgeIndexJobDialog
          name="developers-server"
          loading={false}
          error
          onRetry={onRetry}
          onClose={onClose}
        />
      </LocalizationProvider>
    )
    expect(screen.getByRole('alert')).toHaveClass(
      'ui-inline-alert',
      'ui-inline-alert--danger'
    )
    expect(screen.getByRole('alert')).toHaveTextContent('无法读取最近索引任务')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
