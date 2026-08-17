import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type MessageWithMedia } from "../api/client";
import { Button } from "../components/Button";
import { EmptyState } from "../components/EmptyState";
import { MediaPreview } from "../components/MediaPreview";
import { Skeleton } from "../components/Skeleton";
import "./ChatMessages.css";

const PAGE_SIZE = 50;

// Rendered with `key={chatId}` by App.tsx, so a chat switch remounts this
// component fresh rather than needing an effect to reset state manually.
export function ChatMessages({ chatId, onBack }: { chatId: string; onBack: () => void }) {
  const [pages, setPages] = useState<MessageWithMedia[][]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [mediaOnly, setMediaOnly] = useState(false);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    void loadMore();
    api
      .listChannels()
      .then((channels) => setTitle(channels.find((c) => c.chat?.telegramId === chatId)?.chat?.title ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only, loadMore reads current state via closures below
  }, []);

  async function loadMore(): Promise<void> {
    setLoading(true);
    try {
      const last = pages.at(-1)?.at(-1);
      const before = last?.message.telegramMessageId;
      const page = await api.listMessages(chatId, { before, limit: PAGE_SIZE });
      if (page.length === 0) setExhausted(true);
      else setPages((prev) => [...prev, page]);
    } finally {
      setLoading(false);
    }
  }

  const messages = pages.flat().filter((m) => (mediaOnly ? m.media !== null : true));

  return (
    <div>
      <div className="chat-messages-header">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={14} aria-hidden="true" />
          Channels
        </Button>
        <div>
          <h2 className="chat-messages-title">{title ?? chatId}</h2>
          <p className="muted text-sm mono">Raw messages · {chatId}</p>
        </div>
      </div>

      <label className="chat-messages-filter">
        <input type="checkbox" checked={mediaOnly} onChange={(e) => setMediaOnly(e.target.checked)} />
        Media only
      </label>

      {messages.length === 0 && !loading && (
        <EmptyState
          icon={<span className="text-2xl">∅</span>}
          title={mediaOnly ? "No media messages loaded" : "No messages yet"}
          description={mediaOnly ? "Try loading more, or turn off the media-only filter." : undefined}
        />
      )}

      <ul className="chat-messages-list">
        {messages.map(({ message, media }) => (
          <li key={message.id} className="chat-messages-item">
            <div className="muted text-sm mono">
              #{message.telegramMessageId} · {new Date(message.sourceDate).toLocaleString()}
              {message.deletedAt && " · deleted"}
            </div>
            {message.text && <div>{message.text}</div>}
            {media && <MediaPreview media={media} src={api.mediaUrl(chatId, message.telegramMessageId)} />}
          </li>
        ))}
        {loading &&
          Array.from({ length: 3 }, (_, i) => (
            <li key={`skeleton-${i}`} className="chat-messages-item">
              <Skeleton height="0.75rem" width="220px" />
              <div style={{ marginTop: 6 }}>
                <Skeleton height="1rem" width="70%" />
              </div>
            </li>
          ))}
      </ul>

      {!exhausted && (
        <Button onClick={() => void loadMore()} loading={loading}>
          Load older messages
        </Button>
      )}
    </div>
  );
}
