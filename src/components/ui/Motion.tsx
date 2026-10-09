import { LoaderCircle, type LucideProps } from "lucide-react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

type MatchMedia = (
  query: string,
) => Pick<MediaQueryList, "matches">;

export type SpinnerProps = Omit<LucideProps, "aria-label"> & {
  label?: string;
};

export function Spinner({
  className,
  label,
  size = 16,
  ...props
}: SpinnerProps): JSX.Element {
  return (
    <LoaderCircle
      {...props}
      className={["ui-spinner", className].filter(Boolean).join(" ")}
      size={size}
      aria-hidden={label ? undefined : "true"}
      aria-label={label}
      role={label ? "status" : undefined}
    />
  );
}

export function getProgrammaticScrollBehavior(
  matchMedia: MatchMedia | undefined =
    typeof window === "undefined"
      ? undefined
      : window.matchMedia?.bind(window),
): ScrollBehavior {
  return matchMedia?.(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
}
