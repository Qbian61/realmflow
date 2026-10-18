import { NavLink } from "react-router-dom";
import { useLocalization } from "../../localization/LocalizationProvider";
import { getPrimaryNavigation } from "../../navigation";

export function WorkspacePrimaryNavigation(): JSX.Element {
  const { t } = useLocalization();
  const navigation = getPrimaryNavigation(t);

  return (
    <nav
      className="sidebar-primary-navigation"
      aria-label={t("workspace.mainNavigation")}
    >
      {navigation.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            [
              "nav-item",
              "ui-button",
              "ui-button--neutral",
              "ui-button--comfortable",
              "sidebar-new-chat",
              isActive ? "active" : undefined,
            ]
              .filter(Boolean)
              .join(" ")
          }
        >
          <Icon size={18} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
