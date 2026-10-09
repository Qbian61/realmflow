import { PencilLine, Trash2 } from "lucide-react";
import type { CSSProperties } from "react";
import { Menu, MenuContent, MenuItem } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { WorkspaceNameDialogState } from "./WorkspaceNameDialog";

type RequirementActionsMenuProps = {
  spacePath: string;
  requirementId: string;
  requirementTitle: string;
  position?: CSSProperties;
  onOpenNameDialog: (dialog: WorkspaceNameDialogState) => void;
  onClose: () => void;
};

export function RequirementActionsMenu({
  spacePath,
  requirementId,
  requirementTitle,
  position,
  onOpenNameDialog,
  onClose,
}: RequirementActionsMenuProps): JSX.Element {
  const { t } = useLocalization();
  const openDialog = (
    kind: "rename-requirement" | "delete-requirement",
  ): void => {
    onOpenNameDialog({
      kind,
      spacePath,
      requirementId,
      requirementTitle,
    });
  };

  return (
    <Menu
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <MenuContent
        className="requirement-actions-menu"
        aria-label={t("requirement.itemActions", { name: requirementTitle })}
        style={position}
      >
        <MenuItem onSelect={() => openDialog("rename-requirement")}>
          <PencilLine size={16} />
          {t("requirement.rename")}
        </MenuItem>
        <MenuItem
          variant="danger"
          onSelect={() => openDialog("delete-requirement")}
        >
          <Trash2 size={16} />
          {t("requirement.delete")}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
