import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { browserInputSchema, browserPackageSpec } from './builtin-browser-catalog.mjs'

const VERSION = '1.0.0'
const OUTPUT_ROOT = new URL('../resources/extensions/builtin/', import.meta.url)
const CONTEXTS = ['general', 'space', 'requirement', 'workflow', 'schedule']
const OBJECT_SCHEMA = { type: 'object', additionalProperties: true }

const packageSpecs = [
  browserPackageSpec,
  {
    directory: 'files',
    packageId: 'realmflow.builtin.files',
    version: '1.3.1',
    name: 'Files',
    description: 'Authorized local file operations.',
    tools: [
      [
        'builtin.files.list',
        'List files',
        'List an authorized directory and the supported reader for each file.',
        'filesystem.read',
        'low',
      ],
      [
        'builtin.files.read',
        'Read file',
        'Read UTF-8 text in bounded chunks. Use Read document for PDF and DOCX files.',
        'filesystem.read',
        'low',
      ],
      [
        'builtin.documents.read',
        'Read document',
        'Read structured pages or blocks locally from authorized PDF and DOCX documents.',
        'filesystem.read',
        'low',
      ],
      [
        'builtin.files.search',
        'Search files',
        'Search authorized files by name or content.',
        'filesystem.read',
        'low',
      ],
      [
        'builtin.files.stat',
        'Inspect file',
        'Read file type, size, timestamps, checksum, and supported reader.',
        'filesystem.read',
        'low',
      ],
      [
        'builtin.files.create_directory',
        'Create directory',
        'Create an authorized directory.',
        'filesystem.write',
        'medium',
      ],
      [
        'builtin.files.write',
        'Write file',
        'Atomically create or replace a file.',
        'filesystem.write',
        'medium',
      ],
      [
        'builtin.files.apply_patch',
        'Apply patch',
        'Apply a patch with prior-content validation.',
        'filesystem.write',
        'medium',
      ],
      [
        'builtin.files.copy',
        'Copy files',
        'Copy an authorized file or directory.',
        'filesystem.write',
        'medium',
      ],
      [
        'builtin.files.move',
        'Move files',
        'Move or rename an authorized file or directory.',
        'filesystem.write',
        'medium',
      ],
      [
        'builtin.files.trash',
        'Move to trash',
        'Move a file or directory to the system trash.',
        'filesystem.delete',
        'high',
      ],
      [
        'builtin.files.delete_permanently',
        'Delete permanently',
        'Permanently delete an authorized file or directory.',
        'filesystem.delete',
        'critical',
      ],
    ],
  },
  {
    directory: 'documents',
    packageId: 'realmflow.builtin.documents',
    version: '1.1.0',
    name: 'Documents',
    description: 'Revision-safe local DOCX inspection and editing.',
    tools: [
      ['builtin.document.create', 'Create document', 'Create a deterministic DOCX from structured content at an authorized new path.', 'filesystem.write', 'medium'],
      ['builtin.document.export_pdf', 'Export document to PDF', 'Export a checksum-bound DOCX to a verified PDF at an authorized new path.', 'filesystem.write', 'medium'],
      ['builtin.artifact.verify', 'Verify artifact', 'Read back and verify a DOCX or PDF artifact against explicit acceptance criteria.', 'filesystem.read', 'low'],
      ['builtin.document.inspect', 'Inspect document', 'Open and inspect an authorized DOCX file.', 'filesystem.read', 'low'],
      ['builtin.document.find', 'Find in document', 'Find text using stable document block locations.', 'filesystem.read', 'low'],
      ['builtin.document.insert_blocks', 'Insert document blocks', 'Insert Markdown as structured document blocks.', 'filesystem.write', 'medium'],
      ['builtin.document.replace_text', 'Replace document text', 'Replace text without rewriting unrelated blocks.', 'filesystem.write', 'medium'],
      ['builtin.document.update_style', 'Update document style', 'Update a paragraph style using its stable block ID.', 'filesystem.write', 'medium'],
      ['builtin.document.update_layout', 'Update document layout', 'Update page size, orientation, header, and footer.', 'filesystem.write', 'medium'],
      ['builtin.document.table_insert', 'Insert document table', 'Insert a structured table after a document block.', 'filesystem.write', 'medium'],
      ['builtin.document.table_write', 'Write document table', 'Write a bounded value matrix into an existing table.', 'filesystem.write', 'medium'],
      ['builtin.document.comment_add', 'Add document comment', 'Attach a local Word comment to a paragraph.', 'filesystem.write', 'medium'],
      ['builtin.document.comment_delete', 'Delete document comment', 'Delete a Word comment by its stable ID.', 'filesystem.write', 'medium'],
      ['builtin.document.save', 'Save document', 'Atomically commit a safe DOCX candidate revision.', 'filesystem.write', 'medium'],
    ],
  },
  {
    directory: 'spreadsheets',
    packageId: 'realmflow.builtin.spreadsheets',
    version: '1.0.0',
    name: 'Spreadsheets',
    description: 'Revision-safe local spreadsheet inspection and editing.',
    tools: [
      ['builtin.spreadsheet.inspect', 'Inspect spreadsheet', 'Open and inspect an authorized XLSX, CSV, or TSV file.', 'filesystem.read', 'low'],
      ['builtin.spreadsheet.read_range', 'Read spreadsheet range', 'Read typed cells from a spreadsheet session.', 'filesystem.read', 'low'],
      ['builtin.spreadsheet.insert_rows', 'Insert spreadsheet rows', 'Insert structural rows without overwriting existing cells.', 'filesystem.write', 'medium'],
      ['builtin.spreadsheet.delete_rows', 'Delete spreadsheet rows', 'Delete structural rows from a spreadsheet session.', 'filesystem.write', 'medium'],
      ['builtin.spreadsheet.write_range', 'Write spreadsheet range', 'Write a two-dimensional value matrix in one operation.', 'filesystem.write', 'medium'],
      ['builtin.spreadsheet.set_style', 'Style spreadsheet range', 'Apply deterministic cell style properties to a range.', 'filesystem.write', 'medium'],
      ['builtin.spreadsheet.set_formula', 'Set spreadsheet formula', 'Write formulas and require verified recalculation before save.', 'filesystem.write', 'medium'],
      ['builtin.spreadsheet.sort', 'Sort spreadsheet rows', 'Sort a bounded range by explicit columns.', 'filesystem.write', 'medium'],
      ['builtin.spreadsheet.filter', 'Filter spreadsheet rows', 'Evaluate and persist a bounded spreadsheet filter.', 'filesystem.write', 'low'],
      ['builtin.spreadsheet.chart', 'Add spreadsheet chart', 'Add a basic chart from explicit data and category ranges.', 'filesystem.write', 'medium'],
      ['builtin.spreadsheet.save', 'Save spreadsheet', 'Atomically commit the current spreadsheet revision.', 'filesystem.write', 'medium'],
    ],
  },
  {
    directory: 'images',
    packageId: 'realmflow.builtin.images',
    version: '1.0.0',
    name: 'Images',
    description: 'Revision-safe local image inspection, OCR, and deterministic editing.',
    tools: [
      ['builtin.image.inspect', 'Inspect image', 'Open and inspect an authorized PNG, JPEG, WebP, GIF, or SVG file.', 'filesystem.read', 'low'],
      ['builtin.image.ocr', 'Recognize image text', 'Run local OCR or an explicitly authorized model vision fallback.', 'filesystem.read', 'low'],
      ['builtin.image.resize', 'Resize image', 'Resize an image to bounded dimensions.', 'filesystem.write', 'medium'],
      ['builtin.image.crop', 'Crop image', 'Crop an explicit image rectangle.', 'filesystem.write', 'medium'],
      ['builtin.image.rotate', 'Rotate image', 'Rotate an image after applying its stored orientation.', 'filesystem.write', 'medium'],
      ['builtin.image.compress', 'Compress image', 'Re-encode an image with an explicit format and quality.', 'filesystem.write', 'medium'],
      ['builtin.image.convert', 'Convert image', 'Convert an image candidate to PNG, JPEG, or WebP.', 'filesystem.write', 'medium'],
      ['builtin.image.composite', 'Composite image', 'Composite bounded local image layers.', 'filesystem.write', 'medium'],
      ['builtin.image.redact', 'Redact image', 'Cover explicit image regions with an opaque color.', 'filesystem.write', 'high'],
      ['builtin.image.remove_exif', 'Remove image metadata', 'Remove EXIF and other embedded metadata.', 'filesystem.write', 'medium'],
      ['builtin.image.save', 'Save image', 'Atomically commit the current image revision.', 'filesystem.write', 'medium'],
    ],
  },
  {
    directory: 'pdf',
    packageId: 'realmflow.builtin.pdf',
    version: '1.0.1',
    name: 'PDF',
    description: 'Revision-safe local PDF reading, OCR, and page operations.',
    tools: [
      ['builtin.pdf.inspect', 'Inspect PDF', 'Open and inspect PDF pages, forms, signatures, and OCR requirements.', 'filesystem.read', 'low'],
      ['builtin.pdf.thumbnail', 'Render PDF page', 'Render one PDF page as a bounded PNG thumbnail.', 'filesystem.read', 'low'],
      ['builtin.pdf.ocr', 'Recognize PDF page text', 'Render and recognize one scanned PDF page locally.', 'filesystem.read', 'low'],
      ['builtin.pdf.merge', 'Merge PDF', 'Append pages from authorized PDF files.', 'filesystem.write', 'medium'],
      ['builtin.pdf.split', 'Select PDF pages', 'Keep explicit PDF pages in the requested order.', 'filesystem.write', 'medium'],
      ['builtin.pdf.rotate', 'Rotate PDF pages', 'Rotate explicit PDF pages by quarter turns.', 'filesystem.write', 'medium'],
      ['builtin.pdf.watermark', 'Watermark PDF pages', 'Draw a text watermark on explicit PDF pages.', 'filesystem.write', 'medium'],
      ['builtin.pdf.form_fill', 'Fill PDF form', 'Fill standard AcroForm fields by name.', 'filesystem.write', 'medium'],
      ['builtin.pdf.annotation_add', 'Add PDF annotation', 'Add a visible text annotation to a PDF page.', 'filesystem.write', 'medium'],
      ['builtin.pdf.save', 'Save PDF', 'Atomically commit the current PDF revision.', 'filesystem.write', 'medium'],
    ],
  },
  {
    directory: 'presentations',
    packageId: 'realmflow.builtin.presentations',
    version: '1.0.0',
    name: 'Presentations',
    description: 'Revision-safe local PPTX inspection and structured editing.',
    tools: [
      ['builtin.presentation.inspect', 'Inspect presentation', 'Open and inspect an authorized PPTX file.', 'filesystem.read', 'low'],
      ['builtin.presentation.update_text', 'Update presentation text', 'Replace text in a shape selected by stable ID.', 'filesystem.write', 'medium'],
      ['builtin.presentation.replace_image', 'Replace presentation image', 'Replace an image shape from an authorized local file.', 'filesystem.write', 'medium'],
      ['builtin.presentation.table_write', 'Write presentation table', 'Write a bounded value matrix into a table shape.', 'filesystem.write', 'medium'],
      ['builtin.presentation.chart_write', 'Write presentation chart', 'Replace basic chart categories and series.', 'filesystem.write', 'medium'],
      ['builtin.presentation.add_slide', 'Add presentation slide', 'Add a blank slide at an explicit position.', 'filesystem.write', 'medium'],
      ['builtin.presentation.copy_slide', 'Copy presentation slide', 'Copy a slide and its local relationships.', 'filesystem.write', 'medium'],
      ['builtin.presentation.delete_slide', 'Delete presentation slide', 'Delete a slide while retaining at least one slide.', 'filesystem.write', 'high'],
      ['builtin.presentation.reorder_slide', 'Reorder presentation slide', 'Move a slide to an explicit one-based index.', 'filesystem.write', 'medium'],
      ['builtin.presentation.add_text', 'Add presentation text', 'Add a bounded text box to a slide.', 'filesystem.write', 'medium'],
      ['builtin.presentation.add_image', 'Add presentation image', 'Add an authorized local image to a slide.', 'filesystem.write', 'medium'],
      ['builtin.presentation.add_table', 'Add presentation table', 'Add a structured table to a slide.', 'filesystem.write', 'medium'],
      ['builtin.presentation.add_chart', 'Add presentation chart', 'Add a basic chart with explicit categories and series.', 'filesystem.write', 'medium'],
      ['builtin.presentation.reorder_shape', 'Reorder presentation shape', 'Move a shape to an explicit layer.', 'filesystem.write', 'medium'],
      ['builtin.presentation.update_size', 'Update presentation size', 'Update presentation page dimensions.', 'filesystem.write', 'medium'],
      ['builtin.presentation.save', 'Save presentation', 'Atomically commit a safe PPTX candidate revision.', 'filesystem.write', 'medium'],
    ],
  },
  {
    directory: 'legacy-office',
    packageId: 'realmflow.builtin.legacy-office',
    version: '1.2.0',
    name: 'Legacy Office Import',
    description: 'Non-overwriting local import and safe-copy conversion for Office files.',
    tools: [
      ['builtin.office.inspect_original', 'Inspect original Office file', 'Open an Office template or macro-enabled document in a read-only local session.', 'filesystem.read', 'low'],
      ['builtin.office.create_safe_copy', 'Create safe Office copy', 'Materialize an Office template or remove macros into a new modern Office document.', 'filesystem.write', 'medium'],
      ['builtin.office.import_legacy', 'Import legacy Office file', 'Convert an authorized legacy Office or WPS file into a new modern Office document.', 'filesystem.write', 'medium'],
    ],
  },
  {
    directory: 'archives',
    packageId: 'realmflow.builtin.archives',
    version: '1.1.0',
    name: 'Archives',
    description: 'Bounded local archive inspection, extraction, and creation.',
    tools: [
      ['builtin.archives.list', 'List archive', 'Inspect an authorized ZIP, TAR, TGZ, or GZ archive without extracting it.', 'filesystem.read', 'low'],
      ['builtin.archives.extract', 'Extract archive', 'Safely extract an authorized archive into a new local directory.', 'filesystem.write', 'medium'],
      ['builtin.archives.create', 'Create archive', 'Create a new local archive from authorized files and directories.', 'filesystem.write', 'medium'],
    ],
  },
  {
    directory: 'fixed-layout',
    packageId: 'realmflow.builtin.fixed-layout',
    version: '1.1.0',
    name: 'Fixed Layout',
    description: 'Read-only local OFD inspection, preview, and OCR.',
    tools: [
      ['builtin.fixed_layout.inspect', 'Inspect OFD', 'Inspect authorized OFD metadata and page text without editing or uploading the document.', 'filesystem.read', 'low'],
      ['builtin.fixed_layout.ocr', 'Recognize OFD page', 'Render and recognize one scanned OFD page with the bundled local OCR runtime.', 'filesystem.read', 'low'],
    ],
  },
  {
    directory: 'git',
    packageId: 'realmflow.builtin.git',
    version: '1.0.1',
    name: 'Git',
    description: 'Bounded Git repository operations.',
    tools: [
      [
        'builtin.git.status',
        'Git status',
        'Read repository working tree status.',
        'repository.read',
        'low',
      ],
      [
        'builtin.git.diff',
        'Git diff',
        'Read staged or unstaged differences.',
        'repository.read',
        'low',
      ],
      [
        'builtin.git.log',
        'Git log',
        'Read bounded commit history.',
        'repository.read',
        'low',
      ],
      [
        'builtin.git.list_branches',
        'List branches',
        'Read local and remote branch names.',
        'repository.read',
        'low',
      ],
      [
        'builtin.git.show',
        'Git show',
        'Read a commit or object.',
        'repository.read',
        'low',
      ],
      [
        'builtin.git.file_history',
        'File history',
        'Read bounded history for one file.',
        'repository.read',
        'low',
      ],
      [
        'builtin.git.commit',
        'Create commit',
        'Create a new commit from explicitly selected files.',
        'repository.modify',
        'high',
      ],
    ],
  },
  {
    directory: 'process',
    packageId: 'realmflow.builtin.process',
    version: '1.0.3',
    name: 'Processes',
    description: 'Local tool discovery and managed processes.',
    tools: [
      [
        'builtin.process.discover',
        'Discover tools',
        'Discover local executables and versions.',
        'process.discover',
        'low',
      ],
      [
        'builtin.process.run',
        'Run process',
        'Run a bounded foreground process.',
        'process.execute',
        'high',
      ],
      [
        'builtin.process.start',
        'Start process',
        'Start a managed background process.',
        'process.execute',
        'high',
      ],
      [
        'builtin.process.list',
        'List processes',
        'List RealmFlow-managed processes.',
        'process.manage',
        'low',
      ],
      [
        'builtin.process.stop',
        'Stop process',
        'Stop a RealmFlow-managed process.',
        'process.manage',
        'high',
      ],
    ],
  },
  {
    directory: 'web',
    packageId: 'realmflow.builtin.web',
    version: '1.1.0',
    name: 'Web',
    description: 'Permissioned public web retrieval.',
    tools: [
      [
        'builtin.web.fetch',
        'Fetch web page',
        'Fetch a public HTTP or HTTPS resource and return sanitized readable text.',
        'network.connect',
        'medium',
      ],
      [
        'builtin.web.search',
        'Search web',
        'Search using the provider saved in Web settings (self-hosted SearXNG or opt-in Brave); return source-attributed results. Provider selection and credentials are controlled by the user.',
        ['network.connect', 'credential.use'],
        'medium',
      ],
    ],
  },
  {
    directory: 'realmflow',
    packageId: 'realmflow.builtin.domain',
    version: '1.0.2',
    name: 'RealmFlow',
    description: 'RealmFlow domain queries and commands.',
    tools: [
      [
        'builtin.realmflow.spaces.list',
        'List spaces',
        'List active spaces.',
        'realmflow.read',
        'low',
      ],
      [
        'builtin.realmflow.requirements.list',
        'List requirements',
        'List requirements by space and status.',
        'realmflow.read',
        'low',
      ],
      [
        'builtin.realmflow.requirements.get',
        'Get requirement',
        'Read requirement details and ownership.',
        'realmflow.read',
        'low',
      ],
      [
        'builtin.realmflow.workflow.get_execution',
        'Get workflow execution',
        'Read DAG, NodeRun, and gate state.',
        'realmflow.read',
        'low',
      ],
      [
        'builtin.realmflow.node.answer_question',
        'Answer node question',
        'Answer an open NodeRun question.',
        'realmflow.write',
        'medium',
      ],
      [
        'builtin.realmflow.node.decide_approval',
        'Decide approval',
        'Approve or reject a NodeRun approval gate.',
        'realmflow.write',
        'critical',
      ],
      [
        'builtin.realmflow.node.todo.manage',
        'Manage node Todo',
        'Create, complete, or delete a NodeRun Todo.',
        'realmflow.write',
        'medium',
      ],
      [
        'builtin.realmflow.artifacts.list',
        'List artifacts',
        'List formal artifacts.',
        'realmflow.read',
        'low',
      ],
      [
        'builtin.realmflow.artifacts.read',
        'Read artifact',
        'Read formal artifact content or references.',
        'realmflow.read',
        'low',
      ],
      [
        'builtin.attachment.read_chunk',
        'Read attachment chunk',
        'Read one referenced long-text attachment chunk from the current conversation.',
        'realmflow.read',
        'low',
      ],
    ],
  },
  {
    directory: 'knowledge',
    packageId: 'realmflow.builtin.knowledge',
    version: '1.0.2',
    name: 'Knowledge',
    description: 'Scoped local knowledge operations.',
    tools: [
      [
        'builtin.knowledge.search',
        'Search knowledge',
        'Search within the persisted knowledge scope.',
        'knowledge.read',
        'low',
      ],
      [
        'builtin.knowledge.source.read',
        'Read knowledge source',
        'Read source, version, and indexing state.',
        'knowledge.read',
        'low',
      ],
      [
        'builtin.knowledge.note.save',
        'Save knowledge note',
        'Create or update a knowledge note.',
        'knowledge.write',
        'medium',
      ],
      [
        'builtin.knowledge.index.refresh',
        'Refresh knowledge index',
        'Refresh or rebuild a knowledge source index.',
        'knowledge.write',
        'medium',
      ],
    ],
  },
  {
    directory: 'computer',
    packageId: 'realmflow.builtin.computer',
    name: 'Computer Use',
    description: 'Authorized macOS observation and control.',
    platforms: ['darwin'],
    tools: [
      [
        'builtin.computer.observe',
        'Observe screen',
        'Capture the screen and accessibility tree.',
        'computer.observe',
        'medium',
      ],
      [
        'builtin.computer.focus',
        'Focus application',
        'Focus an authorized application or window.',
        'computer.control',
        'medium',
      ],
      [
        'builtin.computer.click',
        'Click',
        'Click a coordinate or accessible element.',
        'computer.control',
        'high',
      ],
      [
        'builtin.computer.type',
        'Type text',
        'Type text into a non-secure field.',
        'computer.control',
        'high',
      ],
      [
        'builtin.computer.key',
        'Press key',
        'Send a controlled key chord.',
        'computer.control',
        'high',
      ],
      [
        'builtin.computer.scroll',
        'Scroll',
        'Scroll an authorized window.',
        'computer.control',
        'medium',
      ],
      [
        'builtin.computer.wait',
        'Wait for UI',
        'Wait for a bounded UI condition.',
        'computer.observe',
        'low',
      ],
      [
        'builtin.computer.screenshot',
        'Take screenshot',
        'Create a short-lived screenshot artifact.',
        'computer.observe',
        'medium',
      ],
    ],
  },
]

const skillSpecs = [
  [
    'builtin.skill.requirement_analysis',
    'Requirement analysis',
    'Clarify goals, boundaries, risks, and acceptance criteria.',
    [
      'builtin.realmflow.requirements.get',
      'builtin.knowledge.search',
      'builtin.files.read',
    ],
  ],
  [
    'builtin.skill.technical_design',
    'Technical design',
    'Design architecture, protocols, data models, migration, and priorities.',
    [
      'builtin.files.read',
      'builtin.files.search',
      'builtin.git.status',
      'builtin.knowledge.search',
    ],
  ],
  [
    'builtin.skill.feature_implementation',
    'Feature implementation',
    'Implement a designed change and continuously verify it.',
    [
      'builtin.files.read',
      'builtin.files.write',
      'builtin.files.apply_patch',
      'builtin.git.diff',
      'builtin.process.run',
    ],
  ],
  [
    'builtin.skill.bug_fix',
    'Bug fix',
    'Reproduce, diagnose, repair, and regression-test a defect.',
    [
      'builtin.files.read',
      'builtin.files.search',
      'builtin.files.apply_patch',
      'builtin.git.diff',
      'builtin.process.run',
      'builtin.knowledge.search',
    ],
  ],
  [
    'builtin.skill.test_acceptance',
    'Test acceptance',
    'Run tests, inspect results, and produce acceptance evidence.',
    ['builtin.process.run', 'builtin.files.read', 'builtin.computer.observe'],
  ],
  [
    'builtin.skill.code_review',
    'Code review',
    'Find defects, regressions, risks, and missing tests.',
    [
      'builtin.git.diff',
      'builtin.git.log',
      'builtin.files.read',
      'builtin.knowledge.search',
    ],
  ],
  [
    'builtin.skill.repository_onboarding',
    'Repository onboarding',
    'Identify architecture, tooling, rules, and entry points.',
    [
      'builtin.files.search',
      'builtin.files.read',
      'builtin.git.log',
      'builtin.process.discover',
    ],
  ],
  [
    'builtin.skill.knowledge_curation',
    'Knowledge curation',
    'Retrieve, distill, and save durable project knowledge.',
    [
      'builtin.knowledge.search',
      'builtin.knowledge.note.save',
      'builtin.files.read',
      'builtin.realmflow.artifacts.read',
    ],
  ],
  [
    'builtin.skill.release_preparation',
    'Release preparation',
    'Check changes, tests, builds, artifacts, and release gates.',
    [
      'builtin.git.status',
      'builtin.git.diff',
      'builtin.process.run',
      'builtin.realmflow.artifacts.list',
      'builtin.computer.observe',
    ],
  ],
  [
    'builtin.skill.workflow_recovery',
    'Workflow recovery',
    'Inspect failures, plan recovery, and retry without bypassing gates.',
    [
      'builtin.realmflow.workflow.get_execution',
      'builtin.process.list',
      'builtin.knowledge.search',
    ],
  ],
]

export const BUILTIN_TOOL_IDS = packageSpecs
  .flatMap(({ tools }) => tools.map(([id]) => id))
  .sort()

export const BUILTIN_SKILL_IDS = skillSpecs.map(([id]) => id).sort()

export function buildBuiltinCatalog() {
  const packages = packageSpecs.map(buildToolPackage)
  packages.push(buildSkillPackage())
  const index = {
    schemaVersion: 1,
    catalogVersion: VERSION,
    packages: packages
      .map(({ directory, manifest, sourceDigest, tools, skills }) => ({
        packageId: manifest.packageId,
        version: manifest.version,
        path: `${directory}/extension.json`,
        sourceDigest,
        toolDefinitions: tools
          .map(({ id, version }) => ({ id, version }))
          .sort((left, right) => left.id.localeCompare(right.id)),
        skillDefinitions: skills
          .map(({ id, version }) => ({ id, version }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      }))
      .sort((left, right) => left.packageId.localeCompare(right.packageId)),
  }
  return { index, packages }
}

function buildToolPackage(spec) {
  const version = spec.version ?? VERSION
  const tools = spec.tools.map(([id, name, description, capability, risk]) =>
    toolDefinition({
      id,
      version,
      name,
      description,
      capability,
      risk,
      inputSchema:
        spec.directory === 'browser'
          ? browserInputSchema(id)
        : spec.directory === 'computer'
          ? computerInputSchema(id.slice('builtin.computer.'.length))
          : spec.directory === 'knowledge'
            ? knowledgeInputSchema(id)
            : spec.directory === 'realmflow'
              ? realmflowInputSchema(id)
              : spec.directory === 'documents'
                ? documentInputSchema(id)
              : spec.directory === 'images'
                ? imageInputSchema(id)
              : spec.directory === 'pdf'
                ? pdfInputSchema(id)
              : spec.directory === 'presentations'
                ? presentationInputSchema(id)
              : spec.directory === 'legacy-office'
                ? legacyOfficeInputSchema(id)
              : spec.directory === 'archives'
                ? archiveInputSchema(id)
              : spec.directory === 'fixed-layout'
                ? fixedLayoutInputSchema(id)
              : spec.directory === 'spreadsheets'
                ? spreadsheetInputSchema(id)
              : spec.directory === 'files'
                ? fileInputSchema(id)
              : spec.directory === 'git'
                ? gitInputSchema(id)
              : spec.directory === 'process'
                ? processInputSchema(id)
                : spec.directory === 'web'
                  ? webInputSchema(id)
                  : OBJECT_SCHEMA,
      executor:
        spec.directory === 'computer'
          ? {
              kind: 'computer',
              actionSet: id.slice('builtin.computer.'.length),
              actionSetVersion: VERSION,
            }
          : {
              kind: 'builtin',
              handler: id.slice('builtin.'.length),
              handlerVersion: VERSION,
            },
    }),
  )
  return createPackage({
    directory: spec.directory,
    packageId: spec.packageId,
    name: spec.name,
    description: spec.description,
    platforms: spec.platforms,
    version,
    tools,
    skills: [],
  })
}

function fileInputSchema(id) {
  const path = { type: 'string', minLength: 1 }
  const scopeRoot = { type: 'string', minLength: 1 }
  const checksum = { type: 'string', pattern: '^[a-f0-9]{64}$' }
  const expectedAbsent = { type: 'boolean', const: true }
  if (id === 'builtin.documents.read') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path,
        scopeRoot,
        maxCharacters: {
          type: 'integer',
          minimum: 1000,
          maximum: 200000,
        },
        chunkId: {
          type: 'string',
          pattern: '^[a-f0-9]{64}:chunk:[1-9][0-9]*$',
        },
      },
    }
  }
  if (id === 'builtin.files.read') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path,
        scopeRoot,
        offset: { type: 'integer', minimum: 0 },
        limit: { type: 'integer', minimum: 1, maximum: 1048576 },
      },
    }
  }
  if (id === 'builtin.files.list') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        path,
        scopeRoot,
      },
    }
  }
  if (id === 'builtin.files.search') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        path,
        scopeRoot,
        query: { type: 'string', minLength: 1, maxLength: 2000 },
        mode: { type: 'string', enum: ['name', 'content'] },
        maxResults: { type: 'integer', minimum: 1, maximum: 200 },
      },
    }
  }
  if (id === 'builtin.files.stat') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        path,
        paths: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: path,
        },
        scopeRoot,
      },
      oneOf: [{ required: ['path'] }, { required: ['paths'] }],
    }
  }
  if (id === 'builtin.files.write') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'mode', 'content'],
      properties: {
        path,
        scopeRoot,
        mode: { type: 'string', enum: ['create', 'replace'] },
        content: { type: 'string' },
        expectedChecksum: checksum,
        expectedAbsent,
      },
      allOf: [
        {
          if: {
            required: ['mode'],
            properties: { mode: { const: 'create' } },
          },
          then: { required: ['expectedAbsent'] },
          else: { required: ['expectedChecksum'] },
        },
      ],
    }
  }
  if (id === 'builtin.files.apply_patch') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'expectedChecksum', 'edits'],
      properties: {
        path,
        scopeRoot,
        expectedChecksum: checksum,
        edits: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['oldText', 'newText'],
            properties: {
              oldText: { type: 'string', minLength: 1 },
              newText: { type: 'string' },
              replaceAll: { type: 'boolean' },
            },
          },
        },
      },
    }
  }
  if (id === 'builtin.files.create_directory') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'expectedAbsent'],
      properties: { path, scopeRoot, expectedAbsent },
    }
  }
  if (id === 'builtin.files.copy' || id === 'builtin.files.move') {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'sourcePath',
        'targetPath',
        'expectedChecksum',
        'expectedAbsent',
      ],
      properties: {
        sourcePath: path,
        targetPath: path,
        expectedChecksum: checksum,
        expectedAbsent,
        scopeRoot,
      },
    }
  }
  if (
    id === 'builtin.files.trash' ||
    id === 'builtin.files.delete_permanently'
  ) {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'expectedChecksum'],
      properties: { path, scopeRoot, expectedChecksum: checksum },
    }
  }
  return OBJECT_SCHEMA
}

function legacyOfficeInputSchema(id) {
  if (id === 'builtin.office.inspect_original') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 },
        scopeRoot: { type: 'string', minLength: 1 },
      },
    }
  }
  if (
    id !== 'builtin.office.import_legacy' &&
    id !== 'builtin.office.create_safe_copy'
  ) {
    return OBJECT_SCHEMA
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['path', 'outputPath', 'expectedChecksum', 'expectedAbsent'],
    properties: {
      path: { type: 'string', minLength: 1 },
      outputPath: { type: 'string', minLength: 1 },
      expectedChecksum: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
      },
      expectedAbsent: { type: 'boolean', const: true },
      ...(id === 'builtin.office.create_safe_copy'
        ? { confirmMacroRemoval: { type: 'boolean' } }
        : {}),
      scopeRoot: { type: 'string', minLength: 1 },
    },
  }
}

function archiveInputSchema(id) {
  const path = { type: 'string', minLength: 1 }
  const scopeRoot = { type: 'string', minLength: 1 }
  const checksum = { type: 'string', pattern: '^[a-f0-9]{64}$' }
  const expectedAbsent = { type: 'boolean', const: true }
  if (id === 'builtin.archives.list') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: { path, scopeRoot },
    }
  }
  if (id === 'builtin.archives.extract') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'expectedChecksum', 'outputPath', 'expectedAbsent'],
      properties: {
        path,
        expectedChecksum: checksum,
        outputPath: path,
        expectedAbsent,
        scopeRoot,
      },
    }
  }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['outputPath', 'sources', 'expectedAbsent'],
    properties: {
      outputPath: path,
      expectedAbsent,
      sources: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['path', 'expectedChecksum'],
          properties: {
            path,
            expectedChecksum: checksum,
          },
        },
      },
      scopeRoot,
    },
  }
}

function fixedLayoutInputSchema(id) {
  return {
    type: 'object',
    additionalProperties: false,
    required:
      id === 'builtin.fixed_layout.ocr'
        ? ['path', 'pageNumber']
        : ['path'],
    properties: {
      path: { type: 'string', minLength: 1 },
      scopeRoot: { type: 'string', minLength: 1 },
      ...(id === 'builtin.fixed_layout.ocr'
        ? {
            pageNumber: { type: 'integer', minimum: 1, maximum: 2000 },
            language: { type: 'string', enum: ['eng', 'chi_sim'] },
            maxDimension: { type: 'integer', minimum: 64, maximum: 2400 },
          }
        : {}),
    },
  }
}

function spreadsheetInputSchema(id) {
  const sessionId = {
    type: 'string',
    pattern: '^[0-9a-f]{8}-[0-9a-f-]{27,}$',
  }
  const expectedRevision = { type: 'integer', minimum: 0 }
  const sheet = { type: 'string', minLength: 1, maxLength: 255 }
  const range = {
    type: 'string',
    pattern: '^[A-Za-z]{1,3}[1-9][0-9]*:[A-Za-z]{1,3}[1-9][0-9]*$',
  }
  const common = {
    type: 'object',
    additionalProperties: false,
    properties: { sessionId, expectedRevision, sheet, range },
  }
  if (id === 'builtin.spreadsheet.inspect') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 },
        scopeRoot: { type: 'string', minLength: 1 },
        mode: { type: 'string', enum: ['read', 'edit'] },
      },
    }
  }
  if (id === 'builtin.spreadsheet.read_range') {
    return {
      ...common,
      required: ['sessionId', 'sheet', 'range'],
    }
  }
  if (
    id === 'builtin.spreadsheet.insert_rows' ||
    id === 'builtin.spreadsheet.delete_rows'
  ) {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'sheet', 'startRow', 'count'],
      properties: {
        ...common.properties,
        startRow: { type: 'integer', minimum: 1 },
        count: { type: 'integer', minimum: 1, maximum: 10000 },
      },
    }
  }
  if (
    id === 'builtin.spreadsheet.write_range' ||
    id === 'builtin.spreadsheet.set_formula'
  ) {
    const valueKey =
      id === 'builtin.spreadsheet.set_formula' ? 'formulas' : 'values'
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'sheet', 'range', valueKey],
      properties: {
        ...common.properties,
        [valueKey]: {
          type: 'array',
          minItems: 1,
          maxItems: 10000,
          items: { type: 'array', minItems: 1, maxItems: 10000 },
        },
      },
    }
  }
  if (id === 'builtin.spreadsheet.set_style') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'sheet', 'range', 'style'],
      properties: {
        ...common.properties,
        style: { type: 'object', additionalProperties: true },
      },
    }
  }
  if (id === 'builtin.spreadsheet.sort') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'sheet', 'range', 'keys'],
      properties: {
        ...common.properties,
        keys: {
          type: 'array',
          minItems: 1,
          maxItems: 16,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['column', 'direction'],
            properties: {
              column: { type: 'integer', minimum: 1 },
              direction: {
                type: 'string',
                enum: ['ascending', 'descending'],
              },
            },
          },
        },
      },
    }
  }
  if (id === 'builtin.spreadsheet.filter') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'sheet',
        'range',
        'column',
        'operator',
        'value',
      ],
      properties: {
        ...common.properties,
        column: { type: 'integer', minimum: 1 },
        operator: {
          type: 'string',
          enum: ['equals', 'not_equals', 'contains'],
        },
        value: { type: ['string', 'number', 'boolean'] },
      },
    }
  }
  if (id === 'builtin.spreadsheet.chart') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'sheet',
        'type',
        'title',
        'dataRange',
        'categoryRange',
        'anchor',
      ],
      properties: {
        ...common.properties,
        type: { type: 'string', enum: ['bar', 'line', 'pie'] },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        dataRange: range,
        categoryRange: range,
        anchor: {
          type: 'string',
          pattern: '^[A-Za-z]{1,3}[1-9][0-9]*$',
        },
      },
    }
  }
  if (id === 'builtin.spreadsheet.save') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision'],
    }
  }
  return common
}

function presentationInputSchema(id) {
  const sessionId = {
    type: 'string',
    pattern: '^[0-9a-f]{8}-[0-9a-f-]{27,}$',
  }
  const expectedRevision = { type: 'integer', minimum: 0 }
  const slideId = { type: 'string', pattern: '^slide-[0-9]+$' }
  const shapeId = {
    type: 'string',
    pattern: '^shape-[0-9]+-[0-9]+$',
  }
  const bounds = {
    type: 'object',
    additionalProperties: false,
    required: ['leftPt', 'topPt', 'widthPt', 'heightPt'],
    properties: {
      leftPt: { type: 'number', minimum: 0, maximum: 2880 },
      topPt: { type: 'number', minimum: 0, maximum: 2880 },
      widthPt: { type: 'number', exclusiveMinimum: 0, maximum: 2880 },
      heightPt: { type: 'number', exclusiveMinimum: 0, maximum: 2880 },
    },
  }
  const matrix = {
    type: 'array',
    minItems: 1,
    maxItems: 100,
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: { type: ['string', 'number', 'boolean', 'null'] },
    },
  }
  const categories = {
    type: 'array',
    minItems: 1,
    maxItems: 1000,
    items: { type: ['string', 'number'] },
  }
  const series = {
    type: 'array',
    minItems: 1,
    maxItems: 100,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'values'],
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 255 },
        values: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          items: { type: 'number' },
        },
      },
    },
  }
  const common = {
    type: 'object',
    additionalProperties: false,
    properties: { sessionId, expectedRevision },
  }
  if (id === 'builtin.presentation.inspect') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 },
        scopeRoot: { type: 'string', minLength: 1 },
        mode: { type: 'string', enum: ['read', 'edit'] },
      },
    }
  }
  if (id === 'builtin.presentation.update_text') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'shapeId', 'text'],
      properties: {
        ...common.properties,
        shapeId,
        text: { type: 'string', maxLength: 100000 },
      },
    }
  }
  if (
    id === 'builtin.presentation.replace_image' ||
    id === 'builtin.presentation.add_image'
  ) {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        ...(id.endsWith('add_image') ? ['slideId', 'bounds'] : ['shapeId']),
        'imagePath',
      ],
      properties: {
        ...common.properties,
        slideId,
        shapeId,
        imagePath: { type: 'string', minLength: 1 },
        bounds,
        scopeRoot: { type: 'string', minLength: 1 },
      },
    }
  }
  if (id === 'builtin.presentation.table_write') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'shapeId',
        'startRow',
        'startColumn',
        'values',
      ],
      properties: {
        ...common.properties,
        shapeId,
        startRow: { type: 'integer', minimum: 1 },
        startColumn: { type: 'integer', minimum: 1 },
        values: matrix,
      },
    }
  }
  if (id === 'builtin.presentation.chart_write') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'shapeId',
        'title',
        'categories',
        'series',
      ],
      properties: {
        ...common.properties,
        shapeId,
        title: { type: 'string', maxLength: 255 },
        categories,
        series,
      },
    }
  }
  if (id === 'builtin.presentation.add_slide') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision'],
      properties: {
        ...common.properties,
        afterSlideId: slideId,
        notes: { type: 'string', maxLength: 100000 },
      },
    }
  }
  if (id === 'builtin.presentation.copy_slide') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'slideId', 'afterSlideId'],
      properties: {
        ...common.properties,
        slideId,
        afterSlideId: slideId,
      },
    }
  }
  if (id === 'builtin.presentation.delete_slide') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'slideId'],
      properties: { ...common.properties, slideId },
    }
  }
  if (id === 'builtin.presentation.reorder_slide') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'slideId', 'index'],
      properties: {
        ...common.properties,
        slideId,
        index: { type: 'integer', minimum: 1, maximum: 10000 },
      },
    }
  }
  if (id === 'builtin.presentation.add_text') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'slideId',
        'text',
        'bounds',
      ],
      properties: {
        ...common.properties,
        slideId,
        text: { type: 'string', maxLength: 100000 },
        bounds,
      },
    }
  }
  if (id === 'builtin.presentation.add_table') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'slideId',
        'rows',
        'bounds',
      ],
      properties: {
        ...common.properties,
        slideId,
        rows: matrix,
        bounds,
      },
    }
  }
  if (id === 'builtin.presentation.add_chart') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'slideId',
        'type',
        'title',
        'categories',
        'series',
        'bounds',
      ],
      properties: {
        ...common.properties,
        slideId,
        type: { type: 'string', enum: ['bar', 'column', 'line', 'pie'] },
        title: { type: 'string', maxLength: 255 },
        categories,
        series,
        bounds,
      },
    }
  }
  if (id === 'builtin.presentation.reorder_shape') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'shapeId', 'zIndex'],
      properties: {
        ...common.properties,
        shapeId,
        zIndex: { type: 'integer', minimum: 1, maximum: 10000 },
      },
    }
  }
  if (id === 'builtin.presentation.update_size') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'widthPt',
        'heightPt',
      ],
      properties: {
        ...common.properties,
        widthPt: { type: 'number', minimum: 72, maximum: 2880 },
        heightPt: { type: 'number', minimum: 72, maximum: 2880 },
      },
    }
  }
  if (id === 'builtin.presentation.save') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision'],
    }
  }
  return common
}

function imageInputSchema(id) {
  const sessionId = {
    type: 'string',
    pattern: '^[0-9a-f]{8}-[0-9a-f-]{27,}$',
  }
  const expectedRevision = { type: 'integer', minimum: 0 }
  const dimension = { type: 'integer', minimum: 1, maximum: 20000 }
  const coordinate = { type: 'integer', minimum: 0, maximum: 20000 }
  const rectangle = {
    type: 'object',
    additionalProperties: false,
    required: ['left', 'top', 'width', 'height'],
    properties: {
      left: coordinate,
      top: coordinate,
      width: dimension,
      height: dimension,
    },
  }
  const common = {
    type: 'object',
    additionalProperties: false,
    properties: { sessionId, expectedRevision },
  }
  if (id === 'builtin.image.inspect') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 },
        scopeRoot: { type: 'string', minLength: 1 },
        mode: { type: 'string', enum: ['read', 'edit'] },
      },
    }
  }
  if (id === 'builtin.image.ocr') {
    return {
      ...common,
      required: ['sessionId'],
      properties: {
        sessionId,
        language: {
          type: 'string',
          minLength: 2,
          maxLength: 32,
          pattern: '^[A-Za-z0-9_-]+$',
        },
      },
    }
  }
  if (id === 'builtin.image.resize') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'width', 'height'],
      properties: {
        ...common.properties,
        width: dimension,
        height: dimension,
        fit: {
          type: 'string',
          enum: ['cover', 'contain', 'fill', 'inside', 'outside'],
        },
      },
    }
  }
  if (id === 'builtin.image.crop') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'left',
        'top',
        'width',
        'height',
      ],
      properties: { ...common.properties, ...rectangle.properties },
    }
  }
  if (id === 'builtin.image.rotate') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'angle'],
      properties: {
        ...common.properties,
        angle: { type: 'number', minimum: -360, maximum: 360 },
      },
    }
  }
  if (
    id === 'builtin.image.compress' ||
    id === 'builtin.image.convert'
  ) {
    return {
      ...common,
      required:
        id === 'builtin.image.convert'
          ? ['sessionId', 'expectedRevision', 'format']
          : ['sessionId', 'expectedRevision', 'quality'],
      properties: {
        ...common.properties,
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'] },
        quality: { type: 'integer', minimum: 1, maximum: 100 },
      },
    }
  }
  if (id === 'builtin.image.composite') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'overlays'],
      properties: {
        ...common.properties,
        overlays: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['contentBase64', 'left', 'top'],
            properties: {
              contentBase64: { type: 'string', minLength: 1 },
              left: coordinate,
              top: coordinate,
            },
          },
        },
      },
    }
  }
  if (id === 'builtin.image.redact') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'regions'],
      properties: {
        ...common.properties,
        regions: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: rectangle,
        },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
    }
  }
  if (
    id === 'builtin.image.remove_exif'
  ) {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision'],
    }
  }
  if (id === 'builtin.image.save') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision'],
      properties: {
        ...common.properties,
        path: { type: 'string', minLength: 1 },
        scopeRoot: { type: 'string', minLength: 1 },
      },
    }
  }
  return common
}

function pdfInputSchema(id) {
  const sessionId = {
    type: 'string',
    pattern: '^[0-9a-f]{8}-[0-9a-f-]{27,}$',
  }
  const expectedRevision = { type: 'integer', minimum: 0 }
  const pageNumber = { type: 'integer', minimum: 1, maximum: 100000 }
  const pageNumbers = {
    type: 'array',
    minItems: 1,
    maxItems: 10000,
    uniqueItems: false,
    items: pageNumber,
  }
  const common = {
    type: 'object',
    additionalProperties: false,
    properties: { sessionId, expectedRevision },
  }
  if (id === 'builtin.pdf.inspect') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 },
        scopeRoot: { type: 'string', minLength: 1 },
        mode: { type: 'string', enum: ['read', 'edit'] },
      },
    }
  }
  if (id === 'builtin.pdf.thumbnail' || id === 'builtin.pdf.ocr') {
    return {
      ...common,
      required: ['sessionId', 'pageNumber'],
      properties: {
        ...common.properties,
        pageNumber,
        maxDimension: { type: 'integer', minimum: 64, maximum: 2048 },
        language: {
          type: 'string',
          minLength: 2,
          maxLength: 32,
          pattern: '^[A-Za-z0-9_-]+$',
        },
      },
    }
  }
  if (id === 'builtin.pdf.merge') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'paths'],
      properties: {
        ...common.properties,
        paths: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { type: 'string', minLength: 1 },
        },
        scopeRoot: { type: 'string', minLength: 1 },
      },
    }
  }
  if (id === 'builtin.pdf.split') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'pageNumbers'],
      properties: { ...common.properties, pageNumbers },
    }
  }
  if (id === 'builtin.pdf.rotate') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'pageNumbers', 'angle'],
      properties: {
        ...common.properties,
        pageNumbers,
        angle: { type: 'integer', enum: [90, 180, 270] },
      },
    }
  }
  if (id === 'builtin.pdf.watermark') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'pageNumbers', 'text'],
      properties: {
        ...common.properties,
        pageNumbers,
        text: { type: 'string', minLength: 1, maxLength: 500 },
        fontSize: { type: 'number', minimum: 6, maximum: 200 },
        opacity: { type: 'number', minimum: 0.05, maximum: 1 },
        angle: { type: 'number', minimum: -180, maximum: 180 },
      },
    }
  }
  if (id === 'builtin.pdf.form_fill') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'fields'],
      properties: {
        ...common.properties,
        fields: {
          type: 'object',
          minProperties: 1,
          maxProperties: 200,
          additionalProperties: { type: ['string', 'boolean'] },
        },
      },
    }
  }
  if (id === 'builtin.pdf.annotation_add') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'pageNumber',
        'text',
        'x',
        'y',
      ],
      properties: {
        ...common.properties,
        pageNumber,
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        x: { type: 'number', minimum: 0 },
        y: { type: 'number', minimum: 0 },
      },
    }
  }
  return {
    ...common,
    required: ['sessionId', 'expectedRevision'],
  }
}

function documentInputSchema(id) {
  const path = { type: 'string', minLength: 1 }
  const scopeRoot = { type: 'string', minLength: 1 }
  const deliveryChecksum = {
    type: 'string',
    pattern: '^sha256:[a-f0-9]{64}$',
  }
  if (id === 'builtin.document.create') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['outputPath', 'expectedAbsent', 'document'],
      properties: {
        outputPath: path,
        expectedAbsent: { type: 'boolean', const: true },
        scopeRoot,
        document: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'blocks'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 1000 },
            blocks: {
              type: 'array',
              minItems: 1,
              maxItems: 10000,
              items: {
                oneOf: [
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'level', 'text'],
                    properties: {
                      kind: { const: 'heading' },
                      level: { type: 'integer', minimum: 1, maximum: 9 },
                      text: { type: 'string', minLength: 1, maxLength: 100000 },
                    },
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'text'],
                    properties: {
                      kind: { const: 'paragraph' },
                      text: { type: 'string', minLength: 1, maxLength: 100000 },
                    },
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'items'],
                    properties: {
                      kind: { const: 'bullet_list' },
                      items: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 10000,
                        items: { type: 'string', minLength: 1, maxLength: 100000 },
                      },
                    },
                  },
                  {
                    type: 'object',
                    additionalProperties: false,
                    required: ['kind', 'rows'],
                    properties: {
                      kind: { const: 'table' },
                      rows: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 1000,
                        items: {
                          type: 'array',
                          minItems: 1,
                          maxItems: 100,
                          items: { type: 'string', maxLength: 100000 },
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    }
  }
  if (id === 'builtin.document.export_pdf') {
    return {
      type: 'object',
      additionalProperties: false,
      required: [
        'sourcePath',
        'sourceChecksum',
        'outputPath',
        'expectedAbsent',
      ],
      properties: {
        sourcePath: path,
        sourceChecksum: deliveryChecksum,
        outputPath: path,
        expectedAbsent: { type: 'boolean', const: true },
        scopeRoot,
      },
    }
  }
  if (id === 'builtin.artifact.verify') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path', 'format'],
      properties: {
        path,
        format: { type: 'string', enum: ['docx', 'pdf'] },
        expectedChecksum: deliveryChecksum,
        minimumByteSize: { type: 'integer', minimum: 1 },
        minimumPageCount: { type: 'integer', minimum: 1 },
        scopeRoot,
      },
    }
  }
  const sessionId = {
    type: 'string',
    pattern: '^[0-9a-f]{8}-[0-9a-f-]{27,}$',
  }
  const expectedRevision = { type: 'integer', minimum: 0 }
  const blockId = {
    type: 'string',
    pattern: '^(paragraph|table)-[1-9][0-9]*$',
  }
  const paragraphId = {
    type: 'string',
    pattern: '^paragraph-[1-9][0-9]*$',
  }
  const tableId = {
    type: 'string',
    pattern: '^table-[1-9][0-9]*$',
  }
  const sectionId = {
    type: 'string',
    pattern: '^section-[1-9][0-9]*$',
  }
  const matrix = {
    type: 'array',
    minItems: 1,
    maxItems: 1000,
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: { type: 'string', maxLength: 100000 },
    },
  }
  const common = {
    type: 'object',
    additionalProperties: false,
    properties: { sessionId, expectedRevision },
  }
  if (id === 'builtin.document.inspect') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: {
        path: { type: 'string', minLength: 1 },
        scopeRoot: { type: 'string', minLength: 1 },
        mode: { type: 'string', enum: ['read', 'edit'] },
      },
    }
  }
  if (id === 'builtin.document.find') {
    return {
      ...common,
      required: ['sessionId', 'query'],
      properties: {
        ...common.properties,
        query: { type: 'string', minLength: 1, maxLength: 100000 },
        caseSensitive: { type: 'boolean' },
      },
    }
  }
  if (id === 'builtin.document.insert_blocks') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'afterBlockId', 'markdown'],
      properties: {
        ...common.properties,
        afterBlockId: blockId,
        markdown: { type: 'string', minLength: 1, maxLength: 1000000 },
      },
    }
  }
  if (id === 'builtin.document.replace_text') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'query', 'replacement'],
      properties: {
        ...common.properties,
        query: { type: 'string', minLength: 1, maxLength: 100000 },
        replacement: { type: 'string', maxLength: 100000 },
        replaceAll: { type: 'boolean' },
      },
    }
  }
  if (id === 'builtin.document.update_style') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'blockId', 'style'],
      properties: {
        ...common.properties,
        blockId: paragraphId,
        style: {
          type: 'object',
          additionalProperties: false,
          properties: {
            styleName: { type: 'string', minLength: 1, maxLength: 100 },
            bold: { type: 'boolean' },
            italic: { type: 'boolean' },
            fontSizePt: { type: 'number', exclusiveMinimum: 0, maximum: 512 },
          },
        },
      },
    }
  }
  if (id === 'builtin.document.update_layout') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'sectionId'],
      properties: {
        ...common.properties,
        sectionId,
        widthPt: { type: 'number', minimum: 72, maximum: 2880 },
        heightPt: { type: 'number', minimum: 72, maximum: 2880 },
        header: { type: 'string', maxLength: 100000 },
        footer: { type: 'string', maxLength: 100000 },
      },
    }
  }
  if (id === 'builtin.document.table_insert') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'afterBlockId', 'rows'],
      properties: {
        ...common.properties,
        afterBlockId: blockId,
        rows: matrix,
      },
    }
  }
  if (id === 'builtin.document.table_write') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'tableId',
        'startRow',
        'startColumn',
        'values',
      ],
      properties: {
        ...common.properties,
        tableId,
        startRow: { type: 'integer', minimum: 1 },
        startColumn: { type: 'integer', minimum: 1 },
        values: matrix,
      },
    }
  }
  if (id === 'builtin.document.comment_add') {
    return {
      ...common,
      required: [
        'sessionId',
        'expectedRevision',
        'blockId',
        'text',
        'author',
      ],
      properties: {
        ...common.properties,
        blockId: paragraphId,
        text: { type: 'string', minLength: 1, maxLength: 100000 },
        author: { type: 'string', minLength: 1, maxLength: 255 },
      },
    }
  }
  if (id === 'builtin.document.comment_delete') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision', 'commentId'],
      properties: {
        ...common.properties,
        commentId: { type: 'string', pattern: '^[0-9]+$' },
      },
    }
  }
  if (id === 'builtin.document.save') {
    return {
      ...common,
      required: ['sessionId', 'expectedRevision'],
    }
  }
  return common
}

function realmflowInputSchema(id) {
  const idString = { type: 'string', minLength: 1, maxLength: 200 }
  const revision = { type: 'integer', minimum: 0 }
  if (id === 'builtin.realmflow.spaces.list') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {},
    }
  }
  if (id === 'builtin.realmflow.requirements.list') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'active', 'completed'],
        },
      },
    }
  }
  if (
    id === 'builtin.realmflow.requirements.get' ||
    id === 'builtin.realmflow.artifacts.list'
  ) {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        requirementId: idString,
      },
    }
  }
  if (id === 'builtin.realmflow.workflow.get_execution') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        requirementId: idString,
        nodeId: idString,
      },
    }
  }
  if (id === 'builtin.realmflow.artifacts.read') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['artifactId'],
      properties: {
        requirementId: idString,
        artifactId: idString,
      },
    }
  }
  if (id === 'builtin.realmflow.node.answer_question') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'status', 'expectedRevision'],
      properties: {
        id: idString,
        nodeRunId: idString,
        status: { type: 'string', enum: ['answered', 'dismissed'] },
        answer: { type: 'string', maxLength: 20000 },
        expectedRevision: revision,
      },
    }
  }
  if (id === 'builtin.realmflow.node.decide_approval') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['expectedNodeRunRevision', 'gate'],
      properties: {
        requirementId: idString,
        nodeRunId: idString,
        expectedNodeRunRevision: revision,
        gate: {
          oneOf: [
            {
              type: 'object',
              additionalProperties: false,
              required: [
                'kind',
                'decisionId',
                'expectedApprovalRevision',
                'result',
              ],
              properties: {
                kind: { const: 'approval' },
                decisionId: idString,
                expectedApprovalRevision: revision,
                result: { type: 'string', enum: ['approved', 'rejected'] },
                note: { type: 'string', maxLength: 5000 },
              },
            },
            {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'gateId', 'passed'],
              properties: {
                kind: { const: 'custom' },
                gateId: idString,
                passed: { type: 'boolean' },
              },
            },
          ],
        },
      },
    }
  }
  if (id === 'builtin.realmflow.node.todo.manage') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['operation', 'id', 'expectedRevision'],
      properties: {
        operation: { type: 'string', enum: ['save', 'delete'] },
        id: idString,
        nodeRunId: idString,
        title: { type: 'string', minLength: 1, maxLength: 500 },
        required: { type: 'boolean' },
        status: {
          type: 'string',
          enum: [
            'pending',
            'in_progress',
            'completed',
            'blocked',
            'cancelled',
          ],
        },
        reason: { type: 'string', maxLength: 1000 },
        expectedRevision: revision,
      },
    }
  }
  if (id !== 'builtin.attachment.read_chunk') return OBJECT_SCHEMA
  return {
    type: 'object',
    additionalProperties: false,
    required: ['chunkId'],
    properties: {
      chunkId: {
        type: 'string',
        minLength: 1,
        maxLength: 240,
      },
    },
  }
}

function processInputSchema(id) {
  const executableName = {
    type: 'string',
    pattern: '^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$',
  }
  const executable = {
    type: 'string',
    anyOf: [
      { pattern: '^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$' },
      { pattern: '^/[A-Za-z0-9._+/-]{1,199}$' },
    ],
  }
  const processId = {
    type: 'string',
    pattern: '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$',
  }
  const scopeRoot = { type: 'string', minLength: 1 }
  const cwd = { type: 'string' }
  const processArguments = {
    type: 'array',
    maxItems: 1000,
    items: {
      type: 'string',
      maxLength: 65536,
      not: { const: '\u0000' },
    },
  }
  const maxOutputBytes = {
    type: 'integer',
    minimum: 1024,
    maximum: 16 * 1024 * 1024,
  }
  if (id === 'builtin.process.discover') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['names'],
      properties: {
        names: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
          items: executableName,
        },
        cwd,
        scopeRoot,
      },
    }
  }
  if (id === 'builtin.process.run') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['executable'],
      properties: {
        executable,
        arguments: processArguments,
        cwd,
        timeoutMs: {
          type: 'integer',
          minimum: 1000,
          maximum: 3600000,
        },
        maxOutputBytes,
        scopeRoot,
      },
    }
  }
  if (id === 'builtin.process.start') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['executable'],
      properties: {
        executable,
        arguments: processArguments,
        cwd,
        maxOutputBytes,
        scopeRoot,
      },
    }
  }
  if (id === 'builtin.process.list') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {},
    }
  }
  if (id === 'builtin.process.stop') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['processId'],
      properties: {
        processId,
      },
    }
  }
  return OBJECT_SCHEMA
}

function webInputSchema(id) {
  if (id === 'builtin.web.fetch') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['url'],
      properties: {
        url: { type: 'string', minLength: 1, maxLength: 4096 },
        mode: { type: 'string', enum: ['readable', 'raw_text'] },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 30000 },
        maxBytes: { type: 'integer', minimum: 1024, maximum: 1048576 },
        maxRedirects: { type: 'integer', minimum: 0, maximum: 10 },
      },
    }
  }
  if (id === 'builtin.web.search') {
    return {
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
          enum: ['day', 'week', 'month', 'year', 'any'],
        },
        safeSearch: {
          type: 'string',
          enum: ['strict', 'moderate', 'off'],
        },
      },
    }
  }
  return OBJECT_SCHEMA
}

function buildSkillPackage() {
  const skills = skillSpecs.map(([id, name, description, dependencies]) => ({
    schemaVersion: 1,
    id,
    version: VERSION,
    name,
    description,
    instructionsPath: `instructions/${id.slice('builtin.skill.'.length)}.md`,
    runtime: { kind: 'instruction' },
    inputSchema: OBJECT_SCHEMA,
    outputSchema: OBJECT_SCHEMA,
    requiredTools: dependencies.map((toolId) => ({
      toolId,
      versionRange: `^${VERSION}`,
      required: true,
    })),
    activation: {
      intents: [name.toLowerCase()],
      contexts: CONTEXTS,
    },
    limits: {
      maxToolCalls: 64,
      timeoutMs: 900_000,
    },
  }))
  return createPackage({
    directory: 'core-skills',
    packageId: 'realmflow.builtin.core-skills',
    name: 'Core Skills',
    description: 'RealmFlow built-in software delivery Skills.',
    tools: [],
    skills,
  })
}

function toolDefinition({
  id,
  version = VERSION,
  name,
  description,
  capability,
  risk,
  inputSchema = OBJECT_SCHEMA,
  executor,
}) {
  return {
    schemaVersion: 1,
    id,
    version,
    name,
    description,
    tags: [id.split('.')[1]],
    executor,
    inputSchema,
    outputSchema: OBJECT_SCHEMA,
    capabilities: Array.isArray(capability) ? capability : [capability],
    effects: [...new Set((Array.isArray(capability) ? capability : [capability]).map(effectFor))],
    risk,
    invocation: {
      mode: 'unary',
      idempotency: id.startsWith('builtin.browser.') ? 'required' : 'supported',
      cancellable: true,
      resumable: false,
    },
    resources: {
      timeoutMs: 120_000,
      maxOutputBytes: 4 * 1024 * 1024,
      maxAttempts: 1,
    },
    discovery: {
      intents: [name.toLowerCase()],
      contexts: CONTEXTS,
      ...(risk === 'critical' || ['builtin.browser.attach', 'builtin.browser.evaluate'].includes(id)
        ? { requiresExplicitSelection: true } : {}),
    },
  }
}

function knowledgeInputSchema(id) {
  if (id === 'builtin.knowledge.search') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 2000 },
        topK: { type: 'integer', minimum: 1, maximum: 20 },
        sourceKinds: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'file',
              'document',
              'repository',
              'artifact',
              'requirement_memory',
              'conversation_note',
              'decision',
              'retrospective',
            ],
          },
          uniqueItems: true,
        },
      },
      required: ['query'],
    }
  }
  if (id === 'builtin.knowledge.source.read') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        sourceId: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['sourceId'],
    }
  }
  if (id === 'builtin.knowledge.note.save') {
    const idString = { type: 'string', minLength: 1, maxLength: 200 }
    return {
      type: 'object',
      additionalProperties: false,
      required: ['operation'],
      properties: {
        operation: { type: 'string', enum: ['create', 'edit'] },
        kind: {
          type: 'string',
          enum: ['conversation_note', 'decision', 'retrospective'],
        },
        id: idString,
        versionId: idString,
        noteId: idString,
        sourceMessageIds: {
          type: 'array',
          maxItems: 50,
          items: idString,
          uniqueItems: true,
        },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        content: { type: 'string', minLength: 1, maxLength: 20000 },
        expectedRevision: { type: 'integer', minimum: 0 },
      },
    }
  }
  if (id === 'builtin.knowledge.index.refresh') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['sourceId', 'idempotencyKey'],
      properties: {
        sourceId: { type: 'string', minLength: 1, maxLength: 200 },
        idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 },
      },
    }
  }
  return OBJECT_SCHEMA
}

function gitInputSchema(id) {
  const scopeRoot = { type: 'string', minLength: 1 }
  const relativePath = { type: 'string', minLength: 1 }
  const maxCount = { type: 'integer', minimum: 1, maximum: 500 }
  if (
    id === 'builtin.git.status' ||
    id === 'builtin.git.list_branches'
  ) {
    return {
      type: 'object',
      additionalProperties: false,
      properties: { scopeRoot },
    }
  }
  if (id === 'builtin.git.diff') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        scopeRoot,
        staged: { type: 'boolean' },
        path: relativePath,
      },
    }
  }
  if (id === 'builtin.git.log') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: { scopeRoot, maxCount },
    }
  }
  if (id === 'builtin.git.show') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['ref'],
      properties: {
        scopeRoot,
        ref: { type: 'string', minLength: 1, maxLength: 200 },
      },
    }
  }
  if (id === 'builtin.git.file_history') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['path'],
      properties: { scopeRoot, path: relativePath, maxCount },
    }
  }
  if (id === 'builtin.git.commit') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['message', 'files'],
      properties: {
        scopeRoot,
        message: { type: 'string', minLength: 1, maxLength: 10000 },
        files: {
          type: 'array',
          minItems: 1,
          maxItems: 1000,
          uniqueItems: true,
          items: relativePath,
        },
      },
    }
  }
  return OBJECT_SCHEMA
}

function computerInputSchema(action) {
  const properties = {
    bundleId: {
      type: 'string',
      pattern: '^[A-Za-z0-9][A-Za-z0-9.-]{1,199}$',
    },
  }
  const required = ['bundleId']
  if (action === 'click') {
    properties.x = { type: 'integer', minimum: 0, maximum: 100000 }
    properties.y = { type: 'integer', minimum: 0, maximum: 100000 }
    required.push('x', 'y')
  } else if (action === 'type') {
    properties.text = { type: 'string', minLength: 1, maxLength: 10000 }
    required.push('text')
  } else if (action === 'key') {
    properties.key = {
      type: 'string',
      enum: [
        'return',
        'tab',
        'space',
        'delete',
        'escape',
        'left',
        'right',
        'down',
        'up',
      ],
    }
    properties.modifiers = {
      type: 'array',
      items: {
        type: 'string',
        enum: ['command', 'control', 'option', 'shift'],
      },
      uniqueItems: true,
      maxItems: 4,
    }
    required.push('key')
  } else if (action === 'scroll') {
    properties.deltaY = {
      type: 'integer',
      enum: [
        -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ],
    }
    required.push('deltaY')
  } else if (action === 'wait') {
    properties.contains = { type: 'string', minLength: 1, maxLength: 500 }
    properties.role = { type: 'string', minLength: 1, maxLength: 100 }
    properties.timeoutMs = {
      type: 'integer',
      minimum: 100,
      maximum: 30000,
    }
  }
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  }
}

function effectFor(capability) {
  if (capability === 'credential.use') return 'local_data.read'
  if (capability.endsWith('.read') || capability.endsWith('.observe')) {
    return 'local_data.read'
  }
  if (capability === 'filesystem.delete') return 'local_data.delete'
  if (capability === 'network.connect') return 'external.read'
  if (capability.startsWith('computer.')) return 'user_interface.change'
  if (capability.startsWith('repository.')) return 'repository.change'
  if (capability.startsWith('process.')) return 'local_process.change'
  return 'local_data.change'
}

function createPackage({
  directory,
  packageId,
  version = VERSION,
  name,
  description,
  platforms = ['darwin', 'linux', 'win32'],
  tools,
  skills,
}) {
  const manifest = {
    schemaVersion: 1,
    packageId,
    version,
    name,
    description,
    publisher: {
      name: 'RealmFlow',
      keyId: 'realmflow-builtin-v1',
    },
    compatibility: {
      realmflow: '>=0.1.0 <1.0.0',
      platforms,
    },
    tools: tools.map(({ id }) => ({
      path: `tools/${fileName(id)}.json`,
    })),
    skills: skills.map(({ id }) => ({
      path: `skills/${fileName(id)}.json`,
    })),
    assets: skills.map(({ instructionsPath }) => instructionsPath),
  }
  const files = [
    jsonFile('extension.json', manifest),
    ...tools.map((tool) => jsonFile(`tools/${fileName(tool.id)}.json`, tool)),
    ...skills.map((skill) =>
      jsonFile(`skills/${fileName(skill.id)}.json`, skill),
    ),
    ...skills.map((skill) => ({
      path: skill.instructionsPath,
      content: `# ${skill.name}\n\n${skill.description}\n`,
    })),
  ].sort((left, right) => left.path.localeCompare(right.path))
  return {
    directory,
    manifest,
    tools,
    skills,
    files,
    sourceDigest: digestFiles(files),
  }
}

function fileName(id) {
  return id.replaceAll('.', '-')
}

function jsonFile(path, value) {
  return { path, content: `${JSON.stringify(value, null, 2)}\n` }
}

function digestFiles(files) {
  const hash = createHash('sha256')
  for (const { path, content } of files) {
    updateLengthPrefixed(hash, Buffer.from(path, 'utf8'))
    updateLengthPrefixed(hash, Buffer.from(content, 'utf8'))
  }
  return hash.digest('hex')
}

function updateLengthPrefixed(hash, value) {
  const length = Buffer.allocUnsafe(8)
  length.writeBigUInt64BE(BigInt(value.byteLength))
  hash.update(length)
  hash.update(value)
}

export async function writeBuiltinCatalog(
  outputRoot = fileURLToPath(OUTPUT_ROOT),
) {
  const catalog = buildBuiltinCatalog()
  await rm(outputRoot, { recursive: true, force: true })
  for (const pkg of catalog.packages) {
    for (const file of pkg.files) {
      const path = resolve(outputRoot, pkg.directory, file.path)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, file.content)
    }
  }
  await mkdir(outputRoot, { recursive: true })
  await writeFile(
    resolve(outputRoot, 'index.json'),
    `${JSON.stringify(catalog.index, null, 2)}\n`,
  )
  return catalog
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined
if (invokedPath === fileURLToPath(import.meta.url)) {
  await writeBuiltinCatalog()
}
