import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The Lumen radius scale (`--radius-input|tile|card|pill`, design.md D3) is
 * declared in `@theme`, so `tailwind-merge` does not know its utilities are
 * radius utilities. Registering the scale puts `rounded-tile`/`rounded-card`/
 * `rounded-input`/`rounded-pill` in the same conflict group as `rounded-none`/
 * `rounded-full`, so a caller's override wins deterministically (last one) —
 * instead of leaving the conflict to stylesheet order (design.md D5).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["input", "tile", "card", "pill"],
    },
  },
});

/**
 * Merge conditional class names (design.md D5).
 *
 * `clsx` flattens the inputs; `tailwind-merge` resolves conflicts so a
 * caller-supplied `className` wins over a primitive's defaults (e.g.
 * `<Card className="bg-surface-2">` beats the Card's own `bg-surface`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
