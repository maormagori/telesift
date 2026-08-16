import { useEffect, useState } from "react";

// A hand-rolled router rather than a routing library: this v1 slice has four
// screens, so a dependency isn't warranted yet.
export function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(next: string): void {
    window.history.pushState(null, "", next);
    setPath(next);
  }

  return [path, navigate];
}
