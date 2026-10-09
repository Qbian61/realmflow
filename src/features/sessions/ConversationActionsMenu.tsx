import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { PencilLine, Trash2 } from "lucide-react";
import { Menu, MenuContent, MenuItem } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";

type ConversationActionsMenuProps = {
  anchor: HTMLButtonElement;
  sessionTitle: string;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
};

export function ConversationActionsMenu({
  anchor,
  sessionTitle,
  onRename,
  onDelete,
  onClose,
}: ConversationActionsMenuProps): JSX.Element {
  const { t } = useLocalization();
  const menuRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      const bounds = anchor.getBoundingClientRect();
      const width = 160;
      setStyle({
        position: "fixed",
        top: Math.min(bounds.bottom + 4, window.innerHeight - 88),
        left: Math.max(8, Math.min(bounds.right - width, window.innerWidth - width - 8)),
        width,
        visibility: "visible",
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor]);

  return createPortal(
    <Menu open trigger={anchor} onOpenChange={(open) => !open && onClose()}>
      <MenuContent
        ref={menuRef}
        size="compact"
        className="recent-session-actions-menu"
        aria-label={t("recent.actions.menu", { name: sessionTitle })}
        style={style}
      >
        <MenuItem onSelect={onRename}>
          <PencilLine size={15} />
          <span>{t("recent.actions.rename")}</span>
        </MenuItem>
        <MenuItem variant="danger" onSelect={onDelete}>
          <Trash2 size={15} />
          <span>{t("recent.actions.delete")}</span>
        </MenuItem>
      </MenuContent>
    </Menu>,
    document.body,
  );
}
