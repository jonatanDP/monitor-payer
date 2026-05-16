import { useEffect, useState } from "react";
import DeviceTable from "../components/DeviceTable";
import { fetchDevices, sendCommand } from "../services/api";

export default function DashboardPage({ token, onLogout }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyDeviceId, setBusyDeviceId] = useState("");

  async function loadDevices() {
    try {
      const data = await fetchDevices(token);
      setDevices(data);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDevices();
    const intervalId = window.setInterval(loadDevices, 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  async function handleAction(device, action) {
    setBusyDeviceId(device.id);
    setError("");

    try {
      await sendCommand(token, device.id, { action });
      await loadDevices();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyDeviceId("");
    }
  }

  const onlineCount = devices.filter((device) => device.status === "online").length;
  const offlineCount = devices.filter((device) => device.status === "offline").length;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <h1>Secure Screen Manager</h1>
          <p>Monitoreo y control remoto de dispositivos Android kiosk.</p>
        </div>

        <button className="secondary-button" onClick={onLogout}>
          Salir
        </button>
      </header>

      <section className="stats-row" aria-label="Resumen de dispositivos">
        <div className="stat-tile">
          <span>Online</span>
          <strong>{onlineCount}</strong>
        </div>
        <div className="stat-tile">
          <span>Offline</span>
          <strong>{offlineCount}</strong>
        </div>
        <div className="stat-tile">
          <span>Total</span>
          <strong>{devices.length}</strong>
        </div>
      </section>

      {error ? <div className="error-box">{error}</div> : null}

      {loading ? (
        <div className="loading-box">Cargando dispositivos...</div>
      ) : (
        <DeviceTable devices={devices} busyDeviceId={busyDeviceId} onAction={handleAction} />
      )}
    </main>
  );
}
