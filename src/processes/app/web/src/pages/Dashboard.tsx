import { AlertTriangle, CheckCircle2, Download, ListVideo, Radio, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type ChannelWithStatus, type ConnectionStatus, type DownloadWithRelease } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import "./Dashboard.css";

interface AttentionItem {
  key: string;
  icon: typeof AlertTriangle;
  title: string;
  detail: string;
  action: { label: string; path: string };
}

export function Dashboard({ navigate }: { navigate: (path: string) => void }) {
  const [channels, setChannels] = useState<ChannelWithStatus[] | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [pendingReviewCount, setPendingReviewCount] = useState<number | null>(null);
  const [downloads, setDownloads] = useState<DownloadWithRelease[] | null>(null);

  useEffect(() => {
    void api.listChannels().then(setChannels);
    // Treat an unreachable telegram-service the same as "disconnected" — it's the
    // top-priority thing an operator needs to know either way.
    void api.getTelegramStatus().then(setStatus, () => setStatus({ connected: false, account: null }));
    void api.listPendingReview({ limit: 200 }).then((releases) => setPendingReviewCount(releases.length));
    void api.listDownloads().then(setDownloads);
  }, []);

  const loading = channels === null || status === null || pendingReviewCount === null || downloads === null;

  const attention: AttentionItem[] = [];
  if (status && !status.connected) {
    attention.push({
      key: "telegram-down",
      icon: WifiOff,
      title: "Telegram is disconnected",
      detail: "Ingestion is stalled until the connection recovers.",
      action: { label: "View status", path: "/telegram-status" },
    });
  }
  for (const entry of channels ?? []) {
    if (!entry.chat) {
      attention.push({
        key: `unresolved-${entry.channel.identifier.value}`,
        icon: Radio,
        title: `${entry.channel.identifier.value} isn't visible yet`,
        detail: "The account can't see this channel — check the identifier or account access.",
        action: { label: "View channels", path: "/channels" },
      });
    } else if (entry.syncState?.lastError) {
      attention.push({
        key: `error-${entry.chat.telegramId}`,
        icon: AlertTriangle,
        title: `${entry.chat.title} is failing to sync`,
        detail: entry.syncState.lastError,
        action: { label: "View channels", path: "/channels" },
      });
    }
  }
  if (pendingReviewCount) {
    attention.push({
      key: "pending-review",
      icon: ListVideo,
      title: `${pendingReviewCount} release${pendingReviewCount === 1 ? "" : "s"} waiting for review`,
      detail: "Approve or reject extracted candidates.",
      action: { label: "Open review queue", path: "/review" },
    });
  }
  const failedDownloads = (downloads ?? []).filter((d) => d.download.observedState === "failed");
  if (failedDownloads.length > 0) {
    attention.push({
      key: "failed-downloads",
      icon: Download,
      title: `${failedDownloads.length} download${failedDownloads.length === 1 ? "" : "s"} failed`,
      detail: "Retry or investigate in the downloads monitor.",
      action: { label: "Open downloads", path: "/downloads" },
    });
  }

  return (
    <div>
      <h2>Dashboard</h2>
      {loading ? (
        <div className="skeleton-stack">
          <Skeleton height="3.5rem" />
          <Skeleton height="3.5rem" />
        </div>
      ) : attention.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={28} />} title="All clear" description="Nothing needs your attention right now." />
      ) : (
        <ul className="dashboard-attention-list">
          {attention.map((item) => (
            <li key={item.key} className="dashboard-attention-item">
              <item.icon size={18} aria-hidden="true" className="dashboard-attention-icon" />
              <div className="dashboard-attention-body">
                <div className="dashboard-attention-title">{item.title}</div>
                <div className="muted text-sm">{item.detail}</div>
              </div>
              <button type="button" className="dashboard-attention-action" onClick={() => navigate(item.action.path)}>
                {item.action.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
