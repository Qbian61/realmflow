import { open } from 'node:fs/promises'
import {
  classifyLocalFileCapability,
  type LocalFileCapability
} from '../../../../domain/local-file-capability'

const MAX_SIGNATURE_BYTES = 8 * 1024

export async function inspectLocalFileCapability(input: {
  path: string
  fileName: string
  mimeType?: string
}): Promise<LocalFileCapability> {
  const file = await open(input.path, 'r')
  try {
    const buffer = Buffer.alloc(MAX_SIGNATURE_BYTES)
    const { bytesRead } = await file.read(buffer, 0, buffer.byteLength, 0)
    return classifyLocalFileCapability({
      fileName: input.fileName,
      mimeType: input.mimeType,
      head: buffer.subarray(0, bytesRead)
    })
  } finally {
    await file.close()
  }
}
