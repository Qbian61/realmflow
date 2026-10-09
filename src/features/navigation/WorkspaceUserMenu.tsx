import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";
import {
  Archive,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  Globe2,
  RefreshCw,
  Settings,
  Sun,
} from "lucide-react";
import type { SidecarStatus } from "../../../shared/types";
import { Menu, MenuContent } from "../../components/ui";
import { useLocalization } from "../../localization/LocalizationProvider";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type Locale,
} from "../../localization/locales";
import type { TranslationKey } from "../../localization/translate";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemePreference } from "../../theme/themes";
import { useToast } from "../toast/ToastProvider";

type PreferenceMenu = "language" | "theme";
type SubmenuPosition = { left: number; top: number };

const SUBMENU_WIDTH = 168;
const SUBMENU_HEIGHT = 116;
const SUBMENU_GAP = 8;
const VIEWPORT_PADDING = 12;

const THEME_LABEL_KEYS: Readonly<Record<ThemePreference, TranslationKey>> = {
  light: "theme.option.light",
  dark: "theme.option.dark",
  system: "theme.option.system",
};
const USER_MENU_THEME_PREFERENCES: readonly ThemePreference[] = [
  "dark",
  "light",
  "system",
];

export function WorkspaceUserMenu(): JSX.Element {
  const { locale, setLocale, t } = useLocalization();
  const { preference, setTheme } = useTheme();
  const toast = useToast();
  const [sidecarStatus, setSidecarStatus] = useState<SidecarStatus>("starting");
  const [open, setOpen] = useState(false);
  const [activePreferenceMenu, setActivePreferenceMenu] =
    useState<PreferenceMenu>();
  const [submenuPosition, setSubmenuPosition] = useState<SubmenuPosition>();
  const userAreaRef = useRef<HTMLDivElement>(null);
  const preferenceMenuRef = useRef<HTMLDivElement>(null);
  const activePreferenceTriggerRef = useRef<HTMLButtonElement>();

  const closeMenus = useCallback((): void => {
    setOpen(false);
    setActivePreferenceMenu(undefined);
    setSubmenuPosition(undefined);
  }, []);
  const handleMainOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (!nextOpen) closeMenus();
    },
    [closeMenus],
  );
  const handleSubmenuOpenChange = useCallback((nextOpen: boolean): void => {
    if (nextOpen) return;
    setActivePreferenceMenu(undefined);
    setSubmenuPosition(undefined);
  }, []);

  const openWebsite = (): void => {
    closeMenus();
    const business = window.realmflow?.business;
    if (!business) return;
    void business
      .openSupportLink({
        requestId: crypto.randomUUID(),
        target: "website",
      })
      .catch(() => toast.error("support.error.targetUnavailable"));
  };

  useEffect(() => {
    const refreshStatus = (): void => {
      void window.realmflow?.getSidecarStatus().then(setSidecarStatus);
    };
    const closeOnOutsideClick = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (
        !userAreaRef.current?.contains(target) &&
        !preferenceMenuRef.current?.contains(target)
      ) {
        closeMenus();
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeMenus();
    };

    refreshStatus();
    const interval = window.setInterval(refreshStatus, 1000);
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (!activePreferenceMenu) return;

    const updatePosition = (): void => {
      const trigger = activePreferenceTriggerRef.current;
      if (!trigger) return;
      setSubmenuPosition(getSubmenuPosition(trigger.getBoundingClientRect()));
    };

    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [activePreferenceMenu]);

  const togglePreferenceMenu = (
    menu: PreferenceMenu,
    trigger: HTMLButtonElement,
  ): void => {
    if (activePreferenceMenu === menu) {
      setActivePreferenceMenu(undefined);
      setSubmenuPosition(undefined);
      return;
    }
    activePreferenceTriggerRef.current = trigger;
    setSubmenuPosition(getSubmenuPosition(trigger.getBoundingClientRect()));
    setActivePreferenceMenu(menu);
  };

  const changeLocale = (nextLocale: Locale): void => {
    const result = setLocale(nextLocale);
    if (result.outcome === "failed" || result.outcome === "invalid") {
      toast.error("localization.storageError");
      return;
    }
    setActivePreferenceMenu(undefined);
  };

  const changeTheme = (nextTheme: ThemePreference): void => {
    const result = setTheme(nextTheme);
    if (result.outcome === "failed" || result.outcome === "invalid") {
      toast.error("theme.storageError");
      return;
    }
    setActivePreferenceMenu(undefined);
  };

  return (
    <div className="user-area" ref={userAreaRef}>
      <Menu
        open={open}
        onOpenChange={handleMainOpenChange}
        dismissOnOutsidePointer={false}
      >
        <MenuContent
          className="user-menu"
          aria-label={t("userMenu.ariaLabel")}
        >
          <div className="user-menu-group">
            <PreferenceMenuButton
              icon={<Globe2 size={17} />}
              label={t("navigation.language")}
              value={LOCALE_LABELS[locale]}
              expanded={activePreferenceMenu === "language"}
              onClick={(trigger) =>
                togglePreferenceMenu("language", trigger)
              }
            />
            <PreferenceMenuButton
              icon={<Sun size={17} />}
              label={t("userMenu.theme")}
              value={t(THEME_LABEL_KEYS[preference])}
              expanded={activePreferenceMenu === "theme"}
              onClick={(trigger) => togglePreferenceMenu("theme", trigger)}
            />
          </div>
          <div className="user-menu-group">
            <MenuLink
              to="/settings?section=general"
              icon={<Settings size={17} />}
              onClose={closeMenus}
            >
              {t("settings.section.general.label")}
            </MenuLink>
            <MenuLink
              to="/settings?section=models"
              icon={<Bot size={17} />}
              onClose={closeMenus}
            >
              {t("userMenu.modelConfiguration")}
            </MenuLink>
            <MenuLink
              to="/settings?section=backup"
              icon={<Archive size={17} />}
              onClose={closeMenus}
            >
              {t("settings.section.backup.label")}
            </MenuLink>
            <button
              className="ui-menu-item"
              type="button"
              role="menuitem"
              onClick={openWebsite}
            >
              <ExternalLink size={17} />
              <span>{t("userMenu.website")}</span>
            </button>
            <MenuLink
              to="/updates"
              icon={<RefreshCw size={17} />}
              onClose={closeMenus}
            >
              {t("navigation.updates")}
            </MenuLink>
            <MenuLink
              to="/feedback"
              icon={<CircleHelp size={17} />}
              onClose={closeMenus}
            >
              {t("navigation.feedback")}
            </MenuLink>
          </div>
        </MenuContent>
      </Menu>
      {open && activePreferenceMenu && submenuPosition
        ? createPortal(
            <Menu
              open
              onOpenChange={handleSubmenuOpenChange}
              dismissOnOutsidePointer={false}
              trigger={activePreferenceTriggerRef.current}
            >
              <PreferenceSubmenu
                menuRef={preferenceMenuRef}
                position={submenuPosition}
                ariaLabel={
                  activePreferenceMenu === "language"
                    ? t("localization.ariaLabel")
                    : t("theme.ariaLabel")
                }
                options={
                  activePreferenceMenu === "language"
                    ? SUPPORTED_LOCALES.map((candidate) => ({
                        key: candidate,
                        label: LOCALE_LABELS[candidate],
                        selected: candidate === locale,
                        onSelect: () => changeLocale(candidate),
                      }))
                    : USER_MENU_THEME_PREFERENCES.map((candidate) => ({
                        key: candidate,
                        label: t(THEME_LABEL_KEYS[candidate]),
                        selected: candidate === preference,
                        onSelect: () => changeTheme(candidate),
                      }))
                }
              />
            </Menu>,
            document.body,
          )
        : null}
      <button
        className="user-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (open) {
            closeMenus();
            return;
          }
          setOpen(true);
        }}
      >
        <span className="avatar">Q</span>
        <span className="user-copy">
          <strong>Qbian61</strong>
          <small>
            <i data-status={sidecarStatus} />
            {t("userMenu.edition")}
          </small>
        </span>
        <ChevronRight className="user-chevron" size={16} />
      </button>
    </div>
  );
}

function PreferenceMenuButton({
  icon,
  label,
  value,
  expanded,
  onClick,
}: {
  icon: JSX.Element;
  label: string;
  value: string;
  expanded: boolean;
  onClick: (trigger: HTMLButtonElement) => void;
}): JSX.Element {
  return (
    <button
      className="user-preference-trigger ui-menu-item"
      type="button"
      role="menuitem"
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={(event) => onClick(event.currentTarget)}
    >
      {icon}
      <span>{label}</span>
      <span className="user-preference-value">
        <span>{value}</span>
        <ChevronRight size={15} />
      </span>
    </button>
  );
}

function PreferenceSubmenu({
  menuRef,
  position,
  ariaLabel,
  options,
}: {
  menuRef: React.RefObject<HTMLDivElement>;
  position: SubmenuPosition;
  ariaLabel: string;
  options: ReadonlyArray<{
    key: string;
    label: string;
    selected: boolean;
    onSelect: () => void;
  }>;
}): JSX.Element {
  return (
    <MenuContent
      className="user-preference-menu"
      aria-label={ariaLabel}
      ref={menuRef}
      style={position}
    >
      {options.map((option) => (
        <button
          className="ui-menu-item"
          type="button"
          role="menuitemradio"
          aria-checked={option.selected}
          key={option.key}
          onClick={option.onSelect}
        >
          <Check
            className="user-preference-check"
            data-visible={option.selected}
            size={15}
            aria-hidden="true"
          />
          <span>{option.label}</span>
        </button>
      ))}
    </MenuContent>
  );
}

function getSubmenuPosition(trigger: DOMRect): SubmenuPosition {
  const rightPlacement = trigger.right + SUBMENU_GAP;
  const left =
    rightPlacement + SUBMENU_WIDTH <= window.innerWidth - VIEWPORT_PADDING
      ? rightPlacement
      : Math.max(
          VIEWPORT_PADDING,
          trigger.left - SUBMENU_GAP - SUBMENU_WIDTH,
        );
  const top = Math.min(
    Math.max(trigger.top, VIEWPORT_PADDING),
    window.innerHeight - SUBMENU_HEIGHT - VIEWPORT_PADDING,
  );
  return { left, top };
}

function MenuLink({
  to,
  icon,
  children,
  onClose,
}: {
  to: string;
  icon: JSX.Element;
  children: string;
  onClose: () => void;
}): JSX.Element {
  return (
    <NavLink
      className="ui-menu-item"
      to={to}
      role="menuitem"
      onClick={onClose}
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}
