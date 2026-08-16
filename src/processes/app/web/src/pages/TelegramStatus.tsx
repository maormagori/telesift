import { useEffect, useState } from "react";
import { api, type ConnectionStatus } from "../api/client";

export function TelegramStatus() {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .getTelegramStatus()
      .then(setStatus)
      .catch(() => setError(true));
  }, []);

  return (
    <div>
      <h2>Telegram status</h2>
      {error && <p className="error">Could not reach telegram-service.</p>}
      {!error && !status && <p className="muted">Loading...</p>}
      {status && (
        <ul>
          <li>Connected: {status.connected ? "yes" : "no"}</li>
          {status.account && (
            <>
              <li>Account: {status.account.firstName ?? status.account.username ?? status.account.id}</li>
              <li>Username: {status.account.username ?? "-"}</li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}
