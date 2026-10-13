import { Slot } from "@radix-ui/react-slot";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.js";

const DEPTH_INDENT = ["pl-3", "pl-7", "pl-11", "pl-15"];

export interface NavItemProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  /** A leading icon, marked decorative by the component. */
  icon?: ReactNode;
  label: ReactNode;
  /** Whether this item is the current view; sets `aria-current="page"`. */
  active?: boolean;
  /** Nesting level; each level indents one step. */
  depth?: 0 | 1 | 2 | 3;
  /** A trailing slot, e.g. a count or affordance. */
  trailing?: ReactNode;
  /** Render the child as the link (Radix Slot) for a client-side router. */
  asChild?: boolean;
}

/** A navigation row on `ui/` tokens with an accessible active state (design.md D5). */
export function NavItem({
  className,
  icon,
  label,
  active = false,
  depth = 0,
  trailing,
  asChild = false,
  ...props
}: NavItemProps) {
  const classes = cn(
    "touch-target flex items-center gap-2.5 rounded-input py-2 pr-3 text-sm font-medium motion-toggle",
    DEPTH_INDENT[depth] ?? DEPTH_INDENT[0],
    active
      ? "bg-surface-2 text-ink"
      : "text-muted hover:bg-surface-2 hover:text-ink active:bg-surface-3",
    className,
  );

  const content = (
    <>
      {icon !== undefined ? (
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );

  if (asChild) {
    return (
      <Slot className={classes} aria-current={active ? "page" : undefined} {...props}>
        {content}
      </Slot>
    );
  }
  return (
    <a className={classes} aria-current={active ? "page" : undefined} {...props}>
      {content}
    </a>
  );
}
