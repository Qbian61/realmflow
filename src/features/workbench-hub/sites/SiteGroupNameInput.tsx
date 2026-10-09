import { useState } from "react";

type SiteGroupNameInputProps = {
  label: string;
  name: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
};

export function SiteGroupNameInput({
  label,
  name,
  onCommit,
  onCancel,
}: SiteGroupNameInputProps): JSX.Element {
  const [value, setValue] = useState(name);
  return (
    <input name="site-group-name-input-value" autoComplete="off"
      autoFocus
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(value);
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}
