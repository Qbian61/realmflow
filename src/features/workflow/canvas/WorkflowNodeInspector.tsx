import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent
} from 'react'
import { Rocket } from 'lucide-react'
import type {
  WorkflowNodeConfiguration,
  WorkflowNodeType
} from '../../../../domain/workflow'
import type {
  BusinessApi,
  ConnectorDto,
  ModelPoolDto,
  WorkflowTemplateDraftDto,
  WorkflowTemplateNodeDto
} from '../../../../shared/business'
import { Button, Field } from '../../../components/ui'
import { useLocalization } from '../../../localization/LocalizationProvider'
import {
  WorkflowTemplateNodeConfiguration,
  type WorkflowTemplateNodeConfigurationHandle
} from '../WorkflowTemplateNodeConfiguration'

type Props = {
  business: BusinessApi
  template: WorkflowTemplateDraftDto
  node?: WorkflowTemplateNodeDto
  models: ModelPoolDto
  connectors: ConnectorDto[]
  readOnly: boolean
  onConfigure: (
    nodeId: string,
    configuration: WorkflowNodeConfiguration
  ) => Promise<boolean>
  onChange: (template: WorkflowTemplateDraftDto) => void
  onUpdateNode: (input: {
    nodeId: string
    name: string
    description: string
    type: WorkflowNodeType
    allowSkip: boolean
  }) => Promise<boolean>
  onUpdateTemplate: (input: {
    name: string
    description: string
  }) => Promise<boolean>
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
  onPublish: () => void
  publishing: boolean
}

export type WorkflowNodeInspectorHandle = {
  save: () => Promise<boolean>
  discard: () => void
  getRecoveryText: () => string
}

export const WorkflowNodeInspector = forwardRef<
  WorkflowNodeInspectorHandle,
  Props
>(function WorkflowNodeInspector(
  {
    business,
    template,
    node,
    models,
    connectors,
    readOnly,
    onConfigure,
    onChange,
    onUpdateNode,
    onUpdateTemplate,
    onDirtyChange,
    onClose,
    onPublish,
    publishing
  },
  ref
): JSX.Element {
  const { t } = useLocalization()
  const [draft, setDraft] = useState(() => nodeDraft(node))
  const [baseBaseline, setBaseBaseline] = useState(() => nodeDraft(node))
  const [templateDraft, setTemplateDraft] = useState(() =>
    templateMetadataDraft(template)
  )
  const [templateBaseline, setTemplateBaseline] = useState(() =>
    templateMetadataDraft(template)
  )
  const [configurationDirty, setConfigurationDirty] = useState(false)
  const [savingBase, setSavingBase] = useState(false)
  const [savingAll, setSavingAll] = useState(false)
  const configurationRef =
    useRef<WorkflowTemplateNodeConfigurationHandle>(null)
  const baseDirty = !nodeDraftEqual(draft, baseBaseline)
  const metadataDirty = !templateMetadataEqual(
    templateDraft,
    templateBaseline
  )
  const dirty = node ? baseDirty || configurationDirty : metadataDirty

  useEffect(() => {
    const next = nodeDraft(node)
    setDraft(next)
    setBaseBaseline(next)
    setConfigurationDirty(false)
  }, [node?.id])

  useEffect(() => {
    if (node) return
    const next = templateMetadataDraft(template)
    setTemplateDraft(next)
    setTemplateBaseline(next)
  }, [node, template.name, template.description])

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  async function saveNodeBase(): Promise<boolean> {
    if (!node) return false
    if (!baseDirty) return true
    setSavingBase(true)
    try {
      const saved = await onUpdateNode({ nodeId: node.id, ...draft })
      if (saved) setBaseBaseline(draft)
      return saved
    } finally {
      setSavingBase(false)
    }
  }

  async function save(): Promise<boolean> {
    if (node) {
      const baseSaved = await saveNodeBase()
      if (!baseSaved) return false
      return configurationDirty
        ? (configurationRef.current?.save() ?? Promise.resolve(false))
        : true
    }
    if (!metadataDirty) return true
    setSavingBase(true)
    try {
      const saved = await onUpdateTemplate(templateDraft)
      if (saved) setTemplateBaseline(templateDraft)
      return saved
    } finally {
      setSavingBase(false)
    }
  }

  async function saveAll(): Promise<void> {
    setSavingAll(true)
    try {
      await save()
    } finally {
      setSavingAll(false)
    }
  }

  function discard(): void {
    if (node) {
      const next = nodeDraft(node)
      setDraft(next)
      setBaseBaseline(next)
      configurationRef.current?.discard()
      setConfigurationDirty(false)
    } else {
      const next = templateMetadataDraft(template)
      setTemplateDraft(next)
      setTemplateBaseline(next)
    }
    onDirtyChange(false)
  }

  useImperativeHandle(ref, () => ({
    save,
    discard,
    getRecoveryText: () =>
      JSON.stringify(
        {
          node: draft,
          configuration: JSON.parse(
            configurationRef.current?.getRecoveryText() ?? 'null'
          )
        },
        null,
        2
      )
  }))

  async function submitBase(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await saveNodeBase()
  }

  return (
    <aside
      className="workflow-node-inspector"
      aria-label={t('workflowInspector.ariaLabel')}
    >
      <div className="workflow-node-inspector-scroll">
        {node ? (
          <>
          <form className="workflow-inspector-base" onSubmit={submitBase}>
            <header>
              <h2>{t('workflowInspector.node')}</h2>
            </header>
            <Field name="workflow-editor-node-name" label={t('workflowEditor.nodeName')}>
              <input
                required
                maxLength={160}
                disabled={readOnly}
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </Field>
            <Field name="workflow-editor-stable-key" label={t('workflowEditor.stableKey')}>
              <input spellCheck={false} readOnly value={node.stableKey} />
            </Field>
            <Field name="workflow-editor-node-type" label={t('workflowEditor.nodeType')}>
              <select
                disabled={readOnly}
                value={draft.type}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    type: event.target.value as WorkflowNodeType
                  })
                }
              >
                {(
                  [
                    'ai_generate',
                    'human_input',
                    'tool',
                    'approval'
                  ] as const
                ).map((type) => (
                  <option key={type} value={type}>
                    {t(`workflowEditor.type.${type}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field name="workflow-editor-node-description" label={t('workflowEditor.nodeDescription')}>
              <textarea
                rows={3}
                disabled={readOnly}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </Field>
            <label className="workflow-node-checkbox">
              <input name="workflow-node-inspector-draft-allow-skip" autoComplete="off"
                type="checkbox"
                disabled={readOnly}
                checked={draft.allowSkip}
                onChange={(event) =>
                  setDraft({ ...draft, allowSkip: event.target.checked })
                }
              />
              <span>{t('workflowEditor.allowSkip')}</span>
            </label>
          </form>
          <WorkflowTemplateNodeConfiguration
            ref={configurationRef}
            key={node.id}
            business={business}
            models={models}
            connectors={connectors}
            template={template}
            node={node}
            embedded
            showActions={false}
            readOnly={readOnly}
            onSave={(configuration) => onConfigure(node.id, configuration)}
            onDirtyChange={setConfigurationDirty}
            onChange={onChange}
            onClose={onClose}
          />
          </>
        ) : (
          <form
            className="workflow-inspector-summary"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
          <h2>{t('workflowInspector.template')}</h2>
          <Field name="workflow-inspector-template-name" label={t('workflowInspector.templateName')}>
            <input
              required
              maxLength={160}
              disabled={readOnly}
              value={templateDraft.name}
              onChange={(event) =>
                setTemplateDraft({
                  ...templateDraft,
                  name: event.target.value
                })
              }
            />
          </Field>
          <Field name="workflow-inspector-template-description" label={t('workflowInspector.templateDescription')}>
            <textarea
              rows={4}
              maxLength={4000}
              disabled={readOnly}
              value={templateDraft.description}
              onChange={(event) =>
                setTemplateDraft({
                  ...templateDraft,
                  description: event.target.value
                })
              }
            />
          </Field>
          <dl>
            <div>
              <dt>{t('workflowInspector.name')}</dt>
              <dd>{template.name}</dd>
            </div>
            <div>
              <dt>{t('workflowInspector.version')}</dt>
              <dd>{template.currentVersion.version}</dd>
            </div>
            <div>
              <dt>{t('workflowInspector.nodes')}</dt>
              <dd>{template.currentVersion.nodeCount}</dd>
            </div>
            <div>
              <dt>{t('workflowInspector.edges')}</dt>
              <dd>{template.currentVersion.edgeCount}</dd>
            </div>
          </dl>
          </form>
        )}
      </div>
      {!readOnly ? (
        <footer className="workflow-node-inspector-actions">
          <Button
            size="compact"
            disabled={
              !dirty ||
              savingBase ||
              savingAll ||
              publishing ||
              !(node ? draft.name.trim() : templateDraft.name.trim())
            }
            onClick={() => void saveAll()}
          >
            {t('workflowInspector.saveChanges')}
          </Button>
          <div className="workflow-node-inspector-end-actions">
            <Button
              size="compact"
              variant="primary"
              leadingIcon={<Rocket size={15} />}
              className="workflow-canvas-publish"
              disabled={savingBase || savingAll || publishing}
              onClick={onPublish}
            >
              {t('workflowTemplates.action.publish')}
            </Button>
            <Button
              size="compact"
              disabled={savingAll || publishing}
              onClick={onClose}
            >
              {t('common.close')}
            </Button>
          </div>
        </footer>
      ) : null}
    </aside>
  )
})

function nodeDraft(node?: WorkflowTemplateNodeDto): {
  name: string
  description: string
  type: WorkflowNodeType
  allowSkip: boolean
} {
  return {
    name: node?.name ?? '',
    description: node?.description ?? '',
    type: node?.type ?? 'ai_generate',
    allowSkip: node?.allowSkip ?? false
  }
}

function nodeDraftEqual(
  left: ReturnType<typeof nodeDraft>,
  right: ReturnType<typeof nodeDraft>
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function templateMetadataDraft(template: WorkflowTemplateDraftDto): {
  name: string
  description: string
} {
  return {
    name: template.name,
    description: template.description
  }
}

function templateMetadataEqual(
  left: ReturnType<typeof templateMetadataDraft>,
  right: ReturnType<typeof templateMetadataDraft>
): boolean {
  return left.name === right.name && left.description === right.description
}
