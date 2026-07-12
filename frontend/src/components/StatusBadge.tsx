// ---------------------------------------------------------------------------
// Oracle Sanity Engine — Status Badge Component
//
// Renders a color-coded status indicator with a label for health states:
//   — safe: green dot, "Operational"
//   — warn: amber dot, "Degraded"
//   — danger: red dot, "Critical"
//   — info: blue dot, informational
//   — disconnected: gray dot
//
// Used across the dashboard for quick visual health scanning.
// ---------------------------------------------------------------------------

import clsx from "clsx";

export type StatusVariant = "safe" | "warn" | "danger" | "info" | "disconnected";

/** Mapping from variant to display properties. */
const VARIANT_CONFIG: Record<
  StatusVariant,
  { dotClass: string; label: string; textClass: string }
> = {
  safe: {
    dotClass: "bg-severity-safe",
    label: "Operational",
    textClass: "text-severity-safe",
  },
  warn: {
    dotClass: "bg-severity-warn",
    label: "Degraded",
    textClass: "text-severity-warn",
  },
  danger: {
    dotClass: "bg-severity-danger animate-pulse-slow",
    label: "Critical",
    textClass: "text-severity-danger",
  },
  info: {
    dotClass: "bg-severity-info",
    label: "Info",
    textClass: "text-severity-info",
  },
  disconnected: {
    dotClass: "bg-slate-500",
    label: "Disconnected",
    textClass: "text-slate-400",
  },
};

interface StatusBadgeProps {
  /** The severity/status variant. */
  variant: StatusVariant;

  /** Optional override label (defaults to variant label). */
  label?: string;

  /** Optional additional CSS classes. */
  className?: string;

  /** Show animation pulse on the dot (default: true for danger). */
  pulse?: boolean;
}

export function StatusBadge({ variant, label, className, pulse }: StatusBadgeProps) {
  const config = VARIANT_CONFIG[variant];

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium",
        config.textClass,
        "bg-white/5 border border-white/10",
        className
      )}
    >
      <span
        className={clsx(
          "status-dot",
          variant,
          pulse && variant === "danger" && "animate-pulse-slow"
        )}
      />
      {label || config.label}
    </span>
  );
}
