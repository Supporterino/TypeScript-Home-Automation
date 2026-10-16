import type { ReactNode } from "react";
import { cn } from "./cn.js";

export interface EmptyStateProps {
  /** A leading icon, marked decorative by the component. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** A primary call to action. */
  action?: ReactNode;
  className?: string;
}

/** A centred, explanatory empty state. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-10 text-center",
        className,
      )}
    >
      {icon !== undefined ? (
        <span aria-hidden className="text-muted">
          {icon}
        </span>
      ) : null}
      <p className="text-base font-semibold text-ink">{title}</p>
      {description !== undefined ? (
        <p className="max-w-prose text-sm text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}
