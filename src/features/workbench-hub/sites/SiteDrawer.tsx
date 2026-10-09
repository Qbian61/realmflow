import { ImagePlus, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  WorkbenchSite,
  WorkbenchSiteGroup,
  WorkbenchSiteOpenMode,
} from "../../../../shared/workbench-sites";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  Field,
  IconButton,
} from "../../../components/ui";
import { useLocalization } from "../../../localization/LocalizationProvider";

export type SiteDraft = {
  name: string;
  url: string;
  groupId: string;
  openMode: WorkbenchSiteOpenMode;
};

export function SiteDrawer({
  groups,
  site,
  saving,
  onClose,
  onSave,
  onPickIcon,
}: {
  groups: WorkbenchSiteGroup[];
  site?: WorkbenchSite;
  saving: boolean;
  onClose: () => void;
  onSave: (draft: SiteDraft) => Promise<void>;
  onPickIcon: (site: WorkbenchSite) => Promise<void>;
}): JSX.Element {
  const { t } = useLocalization();
  const [draft, setDraft] = useState<SiteDraft>(() =>
    createDraft(site, groups),
  );

  useEffect(() => {
    setDraft(createDraft(site, groups));
  }, [groups, site]);

  const title = t(
    site ? "workbenchSites.editSite" : "workbenchSites.createSite",
  );
  return (
    <Drawer
      open
      size="default"
      className="workbench-site-drawer"
      aria-label={title}
      locked={saving}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft);
        }}
      >
        <DrawerHeader>
          <strong>{title}</strong>
          <IconButton
            type="button"
            size="compact"
            variant="ghost"
            aria-label={t("workbenchHub.close")}
            title={t("workbenchHub.close")}
            disabled={saving}
            onClick={onClose}
          >
            <X size={16} />
          </IconButton>
        </DrawerHeader>
        <DrawerBody>
          <Field name="workbench-sites-name" label={t("workbenchSites.name")}>
            <input
              required
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </Field>
          <Field name="workbench-sites-url" label={t("workbenchSites.url")}>
            <input
              required
              type="url"
              inputMode="url"
              value={draft.url}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  url: event.target.value,
                }))
              }
            />
          </Field>
          <Field name="workbench-sites-group" label={t("workbenchSites.group")}>
            <select
              value={draft.groupId}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  groupId: event.target.value,
                }))
              }
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </Field>
          <fieldset>
            <legend>{t("workbenchSites.openMode")}</legend>
            <label>
              <input autoComplete="off"
                type="radio"
                name="site-open-mode"
                checked={draft.openMode === "embedded"}
                onChange={() =>
                  setDraft((current) => ({
                    ...current,
                    openMode: "embedded",
                  }))
                }
              />
              {t("workbenchSites.openMode.embedded")}
            </label>
            <label>
              <input autoComplete="off"
                type="radio"
                name="site-open-mode"
                checked={draft.openMode === "external"}
                onChange={() =>
                  setDraft((current) => ({
                    ...current,
                    openMode: "external",
                  }))
                }
              />
              {t("workbenchSites.openMode.external")}
            </label>
          </fieldset>
          {site ? (
            <Button
              type="button"
              className="workbench-site-icon-picker"
              disabled={saving}
              leadingIcon={<ImagePlus size={15} />}
              onClick={() => void onPickIcon(site)}
            >
              {t("workbenchSites.pickIcon")}
            </Button>
          ) : null}
        </DrawerBody>
        <DrawerFooter>
          <Button type="button" onClick={onClose}>
            {t("workbenchSites.cancel")}
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {saving ? t("workbenchSites.saving") : t("workbenchSites.save")}
          </Button>
        </DrawerFooter>
      </form>
    </Drawer>
  );
}

function createDraft(
  site: WorkbenchSite | undefined,
  groups: WorkbenchSiteGroup[],
): SiteDraft {
  return {
    name: site?.name ?? "",
    url: site?.url ?? "https://",
    groupId: site?.groupId ?? groups[0]?.id ?? "",
    openMode: site?.openMode ?? "embedded",
  };
}
