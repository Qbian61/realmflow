import { useState } from "react";
import logoUrl from "../../logo.png";

type RealmFlowLogoProps = {
  size: number;
  className?: string;
  loading?: "eager" | "lazy";
};

export function RealmFlowLogo({
  size,
  className,
  loading = "eager",
}: RealmFlowLogoProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const classes = ["realmflow-logo", className, failed && "is-fallback"]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={classes}
      data-testid="realmflow-logo"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      {failed ? (
        "R"
      ) : (
        <img
          src={logoUrl}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          loading={loading}
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
