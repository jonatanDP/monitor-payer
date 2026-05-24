function formatDate(value) {
  if (!value) return "Sin datos";
  return new Date(value).toLocaleString("es-CO");
}

function formatJson(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function DeviceDetail({ device, timeline, loading, onClose }) {
  if (!device) return null;

  const logs = timeline?.logs || [];
  const commands = timeline?.commands || [];
  const metrics = timeline?.metrics || [];
  const heartbeats = timeline?.heartbeats || [];

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div>
          <span className="eyebrow">Detalle tecnico</span>
          <h2>{device.name || device.id}</h2>
          <p>{device.manufacturer || "Fabricante no reportado"} {device.model || ""}</p>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar detalle">
          X
        </button>
      </div>

      <section className="detail-grid">
        <div>
          <span>Android</span>
          <strong>{device.android_version || "N/D"}</strong>
        </div>
        <div>
          <span>Kiosk</span>
          <strong>{device.lock_task_active ? "Activo" : "No activo"}</strong>
        </div>
        <div>
          <span>Servicio</span>
          <strong>{device.service_running ? "Ejecutando" : "Sin reporte"}</strong>
        </div>
        <div>
          <span>Ultima conexion</span>
          <strong>{formatDate(device.last_seen)}</strong>
        </div>
      </section>

      {loading ? <div className="inline-loading">Cargando historial...</div> : null}

      <section className="timeline-section">
        <h3>Comandos recientes</h3>
        {commands.length === 0 ? <p className="muted">Sin comandos registrados.</p> : commands.slice(0, 8).map((command) => (
          <div className="timeline-item" key={`cmd-${command.id}`}>
            <span>{formatDate(command.created_at)}</span>
            <strong>{command.action}</strong>
            <p>{command.executed ? "Ejecutado" : "Pendiente"}</p>
          </div>
        ))}
      </section>

      <section className="timeline-section">
        <h3>Logs tecnicos</h3>
        {logs.length === 0 ? <p className="muted">Sin logs visibles.</p> : logs.slice(0, 10).map((log) => (
          <div className="timeline-item" key={`log-${log.id}`}>
            <span>{formatDate(log.created_at)}</span>
            <strong>{log.event}</strong>
            <p>{formatJson(log.details)}</p>
          </div>
        ))}
      </section>

      <section className="timeline-section">
        <h3>Heartbeats y metricas</h3>
        {[...heartbeats, ...metrics].slice(0, 10).map((item, index) => (
          <div className="timeline-item compact" key={`metric-${item.id || index}`}>
            <span>{formatDate(item.created_at)}</span>
            <p>
              Uptime {Math.round((item.uptime_ms || 0) / 60000)} min
              {item.latency_ms ? `, latencia ${item.latency_ms} ms` : ""}
            </p>
          </div>
        ))}
      </section>
    </aside>
  );
}
