import type { ReactNode } from "react";
import "./Card.css";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["card", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function SummaryCard({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "success" | "warning" | "destructive";
  icon?: ReactNode;
}) {
  return (
    <div className={`summary-card summary-card-${tone}`}>
      {icon && (
        <span className="summary-card-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div>
        <div className="summary-card-value">{value}</div>
        <div className="summary-card-label">{label}</div>
      </div>
    </div>
  );
}
