import type Database from 'better-sqlite3'
import {
  assertCapabilityVersionImmutable,
  createCapabilityInstallation,
  resolveInstalledCapabilities,
  type CapabilityDefinition,
  type CapabilityInstallation,
  type CapabilityScope
} from '../../../../domain/capability'

export type CapabilityReference = {
  capabilityId: string
  capabilityVersion: string
  ownerKind: 'profile' | 'conversation' | 'workflow' | 'schedule' | 'run'
  ownerId: string
  createdAt: number
}

type DefinitionRow = {
  definition_json: string
}

type InstallationRow = {
  installation_json: string
}

type ReferenceRow = {
  owner_kind: CapabilityReference['ownerKind']
  owner_id: string
}

export class SqliteCapabilityCatalogRepository {
  constructor(private readonly database: Database.Database) {}

  async publish(definition: CapabilityDefinition): Promise<void> {
    this.database.transaction(() => this.publishSync(definition))()
  }

  async install(
    value: CapabilityInstallation,
    expectedRevision?: number
  ): Promise<void> {
    const installation = createCapabilityInstallation(value)
    this.database.transaction(() =>
      this.installSync(installation, expectedRevision)
    )()
  }

  async saveInstallation(
    value: CapabilityInstallation,
    expectedRevision: number,
    eventType: string
  ): Promise<void> {
    const installation = createCapabilityInstallation(value)
    this.database.transaction(() =>
      this.installSync(installation, expectedRevision, eventType)
    )()
  }

  async getInstallation(
    installationId: string
  ): Promise<CapabilityInstallation | undefined> {
    return this.findInstallation(installationId)
  }

  async getDefinition(
    capabilityId: string,
    capabilityVersion: string
  ): Promise<CapabilityDefinition | undefined> {
    return this.findDefinition(capabilityId, capabilityVersion)
  }

  async publishAndInstall(
    definition: CapabilityDefinition,
    value: CapabilityInstallation,
    packageDigest?: string,
    onTransaction?: () => void
  ): Promise<void> {
    const installation = createCapabilityInstallation(value)
    this.database.transaction(() => {
      this.publishSync(definition)
      if (packageDigest) {
        this.bindPackageSync(definition, packageDigest)
      }
      this.installSync(installation)
      onTransaction?.()
    })()
  }

  async listReferencedPackageDigests(): Promise<ReadonlySet<string>> {
    const rows = this.database
      .prepare(
        `SELECT DISTINCT package_digest
         FROM capability_package_bindings
         ORDER BY package_digest`
      )
      .all() as Array<{ package_digest: string }>
    return new Set(rows.map((row) => row.package_digest))
  }

  async synchronizeLegacy(
    values: Array<{
      definition: CapabilityDefinition
      installation: CapabilityInstallation
    }>
  ): Promise<void> {
    this.database.transaction(() => {
      const projectedInstallationIds = new Set(
        values.map((value) => value.installation.id)
      )
      for (const value of values) {
        this.publishSync(value.definition)
        const current = this.findInstallation(value.installation.id)
        if (
          current &&
          current.capabilityVersion ===
            value.installation.capabilityVersion &&
          current.capabilityDigest ===
            value.installation.capabilityDigest &&
          current.enabled === value.installation.enabled &&
          current.status === value.installation.status
        ) {
          continue
        }
        const installation = createCapabilityInstallation(
          current
            ? {
                ...value.installation,
                revision: current.revision + 1,
                installedAt: current.installedAt,
                updatedAt: Math.max(
                  current.updatedAt,
                  value.installation.updatedAt
                )
              }
            : value.installation
        )
        this.installSync(
          installation,
          current?.revision,
          'legacy.synchronized'
        )
      }
      const legacyRows = this.database
        .prepare(
          `SELECT installation_json
           FROM capability_installations
           WHERE installation_id LIKE 'legacy-installation.%'`
        )
        .all() as InstallationRow[]
      for (const row of legacyRows) {
        const installation = JSON.parse(
          row.installation_json
        ) as CapabilityInstallation
        if (projectedInstallationIds.has(installation.id)) continue
        if (
          this.listReferencesSync(
            installation.capabilityId,
            installation.capabilityVersion
          ).length > 0
        ) {
          continue
        }
        this.database
          .prepare(
            'DELETE FROM capability_installations WHERE installation_id = ?'
          )
          .run(installation.id)
        this.database
          .prepare(
            `DELETE FROM capability_definitions
             WHERE capability_id = ? AND capability_version = ?
               AND NOT EXISTS (
                 SELECT 1 FROM capability_installations
                 WHERE capability_id = ? AND capability_version = ?
               )`
          )
          .run(
            installation.capabilityId,
            installation.capabilityVersion,
            installation.capabilityId,
            installation.capabilityVersion
          )
      }
    })()
  }

  async listDefinitions(): Promise<CapabilityDefinition[]> {
    const rows = this.database
      .prepare(
        `SELECT definition_json
         FROM capability_definitions
         ORDER BY capability_id, capability_version`
      )
      .all() as DefinitionRow[]
    return rows.map((row) =>
      JSON.parse(row.definition_json) as CapabilityDefinition
    )
  }

  async listInstallations(): Promise<CapabilityInstallation[]> {
    const rows = this.database
      .prepare(
        `SELECT installation_json
         FROM capability_installations
         ORDER BY installed_at, installation_id`
      )
      .all() as InstallationRow[]
    return rows.map((row) =>
      JSON.parse(row.installation_json) as CapabilityInstallation
    )
  }

  async resolve(
    scopeChain: readonly CapabilityScope[]
  ): Promise<
    Array<{
      definition: CapabilityDefinition
      installation: CapabilityInstallation
    }>
  > {
    return resolveInstalledCapabilities({
      definitions: await this.listDefinitions(),
      installations: await this.listInstallations(),
      scopeChain
    })
  }

  async bindReference(reference: CapabilityReference): Promise<void> {
    if (
      !this.findDefinition(
        reference.capabilityId,
        reference.capabilityVersion
      )
    ) {
      throw new Error('Capability reference definition is unavailable')
    }
    this.database
      .prepare(
        `INSERT OR IGNORE INTO capability_references (
          capability_id, capability_version, owner_kind, owner_id, created_at
        ) VALUES (?, ?, ?, ?, ?)`
      )
      .run(
        reference.capabilityId,
        reference.capabilityVersion,
        reference.ownerKind,
        reference.ownerId,
        reference.createdAt
      )
  }

  async deleteVersion(
    capabilityId: string,
    capabilityVersion: string
  ): Promise<
    | { status: 'deleted' }
    | {
        status: 'referenced'
        references: Array<{
          ownerKind: CapabilityReference['ownerKind']
          ownerId: string
        }>
      }
  > {
    const references = this.database
      .prepare(
        `SELECT owner_kind, owner_id
         FROM capability_references
         WHERE capability_id = ? AND capability_version = ?
         ORDER BY owner_kind, owner_id`
      )
      .all(capabilityId, capabilityVersion) as ReferenceRow[]
    if (references.length > 0) {
      return {
        status: 'referenced',
        references: references.map((row) => ({
          ownerKind: row.owner_kind,
          ownerId: row.owner_id
        }))
      }
    }
    const installations = this.database
      .prepare(
        `SELECT 1 FROM capability_installations
         WHERE capability_id = ? AND capability_version = ?
         LIMIT 1`
      )
      .get(capabilityId, capabilityVersion)
    if (installations) {
      return {
        status: 'referenced',
        references: [
          { ownerKind: 'profile', ownerId: 'installed-scope' }
        ]
      }
    }
    this.database
      .prepare(
        `DELETE FROM capability_definitions
         WHERE capability_id = ? AND capability_version = ?`
      )
      .run(capabilityId, capabilityVersion)
    return { status: 'deleted' }
  }

  async deleteInstallation(
    installationId: string,
    expectedRevision: number
  ): Promise<
    | { status: 'deleted'; packageDigest?: string }
    | {
        status: 'referenced'
        references: Array<{
          ownerKind: CapabilityReference['ownerKind']
          ownerId: string
        }>
      }
  > {
    return this.database.transaction(() => {
      const installation = this.findInstallation(installationId)
      if (!installation) {
        throw new Error('Capability installation is unavailable')
      }
      if (installation.revision !== expectedRevision) {
        throw new Error('Capability installation revision conflict')
      }
      const references = this.listReferencesSync(
        installation.capabilityId,
        installation.capabilityVersion
      )
      if (references.length > 0) {
        return { status: 'referenced' as const, references }
      }
      this.appendAudit(
        installation.capabilityId,
        installation.capabilityVersion,
        'capability.deleted',
        installation.revision + 1,
        installation,
        Date.now()
      )
      this.database
        .prepare(
          'DELETE FROM capability_installations WHERE installation_id = ?'
        )
        .run(installationId)
      const remaining = this.database
        .prepare(
          `SELECT 1 FROM capability_installations
           WHERE capability_id = ? AND capability_version = ?
           LIMIT 1`
        )
        .get(
          installation.capabilityId,
          installation.capabilityVersion
        )
      if (remaining) return { status: 'deleted' as const }
      const packageBinding = this.database
        .prepare(
          `SELECT package_digest
           FROM capability_package_bindings
           WHERE capability_id = ? AND capability_version = ?`
        )
        .get(
          installation.capabilityId,
          installation.capabilityVersion
        ) as { package_digest: string } | undefined
      this.database
        .prepare(
          `DELETE FROM capability_package_bindings
           WHERE capability_id = ? AND capability_version = ?`
        )
        .run(
          installation.capabilityId,
          installation.capabilityVersion
        )
      this.database
        .prepare(
          `DELETE FROM capability_definitions
           WHERE capability_id = ? AND capability_version = ?`
        )
        .run(
          installation.capabilityId,
          installation.capabilityVersion
        )
      if (!packageBinding) return { status: 'deleted' as const }
      const shared = this.database
        .prepare(
          `SELECT 1 FROM capability_package_bindings
           WHERE package_digest = ? LIMIT 1`
        )
        .get(packageBinding.package_digest)
      return {
        status: 'deleted' as const,
        ...(shared
          ? {}
          : { packageDigest: packageBinding.package_digest })
      }
    })()
  }

  private findDefinition(
    capabilityId: string,
    capabilityVersion: string
  ): CapabilityDefinition | undefined {
    const row = this.database
      .prepare(
        `SELECT definition_json
         FROM capability_definitions
         WHERE capability_id = ? AND capability_version = ?`
      )
      .get(capabilityId, capabilityVersion) as DefinitionRow | undefined
    return row
      ? (JSON.parse(row.definition_json) as CapabilityDefinition)
      : undefined
  }

  private listReferencesSync(
    capabilityId: string,
    capabilityVersion: string
  ): Array<{
    ownerKind: CapabilityReference['ownerKind']
    ownerId: string
  }> {
    const rows = this.database
      .prepare(
        `SELECT owner_kind, owner_id
         FROM capability_references
         WHERE capability_id = ? AND capability_version = ?
         ORDER BY owner_kind, owner_id`
      )
      .all(capabilityId, capabilityVersion) as ReferenceRow[]
    return rows.map((row) => ({
      ownerKind: row.owner_kind,
      ownerId: row.owner_id
    }))
  }

  private publishSync(definition: CapabilityDefinition): void {
    const current = this.findDefinition(definition.id, definition.version)
    if (current) {
      assertCapabilityVersionImmutable(current, definition)
      return
    }
    this.database
      .prepare(
        `INSERT INTO capability_definitions (
          capability_id, capability_version, capability_kind,
          definition_digest, definition_json, published_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        definition.id,
        definition.version,
        definition.kind,
        definition.definitionDigest,
        JSON.stringify(definition),
        definition.publishedAt
      )
    this.appendAudit(
      definition.id,
      definition.version,
      'definition.published',
      1,
      definition,
      definition.publishedAt
    )
  }

  private bindPackageSync(
    definition: CapabilityDefinition,
    packageDigest: string
  ): void {
    if (!/^[a-f0-9]{64}$/.test(packageDigest)) {
      throw new Error('Capability package digest is invalid')
    }
    this.database
      .prepare(
        `INSERT INTO capability_package_bindings (
          capability_id, capability_version, package_digest
        ) VALUES (?, ?, ?)
        ON CONFLICT(capability_id, capability_version) DO UPDATE SET
          package_digest = excluded.package_digest
        WHERE package_digest = excluded.package_digest`
      )
      .run(definition.id, definition.version, packageDigest)
    const binding = this.database
      .prepare(
        `SELECT package_digest
         FROM capability_package_bindings
         WHERE capability_id = ? AND capability_version = ?`
      )
      .get(definition.id, definition.version) as
      | { package_digest: string }
      | undefined
    if (binding?.package_digest !== packageDigest) {
      throw new Error('Capability immutable package digest conflicts')
    }
  }

  private installSync(
    installation: CapabilityInstallation,
    expectedRevision?: number,
    eventType = 'installation.saved'
  ): void {
    const definition = this.findDefinition(
      installation.capabilityId,
      installation.capabilityVersion
    )
    if (
      !definition ||
      definition.definitionDigest !== installation.capabilityDigest
    ) {
      throw new Error('Capability installation definition is unavailable')
    }
    const current = this.findInstallation(installation.id)
    if (!current) {
      if (expectedRevision !== undefined || installation.revision !== 1) {
        throw new Error('Capability installation revision conflict')
      }
      this.database
        .prepare(
          `INSERT INTO capability_installations (
            installation_id, capability_id, capability_version,
            capability_digest, scope_kind, scope_key, enabled,
            lifecycle_status, installation_json, revision, installed_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          installation.id,
          installation.capabilityId,
          installation.capabilityVersion,
          installation.capabilityDigest,
          installation.scope.kind,
          scopeKey(installation.scope),
          installation.enabled ? 1 : 0,
          installation.status,
          JSON.stringify(installation),
          installation.revision,
          installation.installedAt,
          installation.updatedAt
        )
    } else {
      if (
        expectedRevision !== current.revision ||
        installation.revision !== current.revision + 1 ||
        installation.capabilityId !== current.capabilityId ||
        installation.scope.kind !== current.scope.kind ||
        scopeKey(installation.scope) !== scopeKey(current.scope)
      ) {
        throw new Error('Capability installation revision conflict')
      }
      const result = this.database
        .prepare(
          `UPDATE capability_installations
           SET capability_version = ?, capability_digest = ?, enabled = ?,
               lifecycle_status = ?, installation_json = ?, revision = ?,
               updated_at = ?
           WHERE installation_id = ? AND revision = ?`
        )
        .run(
          installation.capabilityVersion,
          installation.capabilityDigest,
          installation.enabled ? 1 : 0,
          installation.status,
          JSON.stringify(installation),
          installation.revision,
          installation.updatedAt,
          installation.id,
          expectedRevision
        )
      if (result.changes !== 1) {
        throw new Error('Capability installation revision conflict')
      }
    }
    this.appendAudit(
      installation.capabilityId,
      installation.capabilityVersion,
      eventType,
      installation.revision,
      installation,
      installation.updatedAt
    )
  }

  private findInstallation(
    installationId: string
  ): CapabilityInstallation | undefined {
    const row = this.database
      .prepare(
        `SELECT installation_json
         FROM capability_installations
         WHERE installation_id = ?`
      )
      .get(installationId) as InstallationRow | undefined
    return row
      ? (JSON.parse(row.installation_json) as CapabilityInstallation)
      : undefined
  }

  private appendAudit(
    capabilityId: string,
    capabilityVersion: string,
    eventType: string,
    revision: number,
    payload: unknown,
    occurredAt: number
  ): void {
    this.database
      .prepare(
        `INSERT INTO capability_catalog_audit (
          capability_id, capability_version, event_type, revision,
          payload_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        capabilityId,
        capabilityVersion,
        eventType,
        revision,
        JSON.stringify(payload),
        occurredAt
      )
  }
}

function scopeKey(scope: CapabilityScope): string {
  switch (scope.kind) {
    case 'global':
      return 'global'
    case 'work-root':
      return scope.workRootId
    case 'folder':
      return `${scope.workRootId}:${scope.canonicalPath}`
    case 'workspace':
      return scope.workspaceId
    case 'requirement':
      return `${scope.workspaceId}:${scope.requirementId}`
  }
}
