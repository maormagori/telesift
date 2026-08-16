import "./ProgressBar.css";

export function ProgressBar({ fraction, tone = "neutral" }: { fraction: number; tone?: "neutral" | "success" | "warning" | "destructive" }) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div className="progress-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={`progress-bar-fill progress-bar-${tone}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
