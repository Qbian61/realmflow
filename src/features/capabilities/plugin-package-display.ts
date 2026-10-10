import type { ToolCatalogPackageDto } from "../../../shared/tool-catalog";
import type { useLocalization } from "../../localization/LocalizationProvider";

export function pluginPackageDetails(
  item: ToolCatalogPackageDto,
  t: ReturnType<typeof useLocalization>["t"],
): string[] {
  if (!item.plugin) return [];
  const count = (kind: string): number =>
    item.plugin?.contributions.filter(
      (contribution) => contribution.kind === kind,
    ).length ?? 0;
  const providers =
    count("model_provider") +
    count("web_provider") +
    count("browser_provider") +
    count("media_provider");
  return [
    t("capabilities.plugin.contributions", {
      tools: count("tool"),
      skills: count("skill"),
      connectors: count("connector"),
      providers,
      hooks: count("hook"),
    }),
    t("capabilities.plugin.permissions", {
      count: item.plugin.permissions.capabilities.length,
      risk: item.plugin.permissions.maximumRisk,
    }),
    t("capabilities.plugin.sandboxes", {
      count: item.plugin.sandboxes.length,
    }),
    t("capabilities.plugin.dependencies", {
      count: item.plugin.dependencies.filter(({ required }) => required)
        .length,
    }),
  ];
}
