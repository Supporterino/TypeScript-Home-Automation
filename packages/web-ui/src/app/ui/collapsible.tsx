import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

/** The collapsible region; `aria-expanded` lives on the trigger (Radix). */
export function CollapsibleContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CollapsiblePrimitive.Content>) {
  return <CollapsiblePrimitive.Content className={cn("overflow-hidden", className)} {...props} />;
}
