import { useEffect, useState } from "react";
import { api, type MessageWithMedia } from "../api/client";

const PAGE_SIZE = 50;

// Rendered with `key={chatId}` by App.tsx, so a chat switch remounts this
// component fresh rather than needing an effect to reset state manually.
export function ChatMessages({ chatId }: { chatId: string }) {
  const [pages, setPages] = useState<MessageWithMedia[][]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    void loadMore();
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

  const messages = pages.flat();

  return (
    <div>
      <h2>Raw messages — {chatId}</h2>
      {messages.length === 0 && !loading && <p className="muted">No messages yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {messages.map(({ message, media }) => (
          <li key={message.id} style={{ borderBottom: "1px solid #8884", padding: "0.5rem 0" }}>
            <div className="muted">
              #{message.telegramMessageId} · {new Date(message.sourceDate).toLocaleString()}
              {message.deletedAt && " · deleted"}
            </div>
            {message.text && <div>{message.text}</div>}
            {media && (
              <div>
                <div className="muted">
                  {media.fileName ?? "media"} · {media.mimeType ?? "unknown type"} ·{" "}
                  {media.sizeBytes ? `${Math.round(media.sizeBytes / 1024)} KB` : "size unknown"} ·{" "}
                  {media.availability}
                </div>
                {media.mimeType?.startsWith("video/") ? (
                  <video controls style={{ maxWidth: "100%" }} src={api.mediaUrl(chatId, message.telegramMessageId)} />
                ) : media.mimeType?.startsWith("image/") ? (
                  <img alt={media.fileName ?? "media preview"} style={{ maxWidth: "100%" }} src={api.mediaUrl(chatId, message.telegramMessageId)} />
                ) : (
                  <a href={api.mediaUrl(chatId, message.telegramMessageId)}>Download {media.fileName ?? "media"}</a>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {!exhausted && (
        <button type="button" onClick={() => void loadMore()} disabled={loading}>
          {loading ? "Loading..." : "Load older messages"}
        </button>
      )}
    </div>
  );
}
