import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(
  resolve(process.cwd(), 'src/features/toast/toast.css'),
  'utf8'
)

describe('toast styles', () => {
  it('anchors a stable responsive queue in the upper-right corner', () => {
    const viewport =
      styles.match(/\.toast-viewport\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(viewport).toContain('position: fixed;')
    expect(viewport).toContain('top: 56px;')
    expect(viewport).toContain('right: 16px;')
    expect(viewport).toContain('gap: 8px;')
    expect(viewport).toContain('width: min(360px, calc(100vw - 32px));')
  })

  it('keeps toast content compact and prevents text overflow', () => {
    const message =
      styles.match(/\.toast-message\s*\{([^}]*)\}/)?.[1] ?? ''
    const text =
      styles.match(/\.toast-message__text\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(message).toContain('border-radius: 6px;')
    expect(message).toContain(
      'grid-template-columns: 20px minmax(0, 1fr) 28px;'
    )
    expect(text).toContain('overflow-wrap: anywhere;')
  })

  it('narrows the queue beside centered dialogs on compact desktop windows', () => {
    expect(styles).toMatch(
      /@media \(min-width: 641px\) and \(max-width: 1000px\)\s*\{[\s\S]*?\.toast-viewport\s*\{[^}]*width: min\(232px, calc\(100vw - 24px\)\);/
    )
  })

  it('removes toast motion when reduced motion is requested', () => {
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.toast-message\s*\{[^}]*animation: none;/
    )
  })
})
