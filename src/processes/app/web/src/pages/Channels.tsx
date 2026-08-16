import { useEffect, useState, type FormEvent } from "react";
import { api, type ChannelWithStatus } from "../api/client";

function formatCursor(entry: ChannelWithStatus): string {
  if (!entry.chat) return "not visible to this account yet";
  const state = entry.syncState;
  if (!state) return "resolved, awaiting first sync";
  if (state.lastError) return `error: ${state.lastError}`;
  if (!state.backfillCompletedAt) return `backfilling (through message ${state.newestSeenMessageId ?? 0})`;
  return `caught up (newest: ${state.newestSeenMessageId ?? "-"})`;
}

export function Channels({ onOpenChat }: { onOpenChat: (chatId: string) => void }) {
  const [channels, setChannels] = useState<ChannelWithStatus[] | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function refresh(): Promise<void> {
    setChannels(await api.listChannels());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleAdd(e: FormEvent): Promise<void> {
    e.preventDefault();
    setAddError(null);
    setAddNotice(null);
    setSubmitting(true);
    try {
      const result = await api.addChannel(identifier);
      setIdentifier("");
      setAddNotice(
        result.resolution.status === "resolved"
          ? `Found: ${result.resolution.chat.title}`
          : "Added, but not visible to this account yet — ingestion-worker will keep retrying.",
      );
      await refresh();
    } catch {
      setAddError("Could not add channel.");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(entry: ChannelWithStatus): Promise<void> {
    if (entry.channel.enabled) await api.disableChannel(entry.channel.identifier);
    else await api.enableChannel(entry.channel.identifier);
    await refresh();
  }

  return (
    <div>
      <h2>Channels</h2>
      <form className="inline" onSubmit={handleAdd}>
        <input
          placeholder="@username or numeric chat id"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
        <button type="submit" disabled={submitting || !identifier}>
          Add channel
        </button>
      </form>
      {addError && (
        <p className="error" role="alert">
          {addError}
        </p>
      )}
      {addNotice && <p>{addNotice}</p>}

      {channels === null ? (
        <p className="muted">Loading...</p>
      ) : channels.length === 0 ? (
        <p className="muted">No channels configured yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Identifier</th>
              <th>Title</th>
              <th>Status</th>
              <th>Enabled</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {channels.map((entry) => (
              <tr key={`${entry.channel.identifier.type}:${entry.channel.identifier.value}`}>
                <td>{entry.channel.identifier.value}</td>
                <td>
                  {entry.chat ? (
                    <button type="button" onClick={() => onOpenChat(entry.chat!.telegramId)}>
                      {entry.chat.title}
                    </button>
                  ) : (
                    <span className="muted">unresolved</span>
                  )}
                </td>
                <td>{formatCursor(entry)}</td>
                <td>{entry.channel.enabled ? "yes" : "no"}</td>
                <td>
                  <button type="button" onClick={() => void toggle(entry)}>
                    {entry.channel.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
