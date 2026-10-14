import { Check, ListFilter } from "lucide-react";
import { useRef, useState } from "react";
import { Popover, PopoverContent } from "../../components/ui";

export function ResourceTypeFilterMenu<TValue extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: TValue; label: string }>;
  value: TValue;
  onChange: (value: TValue) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`repository-header-filter ${
          value === "all" ? "" : "active"
        }`}
        title={label}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <ListFilter size={14} aria-hidden="true" />
      </button>
      <Popover
        open={open}
        trigger={triggerRef.current}
        placement="bottom-end"
        onOpenChange={setOpen}
      >
        <PopoverContent
          className="repository-header-filter-menu ui-menu"
          role="menu"
          aria-label={label}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                className="ui-menu-item repository-header-filter-menu-item"
                data-checked={selected || undefined}
                key={option.value}
                role="menuitemradio"
                type="button"
                aria-checked={selected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <Check size={13} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
    </>
  );
}
