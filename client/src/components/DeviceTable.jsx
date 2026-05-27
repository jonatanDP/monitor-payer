function formatLastSeen(value) {
  if (!value) return "Sin datos";
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

function getHeartbeatState(device) {
  if (device.frozen) return "Congelado";
  if (!device.last_seen) return "Sin heartbeat";
  const ageSeconds = (Date.now() - new Date(device.last_seen).getTime()) / 1000;
  if (ageSeconds > 60) return "Sin heartbeat";
  if (ageSeconds > 20) return "Tardio";
  return "Live";
}

function formatTags(tags) {
  if (!tags) return "Sin etiquetas";
  if (Array.isArray(tags)) return tags.length ? tags.join(", ") : "Sin etiquetas";
  return String(tags);
}

export default function DeviceTable({ devices, selectedDeviceId, onSelectDevice }) {
  return (
    <div className="table-frame">
      <table className="device-table">
        <thead>
          <tr>
            <th>Dispositivo</th>
            <th>Estado</th>
            <th>Grupo / entorno</th>
            <th>Identificacion</th>
            <th>IP</th>
            <th>Uptime</th>
            <th>Ultima conexion</th>
            <th>Heartbeat</th>
            <th>Kiosk</th>
            <th>Recursos</th>
            <th>Administrar</th>
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 ? (
            <tr>
              <td colSpan="11" className="empty-cell">No hay dispositivos registrados.</td>
            </tr>
          ) : devices.map((device) => (
            <tr
              key={device.id}
              className={[
                device.frozen ? "row-warning" : "",
                selectedDeviceId === device.id ? "row-selected" : ""
              ].filter(Boolean).join(" ")}
            >
              <td>
                <button className="link-button" type="button" onClick={() => onSelectDevice(device)}>
                  {device.name || device.id}
                </button>
                <span className="device-id">{device.id}</span>
                <span className="tag-line">{formatTags(device.tags)}</span>
              </td>
              <td>
                <span className={`status-pill ${device.frozen ? "frozen" : device.status}`}>
                  {device.frozen ? "congelado" : device.status || "desconocido"}
                </span>
              </td>
              <td>
                <strong>{device.device_group || "PRODUCTION"}</strong>
                <span className="cell-note">{device.environment || "PRODUCTION"}</span>
              </td>
              <td>
                {[device.manufacturer, device.model].filter(Boolean).join(" / ") || "N/D"}
                <span className="cell-note">{device.brand || "Marca no reportada"} · Android {device.android_version || "N/D"}</span>
              </td>
              <td>{device.ip || "Sin IP"}</td>
              <td>{formatDuration(device.uptime_ms)}</td>
              <td>{formatLastSeen(device.last_seen)}</td>
              <td>{getHeartbeatState(device)}</td>
              <td>{device.lock_task_active ? "Activo" : device.mode || "N/D"}</td>
              <td>
                RAM {device.ram_used_mb && device.ram_total_mb ? `${device.ram_used_mb}/${device.ram_total_mb} MB` : "N/D"}
                <span className="cell-note">
                  Bateria {device.battery_level !== null && device.battery_level !== undefined ? `${device.battery_level}%` : "N/D"}
                  {device.latency_ms ? ` · ${device.latency_ms} ms` : ""}
                </span>
              </td>
              <td>
                <button className="action-button neutral" type="button" onClick={() => onSelectDevice(device)}>
                  Abrir panel
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
