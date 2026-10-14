import {
  BookOpen,
  FileArchive,
  FileCode2,
  FileImage,
  FileText,
  type LucideIcon,
} from "lucide-react";
import type { RepositorySnapshotViewDto } from "../../../shared/business";
import type { SpaceResource } from "../../domain/space-resource";
import type { TranslationKey } from "../../localization/translate";

export type ResourceIndexHealth = NonNullable<SpaceResource["index"]>["health"];
export type ResourceIndexHealthFilter = "all" | ResourceIndexHealth;
export type RepositoryIndexStatus =
  | "pending"
  | "indexing"
  | "indexed"
  | "failed"
  | "skipped";
export type RepositoryIndexStatusCounts = Partial<
  Record<RepositoryIndexStatus, number>
>;

export const resourceIndexHealthLabelKeys = {
  missing: "resources.index.missing",
  building: "resources.index.building",
  ready: "resources.index.ready",
  failed: "resources.index.failed",
} as const satisfies Record<ResourceIndexHealth, TranslationKey>;

export const repositoryIndexStatusLabelKeys = {
  pending: "resources.repositoryPreview.pending",
  indexing: "resources.repositoryPreview.indexing",
  indexed: "resources.repositoryPreview.indexed",
  failed: "resources.repositoryPreview.failed",
  skipped: "resources.repositoryPreview.skipped",
} as const satisfies Record<RepositoryIndexStatus, TranslationKey>;

const resourceIndexErrorLabelKeys: Record<string, TranslationKey> = {
  extraction_encrypted: "resources.indexError.encrypted",
  extraction_invalid: "resources.indexError.invalid",
  extraction_limit_exceeded: "resources.indexError.limitExceeded",
  extraction_ocr_failed: "resources.indexError.ocrFailed",
  extraction_ocr_required: "resources.indexError.ocrRequired",
  extraction_converter_unavailable:
    "resources.indexError.converterUnavailable",
  extraction_archive_unsafe: "resources.indexError.archiveUnsafe",
  extraction_empty: "resources.indexError.empty",
  extraction_interrupted: "resources.indexError.interrupted",
  source_changed_during_extraction: "resources.indexError.sourceChanged",
  extraction_unsupported: "resources.indexError.unsupported",
  unsupported_format: "resources.indexError.unsupported",
  permission_denied: "resources.indexError.permissionDenied",
  source_unavailable: "resources.indexError.sourceUnavailable",
  connector_unavailable: "resources.indexError.connectorUnavailable",
  indexing_failed: "resources.indexError.generic",
};

export function getResourceIndexErrorLabelKey(
  resource: SpaceResource,
): TranslationKey | undefined {
  const errorCode = resource.index?.errorCode ?? resource.errorCode;
  if (!errorCode) return undefined;
  return (
    resourceIndexErrorLabelKeys[errorCode] ?? "resources.indexError.generic"
  );
}

export function getResourceIcon(resource: SpaceResource): LucideIcon {
  if (resource.type === "document") return BookOpen;
  if (resource.type === "repository") return FileCode2;
  const name = resource.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(name)) return FileImage;
  if (/\.(zip|tar|gz|rar|7z)$/.test(name)) return FileArchive;
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|json|css|html|md)$/.test(name)) {
    return FileCode2;
  }
  return FileText;
}

export function getResourceIndexHealth(
  resource: SpaceResource,
): ResourceIndexHealth {
  return resource.index?.health ?? "missing";
}

export function summarizeRepositoryIndexStatusCounts(
  view: RepositorySnapshotViewDto,
): RepositoryIndexStatusCounts {
  const counts: RepositoryIndexStatusCounts = {};
  for (const file of view.snapshot?.files ?? []) {
    incrementRepositoryIndexStatusCount(
      counts,
      file.indexStatus?.status ?? "pending",
    );
  }
  for (const file of view.snapshot?.skippedFiles ?? []) {
    incrementRepositoryIndexStatusCount(counts, "skipped");
  }
  return counts;
}

function incrementRepositoryIndexStatusCount(
  counts: RepositoryIndexStatusCounts,
  status: RepositoryIndexStatus,
): void {
  counts[status] = (counts[status] ?? 0) + 1;
}
