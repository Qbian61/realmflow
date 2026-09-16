import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const CONTENT_SECURITY_POLICY = [
  "default-src 'self' data: blob:",
  "script-src 'none'",
  "connect-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:"
].join('; ')

const MIME_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

type ArtifactPathResolver = {
  resolvePreviewPath: (
    requirementId: string,
    path: string
  ) => Promise<string>
}

type ArtifactRequest = {
  url: string
}

export function parseArtifactUrl(urlValue: string): {
  requirementId: string
  path: string
} {
  const url = new URL(urlValue)
  if (url.protocol !== 'realmflow-artifact:' || url.hostname !== 'preview') {
    throw new Error('Artifact URL is invalid')
  }
  const segments = url.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
  const [requirementId, ...pathSegments] = segments
  if (!requirementId || pathSegments.length === 0) {
    throw new Error('Artifact URL is invalid')
  }
  return {
    requirementId,
    path: pathSegments.join('/')
  }
}

export function createArtifactProtocolHandler(
  resolver: ArtifactPathResolver
): (request: ArtifactRequest) => Promise<Response> {
  return async (request) => {
    try {
      const { requirementId, path } = parseArtifactUrl(request.url)
      const absolutePath = await resolver.resolvePreviewPath(requirementId, path)
      const content = await readFile(absolutePath)
      const contentType =
        MIME_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream'
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
      if (contentType.startsWith('text/html')) {
        headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY
      }
      return new Response(new Uint8Array(content), { status: 200, headers })
    } catch {
      return new Response('Artifact not found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }
  }
}
