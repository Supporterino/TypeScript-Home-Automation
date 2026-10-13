import type { ComponentPropsWithoutRef } from "react";
import { cn } from "./cn.js";

/** A gap on the design-system spacing rhythm (design.md D3). */
export type RhythmGap = 0 | 1 | 2 | 3 | 4 | 6 | 8;

const GAP: Record<RhythmGap, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  6: "gap-6",
  8: "gap-8",
};

/** Cross-axis alignment. */
export type StackAlign = "start" | "center" | "end" | "stretch";

const ALIGN: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
};

export interface StackProps extends ComponentPropsWithoutRef<"div"> {
  gap?: RhythmGap;
  align?: StackAlign;
}

/** A vertical flex column on the spacing rhythm (design.md D5). */
export function Stack({ className, gap = 3, align = "stretch", ...props }: StackProps) {
  return <div className={cn("flex flex-col", GAP[gap], ALIGN[align], className)} {...props} />;
}
