import { useEffect, useState } from "react";

const REMOTE_ACTIONS = [
  { label: "Apagar pantalla", action: "SCREEN_OFF", tone: "danger" },
  { label: "Encender pantalla", action: "SCREEN_ON", tone: "success" },
  { label: "Reiniciar app", action: "RESTART_APP", tone: "warning" },
  { label: "Reiniciar equipo", action: "REBOOT_DEVICE", tone: "danger" },
  { label: "Sincronizar", action: "SYNC", tone: "success" },
  { label: "Refrescar kiosk", action: "REFRESH_KIOSK", tone: "neutral" },
  { label: "Bloquear", action: "LOCK_SCREEN", tone: "neutral" },
  { label: "Limpiar cache", action: "CLEAR_CACHE", tone: "warning" },
  { label: "Modo mantenimiento", action: "MAINTENANCE_MODE", tone: "warning" },
  { label: "Ping", action: "PING", tone: "success" }
];

function formatDate(value) {
  if (!value) return "Sin datos";
  return new Date(value).toLocaleString("es-CO");
}

function formatJson(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function getTagText(tags) {
  if (Array.isArray(tags)) return tags.join(", ");
  return tags || "";
}

export default function DeviceDetail({
  device,
  timeline,
  loading,
  busy,
  onClose,
  onAction,
  onSave,
  onSaveSchedule,
  onRequestScreenshot
}) {
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (!device) {
      setForm(null);
      return;
    }
    setForm({
      name: device.name || "",
      location: device.location || "",
      device_group: device.device_group || "PRODUCTION",
      tags: getTagText(device.tags),
      environment: device.environment || "PRODUCTION",
      scheduled_power_on: device.scheduled_power_on || "",
      scheduled_power_off: device.scheduled_power_off || "",
      auto_sync_interval_minutes: device.auto_sync_interval_minutes || 10,
      agent_hidden: Boolean(device.agent_hidden),
      maintenance_mode: Boolean(device.maintenance_mode)
    });
  }, [device]);

  if (!device || !form) return null;

  const logs = timeline?.logs || [];
  const commands = timeline?.commands || [];
  const metrics = timeline?.metrics || [];
  const heartbeats = timeline?.heartbeats || [];
  const alerts = timeline?.alerts || [];

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function buildPayload() {
    return {
      ...form,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      auto_sync_interval_minutes: Number(form.auto_sync_interval_minutes) || 10
    };
  }

  return (
    <aside className="detail-panel">
      <div className="detail-header">
        <div>
          <span className="eyebrow">Administracion MDM</span>
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
          <span>Marca real</span>
          <strong>{device.brand || device.manufacturer || "N/D"}</strong>
        </div>
        <div>
          <span>Kiosk</span>
          <strong>{device.lock_task_active ? "Activo" : "No activo"}</strong>
        </div>
        <div>
          <span>Ultima conexion</span>
          <strong>{formatDate(device.last_seen)}</strong>
        </div>
      </section>

      <section className="admin-section">
        <h3>Gestion del dispositivo</h3>
        <div className="admin-form">
          <label>
            Nombre
            <input value={form.name} onChange={(event) => updateField("name", event.target.value)} />
          </label>
          <label>
            Ubicacion
            <input value={form.location} onChange={(event) => updateField("location", event.target.value)} />
          </label>
          <label>
            Grupo
            <input value={form.device_group} onChange={(event) => updateField("device_group", event.target.value)} />
          </label>
          <label>
            Etiquetas
            <input value={form.tags} onChange={(event) => updateField("tags", event.target.value)} />
          </label>
          <label>
            Entorno
            <select value={form.environment} onChange={(event) => updateField("environment", event.target.value)}>
              <option value="PRODUCTION">PRODUCTION</option>
              <option value="TEST">TEST</option>
            </select>
          </label>
          <label>
            Sync automatico min
            <input
              min="1"
              type="number"
              value={form.auto_sync_interval_minutes}
              onChange={(event) => updateField("auto_sync_interval_minutes", event.target.value)}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.agent_hidden}
              onChange={(event) => updateField("agent_hidden", event.target.checked)}
            />
            Agente oculto administrado
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.maintenance_mode}
              onChange={(event) => updateField("maintenance_mode", event.target.checked)}
            />
            Modo mantenimiento
          </label>
        </div>
        <button className="secondary-button full-width" type="button" disabled={busy} onClick={() => onSave(device, buildPayload())}>
          Guardar y sincronizar Android
        </button>
      </section>

      <section className="admin-section">
        <h3>Programacion remota</h3>
        <div className="admin-form two-cols">
          <label>
            Encendido
            <input type="time" value={form.scheduled_power_on} onChange={(event) => updateField("scheduled_power_on", event.target.value)} />
          </label>
          <label>
            Apagado
            <input type="time" value={form.scheduled_power_off} onChange={(event) => updateField("scheduled_power_off", event.target.value)} />
          </label>
        </div>
        <button
          className="secondary-button full-width"
          type="button"
          disabled={busy}
          onClick={() => onSaveSchedule(device, buildPayload())}
        >
          Aplicar horario
        </button>
      </section>

      <section className="admin-section">
        <h3>Acciones remotas</h3>
        <div className="action-menu">
          {REMOTE_ACTIONS.map((item) => (
            <button
              key={item.action}
              className={`action-button ${item.tone}`}
              type="button"
              disabled={busy}
              onClick={() => onAction(device, item.action)}
            >
              {item.label}
            </button>
          ))}
          <button
            className="action-button neutral"
            type="button"
            disabled={busy}
            onClick={() => onRequestScreenshot(device)}
          >
            Solicitar screenshot
          </button>
        </div>
        <div className="screenshot-box">
          {device.last_screenshot_url ? (
            <img src={device.last_screenshot_url} alt={`Captura de ${device.name || device.id}`} />
          ) : (
            <span>Sin captura disponible. La solicitud queda en cola para el agente Android.</span>
          )}
        </div>
      </section>

      {loading ? <div className="inline-loading">Cargando historial...</div> : null}

      <section className="timeline-section">
        <h3>Centro de alertas</h3>
        {alerts.length === 0 ? <p className="muted">Sin alertas activas para este dispositivo.</p> : alerts.slice(0, 8).map((alert) => (
          <div className="timeline-item" key={`alert-${alert.id}`}>
            <span>{formatDate(alert.created_at)}</span>
            <strong>{alert.severity || "info"} · {alert.type}</strong>
            <p>{alert.message}</p>
          </div>
        ))}
      </section>

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
