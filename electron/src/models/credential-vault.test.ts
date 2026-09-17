import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CredentialVault } from './credential-vault'

let directory: string
let keyPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'realmflow-credential-vault-'))
  keyPath = join(directory, 'model-credentials.key')
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

describe('CredentialVault', () => {
  it('encrypts and decrypts credentials without retaining plaintext', async () => {
    const vault = await CredentialVault.open(keyPath)

    const encrypted = vault.encrypt('sk-sensitive-value')

    expect(Buffer.from(encrypted.encryptedValue).toString('utf8')).not.toContain(
      'sk-sensitive-value'
    )
    expect(vault.decrypt(encrypted)).toBe('sk-sensitive-value')
  })

  it('rejects an encrypted credential when its authentication tag is changed', async () => {
    const vault = await CredentialVault.open(keyPath)
    const encrypted = vault.encrypt('sk-sensitive-value')
    encrypted.authTag[0] ^= 0xff

    expect(() => vault.decrypt(encrypted)).toThrow()
  })

  it('creates and repairs the encryption key file with mode 0600', async () => {
    await CredentialVault.open(keyPath)
    await chmod(keyPath, 0o644)

    await CredentialVault.open(keyPath)

    expect((await stat(keyPath)).mode & 0o777).toBe(0o600)
    expect((await readFile(keyPath)).byteLength).toBe(32)
  })
})
