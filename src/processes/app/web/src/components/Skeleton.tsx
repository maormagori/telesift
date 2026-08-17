import "./Skeleton.css";

export function Skeleton({ height = "1em", width = "100%" }: { height?: string; width?: string }) {
  return <span className="skeleton" style={{ height, width }} aria-hidden="true" />;
}
