import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalizationProvider } from '../../localization/LocalizationProvider'
import { ToastProvider, useToast } from './ToastProvider'
import type { ToastLevel } from './toast-types'

const levels: ToastLevel[] = [
  'success',
  'info',
  'warning',
  'error',
  'system'
]
const persistenceMessage =
  '当前更改暂时无法保存，请检查本地存储权限或可用空间。'

function ToastHarness(): JSX.Element {
  const toast = useToast()
  return (
    <div>
      {levels.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() =>
            toast[level]('app.persistenceUnavailable', {
              dedupeKey: `level-${level}`
            })
          }
        >
          {level}
        </button>
      ))}
      <button
        type="button"
        onClick={() => toast.error('settings.provider.saveFailed')}
      >
        short error
      </button>
    </div>
  )
}

function renderHarness(): void {
  render(
    <LocalizationProvider>
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>
    </LocalizationProvider>
  )
}

describe('ToastProvider', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a distinct Lucide icon for every toast level', () => {
    renderHarness()

    for (const level of levels) {
      fireEvent.click(screen.getByRole('button', { name: level }))
      expect(
        document.querySelector(`[data-toast-icon="${level}"]`)
      ).toBeInTheDocument()
    }
  })

  it('dismisses a message from its close button', () => {
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'warning' }))

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(screen.queryByText(persistenceMessage)).not.toBeInTheDocument()
  })

  it('adds actionable recovery guidance to error messages', () => {
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'short error' }))

    expect(screen.getByText('供应商保存失败')).toBeVisible()
    expect(
      screen.getByText(
        '本次操作未完成，已确认的数据保持不变。请检查相关配置后重试。'
      )
    ).toBeVisible()
  })

  it('starts the next timeout only after the queue head is removed', () => {
    vi.useFakeTimers()
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'warning' }))
    fireEvent.click(screen.getByRole('button', { name: 'error' }))

    expect(screen.getAllByText(persistenceMessage)).toHaveLength(2)

    act(() => vi.advanceTimersByTime(2_999))
    expect(screen.getAllByText(persistenceMessage)).toHaveLength(2)

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getAllByText(persistenceMessage)).toHaveLength(1)

    act(() => vi.advanceTimersByTime(2_999))
    expect(screen.getAllByText(persistenceMessage)).toHaveLength(1)

    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText(persistenceMessage)).not.toBeInTheDocument()
  })

  it('pauses the head timeout while hovered', () => {
    vi.useFakeTimers()
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'warning' }))
    const message = screen.getByText(persistenceMessage)
    const toastItem = message.closest('[data-toast-level]')
    expect(toastItem).not.toBeNull()

    fireEvent.mouseEnter(toastItem!)
    act(() => vi.advanceTimersByTime(6_000))
    expect(message).toBeInTheDocument()
  })

  it('restarts a full timeout when the pointer leaves the head', () => {
    vi.useFakeTimers()
    renderHarness()
    fireEvent.click(screen.getByRole('button', { name: 'warning' }))
    const message = screen.getByText(persistenceMessage)
    const toastItem = message.closest('[data-toast-level]')
    expect(toastItem).not.toBeNull()

    act(() => vi.advanceTimersByTime(2_000))
    fireEvent.mouseEnter(toastItem!)
    act(() => vi.advanceTimersByTime(4_000))
    fireEvent.mouseLeave(toastItem!)
    act(() => vi.advanceTimersByTime(2_999))
    expect(message).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(message).not.toBeInTheDocument()
  })
})
