import { AlertTriangle, UserCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type ConnectionStatus } from "../api/client";
import { Card } from "../components/Card";
import { StatusPill } from "../components/StatusPill";
import "./TelegramStatus.css";

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
      {error && (
        <p className="telegram-status-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          Could not reach telegram-service.
        </p>
      )}
      {!error && !status && <p className="muted">Loading...</p>}
      {status && (
        <Card className="telegram-status-card">
          <div className="telegram-status-row">
            <span className="muted text-sm">Connection</span>
            <StatusPill tone={status.connected ? "success" : "destructive"}>{status.connected ? "Connected" : "Disconnected"}</StatusPill>
          </div>
          {status.account && (
            <div className="telegram-status-account">
              <UserCircle2 size={32} aria-hidden="true" className="muted" />
              <div>
                <div>{status.account.firstName ?? status.account.username ?? status.account.id}</div>
                <div className="muted text-sm mono">{status.account.username ? `@${status.account.username}` : status.account.id}</div>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
