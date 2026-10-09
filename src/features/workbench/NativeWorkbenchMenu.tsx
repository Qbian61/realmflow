import {
  FileText,
  FolderOpen,
  Globe2,
  Search,
  SquareTerminal,
} from "lucide-react";
import { useState } from "react";
import type { WorkbenchActionId } from "../../../shared/native-overlay";
import { Menu, MenuContent, MenuItem, MenuSeparator } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import type { TranslationKey } from "../../localization/translate";
import "./native-workbench-menu.css";

type NativeWorkbenchMenuProps = {
  onAction: (action: WorkbenchActionId) => void;
  onClose: () => void;
};

const actions = [
  { id: "files", labelKey: "workbench.files", icon: FileText },
  { id: "folder", labelKey: "workbench.folder", icon: FolderOpen },
  { id: "browser", labelKey: "workbench.browser", icon: Globe2 },
  { id: "terminal", labelKey: "workbench.terminal", icon: SquareTerminal },
] satisfies Array<{
  id: WorkbenchActionId;
  labelKey: TranslationKey;
  icon: typeof FileText;
}>;

export function NativeWorkbenchMenu({
  onAction,
  onClose,
}: NativeWorkbenchMenuProps): JSX.Element {
  const { t } = useLocalization();
  const [query, setQuery] = useState("");
  const localizedActions = actions.map((action) => ({
    ...action,
    label: t(action.labelKey),
  }));
  const filteredActions = localizedActions.filter((action) =>
    action.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  return (
    <Menu
      open
      onOpenChange={onClose}
      autoFocusItems={false}
      dismissOnOutsidePointer={false}
    >
      <MenuContent
        className="native-workbench-menu"
        aria-label={t("workbench.addContent")}
      >
        <label>
          <Search size={17} />
          <input name="workbench-search-aria" autoComplete="off"
            autoFocus
            type="search"
            aria-label={t("workbench.searchAria")}
            placeholder={t("workbench.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘P</kbd>
        </label>
        <MenuSeparator className="native-workbench-menu-divider" />
        {filteredActions.map((action) => {
          const Icon = action.icon;
          return (
            <MenuItem
              key={action.id}
              onSelect={() => onAction(action.id)}
            >
              <Icon size={17} />
              <span>{action.label}</span>
            </MenuItem>
          );
        })}
      </MenuContent>
    </Menu>
  );
}
