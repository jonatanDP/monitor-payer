import { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";

const TOKEN_KEY = "secure_screen_manager_token";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }, [token]);

  if (!token) {
    return <LoginPage onLogin={setToken} />;
  }

  return <DashboardPage token={token} onLogout={() => setToken("")} />;
}
