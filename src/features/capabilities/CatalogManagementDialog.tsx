import { X } from "lucide-react";
import { useState } from "react";
import type {
  ChangeExtensionPackageVersionCommand,
  ToolCatalogActivationCommand,
  ToolCatalogDto,
  ToolCatalogSourceType,
} from "../../../shared/tool-catalog";
import {
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
  Tab,
  TabList,
  Tabs,
} from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import { ToolCatalogPanel } from "./ToolCatalogPanel";

type CatalogView = "primitive" | "model-facing" | "directory";

export function CatalogManagementDialog({
  open,
  catalog,
  loading,
  busyTarget,
  importing,
  onOpenChange,
  onCatalogViewChange,
  onToggle,
  onChangePackageVersion,
  onImport,
}: {
  open: boolean;
  catalog: ToolCatalogDto;
  loading: boolean;
  busyTarget?: string;
  importing?: ToolCatalogSourceType;
  onOpenChange: (open: boolean) => void;
  onCatalogViewChange: (view: CatalogView) => void;
  onToggle: (command: ToolCatalogActivationCommand) => void;
  onChangePackageVersion: (
    command: ChangeExtensionPackageVersionCommand,
  ) => void;
  onImport: (sourceType: ToolCatalogSourceType) => void;
}): JSX.Element {
  const { t } = useLocalization();
  const [tab, setTab] = useState<"tools" | "skills">("tools");
  const [view, setView] = useState<CatalogView>("primitive");

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="workspace"
      className="catalog-management-dialog"
      aria-labelledby="catalog-management-title"
    >
      <DialogHeader>
        <div>
          <h2 id="catalog-management-title">
            {t("capabilities.catalogManagement.title")}
          </h2>
          <p>{t("capabilities.catalogManagement.description")}</p>
        </div>
        <IconButton
          size="compact"
          variant="ghost"
          title={t("common.close")}
          aria-label={t("common.close")}
          onClick={() => onOpenChange(false)}
        >
          <X size={15} aria-hidden="true" />
        </IconButton>
      </DialogHeader>
      <DialogBody>
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabList aria-label={t("capabilities.catalogManagement.tabs")}>
            <Tab value="tools">{t("capabilities.tab.tools")}</Tab>
            <Tab value="skills">{t("capabilities.tab.skills")}</Tab>
          </TabList>
        </Tabs>
        <ToolCatalogPanel
          activeTab={tab}
          catalog={catalog}
          catalogView={view}
          loading={loading}
          busyTarget={busyTarget}
          importing={importing}
          onCatalogViewChange={(next) => {
            setView(next);
            onCatalogViewChange(next);
          }}
          onToggle={onToggle}
          onChangePackageVersion={onChangePackageVersion}
          onImport={onImport}
        />
      </DialogBody>
    </Dialog>
  );
}
