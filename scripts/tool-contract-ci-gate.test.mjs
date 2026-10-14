import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('tool contract CI gate', () => {
  it('keeps the verifier wired into local production builds', () => {
    const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))

    expect(packageJson.scripts['verify:tool-contracts']).toBe(
      'node scripts/verify-tool-contracts.mjs'
    )
    expect(packageJson.scripts.build).toContain('npm run verify:tool-contracts')
  })

  it('runs the production build from GitHub Actions', () => {
    const workflowsRoot = resolve('.github/workflows')
    expect(existsSync(workflowsRoot)).toBe(true)

    const workflowFiles = readdirSync(workflowsRoot)
      .filter((file) => /\.ya?ml$/i.test(file))
      .sort()
    expect(workflowFiles.length).toBeGreaterThan(0)

    const workflowSource = workflowFiles
      .map((file) => readFileSync(resolve(workflowsRoot, file), 'utf8'))
      .join('\n')

    expect(workflowSource).toContain('npm run build')
  })
})
