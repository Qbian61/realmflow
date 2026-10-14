import { File } from "lucide-react";
import type { KnowledgeRefreshPreset } from "../../../domain/knowledge-refresh";
import type { SpaceResource } from "../../domain/space-resource";
import {
  EmptyState,
  ListPagination,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  KnowledgeResourceRow,
  type RepositoryIndexStatusSummaryState,
} from "./KnowledgeResourceRow";
import { ResourceTypeFilterMenu } from "./ResourceTypeFilterMenu";
import type { ResourceTypeFilter } from "./resource-display-type";
import type { ResourceIndexHealthFilter } from "./resource-presentation";

type FilterOption<T extends string> = {
  value: T;
  label: string;
};

type SpaceKnowledgeResourceTableProps = {
  total: number;
  pageItems: readonly SpaceResource[];
  page: number;
  pageSize: number;
  resourceTypeOptions: ReadonlyArray<FilterOption<ResourceTypeFilter>>;
  resourceFilter: ResourceTypeFilter;
  resourceIndexOptions: ReadonlyArray<FilterOption<ResourceIndexHealthFilter>>;
  resourceIndexFilter: ResourceIndexHealthFilter;
  repositoryIndexStatusSummaries: Record<
    string,
    RepositoryIndexStatusSummaryState
  >;
  onPageChange: (page: number) => void;
  onResourceFilterChange: (value: ResourceTypeFilter) => void;
  onResourceIndexFilterChange: (value: ResourceIndexHealthFilter) => void;
  onOpen: (resource: SpaceResource) => Promise<void>;
  onSync: (resource: SpaceResource) => Promise<void>;
  onRefreshPolicyChange: (
    resource: SpaceResource,
    preset: KnowledgeRefreshPreset,
  ) => Promise<void>;
  onRemove: (resource: SpaceResource) => Promise<void>;
  onLoadRepositoryIndexStatusSummary: (resource: SpaceResource) => void;
};

export function SpaceKnowledgeResourceTable({
  total,
  pageItems,
  page,
  pageSize,
  resourceTypeOptions,
  resourceFilter,
  resourceIndexOptions,
  resourceIndexFilter,
  repositoryIndexStatusSummaries,
  onPageChange,
  onResourceFilterChange,
  onResourceIndexFilterChange,
  onOpen,
  onSync,
  onRefreshPolicyChange,
  onRemove,
  onLoadRepositoryIndexStatusSummary,
}: SpaceKnowledgeResourceTableProps): JSX.Element {
  const { t } = useLocalization();

  if (total === 0) {
    return (
      <EmptyState
        className="space-empty-block"
        icon={<File size={21} />}
        title={t("resources.empty")}
        description={t("resources.emptyDescription")}
      />
    );
  }

  return (
    <>
      <div className="space-resource-table" role="table">
        <div role="row">
          <span role="columnheader">{t("resources.column.name")}</span>
          <span className="space-resource-type-header" role="columnheader">
            <span>{t("resources.column.type")}</span>
            <ResourceTypeFilterMenu
              label={t("resources.typeFilterAria")}
              options={resourceTypeOptions}
              value={resourceFilter}
              onChange={onResourceFilterChange}
            />
          </span>
          <span className="space-resource-type-header" role="columnheader">
            <span>{t("resources.column.indexStatus")}</span>
            <ResourceTypeFilterMenu
              label={t("resources.indexFilterAria")}
              options={resourceIndexOptions}
              value={resourceIndexFilter}
              onChange={onResourceIndexFilterChange}
            />
          </span>
          <span aria-hidden="true" />
        </div>
        {pageItems.map((resource) => (
          <KnowledgeResourceRow
            key={resource.id}
            resource={resource}
            onOpen={onOpen}
            onSync={onSync}
            onRefreshPolicyChange={onRefreshPolicyChange}
            onRemove={onRemove}
            repositoryIndexStatusSummary={
              repositoryIndexStatusSummaries[resource.id]
            }
            onLoadRepositoryIndexStatusSummary={
              onLoadRepositoryIndexStatusSummary
            }
          />
        ))}
      </div>
      <ListPagination
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </>
  );
}
