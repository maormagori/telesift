import { Plus, Radio, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type BackfillPolicy, type ChannelIdentifier, type ChannelWithStatus, type VisibleChat } from "../api/client";
import { Button } from "../components/Button";
import { ChatAvatar } from "../components/ChatAvatar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { StatusPill, type StatusTone } from "../components/StatusPill";
import { useToast } from "../components/Toast";
import { AddChannelDialog } from "./AddChannelDialog";
import "./Channels.css";

function channelStatus(entry: ChannelWithStatus): { tone: StatusTone; label: string; detail?: string } {
  if (!entry.chat) return { tone: "neutral", label: "Unresolved", detail: "not visible to this account yet" };
  const state = entry.syncState;
  if (!state) return { tone: "warning", label: "Awaiting sync" };
  if (state.lastError) return { tone: "destructive", label: "Error", detail: state.lastError };
  if (!state.backfillCompletedAt) return { tone: "warning", label: "Backfilling", detail: `through message ${state.newestSeenMessageId ?? 0}` };
  return { tone: "success", label: "Caught up", detail: `newest: ${state.newestSeenMessageId ?? "-"}` };
}

// Telegram returns chats most recently active first, so an empty search shows the likeliest picks.
const SUGGESTED_CHAT_COUNT = 10;
const MAX_SEARCH_MATCHES = 50;

function matchesSearch(entry: VisibleChat, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return entry.chat.title.toLowerCase().includes(needle) || (entry.chat.username?.toLowerCase().includes(needle) ?? false);
}

/** What the add dialog is about to add: a typed id picked from the visible-chat list, or text typed into the search. */
interface PendingAdd {
  identifier: ChannelIdentifier | string;
  label: string;
}

export function Channels({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const { showToast } = useToast();
  const [channels, setChannels] = useState<ChannelWithStatus[] | null>(null);
  const [visibleChats, setVisibleChats] = useState<VisibleChat[] | null>(null);
  const [visibleChatsFailed, setVisibleChatsFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingDisable, setPendingDisable] = useState<ChannelWithStatus | null>(null);

  async function refresh(): Promise<void> {
    setChannels(await api.listChannels());
  }

  async function refreshVisibleChats(): Promise<void> {
    try {
      setVisibleChats(await api.listVisibleChats());
      setVisibleChatsFailed(false);
    } catch {
      setVisibleChatsFailed(true);
    }
  }

  useEffect(() => {
    void refresh();
    void refreshVisibleChats();
  }, []);

  async function confirmAdd(backfillPolicy: BackfillPolicy): Promise<void> {
    if (!pendingAdd) return;
    setSubmitting(true);
    try {
      const result = await api.addChannel(pendingAdd.identifier, backfillPolicy);
      setSearch("");
      setPendingAdd(null);
      showToast(
        result.resolution.status === "resolved"
          ? `Found: ${result.resolution.chat.title}`
          : "Added, but not visible to this account yet — ingestion-worker will keep retrying.",
      );
      await Promise.all([refresh(), refreshVisibleChats()]);
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
          <div className="channels-chat-cell">
            <ChatAvatar chatId={entry.chat.telegramId} title={entry.chat.title} />
            <button type="button" className="channels-title-link" onClick={() => onOpenChat(entry.chat!.telegramId)}>
              {entry.chat.title}
            </button>
          </div>
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

  const visibleChatColumns: DataTableColumn<VisibleChat>[] = [
    {
      key: "title",
      header: "Chat",
      sortValue: (entry) => entry.chat.title.toLowerCase(),
      render: (entry) => (
        <div className="channels-chat-cell">
          <ChatAvatar chatId={entry.chat.id} title={entry.chat.title} />
          <span className="channels-chat-title">{entry.chat.title}</span>
          {entry.chat.username && <span className="muted text-sm mono">@{entry.chat.username}</span>}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      sortValue: (entry) => entry.chat.type,
      render: (entry) => <span className="muted text-sm">{entry.chat.type === "channel" ? "Channel" : "Group"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (entry) =>
        entry.channel ? (
          <StatusPill tone="success">Added</StatusPill>
        ) : (
          <Button
            variant="primary"
            onClick={() =>
              setPendingAdd({
                identifier: { type: "telegram_id", value: entry.chat.id },
                label: entry.chat.title,
              })
            }
          >
            <Plus size={14} aria-hidden="true" />
            Add
          </Button>
        ),
    },
  ];

  const typedIdentifier = search.trim();
  const matchingChats = visibleChats?.filter((entry) => matchesSearch(entry, search)) ?? [];
  const shownChats = matchingChats.slice(0, typedIdentifier ? MAX_SEARCH_MATCHES : SUGGESTED_CHAT_COUNT);
  const hiddenChatCount = matchingChats.length - shownChats.length;
  // A chat missing from the visible list can still be added by its exact identifier.
  const addTypedIdentifier = typedIdentifier ? (
    <Button variant="primary" onClick={() => setPendingAdd({ identifier: typedIdentifier, label: typedIdentifier })}>
      <Plus size={14} aria-hidden="true" />
      Add “{typedIdentifier}” by username or ID
    </Button>
  ) : undefined;

  return (
    <div>
      <h2>Channels</h2>
      <h3>Your channels</h3>
      {channels === null ? (
        <div className="skeleton-stack">
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={channels}
          rowKey={(entry) => `${entry.channel.identifier.type}:${entry.channel.identifier.value}`}
          emptyState={
            <EmptyState
              icon={<Radio size={28} />}
              title="No channels yet"
              description="Pick a chat below to start ingesting it."
            />
          }
        />
      )}

      <section className="channels-picker">
        <h3>Add a channel</h3>
        <label className="channels-search">
          <Search size={14} aria-hidden="true" />
          <span className="visually-hidden">Search chats by name, or type a username or chat ID</span>
          <input
            type="search"
            placeholder="Search your chats, or type a @username or chat ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        {visibleChatsFailed ? (
          <div className="channels-load-failed">
            <p className="muted text-sm">
              Could not load chats from telegram-service. You can still type a channel's username or chat ID to add it.
            </p>
            {addTypedIdentifier}
          </div>
        ) : visibleChats === null ? (
          <div className="skeleton-stack">
            <Skeleton height="2.5rem" />
            <Skeleton height="2.5rem" />
          </div>
        ) : (
          <div className="channels-picker-list">
            <DataTable
              columns={visibleChatColumns}
              rows={shownChats}
              rowKey={(entry) => entry.chat.id}
              emptyState={
                <EmptyState
                  icon={<Search size={28} />}
                  title={typedIdentifier ? `No chats match “${typedIdentifier}”` : "No channels or groups visible"}
                  description={
                    typedIdentifier
                      ? "If it's a chat this account can see, you can add it by its exact username or chat ID."
                      : "The connected Telegram account isn't a member of any channel or group yet."
                  }
                  action={addTypedIdentifier}
                />
              }
            />
            {hiddenChatCount > 0 && (
              <p className="muted text-sm channels-picker-more">
                {typedIdentifier
                  ? `Showing the first ${shownChats.length} of ${matchingChats.length} matches. Keep typing to narrow it down.`
                  : `Showing your ${shownChats.length} most recently active chats. Search to find the other ${hiddenChatCount}.`}
              </p>
            )}
          </div>
        )}
      </section>

      {pendingAdd && (
        <AddChannelDialog
          label={pendingAdd.label}
          submitting={submitting}
          onConfirm={(backfillPolicy) => void confirmAdd(backfillPolicy)}
          onCancel={() => setPendingAdd(null)}
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
