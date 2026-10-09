import { useEffect, useRef, useState, type FormEvent } from "react";
import type { WorkflowNodeConfiguration } from "../../../domain/workflow";
import type {
  BusinessApi,
  WorkflowTemplateDraftDto,
  WorkflowTemplateNodeDto,
} from "../../../shared/business";
import {
  initialWorkflowNodeConfiguration,
  splitConfigurationList,
  workflowNodeConfigurationValue,
} from "./workflow-node-configuration-model";

type Options = {
  business: BusinessApi;
  template: WorkflowTemplateDraftDto;
  node: WorkflowTemplateNodeDto;
  embedded: boolean;
  saveFailedMessage: string;
  onSave?: (configuration: WorkflowNodeConfiguration) => Promise<boolean>;
  onChange: (template: WorkflowTemplateDraftDto) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function useWorkflowNodeConfigurationDraft(options: Options) {
  const initialAttachments =
    workflowNodeConfigurationValue(options.node).input.attachments.join("\n");
  const [configuration, setConfiguration] = useState(() =>
    initialWorkflowNodeConfiguration(options.node),
  );
  const [listInputs, setListInputs] = useState(() => ({
    attachments: initialAttachments,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const baselineRef = useRef(
    serializeConfiguration(
      initialWorkflowNodeConfiguration(options.node),
      initialAttachments,
    ),
  );
  const dirty =
    serializeConfiguration(configuration, listInputs.attachments) !==
    baselineRef.current;

  useEffect(() => {
    options.onDirtyChange?.(dirty);
  }, [dirty, options.onDirtyChange]);

  async function save(): Promise<boolean> {
    if (!formRef.current?.reportValidity()) return false;
    setBusy(true);
    setError("");
    try {
      const submitted = configurationWithAttachments(
        configuration,
        listInputs.attachments,
      );
      if (options.onSave) {
        if (!(await options.onSave(submitted))) return false;
      } else {
        options.onChange(
          await options.business.configureWorkflowTemplateNode({
            id: options.template.id,
            expectedRevision: options.template.revision,
            nodeId: options.node.id,
            configuration: submitted,
          }),
        );
      }
      baselineRef.current = serializeConfiguration(
        configuration,
        listInputs.attachments,
      );
      options.onDirtyChange?.(false);
      if (!options.embedded) options.onClose();
      return true;
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : options.saveFailedMessage,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  function discard(): void {
    const initial = initialWorkflowNodeConfiguration(options.node);
    const attachments =
      workflowNodeConfigurationValue(options.node).input.attachments.join("\n");
    setConfiguration(initial);
    setListInputs({ attachments });
    baselineRef.current = serializeConfiguration(initial, attachments);
    setError("");
    options.onDirtyChange?.(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await save();
  }

  return {
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
    recoveryText: JSON.stringify(
      configurationWithAttachments(configuration, listInputs.attachments),
      null,
      2,
    ),
  };
}

function configurationWithAttachments(
  configuration: WorkflowNodeConfiguration,
  attachments: string,
): WorkflowNodeConfiguration {
  return {
    ...configuration,
    input: {
      ...configuration.input,
      attachments: splitConfigurationList(attachments),
    },
    connectorIds: configuration.connectorIds,
  };
}

function serializeConfiguration(
  configuration: WorkflowNodeConfiguration,
  attachments: string,
): string {
  return JSON.stringify(
    configurationWithAttachments(configuration, attachments),
  );
}
