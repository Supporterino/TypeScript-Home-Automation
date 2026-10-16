import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";
import type { RhythmGap } from "./stack.js";

/** A column count the grid may use at a breakpoint. */
export type GridColumns = 1 | 2 | 3 | 4 | 5 | 6;

const GAP: Record<RhythmGap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  6: "gap-6",
  8: "gap-8",
};

const BASE: Record<GridColumns, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

const MD: Record<GridColumns, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  5: "md:grid-cols-5",
  6: "md:grid-cols-6",
};

const LG: Record<GridColumns, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

export interface GridProps extends ComponentPropsWithoutRef<"div"> {
  columns?: GridColumns;
  /** Column count from the `md` breakpoint up; falls back to `columns`. */
  md?: GridColumns;
  /** Column count from the `lg` breakpoint up; falls back to `md`/`columns`. */
  lg?: GridColumns;
  gap?: RhythmGap;
}

/** A responsive CSS grid on the spacing rhythm. */
export function Grid({ className, columns = 1, md, lg, gap = 3, ...props }: GridProps) {
  return (
    <div
      className={cn(
        "grid",
        GAP[gap],
        BASE[columns],
        md !== undefined && MD[md],
        lg !== undefined && LG[lg],
        className,
      )}
      {...props}
    />
  );
}
