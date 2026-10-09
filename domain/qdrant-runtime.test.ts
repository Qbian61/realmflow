import {
  QDRANT_RELEASE_ASSETS,
  QDRANT_VERSION,
  resolveQdrantReleaseAsset
} from './qdrant-runtime'

describe('Qdrant runtime assets', () => {
  it('pins Qdrant v1.19.1 and its supported release assets', () => {
    expect(QDRANT_VERSION).toBe('1.19.1')
    expect(QDRANT_RELEASE_ASSETS).toEqual([
      {
        platform: 'darwin',
        arch: 'arm64',
        fileName: 'qdrant-aarch64-apple-darwin.tar.gz',
        sha256:
          'e060209dfefc9d977ddcec48521349f505f8fd1ce21f2a3db444140870522fe4'
      },
      {
        platform: 'darwin',
        arch: 'x64',
        fileName: 'qdrant-x86_64-apple-darwin.tar.gz',
        sha256:
          'ba7cbada9a90aefdbd7f92de4e093cd25328206bd65e9e96657bd6133d272637'
      },
      {
        platform: 'win32',
        arch: 'x64',
        fileName: 'qdrant-x86_64-pc-windows-msvc.zip',
        sha256:
          '9b6f69bd85f6abed4bc13f943099f55c6ffd55f5dd90388635320d8fbb569eb0'
      },
      {
        platform: 'linux',
        arch: 'x64',
        fileName: 'qdrant-x86_64-unknown-linux-gnu.tar.gz',
        sha256:
          'eef986e769d4d3e806dd2d546e1b4ecdd416211e54d34b4ed764fac7c58e1085'
      },
      {
        platform: 'linux',
        arch: 'arm64',
        fileName: 'qdrant-aarch64-unknown-linux-musl.tar.gz',
        sha256:
          '0e607c11705fab22f7d667f4749bc0b6b60a8fa9e91de71880a6ebafbbda1b26'
      }
    ])
    expect(QDRANT_RELEASE_ASSETS).toSatisfy((assets) =>
      assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256))
    )
  })

  it.each(QDRANT_RELEASE_ASSETS)(
    'resolves $platform/$arch to $fileName',
    (expected) => {
      expect(resolveQdrantReleaseAsset(expected.platform, expected.arch)).toBe(
        expected
      )
    }
  )

  it.each([
    ['darwin', 'ia32'],
    ['win32', 'arm64'],
    ['linux', 's390x'],
    ['freebsd', 'x64']
  ])('rejects unsupported target %s/%s', (platform, arch) => {
    expect(() => resolveQdrantReleaseAsset(platform, arch)).toThrow(
      `Unsupported Qdrant runtime target: ${platform}/${arch}`
    )
  })
})
