import type { Translator } from "../../localization/translate";
import {
  resourceDisplayTypeLabelKeys,
  type ResourceTypeFilter,
} from "./resource-display-type";
import {
  resourceIndexHealthLabelKeys,
  type ResourceIndexHealthFilter,
} from "./resource-presentation";

export function spaceResourceTypeOptions(
  t: Translator,
): ReadonlyArray<{ value: ResourceTypeFilter; label: string }> {
  return [
    { value: "all", label: t("resources.type.all") },
    { value: "localFile", label: t(resourceDisplayTypeLabelKeys.localFile) },
    {
      value: "localReference",
      label: t(resourceDisplayTypeLabelKeys.localReference),
    },
    { value: "document", label: t(resourceDisplayTypeLabelKeys.document) },
    {
      value: "repository",
      label: t(resourceDisplayTypeLabelKeys.repository),
    },
    {
      value: "remoteRepository",
      label: t(resourceDisplayTypeLabelKeys.remoteRepository),
    },
  ];
}

export function spaceResourceIndexOptions(
  t: Translator,
): ReadonlyArray<{ value: ResourceIndexHealthFilter; label: string }> {
  return [
    { value: "all", label: t("resources.index.all") },
    { value: "missing", label: t(resourceIndexHealthLabelKeys.missing) },
    { value: "building", label: t(resourceIndexHealthLabelKeys.building) },
    { value: "ready", label: t(resourceIndexHealthLabelKeys.ready) },
    { value: "failed", label: t(resourceIndexHealthLabelKeys.failed) },
  ];
}
