import { createCipheriv, randomBytes } from 'node:crypto'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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

  it('creates and repairs a versioned keyring file with mode 0600', async () => {
    const vault = await CredentialVault.open(keyPath)
    await chmod(keyPath, 0o644)

    await CredentialVault.open(keyPath)

    expect((await stat(keyPath)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await readFile(keyPath, 'utf8'))).toMatchObject({
      formatVersion: 1,
      activeKeyVersion: 1,
      keys: [{ version: 1 }],
      preparedRotations: []
    })
    expect(vault.activeKeyVersion).toBe(1)
  })

  it('atomically upgrades a raw C01 key and decrypts its existing ciphertext', async () => {
    const key = randomBytes(32)
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    const encryptedValue = Buffer.concat([
      cipher.update('existing-secret', 'utf8'),
      cipher.final()
    ])
    const authTag = cipher.getAuthTag()
    await writeFile(keyPath, key, { mode: 0o600 })

    const vault = await CredentialVault.open(keyPath)

    expect(
      vault.decrypt({ encryptedValue, nonce, authTag, keyVersion: 1 })
    ).toBe('existing-secret')
    expect(JSON.parse(await readFile(keyPath, 'utf8'))).toMatchObject({
      formatVersion: 1,
      activeKeyVersion: 1,
      keys: [{ version: 1 }],
      preparedRotations: []
    })
  })

  it('prepares one new key version per request and retains old decryptability', async () => {
    const vault = await CredentialVault.open(keyPath)
    const oldCredential = vault.encrypt('old-secret')

    await expect(vault.prepareRotation('rotation-1')).resolves.toEqual({
      fromKeyVersion: 1,
      toKeyVersion: 2
    })
    await expect(vault.prepareRotation('rotation-1')).resolves.toEqual({
      fromKeyVersion: 1,
      toKeyVersion: 2
    })
    const newCredential = vault.encrypt('new-secret')

    expect(vault.activeKeyVersion).toBe(2)
    expect(newCredential.keyVersion).toBe(2)
    expect(vault.decrypt(oldCredential)).toBe('old-secret')
    expect(vault.decrypt(newCredential)).toBe('new-secret')

    const reopened = await CredentialVault.open(keyPath)
    await expect(reopened.prepareRotation('rotation-1')).resolves.toEqual({
      fromKeyVersion: 1,
      toKeyVersion: 2
    })
    expect(reopened.decrypt(oldCredential)).toBe('old-secret')
    expect(reopened.decrypt(newCredential)).toBe('new-secret')
  })

  it('rejects malformed keyrings and unknown credential key versions safely', async () => {
    await writeFile(keyPath, '{"formatVersion":1,"keys":[]}', { mode: 0o600 })

    await expect(CredentialVault.open(keyPath)).rejects.toThrow(
      'Invalid credential keyring'
    )

    await rm(keyPath)
    const vault = await CredentialVault.open(keyPath)
    expect(() =>
      vault.decrypt({
        encryptedValue: new Uint8Array(),
        nonce: new Uint8Array(12),
        authTag: new Uint8Array(16),
        keyVersion: 99
      })
    ).toThrow('Credential key is unavailable')
  })

  it('refuses to create a replacement keyring when creation is disabled', async () => {
    await expect(
      CredentialVault.open(keyPath, { allowCreate: false })
    ).rejects.toThrow('Credential key is unavailable')
    await expect(stat(keyPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('keeps the persisted and active key version when atomic publishing fails', async () => {
    await CredentialVault.open(keyPath)
    const before = await readFile(keyPath, 'utf8')
    const vault = await CredentialVault.open(keyPath, {
      writeKeyring: async () => {
        throw new Error('disk full')
      }
    })

    await expect(vault.prepareRotation('failed-rotation')).rejects.toThrow(
      'Unable to update credential key file'
    )
    expect(vault.activeKeyVersion).toBe(1)
    expect(await readFile(keyPath, 'utf8')).toBe(before)
  })
})
