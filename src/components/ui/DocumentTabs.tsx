import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./Button";
import { Spinner } from "./Motion";
import { Tab, TabList, Tabs } from "./Tabs";

export type DocumentTabItem = {
  value: string;
  label: string;
  leading?: ReactNode;
  loading?: boolean;
  dirty?: boolean;
  closable?: boolean;
  disabled?: boolean;
};

export type DocumentTabsProps = {
  value: string;
  items: DocumentTabItem[];
  onValueChange: (value: string) => void;
  onClose?: (value: string) => void;
  getCloseLabel?: (item: DocumentTabItem) => string;
  toolbar?: ReactNode;
  className?: string;
  "aria-label": string;
};

export function DocumentTabs({
  value,
  items,
  onValueChange,
  onClose,
  getCloseLabel = (item) => `Close ${item.label}`,
  toolbar,
  className,
  "aria-label": ariaLabel,
}: DocumentTabsProps): JSX.Element {
  return (
    <Tabs
      value={value}
      onValueChange={onValueChange}
      variant="page"
      className={["ui-document-tabs", className].filter(Boolean).join(" ")}
    >
      <TabList
        aria-label={ariaLabel}
        className="ui-document-tabs__list"
      >
        {items.map((item) => (
          <div
            className="ui-document-tab"
            data-active={item.value === value || undefined}
            key={item.value}
          >
            <Tab
              value={item.value}
              disabled={item.disabled}
              className="ui-document-tab__trigger"
            >
              {item.leading || item.loading ? (
                <span
                  className="ui-document-tab__leading"
                  aria-hidden="true"
                >
                  {item.loading ? (
                    <Spinner
                      className="ui-document-tab__loading"
                      size={14}
                    />
                  ) : (
                    item.leading
                  )}
                </span>
              ) : null}
              <span className="ui-document-tab__label">{item.label}</span>
              {item.dirty ? (
                <i className="ui-document-tab__dirty" aria-hidden="true" />
              ) : null}
            </Tab>
            {item.closable && onClose ? (
              <IconButton
                size="compact"
                variant="ghost"
                aria-label={getCloseLabel(item)}
                className="ui-document-tab__close"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(item.value);
                }}
              >
                <X size={13} aria-hidden="true" />
              </IconButton>
            ) : null}
          </div>
        ))}
      </TabList>
      {toolbar ? (
        <div className="ui-document-tabs__toolbar">{toolbar}</div>
      ) : null}
    </Tabs>
  );
}
