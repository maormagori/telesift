import { useEffect, useState } from "react";
import { api } from "./api/client";
import { ChatMessages } from "./pages/ChatMessages";
import { Channels } from "./pages/Channels";
import { Login } from "./pages/Login";
import { TelegramStatus } from "./pages/TelegramStatus";
import { usePath } from "./router";

export function App() {
  const [username, setUsername] = useState<string | null | undefined>(undefined);
  const [path, navigate] = usePath();

  useEffect(() => {
    void api.getSession().then((session) => setUsername(session?.username ?? null));
  }, []);

  if (username === undefined) return null;

  if (!username) {
    return <Login onLoggedIn={setUsername} />;
  }

  async function handleLogout(): Promise<void> {
    await api.logout();
    setUsername(null);
  }

  const chatMatch = /^\/chats\/([^/]+)$/.exec(path);

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <button type="button" onClick={() => navigate("/")}>
          Channels
        </button>
        <button type="button" onClick={() => navigate("/telegram-status")}>
          Telegram status
        </button>
        <span className="spacer" />
        <span className="muted">{username}</span>
        <button type="button" onClick={() => void handleLogout()}>
          Log out
        </button>
      </nav>

      {path === "/telegram-status" ? (
        <TelegramStatus />
      ) : chatMatch ? (
        <ChatMessages key={chatMatch[1]} chatId={decodeURIComponent(chatMatch[1]!)} />
      ) : (
        <Channels onOpenChat={(chatId) => navigate(`/chats/${encodeURIComponent(chatId)}`)} />
      )}
    </div>
  );
}
