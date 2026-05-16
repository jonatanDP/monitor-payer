import { useState } from "react";
import { login } from "../services/api";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await login(username, password);
      onLogin(response.token);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Secure Screen Manager</h1>
        <p>Control remoto basico para pantallas Android kiosk.</p>

        <label>
          Usuario
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>

        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        {error ? <div className="error-box">{error}</div> : null}

        <button type="submit" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </form>
    </main>
  );
}
