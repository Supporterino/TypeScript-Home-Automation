import type { ReactNode } from "react";
import { cn } from "./cn.js";

/** The semantic tone a stat value may carry. */
export type StatTone = "default" | "on" | "stale" | "danger" | "info";

const TONE: Record<StatTone, string> = {
  default: "text-ink",
  on: "text-on",
  stale: "text-stale",
  danger: "text-danger",
  info: "text-info",
};

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** A leading icon, marked decorative. */
  icon?: ReactNode;
  /** Secondary context beneath the value. */
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}

/** A labelled readout; numeric values use the display face. */
export function Stat({ label, value, icon, hint, tone = "default", className }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        {icon !== undefined ? <span aria-hidden>{icon}</span> : null}
        {label}
      </span>
      <span className={cn("font-display text-xl font-bold", TONE[tone])}>{value}</span>
      {hint !== undefined ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
