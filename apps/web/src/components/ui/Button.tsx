import type { ButtonHTMLAttributes, ReactNode } from "react";

const MOTION_CLASS =
  "transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(253,134,6,0.35)]";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "accent";
  children: ReactNode;
};

const variantClasses = {
  primary: "bg-[var(--color-ink)] text-[var(--color-button-text)]",
  secondary:
    "border border-[var(--color-border-strong)] text-[var(--color-ink)]",
  ghost: "text-[var(--color-muted-strong)] hover:bg-white/60",
  accent: "bg-[var(--color-accent)] text-[var(--color-button-text)]"
} as const;

export function Button({
  variant = "secondary",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${MOTION_CLASS} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export { MOTION_CLASS };
