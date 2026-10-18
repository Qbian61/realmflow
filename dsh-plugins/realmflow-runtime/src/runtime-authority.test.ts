import { describe, expect, it } from 'vitest'
import { createDshRunManifest } from './test-manifest-fixture'
import {
  DshRuntimeAuthorityDeniedError,
  buildDshRuntimeAuthority,
  type DshRuntimeAuthorityDeniedEvent
} from './runtime-authority'

describe('DshRuntimeAuthority', () => {
  it('allows only manifest-declared capabilities, scopes, credentials, and destinations', () => {
    const manifest = createDshRunManifest()
    const authority = buildDshRuntimeAuthority(manifest)

    expect(
      authority.requireModel({
        providerId: 'provider-local',
        profileId: 'profile-local',
        modelId: 'local-model'
      })
    ).toBe(manifest.model)
    expect(
      authority.requireTool({
        id: 'builtin.files.read',
        version: '1.0.0',
        definitionDigest: 'a'.repeat(64)
      })
    ).toBe(manifest.tools[0])
    expect(
      authority.requireSkill({
        id: 'builtin.skills.summarize',
        version: '1.0.0',
        definitionDigest: 'c'.repeat(64)
      })
    ).toBe(manifest.skills[0])
    expect(authority.requireAgent({ id: 'builtin.general' })).toBe(
      manifest.agents[0]
    )
    expect(authority.requireMcpServer({ id: 'mcp.docs' })).toBe(
      manifest.mcpServers[0]
    )
    expect(authority.requireConnector({ id: 'connector-docs' })).toBe(
      manifest.connectors[0]
    )
    expect(
      authority.requireProductCommand({
        command: 'realmflow.requirements.get',
        grantId: 'grant-requirements-get'
      })
    ).toBe(manifest.productCommands[0])
    expect(
      authority.requireCredential({
        ref: 'credential-openai',
        purpose: 'model'
      })
    ).toBe(manifest.credentialReferences[0])
    expect(
      authority.requireScope({
        kind: 'workspace',
        workspaceId: 'workspace-1'
      })
    ).toEqual({
      kind: 'workspace',
      workspaceId: 'workspace-1'
    })
    expect(
      authority.requireFilesystemPath({
        path: '/workspace/brief.md',
        access: 'read'
      })
    ).toMatchObject({ rootId: 'root-1' })
    expect(
      authority.requireFilesystemPath({
        path: '/workspace/out.md',
        access: 'write'
      })
    ).toMatchObject({ rootId: 'root-1' })
    expect(
      authority.requireNetworkDestination('https://api.example.com/v1/docs')
    ).toEqual({
      kind: 'connector',
      id: 'connector-docs',
      baseUrl: 'https://api.example.com'
    })
    expect(
      authority.requireNetworkDestination('https://mcp.example.com/rpc')
    ).toEqual({
      kind: 'mcp-server',
      id: 'mcp.docs',
      baseUrl: 'https://mcp.example.com'
    })

    expect(() =>
      authority.requireTool({ id: 'builtin.files.write' })
    ).toThrow(DshRuntimeAuthorityDeniedError)
    expect(() =>
      authority.requireProductCommand({
        command: 'realmflow.requirements.update'
      })
    ).toThrow(/product command.*not declared/i)
    expect(() =>
      authority.requireCredential({
        ref: 'credential-openai',
        purpose: 'connector'
      })
    ).toThrow(/credential.*not declared/i)
    expect(() =>
      authority.requireScope({
        kind: 'workspace',
        workspaceId: 'workspace-2'
      })
    ).toThrow(/scope.*not declared/i)
    expect(() =>
      authority.requireFilesystemPath({
        path: '/outside/out.md',
        access: 'read'
      })
    ).toThrow(/outside declared roots/i)
    expect(() =>
      authority.requireNetworkDestination('https://evil.example.com')
    ).toThrow(/network destination.*not declared/i)
  })

  it('records a denial event for every rejected capability attempt', () => {
    const manifest = createDshRunManifest()
    const deniedEvents: DshRuntimeAuthorityDeniedEvent[] = []
    const authority = buildDshRuntimeAuthority(manifest, {
      now: () => 1_800,
      onDenied: (event) => deniedEvents.push(event)
    })

    expect(() =>
      authority.requireTool({
        id: 'builtin.files.read',
        version: '2.0.0'
      })
    ).toThrow(DshRuntimeAuthorityDeniedError)
    expect(() =>
      authority.requireNetworkDestination('https://evil.example.com')
    ).toThrow(DshRuntimeAuthorityDeniedError)

    expect(deniedEvents).toEqual([
      {
        kind: 'runtime-authority-denied',
        at: 1_800,
        manifestDigest: manifest.digest,
        runId: manifest.runId,
        sessionId: manifest.sessionId,
        capabilityKind: 'tool',
        capabilityId: 'builtin.files.read',
        reason: 'tool version is not declared'
      },
      {
        kind: 'runtime-authority-denied',
        at: 1_800,
        manifestDigest: manifest.digest,
        runId: manifest.runId,
        sessionId: manifest.sessionId,
        capabilityKind: 'network',
        capabilityId: 'https://evil.example.com',
        reason: 'network destination is not declared'
      }
    ])
  })
})
