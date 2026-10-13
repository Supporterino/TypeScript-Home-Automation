import type { ReactNode } from "react";
import { Button, type ButtonProps, type ButtonSize } from "./button.js";
import { cn } from "./cn.js";

const SQUARE: Record<ButtonSize, string> = {
  sm: "size-8",
  md: "size-10",
  lg: "size-11",
};

export interface IconButtonProps extends Omit<ButtonProps, "children" | "size"> {
  /** The accessible name; required, since the icon alone carries no text. */
  label: string;
  /** The icon; marked decorative, because `label` supplies the name. */
  children: ReactNode;
  size?: ButtonSize;
}

/** A square icon-only button with a required accessible name (design.md D9). */
export function IconButton({
  label,
  className,
  size = "md",
  variant = "ghost",
  children,
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={label}
      variant={variant}
      className={cn(SQUARE[size], "px-0", className)}
      {...props}
    >
      <span aria-hidden className="inline-flex items-center justify-center">
        {children}
      </span>
    </Button>
  );
}
