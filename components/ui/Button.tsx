import type { ButtonHTMLAttributes } from "react";
import { cx } from "./format";

type Variant = "primary" | "secondary" | "ghost" | "dark";
type Size = "sm" | "md" | "lg";

export const buttonVariants: Record<Variant, string> = {
  primary: "bg-accent text-accent-foreground shadow-sm hover:bg-accent-strong",
  secondary: "border border-border bg-surface text-foreground shadow-sm hover:bg-surface-2",
  ghost: "text-foreground hover:bg-surface-2",
  dark: "bg-foreground text-background shadow-sm hover:bg-foreground/90",
};

export const buttonSizes: Record<Size, string> = {
  sm: "h-8 rounded-lg px-3 text-xs",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-5 text-base",
};

/** Class string for links styled as buttons. */
export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cx(
    "inline-flex items-center justify-center gap-2 font-medium transition-colors active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}
