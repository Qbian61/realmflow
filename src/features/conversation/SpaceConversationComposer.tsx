import { useState } from "react";
import { useModelProfiles } from "../../app/hooks/use-model-profiles";
import {
  Composer,
  type ComposerConnectorSelection,
  type ComposerSkillSelection,
  toConversationCapabilitySelection,
} from "../../components/Composer";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import type { ReasoningPreference } from "../../../domain/reasoning-router";
import type { ConversationCapabilitySelection } from "../../../shared/business";
import { useDefaultApprovalProfile } from "../permissions/use-default-approval-profile";

type SpaceConversationComposerProps = {
  spacePath: string;
  inputId: string;
  onCreateSession?: (
    spacePath: string,
    prompt: string,
    modelProfileId?: string,
    reasoningMode?: ReasoningPreference,
    attachments?: import("../../../shared/conversation-attachments").ConversationAttachmentSubmission,
    approvalProfileId?: import("../../../domain/approval-profile").ApprovalProfileId,
    capabilities?: ConversationCapabilitySelection,
  ) => void | Promise<void>;
};

export function SpaceConversationComposer({
  spacePath,
  inputId,
  onCreateSession,
}: SpaceConversationComposerProps): JSX.Element {
  const { t } = useLocalization();
  const toast = useToast();
  const [prompt, setPrompt] = useState("");
  const defaultApproval = useDefaultApprovalProfile();
  const [selectedApproval, setApprovalProfileId] = useState<import("../../../domain/approval-profile").ApprovalProfileId>();
  const approvalProfileId = selectedApproval ?? defaultApproval;
  const [submitting, setSubmitting] = useState(false);
  const [selectedSkill, setSelectedSkill] =
    useState<ComposerSkillSelection>();
  const [selectedConnector, setSelectedConnector] =
    useState<ComposerConnectorSelection>();
  const models = useModelProfiles();

  const submit = async (): Promise<void> => {
    const value = prompt.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      const capabilities = toConversationCapabilitySelection(
        selectedSkill,
        selectedConnector,
      );
      if (capabilities) {
        await onCreateSession?.(
          spacePath,
          value,
          models.selectedId || undefined,
          "auto",
          undefined,
          approvalProfileId,
          capabilities,
        );
      } else {
        await onCreateSession?.(
          spacePath,
          value,
          models.selectedId || undefined,
          "auto",
          undefined,
          approvalProfileId,
        );
      }
      setPrompt("");
      setSelectedSkill(undefined);
      setSelectedConnector(undefined);
    } catch {
      toast.error("spaceConversation.failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-chat" aria-label={t("spaceConversation.region")}>
      <Composer
        approvalProfileId={approvalProfileId}
        onApprovalProfileChange={setApprovalProfileId}
        value={prompt}
        placeholder={t("spaceConversation.placeholder")}
        labels={{
          textarea: t("spaceConversation.content"),
          model: t("spaceConversation.model"),
          workspace: t("chat.currentSpace"),
          permission: t("chat.spacePermission"),
          submit: t("spaceConversation.send"),
          menu: t("spaceConversation.addContent"),
          openMenu: t("spaceConversation.openAddMenu"),
          closeMenu: t("spaceConversation.closeAddMenu"),
        }}
        insertions={{
          mode: t("conversation.insertion.mode"),
          skill: t("conversation.insertion.skill"),
          connector: t("conversation.insertion.connector"),
        }}
        fileInputId={inputId}
        modelOptions={models.options}
        modelGroups={models.groups}
        modelProfileId={models.selectedId}
        effectiveModelProfileId={models.effectiveId}
        showContext={false}
        disabled={submitting}
        selectedSkill={selectedSkill}
        onSkillChange={setSelectedSkill}
        selectedConnector={selectedConnector}
        onConnectorChange={setSelectedConnector}
        onModelProfileChange={models.select}
        onModelPickerOpen={() => void models.refresh()}
        onChange={setPrompt}
        onSubmit={() => void submit()}
      />
    </section>
  );
}
