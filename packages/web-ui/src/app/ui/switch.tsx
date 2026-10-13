import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

/** An on/off control; "on" is `--on`, and state is exposed via `aria-checked`. */
export function Switch({ className, ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "touch-target peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-pill border border-hairline p-0.5 motion-toggle",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=unchecked]:bg-surface-3 data-[state=checked]:border-transparent data-[state=checked]:bg-on",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-canvas shadow-e1 motion-toggle",
          "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
