export const QDRANT_VERSION = '1.19.1' as const

export type QdrantRuntimePlatform = 'darwin' | 'win32' | 'linux'
export type QdrantRuntimeArchitecture = 'arm64' | 'x64'

export type QdrantReleaseAsset = Readonly<{
  platform: QdrantRuntimePlatform
  arch: QdrantRuntimeArchitecture
  fileName: string
  sha256: string
}>

export const QDRANT_RELEASE_ASSETS = [
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
] as const satisfies readonly QdrantReleaseAsset[]

export function resolveQdrantReleaseAsset(
  platform: string,
  arch: string
): (typeof QDRANT_RELEASE_ASSETS)[number] {
  const asset = QDRANT_RELEASE_ASSETS.find(
    (candidate) =>
      candidate.platform === platform && candidate.arch === arch
  )
  if (!asset) {
    throw new Error(`Unsupported Qdrant runtime target: ${platform}/${arch}`)
  }
  return asset
}
