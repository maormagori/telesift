import { useState } from "react";
import { api } from "../api/client";
import "./ChatAvatar.css";

/** The chat's Telegram profile photo, falling back to its first letter when it has none. */
export function ChatAvatar({ chatId, title }: { chatId: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const initial = Array.from(title.trim())[0]?.toUpperCase() ?? "?";

  return (
    <span className="chat-avatar" aria-hidden="true">
      {failed ? (
        initial
      ) : (
        <img src={api.chatPhotoUrl(chatId)} alt="" loading="lazy" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
