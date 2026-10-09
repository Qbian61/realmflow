import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('unused CSS report', () => {
  it('provides a repository CSS usage analyzer', async () => {
    expect(
      existsSync(resolve(process.cwd(), 'scripts/report-unused-css.mjs'))
    ).toBe(true)

    const module = await import('./report-unused-css.mjs')

    expect(module.analyzeCssUsage).toBeTypeOf('function')
    expect(module.analyzeRepositoryCssUsage).toBeTypeOf('function')
    expect(module.CSS_USAGE_ALLOWLIST).toBeInstanceOf(Array)
    expect(module.GOVERNED_UNUSED_CLASS_PATTERNS).toBeInstanceOf(Array)
  })

  it('finds grouped unused selectors without treating comments as CSS', async () => {
    const { analyzeCssUsage } = await import('./report-unused-css.mjs')
    const report = analyzeCssUsage({
      styles: [
        {
          path: 'fixture.css',
          content: `
            /* .comment-only {} */
            .used, .active-schedule-card:hover { color: red; }
            .react-flow__pane { cursor: grab; }
            .status-failed { color: red; }
          `
        }
      ],
      sources: [
        {
          path: 'fixture.tsx',
          content: 'const className = "used status-failed"'
        }
      ]
    })

    expect(report.classes.map(({ name }) => name)).toEqual([
      'active-schedule-card',
      'react-flow__pane',
      'status-failed',
      'used'
    ])
    expect(report.unused.map(({ name, classification }) => ({
      name,
      classification
    }))).toEqual([
      { name: 'active-schedule-card', classification: 'governed' },
      { name: 'react-flow__pane', classification: 'allowlisted' }
    ])
    expect(report.violations.map(({ name }) => name)).toEqual([
      'active-schedule-card'
    ])
  })

  it('documents every dynamic selector exception', async () => {
    const { CSS_USAGE_ALLOWLIST } = await import('./report-unused-css.mjs')

    expect(CSS_USAGE_ALLOWLIST.length).toBeGreaterThan(0)
    for (const entry of CSS_USAGE_ALLOWLIST) {
      expect(entry.owner).toEqual(expect.any(String))
      expect(entry.reason).toEqual(expect.any(String))
      expect(entry.removalCondition).toEqual(expect.any(String))
      expect(entry.owner.length).toBeGreaterThan(0)
      expect(entry.reason.length).toBeGreaterThan(0)
      expect(entry.removalCondition.length).toBeGreaterThan(0)
    }
  })

  it('formats review and allowlisted selectors for manual audits', async () => {
    const { formatCssUsageReport } = await import('./report-unused-css.mjs')
    const output = formatCssUsageReport(
      {
        classes: [{ name: 'used', paths: ['fixture.css'] }],
        unused: [
          {
            name: 'review-me',
            paths: ['fixture.css'],
            classification: 'review'
          },
          {
            name: 'react-flow__pane',
            paths: ['fixture.css'],
            classification: 'allowlisted'
          }
        ],
        violations: []
      },
      { details: true }
    )

    expect(output).toContain('Review-only selectors:\n- .review-me')
    expect(output).toContain('Allowlisted selectors:\n- .react-flow__pane')
  })

  it('runs the governed CSS usage check during production builds', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
    )

    expect(packageJson.scripts['verify:css-usage']).toBe(
      'node scripts/report-unused-css.mjs --check'
    )
    expect(packageJson.scripts.build).toContain('npm run verify:css-usage')
  })

  it('has no governed unused selectors in the repository', async () => {
    const { analyzeRepositoryCssUsage } = await import(
      './report-unused-css.mjs'
    )
    const report = analyzeRepositoryCssUsage(process.cwd())

    expect(
      report.violations.map(({ name, paths }) => ({ name, paths }))
    ).toEqual([])
    expect(
      readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    ).toContain('.workflow-template-error')
  })
})
