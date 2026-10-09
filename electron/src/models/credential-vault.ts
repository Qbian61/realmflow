import {
  createCipheriv,
  createDecipheriv,
  randomBytes
} from 'node:crypto'
import {
  chmod,
  open as openFile,
  readFile,
  rename,
  rm
} from 'node:fs/promises'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const NONCE_BYTES = 12
const KEYRING_FORMAT_VERSION = 1

type StoredKey = {
  version: number
  value: string
}

type PreparedRotation = {
  requestId: string
  fromKeyVersion: number
  toKeyVersion: number
}

type StoredKeyring = {
  formatVersion: typeof KEYRING_FORMAT_VERSION
  activeKeyVersion: number
  keys: StoredKey[]
  preparedRotations: PreparedRotation[]
}

export type EncryptedCredential = {
  encryptedValue: Uint8Array
  nonce: Uint8Array
  authTag: Uint8Array
  keyVersion: number
}

export type PreparedCredentialRotation = {
  fromKeyVersion: number
  toKeyVersion: number
}

type CredentialVaultOptions = {
  allowCreate?: boolean
  writeKeyring?: (keyPath: string, contents: string) => Promise<void>
}

export class CredentialVault {
  private constructor(
    private readonly keyPath: string,
    private keyring: StoredKeyring,
    private readonly writeKeyring: (
      keyPath: string,
      contents: string
    ) => Promise<void>
  ) {}

  get activeKeyVersion(): number {
    return this.keyring.activeKeyVersion
  }

  static async open(
    keyPath: string,
    options: CredentialVaultOptions = {}
  ): Promise<CredentialVault> {
    const writeKeyring = options.writeKeyring ?? writeKeyringAtomically
    let contents: Buffer
    try {
      contents = await readFile(keyPath)
    } catch (error) {
      if (!isNodeError(error) || error.code !== 'ENOENT') throw error
      if (options.allowCreate === false) {
        throw new Error('Credential key is unavailable')
      }
      const keyring = createInitialKeyring()
      await persistKeyring(writeKeyring, keyPath, keyring)
      return new CredentialVault(keyPath, keyring, writeKeyring)
    }

    if (contents.byteLength === KEY_BYTES) {
      const keyring = createInitialKeyring(contents)
      await persistKeyring(writeKeyring, keyPath, keyring)
      return new CredentialVault(keyPath, keyring, writeKeyring)
    }

    const keyring = parseKeyring(contents)
    await chmod(keyPath, 0o600)
    return new CredentialVault(keyPath, keyring, writeKeyring)
  }

  async prepareRotation(requestId: string): Promise<PreparedCredentialRotation> {
    const normalizedRequestId = requestId.trim()
    if (!normalizedRequestId) {
      throw new Error('Model credential rotation request ID is required')
    }
    const existing = this.keyring.preparedRotations.find(
      (rotation) => rotation.requestId === normalizedRequestId
    )
    if (existing) {
      return {
        fromKeyVersion: existing.fromKeyVersion,
        toKeyVersion: existing.toKeyVersion
      }
    }

    const fromKeyVersion = this.keyring.activeKeyVersion
    const toKeyVersion =
      Math.max(...this.keyring.keys.map(({ version }) => version)) + 1
    const nextKeyring: StoredKeyring = {
      ...this.keyring,
      activeKeyVersion: toKeyVersion,
      keys: [
        ...this.keyring.keys,
        { version: toKeyVersion, value: randomBytes(KEY_BYTES).toString('base64') }
      ],
      preparedRotations: [
        ...this.keyring.preparedRotations,
        { requestId: normalizedRequestId, fromKeyVersion, toKeyVersion }
      ]
    }
    await persistKeyring(this.writeKeyring, this.keyPath, nextKeyring)
    this.keyring = nextKeyring
    return { fromKeyVersion, toKeyVersion }
  }

  encrypt(value: string, keyVersion = this.activeKeyVersion): EncryptedCredential {
    const key = this.getKey(keyVersion)
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv(ALGORITHM, key, nonce)
    const encryptedValue = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final()
    ])
    return {
      encryptedValue,
      nonce,
      authTag: cipher.getAuthTag(),
      keyVersion
    }
  }

  decrypt(credential: EncryptedCredential): string {
    const key = this.getKey(credential.keyVersion)
    try {
      const decipher = createDecipheriv(ALGORITHM, key, credential.nonce)
      decipher.setAuthTag(credential.authTag)
      return Buffer.concat([
        decipher.update(credential.encryptedValue),
        decipher.final()
      ]).toString('utf8')
    } catch {
      throw new Error('Credential cannot be decrypted')
    }
  }

  private getKey(version: number): Buffer {
    const stored = this.keyring.keys.find((key) => key.version === version)
    if (!stored) throw new Error('Credential key is unavailable')
    return Buffer.from(stored.value, 'base64')
  }
}

function createInitialKeyring(
  key: Uint8Array = randomBytes(KEY_BYTES)
): StoredKeyring {
  return {
    formatVersion: KEYRING_FORMAT_VERSION,
    activeKeyVersion: 1,
    keys: [{ version: 1, value: Buffer.from(key).toString('base64') }],
    preparedRotations: []
  }
}

function parseKeyring(contents: Buffer): StoredKeyring {
  try {
    const candidate = JSON.parse(contents.toString('utf8')) as StoredKeyring
    if (
      candidate.formatVersion !== KEYRING_FORMAT_VERSION ||
      !Number.isInteger(candidate.activeKeyVersion) ||
      candidate.activeKeyVersion < 1 ||
      !Array.isArray(candidate.keys) ||
      candidate.keys.length === 0 ||
      !Array.isArray(candidate.preparedRotations)
    ) {
      throw new Error()
    }
    const versions = new Set<number>()
    for (const key of candidate.keys) {
      if (
        !Number.isInteger(key.version) ||
        key.version < 1 ||
        typeof key.value !== 'string' ||
        Buffer.from(key.value, 'base64').byteLength !== KEY_BYTES ||
        versions.has(key.version)
      ) {
        throw new Error()
      }
      versions.add(key.version)
    }
    if (!versions.has(candidate.activeKeyVersion)) throw new Error()
    for (const rotation of candidate.preparedRotations) {
      if (
        typeof rotation.requestId !== 'string' ||
        !rotation.requestId ||
        !versions.has(rotation.fromKeyVersion) ||
        !versions.has(rotation.toKeyVersion)
      ) {
        throw new Error()
      }
    }
    return candidate
  } catch {
    throw new Error('Invalid credential keyring')
  }
}

async function writeKeyringAtomically(
  keyPath: string,
  contents: string
): Promise<void> {
  const temporaryPath = `${keyPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  let handle: Awaited<ReturnType<typeof openFile>> | undefined
  try {
    handle = await openFile(temporaryPath, 'wx', 0o600)
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporaryPath, keyPath)
    await chmod(keyPath, 0o600)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function persistKeyring(
  writer: (keyPath: string, contents: string) => Promise<void>,
  keyPath: string,
  keyring: StoredKeyring
): Promise<void> {
  try {
    await writer(keyPath, JSON.stringify(keyring))
  } catch {
    throw new Error('Unable to update credential key file')
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
