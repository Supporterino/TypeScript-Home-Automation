import { LoaderCircle } from "lucide-react";
import { cn } from "./cn.js";

export interface SpinnerProps {
  /** Icon size in px. */
  size?: number;
  /** Accessible name; an empty string marks the spinner decorative. */
  label?: string;
  className?: string;
}

/** A token-driven busy indicator. */
export function Spinner({ size = 20, label = "Loading", className }: SpinnerProps) {
  return (
    <LoaderCircle
      size={size}
      aria-hidden={label === "" ? true : undefined}
      aria-label={label === "" ? undefined : label}
      role={label === "" ? undefined : "status"}
      className={cn("animate-spin text-muted", className)}
    />
  );
}
