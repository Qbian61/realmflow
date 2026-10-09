import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useLocalization } from "../../localization/LocalizationProvider";
import { getPrimaryNavigation } from "../../navigation";

const WORKFLOW_LIST_PATH = "/workflows";

export function WorkspacePrimaryNavigation(): JSX.Element {
  const { t } = useLocalization();
  const location = useLocation();
  const navigation = getPrimaryNavigation(t);
  const [lastVisitedPaths, setLastVisitedPaths] = useState<
    Record<string, string>
  >(() => {
    const primaryPath = primaryPathForLocation(
      location.pathname,
      navigation.map(({ path }) => path),
    );
    return primaryPath
      ? { [primaryPath]: `${location.pathname}${location.search}` }
      : {};
  });

  useEffect(() => {
    const primaryPath = primaryPathForLocation(
      location.pathname,
      navigation.map(({ path }) => path),
    );
    if (!primaryPath) return;
    const fullPath = `${location.pathname}${location.search}`;
    setLastVisitedPaths((current) =>
      current[primaryPath] === fullPath
        ? current
        : { ...current, [primaryPath]: fullPath },
    );
  }, [location.pathname, location.search, navigation]);

  return (
    <nav aria-label={t("workspace.mainNavigation")}>
      {navigation.map(({ path, label, icon: Icon }) => {
        const workflowEntry = path === WORKFLOW_LIST_PATH;
        return (
          <NavLink
            key={path}
            to={lastVisitedPaths[path] ?? path}
            end={path === "/"}
            className={({ isActive }) =>
              isActive ||
              (workflowEntry && isWorkflowLocation(location.pathname))
                ? "nav-item active"
                : "nav-item"
            }
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function primaryPathForLocation(
  pathname: string,
  primaryPaths: string[],
): string | undefined {
  if (isWorkflowLocation(pathname)) return WORKFLOW_LIST_PATH;
  return primaryPaths.find((path) => path === pathname);
}

function isWorkflowLocation(pathname: string): boolean {
  return (
    pathname === WORKFLOW_LIST_PATH || pathname.startsWith("/templates/")
  );
}
