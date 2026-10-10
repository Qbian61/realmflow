import { describe, expect, it } from 'vitest'
import {
  BUILTIN_SKILL_IDS,
  BUILTIN_TOOL_IDS,
  buildBuiltinCatalog
} from './generate-builtin-extension-catalog.mjs'

describe('builtin extension catalog generator', () => {
  it('contains the complete stable Tool and Skill contract', () => {
    expect(BUILTIN_TOOL_IDS).toHaveLength(132)
    expect(BUILTIN_SKILL_IDS).toHaveLength(10)
    expect(BUILTIN_TOOL_IDS).toEqual([
      'builtin.archives.create',
      'builtin.archives.extract',
      'builtin.archives.list',
      'builtin.artifact.verify',
      'builtin.attachment.read_chunk',
      'builtin.browser.attach',
      'builtin.browser.click',
      'builtin.browser.close',
      'builtin.browser.create',
      'builtin.browser.download',
      'builtin.browser.evaluate',
      'builtin.browser.fill',
      'builtin.browser.navigate',
      'builtin.browser.press',
      'builtin.browser.screenshot',
      'builtin.browser.select',
      'builtin.browser.snapshot',
      'builtin.browser.upload',
      'builtin.browser.wait_for',
      'builtin.computer.click',
      'builtin.computer.focus',
      'builtin.computer.key',
      'builtin.computer.observe',
      'builtin.computer.screenshot',
      'builtin.computer.scroll',
      'builtin.computer.type',
      'builtin.computer.wait',
      'builtin.document.comment_add',
      'builtin.document.comment_delete',
      'builtin.document.create',
      'builtin.document.export_pdf',
      'builtin.document.find',
      'builtin.document.insert_blocks',
      'builtin.document.inspect',
      'builtin.document.replace_text',
      'builtin.document.save',
      'builtin.document.table_insert',
      'builtin.document.table_write',
      'builtin.document.update_layout',
      'builtin.document.update_style',
      'builtin.documents.read',
      'builtin.files.apply_patch',
      'builtin.files.copy',
      'builtin.files.create_directory',
      'builtin.files.delete_permanently',
      'builtin.files.list',
      'builtin.files.move',
      'builtin.files.read',
      'builtin.files.search',
      'builtin.files.stat',
      'builtin.files.trash',
      'builtin.files.write',
      'builtin.fixed_layout.inspect',
      'builtin.fixed_layout.ocr',
      'builtin.git.commit',
      'builtin.git.diff',
      'builtin.git.file_history',
      'builtin.git.list_branches',
      'builtin.git.log',
      'builtin.git.show',
      'builtin.git.status',
      'builtin.image.composite',
      'builtin.image.compress',
      'builtin.image.convert',
      'builtin.image.crop',
      'builtin.image.inspect',
      'builtin.image.ocr',
      'builtin.image.redact',
      'builtin.image.remove_exif',
      'builtin.image.resize',
      'builtin.image.rotate',
      'builtin.image.save',
      'builtin.knowledge.index.refresh',
      'builtin.knowledge.note.save',
      'builtin.knowledge.search',
      'builtin.knowledge.source.read',
      'builtin.office.create_safe_copy',
      'builtin.office.import_legacy',
      'builtin.office.inspect_original',
      'builtin.pdf.annotation_add',
      'builtin.pdf.form_fill',
      'builtin.pdf.inspect',
      'builtin.pdf.merge',
      'builtin.pdf.ocr',
      'builtin.pdf.rotate',
      'builtin.pdf.save',
      'builtin.pdf.split',
      'builtin.pdf.thumbnail',
      'builtin.pdf.watermark',
      'builtin.presentation.add_chart',
      'builtin.presentation.add_image',
      'builtin.presentation.add_slide',
      'builtin.presentation.add_table',
      'builtin.presentation.add_text',
      'builtin.presentation.chart_write',
      'builtin.presentation.copy_slide',
      'builtin.presentation.delete_slide',
      'builtin.presentation.inspect',
      'builtin.presentation.reorder_shape',
      'builtin.presentation.reorder_slide',
      'builtin.presentation.replace_image',
      'builtin.presentation.save',
      'builtin.presentation.table_write',
      'builtin.presentation.update_size',
      'builtin.presentation.update_text',
      'builtin.process.discover',
      'builtin.process.list',
      'builtin.process.run',
      'builtin.process.start',
      'builtin.process.stop',
      'builtin.realmflow.artifacts.list',
      'builtin.realmflow.artifacts.read',
      'builtin.realmflow.node.answer_question',
      'builtin.realmflow.node.decide_approval',
      'builtin.realmflow.node.todo.manage',
      'builtin.realmflow.requirements.get',
      'builtin.realmflow.requirements.list',
      'builtin.realmflow.spaces.list',
      'builtin.realmflow.workflow.get_execution',
      'builtin.spreadsheet.chart',
      'builtin.spreadsheet.delete_rows',
      'builtin.spreadsheet.filter',
      'builtin.spreadsheet.insert_rows',
      'builtin.spreadsheet.inspect',
      'builtin.spreadsheet.read_range',
      'builtin.spreadsheet.save',
      'builtin.spreadsheet.set_formula',
      'builtin.spreadsheet.set_style',
      'builtin.spreadsheet.sort',
      'builtin.spreadsheet.write_range',
      'builtin.web.fetch',
      'builtin.web.search'
    ])
    expect(BUILTIN_SKILL_IDS).toEqual([
      'builtin.skill.bug_fix',
      'builtin.skill.code_review',
      'builtin.skill.feature_implementation',
      'builtin.skill.knowledge_curation',
      'builtin.skill.release_preparation',
      'builtin.skill.repository_onboarding',
      'builtin.skill.requirement_analysis',
      'builtin.skill.technical_design',
      'builtin.skill.test_acceptance',
      'builtin.skill.workflow_recovery'
    ])
  })

  it('builds deterministic packages with resolvable Skill dependencies', () => {
    const first = buildBuiltinCatalog()
    const second = buildBuiltinCatalog()
    const toolIds = new Set(
      first.packages.flatMap(({ tools }) => tools.map(({ id }) => id))
    )

    expect(second).toEqual(first)
    expect(first.index.packages).toHaveLength(17)
    expect(
      first.packages.flatMap(({ skills }) => skills).every(({ requiredTools }) =>
        requiredTools.every(({ toolId }) => toolIds.has(toolId))
      )
    ).toBe(true)
    expect(
      first.index.packages.every(({ sourceDigest }) =>
        /^[a-f0-9]{64}$/.test(sourceDigest)
      )
    ).toBe(true)
  })

  it('publishes strict input schemas for every built-in Tool', () => {
    const loose = buildBuiltinCatalog().packages.flatMap(({ tools }) =>
      tools
        .filter(
          ({ inputSchema }) =>
            inputSchema.type === 'object' &&
            inputSchema.additionalProperties !== false
        )
        .map(({ id }) => id)
    )

    expect(loose).toEqual([])
  })

  it('requires an optimistic precondition for every filesystem mutation Tool', () => {
    const writeTools = buildBuiltinCatalog().packages.flatMap(({ tools }) =>
      tools.filter(({ capabilities }) =>
        capabilities.some((capability) =>
          capability === 'filesystem.write' ||
          capability === 'filesystem.delete'
        )
      )
    )
    const missing = writeTools
      .filter(({ inputSchema }) => !declaresMutationPrecondition(inputSchema))
      .map(({ id }) => id)

    expect(missing).toEqual([])
  })

  it('publishes a strict schema for local document reading', () => {
    const filesPackage = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.files'
    )
    const documentReader = filesPackage
      .tools
      .find(({ id }) => id === 'builtin.documents.read')

    expect(filesPackage.manifest.version).toBe('1.3.1')
    expect(documentReader).toMatchObject({
      description: expect.stringContaining('PDF and DOCX'),
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 },
          maxCharacters: {
            type: 'integer',
            minimum: 1000,
            maximum: 200000
          },
          chunkId: {
            type: 'string',
            pattern: '^[a-f0-9]{64}:chunk:[1-9][0-9]*$'
          }
        }
      }
    })
  })

  it('publishes explicit text read, write, and patch contracts', () => {
    const tools = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.files'
    ).tools

    expect(tools.find(({ id }) => id === 'builtin.files.read')).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 1048576 }
        }
      }
    })
    expect(tools.find(({ id }) => id === 'builtin.files.list')).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        properties: {
          path: { type: 'string', minLength: 1 }
        }
      }
    })
    expect(tools.find(({ id }) => id === 'builtin.files.search')).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 2000 },
          mode: { type: 'string', enum: ['name', 'content'] }
        }
      }
    })
    expect(tools.find(({ id }) => id === 'builtin.files.stat')).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        properties: {
          path: { type: 'string', minLength: 1 },
          paths: {
            type: 'array',
            minItems: 1,
            maxItems: 100
          }
        },
        oneOf: [{ required: ['path'] }, { required: ['paths'] }]
      }
    })
    expect(tools.find(({ id }) => id === 'builtin.files.write')).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path', 'mode', 'content'],
        properties: {
          mode: { type: 'string', enum: ['create', 'replace'] },
          expectedChecksum: {
            type: 'string',
            pattern: '^[a-f0-9]{64}$'
          }
        }
      }
    })
    expect(
      tools.find(({ id }) => id === 'builtin.files.apply_patch')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path', 'expectedChecksum', 'edits']
      }
    })
  })

  it('publishes revision-safe spreadsheet session contracts', () => {
    const spreadsheets = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.spreadsheets'
    )

    expect(spreadsheets.manifest.version).toBe('1.0.0')
    expect(spreadsheets.tools).toHaveLength(11)
    expect(
      spreadsheets.tools.find(
        ({ id }) => id === 'builtin.spreadsheet.inspect'
      )
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 }
        }
      }
    })
    expect(
      spreadsheets.tools.find(
        ({ id }) => id === 'builtin.spreadsheet.write_range'
      )
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['sessionId', 'expectedRevision', 'sheet', 'range', 'values']
      }
    })
    expect(
      spreadsheets.tools.find(({ id }) => id === 'builtin.spreadsheet.save')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['sessionId', 'expectedRevision']
      }
    })
  })

  it('publishes revision-safe structured Word document contracts', () => {
    const documents = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.documents'
    )

    expect(documents.manifest.version).toBe('1.1.0')
    expect(documents.tools).toHaveLength(14)
    expect(
      documents.tools.find(({ id }) => id === 'builtin.document.inspect')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 },
          mode: { type: 'string', enum: ['read', 'edit'] }
        }
      }
    })
    expect(
      documents.tools.find(
        ({ id }) => id === 'builtin.document.replace_text'
      )
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: [
          'sessionId',
          'expectedRevision',
          'query',
          'replacement'
        ]
      }
    })
    expect(
      documents.tools.find(({ id }) => id === 'builtin.document.save')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['sessionId', 'expectedRevision']
      }
    })
    expect(
      documents.tools.find(({ id }) => id === 'builtin.document.create')
    ).toMatchObject({
      capabilities: ['filesystem.write'],
      inputSchema: {
        additionalProperties: false,
        required: ['outputPath', 'expectedAbsent', 'document']
      }
    })
    expect(
      documents.tools.find(
        ({ id }) => id === 'builtin.document.export_pdf'
      )
    ).toMatchObject({
      capabilities: ['filesystem.write'],
      inputSchema: {
        additionalProperties: false,
        required: [
          'sourcePath',
          'sourceChecksum',
          'outputPath',
          'expectedAbsent'
        ]
      }
    })
    expect(
      documents.tools.find(({ id }) => id === 'builtin.artifact.verify')
    ).toMatchObject({
      capabilities: ['filesystem.read'],
      inputSchema: {
        additionalProperties: false,
        required: ['path', 'format']
      }
    })
  })

  it('publishes revision-safe presentation contracts', () => {
    const presentations = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.presentations'
    )

    expect(presentations.manifest.version).toBe('1.0.0')
    expect(presentations.tools).toHaveLength(16)
    expect(
      presentations.tools.find(
        ({ id }) => id === 'builtin.presentation.inspect'
      )
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 },
          mode: { type: 'string', enum: ['read', 'edit'] }
        }
      }
    })
    expect(
      presentations.tools.find(
        ({ id }) => id === 'builtin.presentation.replace_image'
      )
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: [
          'sessionId',
          'expectedRevision',
          'shapeId',
          'imagePath'
        ]
      }
    })
    expect(
      presentations.tools.find(
        ({ id }) => id === 'builtin.presentation.save'
      )
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['sessionId', 'expectedRevision']
      }
    })
  })

  it('publishes a strict legacy Office import contract', () => {
    const legacyOffice = buildBuiltinCatalog().packages.find(
      ({ manifest }) =>
        manifest.packageId === 'realmflow.builtin.legacy-office'
    )

    expect(legacyOffice.manifest.version).toBe('1.2.0')
    expect(legacyOffice.tools).toHaveLength(3)
    expect(
      legacyOffice.tools.find(
        ({ id }) => id === 'builtin.office.import_legacy'
      )
    ).toMatchObject({
      id: 'builtin.office.import_legacy',
      capabilities: ['filesystem.write'],
      inputSchema: {
        additionalProperties: false,
        required: [
          'path',
          'outputPath',
          'expectedChecksum',
          'expectedAbsent'
        ],
        properties: {
          path: { type: 'string', minLength: 1 },
          outputPath: { type: 'string', minLength: 1 },
          expectedAbsent: { type: 'boolean', const: true }
        }
      }
    })
  })

  it('publishes a strict Office template and macro safe-copy contract', () => {
    const office = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.legacy-office'
    )
    const safeCopy = office.tools.find(
      ({ id }) => id === 'builtin.office.create_safe_copy'
    )

    expect(office.tools).toHaveLength(3)
    expect(safeCopy).toMatchObject({
      id: 'builtin.office.create_safe_copy',
      capabilities: ['filesystem.write'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: [
          'path',
          'outputPath',
          'expectedChecksum',
          'expectedAbsent'
        ],
        properties: {
          path: { type: 'string', minLength: 1 },
          outputPath: { type: 'string', minLength: 1 },
          expectedAbsent: { type: 'boolean', const: true },
          confirmMacroRemoval: { type: 'boolean' },
          scopeRoot: { type: 'string', minLength: 1 }
        }
      }
    })
    expect(
      office.tools.find(({ id }) => id === 'builtin.office.inspect_original')
    ).toMatchObject({
      capabilities: ['filesystem.read'],
      inputSchema: {
        additionalProperties: false,
        required: ['path']
      }
    })
  })

  it('publishes strict local archive contracts without optional 7Z or RAR tools', () => {
    const archives = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.archives'
    )

    expect(archives.manifest.version).toBe('1.1.0')
    expect(archives.tools.map(({ id }) => id)).toEqual([
      'builtin.archives.list',
      'builtin.archives.extract',
      'builtin.archives.create'
    ])
    expect(archives.tools[0].inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 }
      }
    })
    expect(archives.tools[1].inputSchema).toMatchObject({
      additionalProperties: false,
      required: [
        'path',
        'expectedChecksum',
        'outputPath',
        'expectedAbsent'
      ]
    })
    expect(archives.tools[2].inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['outputPath', 'sources', 'expectedAbsent'],
      properties: {
        expectedAbsent: { type: 'boolean', const: true },
        sources: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            additionalProperties: false,
            required: ['path', 'expectedChecksum']
          }
        }
      }
    })
    expect(
      archives.tools.some(({ id }) => id.includes('7z') || id.includes('rar'))
    ).toBe(false)
  })

  it('publishes read-only OFD inspection and local OCR Tools', () => {
    const fixedLayout = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.fixed-layout'
    )

    expect(fixedLayout.manifest.version).toBe('1.1.0')
    expect(fixedLayout.tools).toHaveLength(2)
    expect(fixedLayout.tools[0]).toMatchObject({
      id: 'builtin.fixed_layout.inspect',
      capabilities: ['filesystem.read'],
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 },
          scopeRoot: { type: 'string', minLength: 1 }
        }
      }
    })
    expect(
      fixedLayout.tools.find(({ id }) => id === 'builtin.fixed_layout.ocr')
    ).toMatchObject({
      capabilities: ['filesystem.read'],
      inputSchema: {
        additionalProperties: false,
        required: ['path', 'pageNumber'],
        properties: {
          pageNumber: { type: 'integer', minimum: 1, maximum: 2000 },
          language: { type: 'string', enum: ['eng', 'chi_sim'] },
          maxDimension: { type: 'integer', minimum: 64, maximum: 2400 }
        }
      }
    })
    expect(
      fixedLayout.tools.some(({ capabilities }) =>
        capabilities.includes('filesystem.write')
      )
    ).toBe(false)
  })

  it('publishes revision-safe deterministic image contracts', () => {
    const images = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.images'
    )

    expect(images.manifest.version).toBe('1.0.0')
    expect(images.tools).toHaveLength(11)
    expect(
      images.tools.find(({ id }) => id === 'builtin.image.inspect')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 },
          mode: { type: 'string', enum: ['read', 'edit'] }
        }
      }
    })
    expect(
      images.tools.find(({ id }) => id === 'builtin.image.resize')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: [
          'sessionId',
          'expectedRevision',
          'width',
          'height'
        ]
      }
    })
    expect(
      images.tools.find(({ id }) => id === 'builtin.image.ocr')
    ).toMatchObject({
      capabilities: ['filesystem.read'],
      inputSchema: {
        additionalProperties: false,
        required: ['sessionId']
      }
    })
  })

  it('publishes revision-safe PDF page operation contracts', () => {
    const pdf = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.pdf'
    )

    expect(pdf.manifest.version).toBe('1.0.1')
    expect(pdf.tools).toHaveLength(10)
    expect(
      pdf.tools.find(({ id }) => id === 'builtin.pdf.inspect')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['path'],
        properties: {
          path: { type: 'string', minLength: 1 },
          mode: { type: 'string', enum: ['read', 'edit'] }
        }
      }
    })
    expect(
      pdf.tools.find(({ id }) => id === 'builtin.pdf.thumbnail')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['sessionId', 'pageNumber']
      }
    })
    expect(
      pdf.tools.find(({ id }) => id === 'builtin.pdf.rotate')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: [
          'sessionId',
          'expectedRevision',
          'pageNumbers',
          'angle'
        ]
      }
    })
    expect(
      pdf.tools.find(({ id }) => id === 'builtin.pdf.save')
    ).toMatchObject({
      inputSchema: {
        additionalProperties: false,
        required: ['sessionId', 'expectedRevision']
      }
    })
  })

  it('publishes strict action-specific schemas for every Computer Tool', () => {
    const computerTools = buildBuiltinCatalog().packages.find(
      ({ manifest }) =>
        manifest.packageId === 'realmflow.builtin.computer'
    ).tools

    expect(computerTools).toHaveLength(8)
    expect(
      computerTools.every(
        ({ inputSchema }) =>
          inputSchema.additionalProperties === false &&
          inputSchema.required.includes('bundleId')
      )
    ).toBe(true)
    expect(
      computerTools.find(({ id }) => id === 'builtin.computer.click')
        .inputSchema.required
    ).toEqual(['bundleId', 'x', 'y'])
    expect(
      computerTools.find(({ id }) => id === 'builtin.computer.type')
        .inputSchema.required
    ).toEqual(['bundleId', 'text'])
    expect(
      computerTools.find(({ id }) => id === 'builtin.computer.key')
        .inputSchema.properties.key.enum
    ).toEqual([
      'return',
      'tab',
      'space',
      'delete',
      'escape',
      'left',
      'right',
      'down',
      'up'
    ])
  })

  it('publishes strict action-specific schemas for every Process Tool', () => {
    const processPackage = buildBuiltinCatalog().packages.find(
      ({ manifest }) =>
        manifest.packageId === 'realmflow.builtin.process'
    )
    const tools = new Map(
      processPackage.tools.map((tool) => [tool.id, tool])
    )

    expect(processPackage.manifest.version).toBe('1.0.3')
    expect(
      processPackage.tools.every(
        ({ inputSchema }) => inputSchema.additionalProperties === false
      )
    ).toBe(true)
    expect(tools.get('builtin.process.discover')).toMatchObject({
      inputSchema: {
        required: ['names'],
        properties: {
          names: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
              type: 'string',
              pattern: '^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$'
            }
          }
        }
      }
    })
    expect(tools.get('builtin.process.run')).toMatchObject({
      inputSchema: {
        required: ['executable'],
        properties: {
          executable: {
            type: 'string',
            anyOf: [
              { pattern: '^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$' },
              { pattern: '^/[A-Za-z0-9._+/-]{1,199}$' }
            ]
          },
          arguments: {
            type: 'array',
            items: { type: 'string', maxLength: 65536 }
          },
          timeoutMs: {
            type: 'integer',
            minimum: 1000,
            maximum: 3600000
          }
        }
      }
    })
    expect(
      tools.get('builtin.process.run').inputSchema.properties
    ).not.toHaveProperty('command')
    expect(
      tools.get('builtin.process.run').inputSchema.properties
    ).not.toHaveProperty('args')
    expect(tools.get('builtin.process.start')).toMatchObject({
      inputSchema: {
        required: ['executable']
      }
    })
    expect(tools.get('builtin.process.list')).toMatchObject({
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {}
      }
    })
    expect(tools.get('builtin.process.stop')).toMatchObject({
      inputSchema: {
        required: ['processId'],
        properties: {
          processId: {
            type: 'string',
            pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$'
          }
        }
      }
    })
  })

  it('publishes workspace-bound Knowledge Tools with explicit arguments', () => {
    const knowledge = buildBuiltinCatalog().packages.find(
      ({ manifest }) =>
        manifest.packageId === 'realmflow.builtin.knowledge'
    )
    const search = knowledge.tools.find(
      ({ id }) => id === 'builtin.knowledge.search'
    )
    const sourceRead = knowledge.tools.find(
      ({ id }) => id === 'builtin.knowledge.source.read'
    )

    expect(knowledge.manifest.version).toBe('1.0.2')
    expect(search.version).toBe('1.0.2')
    expect(search.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 2000 }
      }
    })
    expect(sourceRead.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ['sourceId']
    })
    expect(search.inputSchema.properties).not.toHaveProperty('scope')
    expect(sourceRead.inputSchema.properties).not.toHaveProperty(
      'workspaceId'
    )
  })
})

  it('publishes a strict contract for built-in web tools', () => {
    const webPackage = buildBuiltinCatalog().packages.find(
      ({ manifest }) => manifest.packageId === 'realmflow.builtin.web'
    )
    const webFetch = webPackage.tools.find(
      ({ id }) => id === 'builtin.web.fetch'
    )
    const webSearch = webPackage.tools.find(
      ({ id }) => id === 'builtin.web.search'
    )

    expect(webPackage.manifest).toMatchObject({
      version: '1.1.0',
      name: 'Web'
    })
    expect(webFetch).toMatchObject({
      name: 'Fetch web page',
      capabilities: ['network.connect'],
      effects: ['external.read'],
      risk: 'medium',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['url'],
        properties: {
          url: { type: 'string', minLength: 1, maxLength: 4096 },
          mode: { type: 'string', enum: ['readable', 'raw_text'] },
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000 },
          maxBytes: { type: 'integer', minimum: 1024, maximum: 1048576 },
          maxRedirects: { type: 'integer', minimum: 0, maximum: 10 }
        }
      }
    })
    expect(webSearch).toMatchObject({
      name: 'Search web',
      capabilities: ['network.connect', 'credential.use'],
      effects: ['external.read', 'local_data.read'],
      risk: 'medium',
      inputSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 500 },
          limit: { type: 'integer', minimum: 1, maximum: 20 },
          language: { type: 'string', minLength: 2, maxLength: 16 },
          locale: { type: 'string', minLength: 2, maxLength: 32 },
          recency: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year', 'any']
          },
          safeSearch: {
            type: 'string',
            enum: ['strict', 'moderate', 'off']
          }
        }
      }
    })
  })

function declaresMutationPrecondition(schema) {
  const serialized = JSON.stringify(schema)
  return [
    '"expectedRevision"',
    '"expectedChecksum"',
    '"expectedAbsent"'
  ].some((property) => serialized.includes(property))
}
