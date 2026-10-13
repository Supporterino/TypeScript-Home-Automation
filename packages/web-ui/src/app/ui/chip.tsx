import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./cn.js";

export interface ChipProps extends ComponentPropsWithoutRef<"span"> {
  /** A leading icon; kept out of the accessible name (`aria-hidden`). */
  icon?: ReactNode;
}

/**
 * A neutral, outlined metadata tag (design.md D5) — distinct from `Badge`,
 * which is tone-coded status. Non-interactive; wrap in a button for filters.
 */
export function Chip({ className, icon, children, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border border-hairline bg-surface px-2.5 py-1 text-xs font-medium text-muted",
        className,
      )}
      {...props}
    >
      {icon !== undefined ? <span aria-hidden>{icon}</span> : null}
      {children}
    </span>
  );
}
