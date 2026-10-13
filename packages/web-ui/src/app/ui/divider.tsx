import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

export interface DividerProps extends ComponentPropsWithoutRef<"div"> {
  orientation?: "horizontal" | "vertical";
}

/** A hairline separator that follows the design system's border token. */
export function Divider({ className, orientation = "horizontal", ...props }: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-hairline",
        orientation === "vertical" ? "h-full w-px" : "h-px w-full",
        className,
      )}
      {...props}
    />
  );
}
