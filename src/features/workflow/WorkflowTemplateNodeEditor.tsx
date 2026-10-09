import { useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import type {
  BusinessApi,
  WorkflowTemplateDraftDto,
  WorkflowTemplateNodeDto,
} from "../../../shared/business";
import {
  Button,
  ConfirmDialog,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Field,
  IconButton,
  Tab,
  TabList,
  Tabs,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { Translator } from "../../localization/translate";
import { useToast } from "../toast/ToastProvider";
import { WorkflowTemplateEdgeEditor } from "./WorkflowTemplateEdgeEditor";
import { WorkflowTemplateNodeConfiguration } from "./WorkflowTemplateNodeConfiguration";

type NodeFormState =
  | {
      mode: "add" | "copy" | "edit";
      nodeId?: string;
      stableKey: string;
      type: WorkflowTemplateNodeDto["type"];
      name: string;
      description: string;
      allowSkip: boolean;
    }
  | undefined;

type Props = {
  business: BusinessApi;
  initialTemplate: WorkflowTemplateDraftDto;
  onChange: (template: WorkflowTemplateDraftDto) => void;
  onClose: () => void;
};

export function WorkflowTemplateNodeEditor({
  business,
  initialTemplate,
  onChange,
  onClose,
}: Props): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [template, setTemplate] = useState(initialTemplate);
  const [view, setView] = useState<"nodes" | "edges">("nodes");
  const [form, setForm] = useState<NodeFormState>();
  const [configurationNodeId, setConfigurationNodeId] = useState<string>();
  const [pendingDeleteNode, setPendingDeleteNode] =
    useState<WorkflowTemplateNodeDto>();
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);

  function apply(next: WorkflowTemplateDraftDto): void {
    setTemplate(next);
    setForm(undefined);
    onChange(next);
  }

  async function submitNode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!form) return;
    setBusy(true);
    try {
      const saved =
        form.mode === "add"
          ? await business.addWorkflowTemplateNode({
              id: template.id,
              expectedRevision: template.revision,
              node: {
                stableKey: form.stableKey,
                type: form.type,
                name: form.name,
                description: form.description,
                allowSkip: form.allowSkip,
              },
            })
          : form.mode === "copy"
            ? await business.copyWorkflowTemplateNode({
                id: template.id,
                expectedRevision: template.revision,
                sourceNodeId: form.nodeId!,
                stableKey: form.stableKey,
                name: form.name,
              })
            : await business.updateWorkflowTemplateNode({
                id: template.id,
                expectedRevision: template.revision,
                nodeId: form.nodeId!,
                type: form.type,
                name: form.name,
                description: form.description,
                allowSkip: form.allowSkip,
              });
      apply(saved);
    } catch {
      toast.error("workflowEditor.nodeSaveFailed");
    } finally {
      setBusy(false);
    }
  }

  async function removeNode(): Promise<void> {
    if (!pendingDeleteNode) return;
    const node = pendingDeleteNode;
    setBusy(true);
    setDeleteError("");
    try {
      apply(
        await business.removeWorkflowTemplateNode({
          id: template.id,
          expectedRevision: template.revision,
          nodeId: node.id,
        }),
      );
      setPendingDeleteNode(undefined);
    } catch {
      setDeleteError(t("workflowEditor.nodeDeleteFailed"));
      toast.error("workflowEditor.nodeDeleteFailed");
    } finally {
      setBusy(false);
    }
  }

  async function moveNode(nodeId: string, offset: -1 | 1): Promise<void> {
    const nodes = [...template.currentVersion.nodes].sort(
      (left, right) => left.order - right.order,
    );
    const index = nodes.findIndex((node) => node.id === nodeId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= nodes.length) return;
    [nodes[index], nodes[target]] = [nodes[target], nodes[index]];
    setBusy(true);
    try {
      apply(
        await business.reorderWorkflowTemplateNodes({
          id: template.id,
          expectedRevision: template.revision,
          orderedNodeIds: nodes.map((node) => node.id),
        }),
      );
    } catch {
      toast.error("workflowEditor.nodeReorderFailed");
    } finally {
      setBusy(false);
    }
  }

  const nodes = template.currentVersion.nodes
    .slice()
    .sort((left, right) => left.order - right.order);

  return (
    <>
      <Dialog
        open
        size="workspace"
        className="workflow-template-dialog workflow-node-dialog"
        aria-label={t("workflowEditor.editorAria", { name: template.name })}
        locked={
          busy ||
          Boolean(form) ||
          Boolean(configurationNodeId) ||
          Boolean(pendingDeleteNode)
        }
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogHeader>
          <div>
            <h2>{template.name}</h2>
            <span>
              {t("workflowEditor.definition", {
                version: template.currentVersion.version,
              })}
            </span>
          </div>
          <IconButton
            aria-label={t("workflowEditor.closeEditor")}
            title={t("common.close")}
            variant="ghost"
            size="compact"
            onClick={onClose}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody className="workflow-node-dialog__body">
          <Tabs
            className="workflow-editor-tabs"
            variant="segmented"
            value={view}
            onValueChange={(value) => setView(value as "nodes" | "edges")}
          >
            <TabList
              aria-label={t("workflowEditor.definition", {
                version: template.currentVersion.version,
              })}
            >
              <Tab value="nodes">{t("workflowEditor.nodes")}</Tab>
              <Tab value="edges">{t("workflowEditor.edges")}</Tab>
            </TabList>
          </Tabs>
          {view === "nodes" ? (
            <>
              <div className="workflow-node-toolbar">
                <span>
                  {t("workflowEditor.nodeCount", { count: nodes.length })}
                </span>
                <Button
                  variant="primary"
                  size="compact"
                  leadingIcon={<Plus size={15} />}
                  onClick={() =>
                    setForm({
                      mode: "add",
                      stableKey: "",
                      type: "ai_generate",
                      name: "",
                      description: "",
                      allowSkip: false,
                    })
                  }
                >
                  {t("workflowEditor.addNode")}
                </Button>
              </div>
              <div className="workflow-node-list">
                {nodes.map((node, index) => (
                  <div className="workflow-node-row" key={node.id}>
                    <span className="workflow-node-order">{index + 1}</span>
                    <div>
                      <strong>{node.name}</strong>
                      <span>
                        {node.stableKey} · {nodeTypeLabel(node.type, t)}
                      </span>
                    </div>
                    <div className="workflow-template-actions">
                      <button
                        type="button"
                        aria-label={t("workflowEditor.moveUpAria", {
                          name: node.name,
                        })}
                        title={t("workflowEditor.moveUp")}
                        disabled={index === 0 || busy}
                        onClick={() => void moveNode(node.id, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("workflowEditor.moveDownAria", {
                          name: node.name,
                        })}
                        title={t("workflowEditor.moveDown")}
                        disabled={index === nodes.length - 1 || busy}
                        onClick={() => void moveNode(node.id, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("workflowEditor.copyNodeAria", {
                          name: node.name,
                        })}
                        title={t("workflowEditor.copyNode")}
                        disabled={busy}
                        onClick={() =>
                          setForm({
                            mode: "copy",
                            nodeId: node.id,
                            stableKey: `${node.stableKey}-copy`,
                            type: node.type,
                            name: t("workflowEditor.copyName", {
                              name: node.name,
                            }),
                            description: node.description,
                            allowSkip: node.allowSkip,
                          })
                        }
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("workflowEditor.configureNodeAria", {
                          name: node.name,
                        })}
                        title={t("workflowEditor.configure")}
                        disabled={busy}
                        onClick={() => setConfigurationNodeId(node.id)}
                      >
                        <Settings2 size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("workflowEditor.editNodeAria", {
                          name: node.name,
                        })}
                        title={t("workflowEditor.edit")}
                        disabled={busy}
                        onClick={() =>
                          setForm({
                            mode: "edit",
                            nodeId: node.id,
                            stableKey: node.stableKey,
                            type: node.type,
                            name: node.name,
                            description: node.description,
                            allowSkip: node.allowSkip,
                          })
                        }
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={t("workflowEditor.deleteNodeAria", {
                          name: node.name,
                        })}
                        title={t("workflowEditor.delete")}
                        disabled={busy}
                        onClick={() => {
                          setDeleteError("");
                          setPendingDeleteNode(node);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
                {nodes.length === 0 ? (
                  <p className="workflow-template-empty">
                    {t("workflowEditor.emptyNodes")}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <WorkflowTemplateEdgeEditor
              business={business}
              template={template}
              onChange={apply}
            />
          )}
        </DialogBody>
      </Dialog>
      {view === "nodes" && form ? (
        <NodeForm
          state={form}
          busy={busy}
          onChange={setForm}
          onCancel={() => setForm(undefined)}
          onSubmit={submitNode}
        />
      ) : null}
      {configurationNodeId ? (
        <WorkflowTemplateNodeConfiguration
          business={business}
          template={template}
          node={template.currentVersion.nodes.find(
            (node) => node.id === configurationNodeId,
          )!}
          onChange={apply}
          onClose={() => setConfigurationNodeId(undefined)}
        />
      ) : null}
      <ConfirmDialog
        open={pendingDeleteNode !== undefined}
        title={t("workflowEditor.delete")}
        description={
          pendingDeleteNode
            ? t("workflowEditor.nodeDeleteConfirm", {
                name: pendingDeleteNode.name,
              })
            : ""
        }
        confirmLabel={t("workflowEditor.delete")}
        cancelLabel={t("common.cancel")}
        pending={busy}
        error={deleteError}
        onCancel={() => {
          setDeleteError("");
          setPendingDeleteNode(undefined);
        }}
        onConfirm={removeNode}
      />
    </>
  );
}

function NodeForm({
  state,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: Exclude<NodeFormState, undefined>;
  busy: boolean;
  onChange: (state: Exclude<NodeFormState, undefined>) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}): JSX.Element {
  const { t } = useLocalization();
  const ariaLabel =
    state.mode === "add"
      ? t("workflowEditor.form.add")
      : state.mode === "copy"
        ? t("workflowEditor.form.copy")
        : t("workflowEditor.form.edit");

  return (
    <Dialog
      open
      size="default"
      className="workflow-template-dialog workflow-node-form-dialog"
      backdropClassName="workflow-node-form-layer"
      aria-label={ariaLabel}
      locked={busy}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <form
        className="workflow-node-form"
        onSubmit={onSubmit}
      >
        <DialogHeader>
          <h2>
            {state.mode === "add"
              ? t("workflowEditor.addNode")
              : state.mode === "copy"
                ? t("workflowEditor.copyNode")
                : t("workflowEditor.edit")}
          </h2>
          <IconButton
            aria-label={t("workflowEditor.closeForm")}
            title={t("common.close")}
            variant="ghost"
            size="compact"
            onClick={onCancel}
          >
            <X size={17} />
          </IconButton>
        </DialogHeader>
        <DialogBody className="workflow-node-form__body">
          <Field name="workflow-editor-stable-key" label={t("workflowEditor.stableKey")}>
            <input spellCheck={false}
              required
              maxLength={80}
              pattern="[A-Za-z0-9_-]+"
              disabled={state.mode === "edit"}
              value={state.stableKey}
              onChange={(event) =>
                onChange({ ...state, stableKey: event.target.value })
              }
            />
          </Field>
          <Field name="workflow-editor-node-name" label={t("workflowEditor.nodeName")}>
            <input
              data-autofocus
              required
              maxLength={160}
              value={state.name}
              onChange={(event) =>
                onChange({ ...state, name: event.target.value })
              }
            />
          </Field>
          <Field name="workflow-editor-node-type" label={t("workflowEditor.nodeType")}>
            <select
              value={state.type}
              onChange={(event) =>
                onChange({
                  ...state,
                  type: event.target.value as WorkflowTemplateNodeDto["type"],
                })
              }
            >
              <option value="ai_generate">
                {t("workflowEditor.type.ai_generate")}
              </option>
              <option value="human_input">
                {t("workflowEditor.type.human_input")}
              </option>
              <option value="tool">{t("workflowEditor.type.tool")}</option>
              <option value="approval">
                {t("workflowEditor.type.approval")}
              </option>
            </select>
          </Field>
          <Field name="workflow-editor-node-description" label={t("workflowEditor.nodeDescription")}>
            <textarea
              maxLength={4000}
              rows={3}
              value={state.description}
              onChange={(event) =>
                onChange({ ...state, description: event.target.value })
              }
            />
          </Field>
          <label className="workflow-node-checkbox">
            <input name="workflow-template-node-editor-state-allow-skip" autoComplete="off"
              type="checkbox"
              checked={state.allowSkip}
              onChange={(event) =>
                onChange({ ...state, allowSkip: event.target.checked })
              }
            />
            <span>{t("workflowEditor.allowSkip")}</span>
          </label>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={busy}
            disabled={!state.stableKey.trim() || !state.name.trim() || busy}
          >
            {state.mode === "add"
              ? t("workflowEditor.createNode")
              : state.mode === "copy"
                ? t("workflowEditor.copyNode")
                : t("workflowEditor.saveNode")}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function nodeTypeLabel(
  type: WorkflowTemplateNodeDto["type"],
  t: Translator,
): string {
  return t(`workflowEditor.type.${type}`);
}
