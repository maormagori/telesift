import { Plus, Radio } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, type ChannelWithStatus } from "../api/client";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { StatusPill, type StatusTone } from "../components/StatusPill";
import { useToast } from "../components/Toast";
import "./Channels.css";

function channelStatus(entry: ChannelWithStatus): { tone: StatusTone; label: string; detail?: string } {
  if (!entry.chat) return { tone: "neutral", label: "Unresolved", detail: "not visible to this account yet" };
  const state = entry.syncState;
  if (!state) return { tone: "warning", label: "Awaiting sync" };
  if (state.lastError) return { tone: "destructive", label: "Error", detail: state.lastError };
  if (!state.backfillCompletedAt) return { tone: "warning", label: "Backfilling", detail: `through message ${state.newestSeenMessageId ?? 0}` };
  return { tone: "success", label: "Caught up", detail: `newest: ${state.newestSeenMessageId ?? "-"}` };
}

export function Channels({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const { showToast } = useToast();
  const [channels, setChannels] = useState<ChannelWithStatus[] | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<ChannelWithStatus | null>(null);

  async function refresh(): Promise<void> {
    setChannels(await api.listChannels());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAdd(e: FormEvent): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    try {
      const result = await api.addChannel(identifier);
      setIdentifier("");
      showToast(
        result.resolution.status === "resolved"
          ? `Found: ${result.resolution.chat.title}`
          : "Added, but not visible to this account yet — ingestion-worker will keep retrying.",
      );
      await refresh();
    } catch {
      showToast("Could not add channel.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEnable(entry: ChannelWithStatus): Promise<void> {
    await api.enableChannel(entry.channel.identifier);
    await refresh();
  }

  async function confirmDisable(): Promise<void> {
    if (!pendingDisable) return;
    await api.disableChannel(pendingDisable.channel.identifier);
    setPendingDisable(null);
    await refresh();
  }

  const columns: DataTableColumn<ChannelWithStatus>[] = [
    {
      key: "title",
      header: "Channel",
      sortValue: (entry) => entry.chat?.title ?? entry.channel.identifier.value,
      render: (entry) =>
        entry.chat ? (
          <button type="button" className="channels-title-link" onClick={() => onOpenChat(entry.chat!.telegramId)}>
            {entry.chat.title}
          </button>
        ) : (
          <span className="mono text-sm">{entry.channel.identifier.value}</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (entry) => {
        const status = channelStatus(entry);
        return (
          <div className="channels-status-cell">
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
            {status.detail && <span className="muted text-sm mono channels-status-detail">{status.detail}</span>}
          </div>
        );
      },
    },
    {
      key: "enabled",
      header: "Enabled",
      sortValue: (entry) => (entry.channel.enabled ? 1 : 0),
      render: (entry) => <StatusPill tone={entry.channel.enabled ? "success" : "neutral"}>{entry.channel.enabled ? "Yes" : "No"}</StatusPill>,
    },
    {
      key: "actions",
      header: "",
      render: (entry) =>
        entry.channel.enabled ? (
          <Button variant="ghost" onClick={() => setPendingDisable(entry)}>
            Disable
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => void handleEnable(entry)}>
            Enable
          </Button>
        ),
    },
  ];

  return (
    <div>
      <h2>Channels</h2>
      <form className="channels-add-form" onSubmit={(e) => void handleAdd(e)}>
        <input
          placeholder="@username or numeric chat id"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <Button type="submit" variant="primary" loading={submitting} disabled={!identifier}>
          <Plus size={14} aria-hidden="true" />
          Add channel
        </Button>
      </form>

      {channels === null ? (
        <p className="muted">Loading...</p>
      ) : (
        <DataTable
          columns={columns}
          rows={channels}
          rowKey={(entry) => `${entry.channel.identifier.type}:${entry.channel.identifier.value}`}
          emptyState={
            <EmptyState icon={<Radio size={28} />} title="No channels configured yet" description="Add a Telegram channel above to start ingesting it." />
          }
        />
      )}

      <ConfirmDialog
        open={pendingDisable !== null}
        title={`Disable ${pendingDisable?.chat?.title ?? "this channel"}?`}
        description="Ingestion will stop until it's re-enabled. Already-ingested messages and media are kept."
        confirmLabel="Disable"
        tone="danger"
        onConfirm={() => void confirmDisable()}
        onCancel={() => setPendingDisable(null)}
      />
    </div>
  );
}
