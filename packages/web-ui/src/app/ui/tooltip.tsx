import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "./cn.js";

/** Wrap the subtree that uses tooltips; Radix shares one delay across it. */
export const TooltipProvider = TooltipPrimitive.Provider;

/** A floating label for a control; opens on hover and keyboard focus. */
export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-xs rounded-input border border-hairline bg-surface-2 px-2.5 py-1.5 text-xs text-ink shadow-e2 motion-enter",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export interface TooltipProps {
  /** The tooltip text. */
  label: ReactNode;
  /** The trigger element; must be focusable for keyboard access. */
  children: ReactNode;
  side?: ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>["side"];
}

/** A one-shot tooltip: trigger plus content, for the common case. */
export function Tooltip({ label, children, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </TooltipPrimitive.Root>
  );
}
