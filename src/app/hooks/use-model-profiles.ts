import { useCallback, useEffect, useMemo, useState } from "react";
import type { RevisionedApplicationModelDefault } from "../../../domain/model";
import type { ModelSelectorGroup } from "../../features/conversation/ModelSelector";
import { useLocalization } from "../../localization/LocalizationProvider";

export function useModelProfiles(initialSelectedId = ""): {
  options: Array<{ value: string; label: string }>;
  groups: ModelSelectorGroup[];
  selectedId: string;
  effectiveId?: string;
  reasoningSupported?: boolean;
  loading: boolean;
  select: (id: string) => void;
  refresh: () => Promise<void>;
} {
  const { t } = useLocalization();
  const [groups, setGroups] = useState<ModelSelectorGroup[]>([]);
  const [selectedId, select] = useState(initialSelectedId);
  const [preference, setPreference] =
    useState<RevisionedApplicationModelDefault>({
      mode: "auto",
      revision: 0,
    });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    const business = window.realmflow?.business;
    if (!business?.listEffectiveModels) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [snapshot, nextPreference] = await Promise.all([
        business.listEffectiveModels(),
        business.getApplicationModelDefault?.() ??
          Promise.resolve({ mode: "auto" as const, revision: 0 }),
      ]);
      setGroups(
        snapshot.groups
          .filter((group) => group.readiness === "ready")
          .map((group) => ({
            providerId: group.providerId,
            providerName: group.providerName,
            models: group.models.map((model) => ({
              value: model.profileId,
              label: model.displayName,
              reasoningSupported: model.reasoningSupported,
            })),
          }))
          .filter((group) => group.models.length > 0),
      );
      setPreference(nextPreference);
    } catch {
      // Keep the last usable snapshot when a refresh fails.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    select(initialSelectedId);
  }, [initialSelectedId]);

  const options = useMemo(
    () => [
      { value: "", label: t("model.autoSelect") },
      ...groups.flatMap((group) => group.models),
    ],
    [groups, t],
  );
  const availableIds = new Set(options.map((option) => option.value));
  const effectiveId =
    selectedId && availableIds.has(selectedId)
      ? selectedId
      : preference.mode === "profile" &&
          availableIds.has(preference.profileId)
        ? preference.profileId
        : groups[0]?.models[0]?.value;
  const reasoningSupported = groups
    .flatMap((group) => group.models)
    .find((model) => model.value === effectiveId)?.reasoningSupported;

  return {
    options,
    groups,
    selectedId,
    effectiveId,
    reasoningSupported,
    loading,
    select,
    refresh,
  };
}
