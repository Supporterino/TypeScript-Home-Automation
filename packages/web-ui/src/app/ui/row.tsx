import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";
import type { RhythmGap } from "./stack.js";

const GAP: Record<RhythmGap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  6: "gap-6",
  8: "gap-8",
};

export type RowAlign = "start" | "center" | "end" | "baseline" | "stretch";

const ALIGN: Record<RowAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  baseline: "items-baseline",
  stretch: "items-stretch",
};

export type RowJustify = "start" | "center" | "end" | "between" | "around";

const JUSTIFY: Record<RowJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
};

export interface RowProps extends ComponentPropsWithoutRef<"div"> {
  gap?: RhythmGap;
  align?: RowAlign;
  justify?: RowJustify;
  wrap?: boolean;
}

/** A horizontal flex row on the spacing rhythm. */
export function Row({
  className,
  gap = 2,
  align = "center",
  justify = "start",
  wrap = false,
  ...props
}: RowProps) {
  return (
    <div
      className={cn(
        "flex flex-row",
        GAP[gap],
        ALIGN[align],
        JUSTIFY[justify],
        wrap && "flex-wrap",
        className,
      )}
      {...props}
    />
  );
}
