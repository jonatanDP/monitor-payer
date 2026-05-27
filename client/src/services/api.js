const API_BASE_URL = "https://monitor-payer-backend.onrender.com";

async function request(path, options = {}) {
  const method = options.method || "GET";
  console.debug("[api] request start", method, path);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || "Request failed");
    error.status = response.status;
    error.data = data;
    if (response.status === 401) {
      console.warn("[api] auth fail", method, path, data?.message || response.statusText);
    } else {
      console.error("[api] request fail", method, path, response.status, data);
    }
    throw error;
  }

  console.debug("[api] request ok", method, path, response.status);
  return data;
}

export function login(username, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function fetchDevices(token) {
  return request("/devices", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function fetchStats(token) {
  return request("/stats", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function fetchTechnicalLogs(token) {
  return request("/technical-logs?limit=80", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function fetchDeviceTimeline(token, deviceId) {
  return request(`/devices/${deviceId}/timeline`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}

export function sendCommand(token, deviceId, type) {
  console.debug("[api] command sent", deviceId, type);
  return request(`/devices/${deviceId}/command`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ type })
  });
}

export function updateDevice(token, deviceId, payload) {
  console.debug("[api] device update", deviceId, payload);
  return request(`/devices/${deviceId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export function sendBulkCommand(token, type, deviceIds = []) {
  console.debug("[api] bulk command sent", type, deviceIds.length || "all");
  return request("/devices/bulk-command", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ type, deviceIds })
  });
}

export function saveDeviceSchedule(token, deviceId, payload) {
  console.debug("[api] schedule update", deviceId, payload);
  return request(`/devices/${deviceId}/schedule`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
}

export function requestDeviceScreenshot(token, deviceId) {
  console.debug("[api] screenshot request", deviceId);
  return request(`/devices/${deviceId}/screenshot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
}
