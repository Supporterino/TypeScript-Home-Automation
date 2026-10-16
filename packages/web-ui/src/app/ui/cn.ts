import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The radius scale (`--radius-input|tile|card|pill`) is declared in `@theme`, so
 * registering it makes `tailwind-merge` treat the utilities as one conflict group.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["input", "tile", "card", "pill"],
    },
  },
});

/**
 * Merge conditional class names: `clsx` flattens the inputs and `tailwind-merge`
 * resolves conflicts so a caller-supplied `className` wins over the defaults.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
