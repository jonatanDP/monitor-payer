const ACTIONS = [
  { label: "Apagar", action: "SCREEN_OFF", variant: "danger" },
  { label: "Encender", action: "SCREEN_ON", variant: "success" },
  { label: "Reiniciar app", action: "RESTART_APP", variant: "warning" },
  { label: "Reiniciar equipo", action: "REBOOT_DEVICE", variant: "danger" },
  { label: "Refrescar kiosk", action: "REFRESH_KIOSK", variant: "neutral" },
  { label: "Bloquear", action: "LOCK_SCREEN", variant: "neutral" },
  { label: "Desbloquear", action: "UNLOCK_SCREEN", variant: "neutral" },
  { label: "Ping", action: "PING", variant: "success" },
  { label: "Configurar", action: "UPDATE_CONFIG", variant: "neutral" },
  { label: "Sincronizar", action: "SYNC", variant: "success" },
  { label: "Limpiar cache", action: "CLEAR_CACHE", variant: "warning" },
  { label: "Mantenimiento", action: "MAINTENANCE_MODE", variant: "warning" }
];

function formatLastSeen(value) {
  if (!value) {
    return "Sin datos";
  }

  return new Date(value).toLocaleString("es-CO");
}

function formatDuration(ms) {
  if (!ms) return "Sin datos";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} d ${hours % 24} h`;
  return `${hours} h ${minutes % 60} min`;
}

function formatStorage(device) {
  if (!device.storage_free_mb || !device.storage_total_mb) return "N/D";
  return `${Math.round(device.storage_free_mb / 1024)} / ${Math.round(device.storage_total_mb / 1024)} GB libres`;
}

function formatRam(device) {
  if (!device.ram_used_mb || !device.ram_total_mb) return "N/D";
  return `${device.ram_used_mb} / ${device.ram_total_mb} MB`;
}

function getHeartbeatState(device) {
  if (device.frozen) return "Congelado";
  if (!device.last_seen) return "Sin heartbeat";
  const ageSeconds = (Date.now() - new Date(device.last_seen).getTime()) / 1000;
  if (ageSeconds > 60) return "Sin heartbeat";
  if (ageSeconds > 20) return "Tardio";
  return "Live";
}

export default function DeviceTable({ devices, busyDeviceId, onAction, onSelectDevice }) {
  return (
    <div className="table-frame">
      <table className="device-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>IP</th>
            <th>Estado</th>
            <th>Android</th>
            <th>Fabricante / modelo</th>
            <th>Uptime</th>
            <th>Ultima conexion</th>
            <th>Temperatura</th>
            <th>RAM</th>
            <th>Almacenamiento</th>
            <th>Kiosk</th>
            <th>Bateria</th>
            <th>Servicio</th>
            <th>Heartbeat</th>
            <th>Latencia</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 ? (
            <tr>
              <td colSpan="16" className="empty-cell">No hay dispositivos registrados.</td>
            </tr>
          ) : devices.map((device) => (
            <tr key={device.id} className={device.frozen ? "row-warning" : ""}>
              <td>
                <button className="link-button" type="button" onClick={() => onSelectDevice(device)}>
                  {device.name || device.id}
                </button>
                <span className="device-id">{device.id}</span>
              </td>
              <td>{device.ip || "Sin IP"}</td>
              <td>
                <span className={`status-pill ${device.frozen ? "frozen" : device.status}`}>
                  {device.frozen ? "congelado" : device.status}
                </span>
              </td>
              <td>{device.android_version || "N/D"}</td>
              <td>{[device.manufacturer, device.model].filter(Boolean).join(" / ") || "N/D"}</td>
              <td>{formatDuration(device.uptime_ms)}</td>
              <td>{formatLastSeen(device.last_seen)}</td>
              <td>{device.temperature_c ? `${device.temperature_c} C` : "N/D"}</td>
              <td>{formatRam(device)}</td>
              <td>{formatStorage(device)}</td>
              <td>{device.lock_task_active ? "Activo" : device.mode || "N/D"}</td>
              <td>{device.battery_level !== null && device.battery_level !== undefined ? `${device.battery_level}%` : "N/D"}</td>
              <td>{device.service_running ? "Activo" : "Sin reporte"}</td>
              <td>{getHeartbeatState(device)}</td>
              <td>{device.latency_ms ? `${device.latency_ms} ms` : "N/D"}</td>
              <td>
                <div className="actions-grid">
                  {ACTIONS.map((item) => (
                    <button
                      key={`${device.id}-${item.action}`}
                      className={`action-button ${item.variant}`}
                      disabled={busyDeviceId === device.id}
                      onClick={() => onAction(device, item.action)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
