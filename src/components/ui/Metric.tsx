import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export type MetricProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
};

export const Metric = forwardRef<HTMLDivElement, MetricProps>(
  function Metric(
    { label, value, detail, className, ...props },
    ref,
  ): JSX.Element {
    return (
      <div
        {...props}
        ref={ref}
        className={["ui-metric", className].filter(Boolean).join(" ")}
      >
        <span className="ui-metric__label">{label}</span>
        <strong className="ui-metric__value">{value}</strong>
        {detail ? <small className="ui-metric__detail">{detail}</small> : null}
      </div>
    );
  },
);
