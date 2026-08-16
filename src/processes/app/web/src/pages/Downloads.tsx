import { Download as DownloadIcon, Pause, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type DownloadObservedState, type DownloadWithRelease } from "../api/client";
import { Button } from "../components/Button";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { ProgressBar } from "../components/ProgressBar";
import { StatusPill, type StatusTone } from "../components/StatusPill";
import { useToast } from "../components/Toast";
import "./Downloads.css";

const STATE_TONE: Record<DownloadObservedState, StatusTone> = {
  queued: "neutral",
  verifying: "warning",
  downloading: "warning",
  paused: "warning",
  completed: "success",
  failed: "destructive",
  canceled: "neutral",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function Downloads() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<DownloadWithRelease[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function refresh(): Promise<void> {
    setRows(await api.listDownloads());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function withBusy(id: number, action: () => Promise<unknown>, failureMessage: string): Promise<void> {
    setBusyId(id);
    try {
      await action();
      await refresh();
    } catch {
      showToast(failureMessage, "error");
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataTableColumn<DownloadWithRelease>[] = [
    {
      key: "title",
      header: "Release",
      sortValue: (row) => row.release?.displayTitle ?? "",
      render: (row) => <span className="mono downloads-title">{row.release?.displayTitle ?? `release #${row.download.releaseId}`}</span>,
    },
    {
      key: "state",
      header: "State",
      sortValue: (row) => row.download.observedState,
      render: (row) => (
        <div className="downloads-state-cell">
          <StatusPill tone={STATE_TONE[row.download.observedState]}>{row.download.observedState}</StatusPill>
          {row.download.lastError && <span className="muted text-sm downloads-error">{row.download.lastError}</span>}
        </div>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      render: (row) => {
        const { progressBytes, totalBytes } = row.download;
        if (totalBytes === null) return <span className="muted text-sm">{formatBytes(progressBytes)}</span>;
        return (
          <div className="downloads-progress-cell">
            <ProgressBar fraction={progressBytes / totalBytes} tone={STATE_TONE[row.download.observedState] === "destructive" ? "destructive" : "success"} />
            <span className="muted text-sm mono">
              {formatBytes(progressBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (row) => {
        const { download } = row;
        const busy = busyId === download.id;
        const terminal = download.observedState === "completed" || download.observedState === "failed" || download.observedState === "canceled";
        if (terminal) {
          if (download.observedState === "completed") return null;
          return (
            <Button variant="ghost" loading={busy} onClick={() => void withBusy(download.id, () => api.retryDownload(download.releaseId), "Could not retry download")}>
              <RotateCcw size={14} aria-hidden="true" />
              Retry
            </Button>
          );
        }
        return (
          <div className="downloads-actions">
            {download.desiredState === "paused" ? (
              <Button variant="ghost" loading={busy} onClick={() => void withBusy(download.id, () => api.resumeDownload(download.id), "Could not resume download")}>
                <Play size={14} aria-hidden="true" />
                Resume
              </Button>
            ) : (
              <Button variant="ghost" loading={busy} onClick={() => void withBusy(download.id, () => api.pauseDownload(download.id), "Could not pause download")}>
                <Pause size={14} aria-hidden="true" />
                Pause
              </Button>
            )}
            <Button variant="danger" loading={busy} onClick={() => void withBusy(download.id, () => api.cancelDownload(download.id), "Could not cancel download")}>
              <X size={14} aria-hidden="true" />
              Cancel
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <h2>Downloads</h2>
      {rows === null ? (
        <p className="muted">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.download.id}
          emptyState={<EmptyState icon={<DownloadIcon size={28} />} title="No downloads yet" description="Downloads appear once Sonarr grabs an approved release." />}
        />
      )}
    </div>
  );
}
