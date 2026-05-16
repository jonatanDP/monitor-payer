const ACTIONS = [
  { label: "Apagar", action: "SCREEN_OFF", variant: "neutral" },
  { label: "Reiniciar app", action: "RESTART_APP", variant: "warning" },
  { label: "Ping", action: "PING", variant: "neutral" }
];

function formatLastSeen(value) {
  if (!value) {
    return "Sin datos";
  }

  return new Date(value).toLocaleString();
}

export default function DeviceTable({ devices, busyDeviceId, onAction }) {
  return (
    <div className="table-card">
      <table className="device-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>IP</th>
            <th>Estado</th>
            <th>Ultima conexion</th>
            <th>Modo</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {devices.length === 0 ? (
            <tr>
              <td colSpan="6" className="empty-cell">No hay dispositivos registrados.</td>
            </tr>
          ) : devices.map((device) => (
            <tr key={device.id}>
              <td>{device.name || device.id}</td>
              <td>{device.ip || "Sin IP"}</td>
              <td>
                <span className={`status-pill ${device.status}`}>
                  {device.status}
                </span>
              </td>
              <td>{formatLastSeen(device.last_seen)}</td>
              <td>{device.mode}</td>
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
