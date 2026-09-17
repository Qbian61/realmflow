import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from 'node:crypto'
import { chmod, readFile, writeFile } from 'node:fs/promises'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const NONCE_BYTES = 12

export type EncryptedCredential = {
  encryptedValue: Uint8Array
  nonce: Uint8Array
  authTag: Uint8Array
  keyVersion: number
}

export class CredentialVault {
  private constructor(private readonly key: Buffer) {}

  static async open(keyPath: string): Promise<CredentialVault> {
    let key: Buffer
    try {
      key = await readFile(keyPath)
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
      const generated = randomBytes(KEY_BYTES)
      try {
        await writeFile(keyPath, generated, { flag: 'wx', mode: 0o600 })
        key = generated
      } catch (writeError) {
        if (!isNodeError(writeError) || writeError.code !== 'EEXIST') {
          throw writeError
        }
        key = await readFile(keyPath)
      }
    }
    if (key.byteLength !== KEY_BYTES) {
      throw new Error('Invalid model credential encryption key')
    }
    await chmod(keyPath, 0o600)
    return new CredentialVault(key)
  }

  encrypt(value: string): EncryptedCredential {
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.key, nonce)
    const encryptedValue = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final()
    ])
    return {
      encryptedValue,
      nonce,
      authTag: cipher.getAuthTag(),
      keyVersion: 1
    }
  }

  decrypt(credential: EncryptedCredential): string {
    const decipher = createDecipheriv(
      ALGORITHM,
      this.key,
      credential.nonce
    )
    decipher.setAuthTag(credential.authTag)
    return Buffer.concat([
      decipher.update(credential.encryptedValue),
      decipher.final()
    ]).toString('utf8')
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
