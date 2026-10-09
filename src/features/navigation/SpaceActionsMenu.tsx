import { FilePlus2, FolderSearch, PencilLine, Trash2 } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuSeparator } from "../../components/ui";
import type { WorkspaceSpace } from "../../domain/workspace";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { WorkspaceNameDialogState } from "./WorkspaceNameDialog";

type SpaceActionsMenuProps = {
  space: WorkspaceSpace;
  position: { top: number; right: number } | null;
  onOpenNameDialog: (dialog: WorkspaceNameDialogState) => void;
  onRelocate: () => void;
  onClose: () => void;
};

export function SpaceActionsMenu({
  space,
  position,
  onOpenNameDialog,
  onRelocate,
  onClose,
}: SpaceActionsMenuProps): JSX.Element {
  const { t } = useLocalization();

  return (
    <Menu
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <MenuContent
        className="space-item-actions-menu"
        aria-label={t("workspace.itemActions", { name: space.label })}
        style={position ?? undefined}
      >
        <div className="space-item-actions-group">
          <MenuItem
            onSelect={() =>
              onOpenNameDialog({
                kind: "requirement",
                spacePath: space.path,
                spaceLabel: space.label,
              })
            }
          >
            <FilePlus2 size={16} />
            <span>{t("workspace.createRequirement")}</span>
          </MenuItem>
        </div>
        <MenuSeparator />
        <div className="space-item-actions-group">
          <MenuItem
            onSelect={() =>
              onOpenNameDialog({
                kind: "rename-space",
                spacePath: space.path,
                spaceLabel: space.label,
              })
            }
          >
            <PencilLine size={16} />
            <span>{t("workspace.rename")}</span>
          </MenuItem>
          <MenuItem onSelect={onRelocate}>
            <FolderSearch size={16} />
            <span>{t("workspace.relocate")}</span>
          </MenuItem>
          <MenuItem
            variant="danger"
            onSelect={() =>
            onOpenNameDialog({
              kind: "delete-space",
              spacePath: space.path,
              spaceLabel: space.label,
            })
          }
          >
            <Trash2 size={16} />
            <span>{t("workspace.delete")}</span>
          </MenuItem>
        </div>
      </MenuContent>
    </Menu>
  );
}
