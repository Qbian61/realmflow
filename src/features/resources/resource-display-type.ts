import type { SpaceResource } from "../../domain/space-resource";
import type { TranslationKey } from "../../localization/translate";

export type ResourceDisplayType =
  | "localFile"
  | "localReference"
  | "document"
  | "repository"
  | "remoteRepository";

export type ResourceTypeFilter = "all" | ResourceDisplayType;

export const resourceDisplayTypeLabelKeys = {
  localFile: "resources.type.localFile",
  localReference: "resources.type.localReference",
  document: "resources.type.document",
  repository: "resources.type.repository",
  remoteRepository: "resources.type.remoteRepository",
} as const satisfies Record<ResourceDisplayType, TranslationKey>;

export function getResourceDisplayType(
  resource: SpaceResource,
): ResourceDisplayType {
  if (resource.type === "file") {
    return resource.locator.startsWith("external:")
      ? "localReference"
      : "localFile";
  }
  if (resource.type === "repository") {
    return resource.repository?.mode === "remote" ||
      resource.locator.startsWith("connector:")
      ? "remoteRepository"
      : "repository";
  }
  return resource.type;
}
