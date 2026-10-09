import {
  forwardRef,
  useImperativeHandle,
} from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { WorkflowNodeConfiguration } from "../../../domain/workflow";
import type {
  BusinessApi,
  ConnectorDto,
  ModelPoolDto,
  WorkflowTemplateDraftDto,
  WorkflowTemplateNodeDto,
} from "../../../shared/business";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  WorkflowConnectorSelector,
  WorkflowFixedModelSelector,
  WorkflowReasoningSelector,
} from "./WorkflowConfigurationCatalogFields";
import {
  ConfigurationActions,
  ConfigurationHeader,
  ConfigurationLayer,
  ConfigurationScrollBody,
} from "./WorkflowTemplateNodeConfigurationLayout";
import { workflowModelCapabilities, workflowNodePermissions } from "./workflow-node-configuration-model";
import { useWorkflowNodeConfigurationDraft } from "./use-workflow-node-configuration-draft";
type Props = {
  business: BusinessApi;
  models?: ModelPoolDto;
  connectors?: ConnectorDto[];
  template: WorkflowTemplateDraftDto;
  node: WorkflowTemplateNodeDto;
  onChange: (template: WorkflowTemplateDraftDto) => void;
  onClose: () => void;
  embedded?: boolean;
  showActions?: boolean;
  readOnly?: boolean;
  onSave?: (configuration: WorkflowNodeConfiguration) => Promise<boolean>;
  onDirtyChange?: (dirty: boolean) => void;
};

export type WorkflowTemplateNodeConfigurationHandle = {
  save: () => Promise<boolean>;
  discard: () => void;
  getRecoveryText: () => string;
};

export const WorkflowTemplateNodeConfiguration = forwardRef<
  WorkflowTemplateNodeConfigurationHandle,
  Props
>(function WorkflowTemplateNodeConfiguration(
  {
    business,
    models,
    connectors,
    template,
    node,
    onChange,
    onClose,
    embedded = false,
    showActions = true,
    readOnly = false,
    onSave,
    onDirtyChange,
  },
  ref,
): JSX.Element {
  const { t } = useLocalization();
  const {
    configuration,
    setConfiguration,
    listInputs,
    setListInputs,
    busy,
    error,
    formRef,
    save,
    discard,
    submit,
    recoveryText,
  } = useWorkflowNodeConfigurationDraft({
    business,
    template,
    node,
    embedded,
    saveFailedMessage: t("workflowConfig.saveFailed"),
    onSave,
    onChange,
    onClose,
    onDirtyChange,
  });
  const capabilityModel =
    configuration.model.strategy === "capability"
      ? configuration.model
      : undefined;
  const fixedModel =
    configuration.model.strategy === "fixed"
      ? configuration.model
      : undefined;
  const fixedProfile = fixedModel
    ? models?.profiles.find(({ id }) => id === fixedModel.profileId)
    : undefined;
  const reasoningSupported =
    configuration.model.strategy !== "fixed" ||
    fixedProfile === undefined ||
    fixedProfile.reasoning === true;

  useImperativeHandle(ref, () => ({
    save,
    discard,
    getRecoveryText: () => recoveryText,
  }));

  function togglePermission(
    capability: WorkflowNodeConfiguration["permissions"][number]["capability"],
    enabled: boolean,
  ): void {
    setConfiguration({
      ...configuration,
      permissions: enabled
        ? [...configuration.permissions, { capability, scope: "requirement" }]
        : configuration.permissions.filter(
            (permission) => permission.capability !== capability,
          ),
    });
  }

  const dialogLabel = t("workflowConfig.dialogAria", { name: node.name });

  return (
    <ConfigurationLayer
      embedded={embedded}
      label={dialogLabel}
      onClose={onClose}
    >
      <form
        ref={formRef}
        className={
          embedded
            ? "workflow-node-config-form"
            : "workflow-node-config-form workflow-node-config-dialog__form"
        }
        onSubmit={submit}
      >
        <ConfigurationHeader embedded={embedded}>
          <div>
            <h2>{t("workflowConfig.title")}</h2>
            <span>{node.name}</span>
          </div>
          {!embedded ? (
            <button
              type="button"
              aria-label={t("workflowConfig.close")}
              title={t("workflowConfig.close")}
              onClick={onClose}
            >
              <X size={17} />
            </button>
          ) : null}
        </ConfigurationHeader>
        <ConfigurationScrollBody embedded={embedded}>
        {error ? (
          <p className="workflow-template-error" role="alert">
            {error}
          </p>
        ) : null}

        <fieldset disabled={readOnly}>
          <legend>{t("workflowConfig.input")}</legend>
          <div className="workflow-config-options">
            <label className="workflow-node-checkbox">
              <input name="workflow-template-node-configuration-configuration-input-include-requirement-body" autoComplete="off"
                type="checkbox"
                checked={configuration.input.includeRequirementBody}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    input: {
                      ...configuration.input,
                      includeRequirementBody: event.target.checked,
                    },
                  })
                }
              />
              <span>{t("workflowConfig.includeRequirement")}</span>
            </label>
            <label className="workflow-node-checkbox">
              <input name="workflow-template-node-configuration-configuration-input-include-space-knowledge" autoComplete="off"
                type="checkbox"
                checked={configuration.input.includeSpaceKnowledge}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    input: {
                      ...configuration.input,
                      includeSpaceKnowledge: event.target.checked,
                    },
                  })
                }
              />
              <span>{t("workflowConfig.includeKnowledge")}</span>
            </label>
          </div>
          <label>
            <span>{t("workflowConfig.predecessors")}</span>
            <select name="workflow-template-node-configuration-configuration-input-predecessor-artifacts" autoComplete="off"
              value={configuration.input.predecessorArtifacts}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  input: {
                    ...configuration.input,
                    predecessorArtifacts: event.target
                      .value as WorkflowNodeConfiguration["input"]["predecessorArtifacts"],
                  },
                })
              }
            >
              <option value="none">
                {t("workflowConfig.predecessors.none")}
              </option>
              <option value="direct">
                {t("workflowConfig.predecessors.direct")}
              </option>
              <option value="all">
                {t("workflowConfig.predecessors.all")}
              </option>
            </select>
          </label>
          <label>
            <span>{t("workflowConfig.attachments")}</span>
            <textarea name="workflow-template-node-configuration-list-inputs-attachments" autoComplete="off"
              rows={2}
              value={listInputs.attachments}
              onChange={(event) =>
                setListInputs({
                  ...listInputs,
                  attachments: event.target.value,
                })
              }
            />
          </label>
        </fieldset>
        <fieldset disabled={readOnly}>
          <legend>{t("workflowConfig.execution")}</legend>
          <label>
            <span>{t("workflowConfig.prompt")}</span>
            <textarea name="workflow-template-node-configuration-configuration-prompt" autoComplete="off"
              required={node.type === "ai_generate"}
              rows={5}
              value={configuration.prompt}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  prompt: event.target.value,
                })
              }
            />
          </label>
<WorkflowReasoningSelector
            value={configuration.reasoning ?? "inherit"}
            supported={reasoningSupported}
            onChange={(reasoning) =>
              setConfiguration({ ...configuration, reasoning })
            }
          />
          <div className="workflow-config-grid">
            <label>
              <span>{t("workflowConfig.modelStrategy")}</span>
              <select name="workflow-template-node-configuration-configuration-model-strategy" autoComplete="off"
                value={configuration.model.strategy}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    model:
                      event.target.value === "fixed"
                        ? { strategy: "fixed", profileId: "" }
                        : event.target.value === "capability"
                          ? {
                              strategy: "capability",
                              requiredCapabilities: ["text"],
                              minimumContextWindow: 32_000,
                            }
                          : { strategy: "inherit" },
                  })
                }
              >
                <option value="inherit">
                  {t("workflowConfig.model.inherit")}
                </option>
                <option value="fixed">{t("workflowConfig.model.fixed")}</option>
                <option value="capability">
                  {t("workflowConfig.model.capability")}
                </option>
              </select>
            </label>
            {configuration.model.strategy === "fixed" ? (
              <WorkflowFixedModelSelector
                profileId={configuration.model.profileId}
                models={models}
                onChange={(profileId) =>
                  setConfiguration({
                    ...configuration,
                    model: { strategy: "fixed", profileId },
                    ...(models?.profiles.find(({ id }) => id === profileId)
                      ?.reasoning === false
                      ? { reasoning: "inherit" }
                      : {}),
                  })
                }
              />
            ) : null}
          </div>
          {capabilityModel ? (
            <div className="workflow-model-routing">
              <div
                className="workflow-config-options"
                role="group"
                aria-label={t("workflowConfig.capabilities")}
              >
                {workflowModelCapabilities.map(({ capability, label }) => (
                  <label className="workflow-node-checkbox" key={capability}>
                    <input name={`workflow-model-capability-${capability}`} autoComplete="off"
                      type="checkbox"
                      checked={capabilityModel.requiredCapabilities.includes(
                        capability,
                      )}
                      disabled={capability === "text"}
                      onChange={(event) => {
                        const model = capabilityModel;
                        const requiredCapabilities = event.target.checked
                          ? [...model.requiredCapabilities, capability]
                          : model.requiredCapabilities.filter(
                              (item) => item !== capability,
                            );
                        setConfiguration({
                          ...configuration,
                          model: {
                            ...model,
                            requiredCapabilities,
                          },
                        });
                      }}
                    />
                    <span>{t(label)}</span>
                  </label>
                ))}
              </div>
              <label>
                <span>{t("workflowConfig.minimumContext")}</span>
                <input inputMode="numeric" name="workflow-template-node-configuration-capability-model-minimum-context-window" autoComplete="off"
                  type="number"
                  min={1}
                  step={1}
                  value={capabilityModel.minimumContextWindow}
                  onChange={(event) => {
                    const model = capabilityModel;
                    setConfiguration({
                      ...configuration,
                      model: {
                        ...model,
                        minimumContextWindow: Number(event.target.value),
                      },
                    });
                  }}
                />
              </label>
            </div>
          ) : null}
          <WorkflowConnectorSelector
            connectors={connectors}
            selectedIds={configuration.connectorIds}
            onChange={(connectorIds) =>
              setConfiguration({ ...configuration, connectorIds })
            }
          />
        </fieldset>

        <fieldset disabled={readOnly}>
          <legend>{t("workflowConfig.permissions")}</legend>
          <div className="workflow-permission-list">
            {workflowNodePermissions.map(({ capability, label }) => {
              const permission = configuration.permissions.find(
                (item) => item.capability === capability,
              );
              return (
                <div key={capability}>
                  <label className="workflow-node-checkbox">
                    <input name={`workflow-permission-${capability}-enabled`} autoComplete="off"
                      type="checkbox"
                      checked={Boolean(permission)}
                      onChange={(event) =>
                        togglePermission(capability, event.target.checked)
                      }
                    />
                    <span>{t(label)}</span>
                  </label>
                  <select name={`workflow-permission-${capability}-scope`} autoComplete="off"
                    aria-label={t("workflowConfig.permissionScope", {
                      label: t(label),
                    })}
                    disabled={!permission}
                    value={permission?.scope ?? "requirement"}
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        permissions: configuration.permissions.map((item) =>
                          item.capability === capability
                            ? {
                                ...item,
                                scope: event.target.value as
                                  "requirement" | "space",
                              }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="requirement">
                      {t("workflowConfig.scope.requirement")}
                    </option>
                    <option value="space">
                      {t("workflowConfig.scope.space")}
                    </option>
                  </select>
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset disabled={readOnly}>
          <legend>{t("workflowConfig.outputs")}</legend>
          <label className="workflow-node-checkbox">
            <input name="workflow-template-node-configuration-configuration-artifact-required" autoComplete="off"
              type="checkbox"
              checked={configuration.artifact.required}
              disabled={node.type === "ai_generate"}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  artifact: {
                    ...configuration.artifact,
                    required: event.target.checked,
                  },
                })
              }
            />
            <span>{t("workflowConfig.artifactRequired")}</span>
          </label>
          <div className="workflow-config-grid">
            <label>
              <span>{t("workflowConfig.artifactPath")}</span>
              <input spellCheck={false} name="workflow-template-node-configuration-configuration-artifact-relative-path" autoComplete="off"
                required={configuration.artifact.required}
                value={configuration.artifact.relativePath}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    artifact: {
                      ...configuration.artifact,
                      relativePath: event.target.value,
                    },
                  })
                }
              />
            </label>
            <label>
              <span>{t("workflowConfig.artifactType")}</span>
              <input spellCheck={false} name="workflow-template-node-configuration-configuration-artifact-kind" autoComplete="off"
                required={configuration.artifact.required}
                value={configuration.artifact.kind}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    artifact: {
                      ...configuration.artifact,
                      kind: event.target.value,
                    },
                  })
                }
              />
            </label>
          </div>
          <div className="workflow-todo-heading">
            <span>{t("workflowConfig.todos")}</span>
            <button
              type="button"
              onClick={() =>
                setConfiguration({
                  ...configuration,
                  todos: [
                    ...configuration.todos,
                    { title: "", required: true },
                  ],
                })
              }
            >
              <Plus size={14} />
              {t("workflowConfig.addTodo")}
            </button>
          </div>
          <div className="workflow-todo-list">
            {configuration.todos.map((todo, index) => (
              <div key={index}>
                <input name={`workflow-todo-${index}-title`} autoComplete="off"
                  aria-label={t("workflowConfig.todoAria", {
                    index: index + 1,
                  })}
                  required
                  value={todo.title}
                  onChange={(event) =>
                    setConfiguration({
                      ...configuration,
                      todos: configuration.todos.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, title: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <label className="workflow-node-checkbox">
                  <input name={`workflow-todo-${index}-required`} autoComplete="off"
                    type="checkbox"
                    checked={todo.required}
                    onChange={(event) =>
                      setConfiguration({
                        ...configuration,
                        todos: configuration.todos.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, required: event.target.checked }
                            : item,
                        ),
                      })
                    }
                  />
                  <span>{t("workflowConfig.required")}</span>
                </label>
                <button
                  type="button"
                  aria-label={t("workflowConfig.deleteTodoAria", {
                    index: index + 1,
                  })}
                  title={t("tooltip.delete")}
                  onClick={() =>
                    setConfiguration({
                      ...configuration,
                      todos: configuration.todos.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset disabled={readOnly}>
          <legend>{t("workflowConfig.completion")}</legend>
          <div className="workflow-config-options">
            <label className="workflow-node-checkbox">
              <input name="workflow-template-node-configuration-configuration-completion-gate-require-approval" autoComplete="off"
                type="checkbox"
                checked={configuration.completionGate.requireApproval}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    completionGate: {
                      ...configuration.completionGate,
                      requireApproval: event.target.checked,
                    },
                  })
                }
              />
              <span>{t("workflowConfig.requireApproval")}</span>
            </label>
            <label className="workflow-node-checkbox">
              <input name="workflow-template-node-configuration-configuration-skip-allowed" autoComplete="off"
                type="checkbox"
                checked={configuration.skip.allowed}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    skip: {
                      allowed: event.target.checked,
                      requireReason: event.target.checked
                        ? configuration.skip.requireReason
                        : false,
                    },
                  })
                }
              />
              <span>{t("workflowEditor.allowSkip")}</span>
            </label>
            <label className="workflow-node-checkbox">
              <input name="workflow-template-node-configuration-configuration-skip-require-reason" autoComplete="off"
                type="checkbox"
                disabled={!configuration.skip.allowed}
                checked={configuration.skip.requireReason}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    skip: {
                      ...configuration.skip,
                      requireReason: event.target.checked,
                    },
                  })
                }
              />
              <span>{t("workflowConfig.requireSkipReason")}</span>
            </label>
          </div>
          <label>
            <span>{t("workflowConfig.customGateId")}</span>
            <input spellCheck={false} name="workflow-template-node-configuration-configuration-completion-gate-custom-gate-id" autoComplete="off"
              value={configuration.completionGate.customGateId ?? ""}
              onChange={(event) =>
                setConfiguration({
                  ...configuration,
                  completionGate: {
                    ...configuration.completionGate,
                    customGateId: event.target.value || undefined,
                  },
                })
              }
            />
          </label>
          <div className="workflow-config-grid">
            <label>
              <span>{t("workflowConfig.maxAttempts")}</span>
              <input inputMode="numeric" name="workflow-template-node-configuration-configuration-retry-max-attempts" autoComplete="off"
                type="number"
                min={1}
                max={10}
                value={configuration.retry.maxAttempts}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    retry: {
                      ...configuration.retry,
                      maxAttempts: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              <span>{t("workflowConfig.backoff")}</span>
              <input inputMode="numeric" name="workflow-template-node-configuration-configuration-retry-backoff-ms" autoComplete="off"
                type="number"
                min={0}
                max={300000}
                step={100}
                value={configuration.retry.backoffMs}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    retry: {
                      ...configuration.retry,
                      backoffMs: Number(event.target.value),
                    },
                  })
                }
/>
            </label>
          </div>
        </fieldset>
        </ConfigurationScrollBody>

        {!readOnly && showActions ? (
          <ConfigurationActions embedded={embedded}>
            <button type="button" onClick={onClose}>
              {t("common.cancel")}
            </button>
            <button
              className="workflow-dialog-submit"
              type="submit"
              disabled={busy}
            >
              {t("workflowConfig.save")}
            </button>
          </ConfigurationActions>
        ) : null}
      </form>
    </ConfigurationLayer>
  );
});
