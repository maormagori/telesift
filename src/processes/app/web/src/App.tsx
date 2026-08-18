import { useEffect, useState } from "react";
import { api } from "./api/client";
import { AppShell } from "./components/AppShell";
import { ToastProvider } from "./components/Toast";
import { ChatMessages } from "./pages/ChatMessages";
import { Channels } from "./pages/Channels";
import { Dashboard } from "./pages/Dashboard";
import { Downloads } from "./pages/Downloads";
import { Login } from "./pages/Login";
import { Review } from "./pages/Review";
import { SearchSimulator } from "./pages/SearchSimulator";
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
    return (
      <ToastProvider>
        <Login onLoggedIn={setUsername} />
      </ToastProvider>
    );
  }

  async function handleLogout(): Promise<void> {
    await api.logout();
    setUsername(null);
  }

  const chatMatch = /^\/chats\/([^/]+)$/.exec(path);

  return (
    <ToastProvider>
      <AppShell path={path} navigate={navigate} username={username} onLogout={() => void handleLogout()}>
        {path === "/channels" ? (
          <Channels onOpenChat={(chatId) => navigate(`/chats/${encodeURIComponent(chatId)}`)} />
        ) : path === "/telegram-status" ? (
          <TelegramStatus />
        ) : path === "/review" ? (
          <Review />
        ) : path === "/downloads" ? (
          <Downloads />
        ) : path === "/search" ? (
          <SearchSimulator />
        ) : chatMatch ? (
          <ChatMessages key={chatMatch[1]} chatId={decodeURIComponent(chatMatch[1]!)} onBack={() => navigate("/channels")} />
        ) : (
          <Dashboard navigate={navigate} />
        )}
      </AppShell>
    </ToastProvider>
  );
}
