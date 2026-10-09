import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LOCALE_PREFERENCE_KEY } from './locale-preference'
import {
  LocalizationProvider,
  useLocalization
} from './LocalizationProvider'

function Probe(): JSX.Element {
  const { locale, setLocale, t } = useLocalization()
  return (
    <>
      <output aria-label="locale">{locale}</output>
      <span>{t('settings.title')}</span>
      <button type="button" onClick={() => setLocale('en')}>
        English
      </button>
      <button type="button" onClick={() => setLocale('ja')}>
        日本語
      </button>
      <button type="button" onClick={() => setLocale('zh-CN')}>
        简体中文
      </button>
    </>
  )
}

describe('LocalizationProvider', () => {
  it('renders the persisted locale on the first commit', () => {
    window.localStorage.setItem(
      LOCALE_PREFERENCE_KEY,
      JSON.stringify({ version: 1, locale: 'en' })
    )

    render(
      <LocalizationProvider>
        <Probe />
      </LocalizationProvider>
    )

    expect(screen.getByText('Settings')).toBeVisible()
    expect(screen.getByLabelText('locale')).toHaveTextContent('en')
    expect(document.documentElement).toHaveAttribute('lang', 'en')
  })

  it('persists a supported locale before updating mounted consumers', () => {
    render(
      <LocalizationProvider>
        <Probe />
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '日本語' }))

    expect(screen.getByText('設定')).toBeVisible()
    expect(screen.getByLabelText('locale')).toHaveTextContent('ja')
    expect(document.documentElement).toHaveAttribute('lang', 'ja')
    expect(
      JSON.parse(
        window.localStorage.getItem(LOCALE_PREFERENCE_KEY) ?? 'null'
      )
    ).toEqual({ version: 1, locale: 'ja' })
  })

  it('does not write when the active locale is selected again', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    render(
      <LocalizationProvider>
        <Probe />
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: '简体中文' }))

    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('keeps the current locale when storage rejects the write', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })
    render(
      <LocalizationProvider>
        <Probe />
      </LocalizationProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'English' }))

    expect(screen.getByText('设置')).toBeVisible()
    expect(screen.getByLabelText('locale')).toHaveTextContent('zh-CN')
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN')
    setItem.mockRestore()
  })
})
