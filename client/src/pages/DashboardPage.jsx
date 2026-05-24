import { useEffect, useState } from "react";
import DeviceTable from "../components/DeviceTable";
import DeviceDetail from "../components/DeviceDetail";
import {
  fetchDeviceTimeline,
  fetchDevices,
  fetchStats,
  fetchTechnicalLogs,
  sendCommand
} from "../services/api";

const EMPTY_STATS = {
  total_devices: 0,
  online_devices: 0,
  offline_devices: 0,
  frozen_devices: 0,
  missing_heartbeat_devices: 0,
  restarts_today: 0,
  screen_off_today: 0,
  average_online_seconds: 0
};

function enrichDevices(devices) {
  return devices.map((device) => {
    const lastSeen = device.last_seen ? new Date(device.last_seen).getTime() : 0;
    const heartbeatAgeSeconds = lastSeen ? (Date.now() - lastSeen) / 1000 : Infinity;
    const frozen =
      Boolean(device.frozen) ||
      (
        device.status === "online" &&
        heartbeatAgeSeconds <= 180 &&
        device.heartbeat_signature &&
        device.last_event &&
        heartbeatAgeSeconds > 45
      );

    return {
      ...device,
      frozen,
      heartbeatAgeSeconds
    };
  });
}

function buildStats(devices, remoteStats) {
  const local = {
    total_devices: devices.length,
    online_devices: devices.filter((device) => device.status === "online" && !device.frozen).length,
    offline_devices: devices.filter((device) => device.status === "offline" || device.heartbeatAgeSeconds > 60).length,
    frozen_devices: devices.filter((device) => device.frozen).length,
    missing_heartbeat_devices: devices.filter((device) => device.heartbeatAgeSeconds > 20).length,
    restarts_today: devices.reduce((sum, device) => sum + Number(device.restart_app_today || 0), 0),
    screen_off_today: devices.reduce((sum, device) => sum + Number(device.screen_off_today || 0), 0),
    average_online_seconds: devices.length
      ? Math.round(devices.reduce((sum, device) => sum + Number(device.uptime_ms || 0), 0) / devices.length / 1000)
      : 0
  };

  return {
    ...EMPTY_STATS,
    ...local,
    ...(remoteStats || {})
  };
}

function formatAverage(seconds) {
  if (!seconds) return "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.round(minutes / 60)} h`;
}

function isAuthError(error) {
  return error?.status === 401;
}

export default function DashboardPage({ token, onLogout, onAuthFailure }) {
  const [devices, setDevices] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyDeviceId, setBusyDeviceId] = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);

  async function loadDevices() {
    try {
      const [deviceData, statsData, logsData] = await Promise.allSettled([
        fetchDevices(token),
        fetchStats(token),
        fetchTechnicalLogs(token)
      ]);

      if (deviceData.status === "rejected") {
        throw deviceData.reason;
      }

      const enrichedDevices = enrichDevices(deviceData.value);
      const remoteStats = statsData.status === "fulfilled" ? statsData.value : null;

      setDevices(enrichedDevices);
      setStats(buildStats(enrichedDevices, remoteStats));
      if (logsData.status === "fulfilled") {
        setLogs(logsData.value);
      }
      setError("");
      setLastRefresh(new Date());
    } catch (requestError) {
      if (isAuthError(requestError)) {
        console.warn("[dashboard] sesion expirada o token invalido");
        onAuthFailure?.();
        return;
      }
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

  async function handleSelectDevice(device) {
    setSelectedDevice(device);
    setTimelineLoading(true);
    setTimeline(null);

    try {
      setTimeline(await fetchDeviceTimeline(token, device.id));
    } catch (requestError) {
      if (isAuthError(requestError)) {
        console.warn("[dashboard] auth fail cargando timeline");
        onAuthFailure?.();
        return;
      }
      setTimeline({
        logs: logs.filter((log) => log.device_id === device.id),
        commands: [],
        heartbeats: [],
        metrics: [],
        alerts: []
      });
    } finally {
      setTimelineLoading(false);
    }
  }

  async function handleAction(device, action) {
    setBusyDeviceId(device.id);
    setError("");

    try {
      await sendCommand(token, device.id, action);
      await loadDevices();
    } catch (requestError) {
      if (isAuthError(requestError)) {
        console.warn("[dashboard] auth fail enviando comando");
        onAuthFailure?.();
        return;
      }
      setError(requestError.message);
    } finally {
      setBusyDeviceId("");
    }
  }

  const cards = [
    { label: "Total dispositivos", value: stats.total_devices, tone: "blue" },
    { label: "Online", value: stats.online_devices, tone: "green" },
    { label: "Offline", value: stats.offline_devices, tone: "red" },
    { label: "Congelados", value: stats.frozen_devices, tone: "yellow" },
    { label: "Sin heartbeat", value: stats.missing_heartbeat_devices, tone: "yellow" },
    { label: "Reinicios hoy", value: stats.restarts_today, tone: "blue" },
    { label: "Pantallas apagadas", value: stats.screen_off_today, tone: "blue" },
    { label: "Promedio online", value: formatAverage(stats.average_online_seconds), tone: "green" }
  ];

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <span className="eyebrow">NOC Android Kiosk</span>
          <h1>Secure Screen Manager</h1>
          <p>Monitoreo y soporte remoto tecnico para pantallas Android 11-14.</p>
        </div>

        <div className="header-actions">
          <div className="live-indicator">
            <span className="pulse-dot" />
            {lastRefresh ? `Actualizado ${lastRefresh.toLocaleTimeString("es-CO")}` : "Conectando"}
          </div>
          <button className="secondary-button" onClick={loadDevices}>Actualizar</button>
          <button className="secondary-button" onClick={onLogout}>Salir</button>
        </div>
      </header>

      <section className="stats-row" aria-label="Resumen de dispositivos">
        {cards.map((card) => (
          <div className={`stat-tile ${card.tone}`} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </div>
        ))}
      </section>

      {error ? <div className="error-box">{error}</div> : null}

      {loading ? (
        <div className="loading-box">Cargando consola de monitoreo...</div>
      ) : (
        <DeviceTable
          devices={devices}
          busyDeviceId={busyDeviceId}
          onAction={handleAction}
          onSelectDevice={handleSelectDevice}
        />
      )}

      <section className="alerts-panel">
        <div>
          <h2>Alertas y eventos recientes</h2>
          <p>Senales visibles para soporte tecnico remoto.</p>
        </div>
        <div className="alert-list">
          {devices.filter((device) => device.frozen || device.status === "offline" || device.heartbeatAgeSeconds > 20).slice(0, 6).map((device) => (
            <div className="alert-item" key={`alert-${device.id}`}>
              <strong>{device.name || device.id}</strong>
              <span>
                {device.frozen ? "Pantalla congelada detectada" : device.status === "offline" ? "Dispositivo offline" : "Heartbeat tardio"}
              </span>
            </div>
          ))}
          {logs.slice(0, 6).map((log) => (
            <div className="alert-item" key={`log-${log.id}`}>
              <strong>{log.event}</strong>
              <span>{log.device_id || "Sistema"} - {new Date(log.created_at).toLocaleTimeString("es-CO")}</span>
            </div>
          ))}
        </div>
      </section>

      <DeviceDetail
        device={selectedDevice}
        timeline={timeline}
        loading={timelineLoading}
        onClose={() => setSelectedDevice(null)}
      />
    </main>
  );
}
