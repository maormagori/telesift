import type { ReactNode } from "react";
import "./EmptyState.css";

export function EmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon}
      </span>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-description muted">{description}</p>}
      {action}
    </div>
  );
}
