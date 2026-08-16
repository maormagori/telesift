import { AlertTriangle, Radio } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { Button } from "../components/Button";
import "./Login.css";

export function Login({ onLoggedIn }: { onLoggedIn: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.login(username, password);
      onLoggedIn(result.username);
    } catch {
      setError("Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <Radio size={22} aria-hidden="true" />
          <span>TeleSift</span>
        </div>
        <p className="muted text-sm login-subtitle">Operator console</p>

        <label className="login-field">
          <span>Username</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
        </label>
        <label className="login-field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && (
          <p className="login-error" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" loading={submitting} disabled={!username || !password} className="login-submit">
          Log in
        </Button>
      </form>
    </div>
  );
}
