import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Qdrant and knowledge security architecture', () => {
  it('routes every workspace query, scroll, and filter-delete through the tenant builder', () => {
    const requestModules = [
      'electron/src/qdrant/qdrant-search-adapter.ts',
      'electron/src/qdrant/qdrant-index-adapter.ts'
    ]
    const violations = requestModules.filter((file) => {
      const source = readFileSync(resolve(file), 'utf8')
      return (
        /points\/(?:query|scroll|delete)/.test(source) &&
        !source.includes('buildWorkspaceTenantFilter(')
      )
    })

    expect(violations).toEqual([])
  })

  it('keeps offline knowledge inference modules free of network clients', () => {
    const modules = [
      'python-service/app/services/knowledge_chunking.py',
      'python-service/app/services/local_embeddings.py',
      'python-service/app/services/code_chunking.py'
    ]
    const forbidden =
      /\b(?:requests|httpx|urllib|aiohttp|socket|websocket)\b|https?:\/\//
    const violations = modules.filter((file) =>
      forbidden.test(readFileSync(resolve(file), 'utf8'))
    )

    expect(violations).toEqual([])
  })
})
