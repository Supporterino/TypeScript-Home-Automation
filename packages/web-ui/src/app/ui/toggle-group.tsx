import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

export const ToggleGroup = ToggleGroupPrimitive.Root;

/** A segmented option; `aria-pressed` exposes the selected state. */
export function ToggleGroupItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      className={cn(
        "touch-target inline-flex select-none items-center justify-center gap-1.5 rounded-[0.5rem] px-3 py-1.5 text-sm font-medium text-muted motion-toggle",
        "hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-e1",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
