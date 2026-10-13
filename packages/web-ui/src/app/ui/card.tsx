import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

/** Elevation levels a card may sit at (design.md D3). */
export type CardElevation = "flat" | "raised";

const ELEVATION: Record<CardElevation, string> = {
  flat: "shadow-e0",
  raised: "shadow-e1",
};

export interface CardProps extends ComponentPropsWithoutRef<"div"> {
  /** `"raised"` lifts the card with the `--e1` shadow; `"flat"` is border-only. */
  elevation?: CardElevation;
  /** Whether the card applies the default padding rhythm. */
  padding?: boolean;
}

/**
 * A token-driven surface (design.md D5): `--surface` with a hairline border and
 * the tile radius, never a component library's default card.
 */
export function Card({ className, elevation = "flat", padding = true, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-tile border border-hairline bg-surface text-ink",
        padding && "p-4",
        ELEVATION[elevation],
        className,
      )}
      {...props}
    />
  );
}
