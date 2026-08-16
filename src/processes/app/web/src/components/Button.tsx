import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, Ref } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ variant = "secondary", loading = false, disabled, className, children, ref, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      ref={ref}
      className={["btn", `btn-${variant}`, className].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="btn-spinner" size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}
