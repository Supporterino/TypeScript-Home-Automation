import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

/** The semantic tone a badge communicates. */
export type BadgeTone = "neutral" | "accent" | "on" | "stale" | "danger" | "info";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-hairline bg-surface-2 text-muted",
  accent: "border-transparent bg-accent text-accent-fg",
  on: "border-on/30 bg-on/15 text-on",
  stale: "border-stale/30 bg-stale/15 text-stale",
  danger: "border-danger/30 bg-danger/15 text-danger",
  info: "border-info/30 bg-info/15 text-info",
};

export interface BadgeProps extends ComponentPropsWithoutRef<"span"> {
  tone?: BadgeTone;
}

/** A compact, tone-coded status pill. */
export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs font-semibold",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
