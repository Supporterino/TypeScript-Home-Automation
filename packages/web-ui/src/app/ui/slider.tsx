import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

export type SliderProps = ComponentPropsWithoutRef<typeof SliderPrimitive.Root>;

/**
 * A range control with keyboard support and a visible focus ring (Radix). The
 * `aria-label` names the thumb carrying `role="slider"` as well as the root.
 */
export function Slider({ className, "aria-label": ariaLabel, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
        className,
      )}
      aria-label={ariaLabel}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-pill bg-surface-3">
        <SliderPrimitive.Range className="absolute h-full bg-accent" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className={cn(
          "block size-4 rounded-full border border-hairline bg-surface shadow-e1 motion-toggle",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        )}
      />
    </SliderPrimitive.Root>
  );
}
