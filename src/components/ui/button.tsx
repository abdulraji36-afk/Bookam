import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "inverse";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-strong focus-visible:outline-ink",
  secondary: "border-2 border-ink bg-white text-ink hover:bg-paper focus-visible:outline-ink",
  danger: "border-2 border-danger bg-white text-danger hover:bg-danger-soft focus-visible:outline-danger",
  ghost: "text-ink hover:bg-chip focus-visible:outline-ink",
  // For use on the dark navy bars.
  inverse: "border-2 border-white/40 text-white hover:bg-white/10 focus-visible:outline-white"
};

export function buttonClass(variant: ButtonVariant = "primary", size: "md" | "sm" = "md") {
  return [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-extrabold uppercase tracking-wide",
    "transition-[transform,background-color,border-color,color] duration-150 active:scale-[0.97]",
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
    // Slightly tighter on phones so two buttons fit side by side without wrapping.
    size === "md" ? "min-h-12 px-4 text-sm sm:px-5 sm:text-base" : "min-h-11 px-3.5 text-sm sm:px-4",
    VARIANTS[variant]
  ].join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "md" | "sm";
};

export function Button({ variant, size, className = "", ...props }: ButtonProps) {
  return <button className={`${buttonClass(variant, size)} ${className}`} {...props} />;
}
