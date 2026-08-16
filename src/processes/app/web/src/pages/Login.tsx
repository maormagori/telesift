import { useState, type FormEvent } from "react";
import { api } from "../api/client";

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
    <div className="app-shell">
      <h1>TeleSift</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label>
            Username
            <br />
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </label>
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          <label>
            Password
            <br />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} style={{ marginTop: "0.75rem" }}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
