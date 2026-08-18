import { Download, LayoutDashboard, ListVideo, LogOut, Radio, Search, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { onAttentionChanged } from "../lib/refresh-bus";
import "./AppShell.css";

const POLL_INTERVAL_MS = 30_000;

interface NavItemDef {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  matchPrefixes?: string[];
  badge?: number;
}

function isActive(currentPath: string, item: NavItemDef): boolean {
  if (currentPath === item.path) return true;
  return (item.matchPrefixes ?? []).some((prefix) => currentPath.startsWith(prefix));
}

export function AppShell({
  path,
  navigate,
  username,
  onLogout,
  children,
}: {
  path: string;
  navigate: (path: string) => void;
  username: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [attentionDownloadCount, setAttentionDownloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const [status, releases, downloads] = await Promise.all([
        // An unreachable telegram-service is functionally "disconnected" from the
        // operator's point of view, not an unknown state — treat it the same way.
        api.getTelegramStatus().catch(() => ({ connected: false, account: null })),
        api.listPendingReview({ limit: 200 }).catch(() => []),
        api.listDownloads().catch(() => []),
      ]);
      if (cancelled) return;
      setConnected(status.connected);
      setPendingReviewCount(releases.length);
      setAttentionDownloadCount(downloads.filter((d) => d.download.observedState !== "completed").length);
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    const unsubscribe = onAttentionChanged(() => void poll());
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const navItems: NavItemDef[] = [
    { label: "Dashboard", path: "/", icon: LayoutDashboard },
    { label: "Channels", path: "/channels", icon: Radio, matchPrefixes: ["/chats/"] },
    { label: "Telegram status", path: "/telegram-status", icon: Wifi },
    { label: "Review", path: "/review", icon: ListVideo, badge: pendingReviewCount },
    { label: "Downloads", path: "/downloads", icon: Download, badge: attentionDownloadCount },
    { label: "Search simulator", path: "/search", icon: Search },
  ];

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">TeleSift</div>
        <nav className="app-sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.path}
              type="button"
              className={`app-nav-item${isActive(path, item) ? " app-nav-item-active" : ""}`}
              onClick={() => navigate(item.path)}
              aria-current={isActive(path, item) ? "page" : undefined}
            >
              <item.icon size={16} aria-hidden="true" />
              <span>{item.label}</span>
              {!!item.badge && <span className="app-nav-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="app-sidebar-status">
          {connected === null ? null : connected ? (
            <span className="app-connection-indicator app-connection-up">
              <Wifi size={14} aria-hidden="true" />
              Telegram connected
            </span>
          ) : (
            <span className="app-connection-indicator app-connection-down">
              <WifiOff size={14} aria-hidden="true" />
              Telegram disconnected
            </span>
          )}
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <span className="app-topbar-user muted text-sm">{username}</span>
          <button type="button" className="app-topbar-logout" onClick={onLogout}>
            <LogOut size={14} aria-hidden="true" />
            Log out
          </button>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
