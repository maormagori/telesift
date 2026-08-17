import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import "./StatusPill.css";

export type StatusTone = "success" | "warning" | "destructive" | "neutral";

const ICONS: Record<StatusTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
  neutral: CircleDashed,
};

export function StatusPill({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <span className={`status-pill status-pill-${tone}`}>
      <Icon size={13} aria-hidden="true" />
      {children}
    </span>
  );
}
