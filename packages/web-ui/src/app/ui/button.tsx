import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn.js";

/** The visual weight of a button (design.md D5). */
export type ButtonVariant = "solid" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  solid: "border-transparent bg-accent text-accent-fg hover:brightness-110 active:brightness-95",
  soft: "border-transparent bg-accent/15 text-accent hover:bg-accent/25 active:bg-accent/30",
  ghost: "border-transparent bg-transparent text-ink hover:bg-surface-2 active:bg-surface-3",
  danger: "border-transparent bg-danger text-canvas hover:brightness-110 active:brightness-95",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-sm",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the single child as the button (Radix Slot), forwarding styles. */
  asChild?: boolean;
}

/** A token-driven action button with variants and WCAG-sized targets. */
export function Button({
  className,
  variant = "solid",
  size = "md",
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(
    "touch-target inline-flex select-none items-center justify-center rounded-input border font-medium motion-toggle",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );

  if (asChild) {
    return <Slot className={classes} {...props} />;
  }
  return <button type={type ?? "button"} className={classes} {...props} />;
}
