import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BuiltinCatalogLoader } from './builtin-catalog-loader'

describe('BuiltinCatalogLoader', () => {
  it('validates and loads the generated builtin catalog', async () => {
    const loader = new BuiltinCatalogLoader(
      join(process.cwd(), 'resources', 'extensions', 'builtin')
    )

    const packages = await loader.load()

    expect(packages).toHaveLength(16)
    expect(packages.flatMap(({ tools }) => tools)).toHaveLength(118)
    expect(packages.flatMap(({ skills }) => skills)).toHaveLength(10)
    expect(
      packages.flatMap(({ tools }) => tools).every(
        ({ origin, definitionDigest, package: reference }) =>
          origin === 'builtin' &&
          /^[a-f0-9]{64}$/.test(definitionDigest) &&
          /^[a-f0-9]{64}$/.test(reference.packageDigest)
      )
    ).toBe(true)
    expect(
      packages.flatMap(({ skills }) => skills).every(
        ({ origin }) => origin === 'builtin'
      )
    ).toBe(true)
  })
})
