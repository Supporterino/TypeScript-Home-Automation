/**
 * Home Automation Status Page — vanilla JS dashboard
 * No build step required. ES2022 modules are not used to keep this
 * a single self-contained inline script.
 */

/* ── Constants ─────────────────────────────────────────────────────────── */

const POLL_INTERVAL = 5000;
const LOG_LIMIT = 150;

const LEVEL_NAMES = {
  10: "TRACE",
  20: "DEBUG",
  30: "INFO",
  40: "WARN",
  50: "ERROR",
  60: "FATAL",
};

/* ── State ──────────────────────────────────────────────────────────────── */

let token = "";
let basePath = "";
let pollTimer = null;

// Cached data
let cachedStatus = null;
let cachedAutomations = [];
let cachedState = {};
let cachedLogs = [];

// Log filters (applied client-side)
let logFilterLevel = 0;
let logFilterAutomation = "";
let logFilterText = "";

// Expanded automation rows
const expandedAutomations = new Set();

// State rows in edit mode
const editingStateKeys = new Set();

/* ── Bootstrap ──────────────────────────────────────────────────────────── */

document.addEventListener("DOMContentLoaded", () => {
  basePath = document.documentElement.dataset.basePath || "/status";
  token = sessionStorage.getItem("ts-ha-token") || "";

  setupTabs();
  setupModals();
  setupLogFilters();
  setupStateNewKey();
  setupGlobalRefresh();

  fetchAll().then(() => {
    startPolling();
  });
});

/* ── Polling ────────────────────────────────────────────────────────────── */

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(fetchAll, POLL_INTERVAL);
}

async function fetchAll() {
  try {
    const [statusData, automationsData, stateData, logsData] = await Promise.all([
      apiFetch("/api/status"),
      apiFetch("/api/automations"),
      apiFetch("/api/state"),
      apiFetch(`/api/logs?limit=${LOG_LIMIT}`),
    ]);

    cachedStatus = statusData;
    cachedAutomations = automationsData?.automations || [];
    cachedState = stateData?.state || {};
    cachedLogs = logsData?.entries || [];

    renderAll();
    updateSidebarStatus(true);
  } catch (err) {
    updateSidebarStatus(false, err.message);
  }
}

/* ── API helpers ────────────────────────────────────────────────────────── */

async function apiFetch(path, options = {}) {
  const url = basePath + path;
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });

  if (res.status === 401) {
    // Token rejected — go back to login
    sessionStorage.removeItem("ts-ha-token");
    window.location.href = `${basePath}/login`;
    return null;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/* ── Tab system ─────────────────────────────────────────────────────────── */

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    });
  });
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
}

/* ── Sidebar status ─────────────────────────────────────────────────────── */

function updateSidebarStatus(connected, errorMsg) {
  const dot = document.getElementById("connection-dot");
  const lastRefresh = document.getElementById("last-refresh");

  if (dot) {
    dot.className = `connection-dot ${connected ? "connected" : "disconnected"}`;
    dot.title = connected ? "Connected" : errorMsg || "Disconnected";
  }

  if (lastRefresh) {
    const now = new Date();
    lastRefresh.textContent = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
  }
}

/* ── Render all tabs ────────────────────────────────────────────────────── */

function renderAll() {
  renderOverview();
  renderAutomations();
  renderState();
  renderLogs();
}

/* ── Overview tab ───────────────────────────────────────────────────────── */

function renderOverview() {
  const s = cachedStatus;

  // Engine status badge
  setEl("stat-engine-status", () => {
    const ready = s?.status === "ready";
    return `<span class="badge ${ready ? "ready" : "not-ready"}">${ready ? "Ready" : "Not Ready"}</span>`;
  });

  // MQTT badge
  setEl("stat-mqtt-status", () => {
    const connected = s?.checks?.mqtt === true;
    return `<span class="badge ${connected ? "ready" : "not-ready"}">${connected ? "Connected" : "Disconnected"}</span>`;
  });

  // Uptime
  setEl("stat-uptime", () => {
    if (!s?.startedAt) return '<span class="stat-value red">—</span>';
    const uptime = formatUptime(Date.now() - s.startedAt);
    return `<span class="stat-value uptime-value">${uptime}</span>`;
  });

  // Timezone
  setEl("stat-tz", () => {
    return `<span class="stat-value cyan">${s?.tz || "—"}</span>`;
  });

  // Automation count
  setEl("stat-automation-count", () => {
    return `<span class="stat-value purple">${cachedAutomations.length}</span>`;
  });

  // State count
  setEl("stat-state-count", () => {
    const count = Object.keys(cachedState).length;
    return `<span class="stat-value cyan">${count}</span>`;
  });

  // Recent logs (last 10)
  setEl("overview-recent-logs", () => {
    const recent = cachedLogs.slice(-10);
    if (!recent.length) return '<li class="empty-state">No logs yet</li>';
    return recent
      .map((e) => {
        const levelName = LEVEL_NAMES[e.level] || String(e.level);
        const time = formatTime(e.time);
        const automation = e.automation
          ? `<span style="color:var(--purple)">${esc(e.automation)}</span> `
          : "";
        return `<li class="recent-log-entry level-${e.level}">
          <span class="log-time">${time}</span>
          <span class="log-level">${levelName}</span>
          ${automation}<span class="log-msg">${esc(e.msg)}</span>
        </li>`;
      })
      .join("");
  });
}

/* ── Automations tab ────────────────────────────────────────────────────── */

function renderAutomations() {
  setEl("automations-table-body", () => {
    if (!cachedAutomations.length) {
      return '<tr><td colspan="3" class="empty-state">No automations registered</td></tr>';
    }

    return cachedAutomations
      .map((a) => {
        const triggerChips = (a.triggers || [])
          .map((t) => `<span class="trigger-chip ${t.type}">${t.type}</span>`)
          .join("");

        const isExpanded = expandedAutomations.has(a.name);

        const expandedContent = isExpanded
          ? `<tr class="expand-row" data-expand-for="${esc(a.name)}">
              <td colspan="3">
                <div class="expand-content open">
                  <div class="expand-inner">
                    <strong>Triggers:</strong>
                    <pre>${esc(JSON.stringify(a.triggers || [], null, 2))}</pre>
                  </div>
                </div>
              </td>
            </tr>`
          : "";

        return `<tr class="clickable ${isExpanded ? "expanded" : ""}" data-automation="${esc(a.name)}" onclick="toggleAutomationExpand('${esc(a.name)}')">
          <td><strong>${esc(a.name)}</strong></td>
          <td>${triggerChips || "—"}</td>
          <td>
            <div class="btn-group">
              <button class="btn primary" onclick="event.stopPropagation(); openTriggerModal('${esc(a.name)}')">Trigger</button>
            </div>
          </td>
        </tr>${expandedContent}`;
      })
      .join("");
  });
}

function toggleAutomationExpand(name) {
  if (expandedAutomations.has(name)) {
    expandedAutomations.delete(name);
  } else {
    expandedAutomations.add(name);
  }
  renderAutomations();
}

/* ── State tab ──────────────────────────────────────────────────────────── */

function renderState() {
  setEl("state-table-body", () => {
    const keys = Object.keys(cachedState);
    if (!keys.length) {
      return '<tr><td colspan="3" class="empty-state">No state keys</td></tr>';
    }

    return keys
      .map((key) => {
        const raw = cachedState[key];
        const display = typeof raw === "object" ? JSON.stringify(raw) : String(raw);
        const isEditing = editingStateKeys.has(key);

        return `<tr data-state-key="${esc(key)}">
          <td><code>${esc(key)}</code></td>
          <td>
            <span
              class="editable-value"
              contenteditable="${isEditing}"
              id="state-val-${esc(key)}"
              data-original="${esc(display)}"
              onclick="startStateEdit('${esc(key)}')"
              onkeydown="handleStateKeydown(event, '${esc(key)}')"
            >${esc(display)}</span>
          </td>
          <td>
            <div class="btn-group">
              ${isEditing ? `<button class="btn success" onclick="saveStateEdit('${esc(key)}')">Save</button><button class="btn" onclick="cancelStateEdit('${esc(key)}')">Cancel</button>` : ""}
              <button class="btn danger" onclick="deleteStateKey('${esc(key)}')">Delete</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  });
}

function startStateEdit(key) {
  editingStateKeys.add(key);
  renderState();
  const el = document.getElementById(`state-val-${key}`);
  if (el) {
    el.focus();
    // Move cursor to end
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function cancelStateEdit(key) {
  editingStateKeys.delete(key);
  renderState();
}

function handleStateKeydown(event, key) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    saveStateEdit(key);
  } else if (event.key === "Escape") {
    cancelStateEdit(key);
  }
}

async function saveStateEdit(key) {
  const el = document.getElementById(`state-val-${key}`);
  if (!el) return;

  const raw = el.textContent.trim();
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    value = raw;
  }

  try {
    await apiFetch(`/api/state/${encodeURIComponent(key)}`, {
      method: "PUT",
      body: JSON.stringify(value),
    });
    editingStateKeys.delete(key);
    cachedState[key] = value;
    renderState();
  } catch (err) {
    showError(`Failed to save state key "${key}": ${err.message}`);
  }
}

async function deleteStateKey(key) {
  if (!confirm(`Delete state key "${key}"?`)) return;

  try {
    await apiFetch(`/api/state/${encodeURIComponent(key)}`, { method: "DELETE" });
    delete cachedState[key];
    editingStateKeys.delete(key);
    renderState();
  } catch (err) {
    showError(`Failed to delete key "${key}": ${err.message}`);
  }
}

function setupStateNewKey() {
  const btn = document.getElementById("btn-new-state");
  if (btn) btn.addEventListener("click", openNewStateModal);

  const form = document.getElementById("new-state-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const keyInput = document.getElementById("new-state-key");
      const valInput = document.getElementById("new-state-value");
      const key = keyInput?.value.trim();
      const rawVal = valInput?.value.trim();
      if (!key) return;

      let value;
      try {
        value = JSON.parse(rawVal);
      } catch {
        value = rawVal;
      }

      try {
        await apiFetch(`/api/state/${encodeURIComponent(key)}`, {
          method: "PUT",
          body: JSON.stringify(value),
        });
        cachedState[key] = value;
        closeModal("new-state-modal");
        if (keyInput) keyInput.value = "";
        if (valInput) valInput.value = "";
        renderState();
      } catch (err) {
        showError(`Failed to create key: ${err.message}`);
      }
    });
  }
}

function openNewStateModal() {
  document.getElementById("new-state-modal")?.showModal();
}

/* ── Logs tab ───────────────────────────────────────────────────────────── */

function setupLogFilters() {
  const levelSel = document.getElementById("log-filter-level");
  const autoInput = document.getElementById("log-filter-automation");
  const textInput = document.getElementById("log-filter-text");
  const clearBtn = document.getElementById("log-filter-clear");

  if (levelSel) {
    levelSel.addEventListener("change", () => {
      logFilterLevel = Number(levelSel.value);
      renderLogs();
    });
  }

  if (autoInput) {
    autoInput.addEventListener("input", () => {
      logFilterAutomation = autoInput.value.trim().toLowerCase();
      renderLogs();
    });
  }

  if (textInput) {
    textInput.addEventListener("input", () => {
      logFilterText = textInput.value.trim().toLowerCase();
      renderLogs();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      logFilterLevel = 0;
      logFilterAutomation = "";
      logFilterText = "";
      if (levelSel) levelSel.value = "0";
      if (autoInput) autoInput.value = "";
      if (textInput) textInput.value = "";
      renderLogs();
    });
  }
}

function renderLogs() {
  setEl("logs-list", () => {
    let entries = cachedLogs;

    // Apply filters
    if (logFilterLevel > 0) entries = entries.filter((e) => e.level >= logFilterLevel);
    if (logFilterAutomation) {
      entries = entries.filter((e) =>
        (e.automation || "").toLowerCase().includes(logFilterAutomation),
      );
    }
    if (logFilterText) {
      entries = entries.filter(
        (e) =>
          (e.msg || "").toLowerCase().includes(logFilterText) ||
          JSON.stringify(e).toLowerCase().includes(logFilterText),
      );
    }

    if (!entries.length) {
      return '<li class="empty-state">No log entries match the current filters</li>';
    }

    return entries
      .slice(-200)
      .reverse()
      .map((e) => {
        const levelName = LEVEL_NAMES[e.level] || String(e.level);
        const time = formatTime(e.time);
        const automation = e.automation || "—";
        return `<li class="log-entry level-${e.level}">
          <span class="log-time">${time}</span>
          <span class="log-level">${levelName}</span>
          <span class="log-automation">${esc(automation)}</span>
          <span class="log-msg">${esc(e.msg || "")}</span>
        </li>`;
      })
      .join("");
  });
}

/* ── Trigger modal ──────────────────────────────────────────────────────── */

const TRIGGER_TEMPLATES = {
  mqtt: (name) => JSON.stringify({ type: "mqtt", topic: `manual/${name}`, payload: {} }, null, 2),
  cron: () => JSON.stringify({ type: "cron", expression: "manual" }, null, 2),
  state: () =>
    JSON.stringify({ type: "state", key: "manual", newValue: null, oldValue: null }, null, 2),
  webhook: () =>
    JSON.stringify(
      { type: "webhook", path: "manual", method: "POST", headers: {}, query: {}, body: null },
      null,
      2,
    ),
};

let triggerTargetName = "";

function openTriggerModal(name) {
  triggerTargetName = name;
  const modal = document.getElementById("trigger-modal");
  const titleEl = document.getElementById("trigger-modal-title");
  const typeEl = document.getElementById("trigger-type");
  const payloadEl = document.getElementById("trigger-payload");

  if (titleEl) titleEl.textContent = `Trigger: ${name}`;
  if (typeEl) {
    typeEl.value = "mqtt";
    updateTriggerTemplate(name, "mqtt");
  }
  if (payloadEl && typeEl) {
    // Update template on type change
    typeEl.onchange = () => updateTriggerTemplate(name, typeEl.value);
  }

  const errEl = document.getElementById("trigger-error");
  if (errEl) errEl.textContent = "";

  modal?.showModal();
}

function updateTriggerTemplate(name, type) {
  const payloadEl = document.getElementById("trigger-payload");
  if (payloadEl && TRIGGER_TEMPLATES[type]) {
    payloadEl.value = TRIGGER_TEMPLATES[type](name);
  }
}

function setupModals() {
  // Trigger modal submit
  document.getElementById("trigger-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payloadEl = document.getElementById("trigger-payload");
    const errEl = document.getElementById("trigger-error");

    let body;
    try {
      body = JSON.parse(payloadEl?.value || "{}");
    } catch {
      if (errEl) errEl.textContent = "Invalid JSON payload";
      return;
    }

    try {
      await apiFetch(`/api/automations/${encodeURIComponent(triggerTargetName)}/trigger`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      closeModal("trigger-modal");
      // Refresh logs after a short delay to capture the trigger's output
      setTimeout(fetchAll, 800);
    } catch (err) {
      if (errEl) errEl.textContent = err.message;
    }
  });

  // Close buttons
  document.querySelectorAll("[data-close-modal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.closeModal;
      closeModal(id);
    });
  });

  // Close on backdrop click
  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (e) => {
      const rect = dialog.getBoundingClientRect();
      const isBackdrop =
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom;
      if (isBackdrop) dialog.close();
    });
  });
}

function closeModal(id) {
  document.getElementById(id)?.close();
}

/* ── Global refresh button ──────────────────────────────────────────────── */

function setupGlobalRefresh() {
  document.getElementById("btn-global-refresh")?.addEventListener("click", () => {
    fetchAll();
    startPolling(); // reset the interval
  });
}

/* ── Error display ──────────────────────────────────────────────────────── */

function showError(msg) {
  const el = document.getElementById("global-error");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
  setTimeout(() => {
    el.style.display = "none";
    el.textContent = "";
  }, 5000);
}

/* ── Utilities ──────────────────────────────────────────────────────────── */

function setEl(id, renderFn) {
  const el = document.getElementById(id);
  if (el) {
    try {
      el.innerHTML = renderFn();
    } catch (err) {
      el.innerHTML = `<span style="color:var(--red)">Render error: ${esc(err.message)}</span>`;
    }
  }
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// ── Global DOM event handlers ─────────────────────────────────────────────
// These functions are called from inline onclick/onkeydown attributes in the
// HTML strings generated by renderAutomations() and renderState(). They must
// be accessible from the global scope.

window.toggleAutomationExpand = toggleAutomationExpand;
window.openTriggerModal = openTriggerModal;
window.startStateEdit = startStateEdit;
window.cancelStateEdit = cancelStateEdit;
window.handleStateKeydown = handleStateKeydown;
window.saveStateEdit = saveStateEdit;
window.deleteStateKey = deleteStateKey;
