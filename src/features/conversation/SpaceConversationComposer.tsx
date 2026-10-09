import { useState } from "react";
import { useModelProfiles } from "../../app/hooks/use-model-profiles";
import { Composer } from "../../components/Composer";
import { useLocalization } from "../../localization/LocalizationProvider";
import { useToast } from "../toast/ToastProvider";
import type { ReasoningPreference } from "../../../domain/reasoning-router";

type SpaceConversationComposerProps = {
  spacePath: string;
  inputId: string;
  onCreateSession?: (
    spacePath: string,
    prompt: string,
    modelProfileId?: string,
    reasoningMode?: ReasoningPreference,
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
  const [submitting, setSubmitting] = useState(false);
  const [reasoningMode, setReasoningMode] =
    useState<ReasoningPreference>("auto");
  const models = useModelProfiles();

  const submit = async (): Promise<void> => {
    const value = prompt.trim();
    if (!value || submitting) return;
    setSubmitting(true);
    try {
      await onCreateSession?.(
        spacePath,
        value,
        models.selectedId || undefined,
        reasoningMode,
      );
      setPrompt("");
    } catch {
      toast.error("spaceConversation.failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-chat" aria-label={t("spaceConversation.region")}>
      <Composer
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
        reasoningMode={reasoningMode}
        reasoningSupported={models.reasoningSupported}
        showContext={false}
        disabled={submitting}
        onModelProfileChange={models.select}
        onModelPickerOpen={() => void models.refresh()}
        onReasoningModeChange={setReasoningMode}
        onChange={setPrompt}
        onSubmit={() => void submit()}
      />
    </section>
  );
}
