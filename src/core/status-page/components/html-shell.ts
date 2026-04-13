import { JS } from "../assets/app-js.js";
import { CSS } from "../assets/style-css.js";

export interface HtmlShellOptions {
  /** URL path prefix where the status page is mounted, e.g. "/status". */
  basePath: string;
  /**
   * Whether the engine has a token configured.
   * Reserved for future conditional rendering (e.g. showing a logout link).
   */
  hasAuth: boolean;
}

/**
 * Returns the full HTML document for the status page dashboard.
 * CSS and JS are inlined so the page loads with a single HTTP request.
 */
export function htmlShell({ basePath, hasAuth: _hasAuth }: HtmlShellOptions): string {
  return `<!DOCTYPE html>
<html lang="en" data-base-path="${esc(basePath)}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Home Automation — Status</title>
  <style>${CSS}</style>
</head>
<body>

<div class="layout">

  <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
  <nav class="sidebar">
    <div class="sidebar-title">ts-ha</div>

    <button class="tab-btn active" data-tab="overview">Overview</button>
    <button class="tab-btn" data-tab="automations">Automations</button>
    <button class="tab-btn" data-tab="state">State</button>
    <button class="tab-btn" data-tab="logs">Logs</button>

    <div class="sidebar-footer">
      <span class="connection-dot" id="connection-dot" title="Connecting…"></span>
      <span id="last-refresh">—</span>
    </div>
  </nav>

  <!-- ── Main content ─────────────────────────────────────────────────── -->
  <main class="main">

    <!-- Global error banner -->
    <div class="error-banner" id="global-error" style="display:none"></div>

    <!-- ── Overview ───────────────────────────────────────────────────── -->
    <section class="tab-panel active" id="tab-overview">
      <div class="section-header">
        <h1 class="panel-title">Overview</h1>
        <button class="btn refresh-btn" id="btn-global-refresh">↻ Refresh</button>
      </div>

      <div class="overview-grid">
        <div class="stat-card">
          <div class="stat-label">Engine</div>
          <div id="stat-engine-status"><span class="badge warn">Loading…</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">MQTT</div>
          <div id="stat-mqtt-status"><span class="badge warn">Loading…</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Uptime</div>
          <div id="stat-uptime"><span class="stat-value">—</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Timezone</div>
          <div id="stat-tz"><span class="stat-value cyan">—</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Automations</div>
          <div id="stat-automation-count"><span class="stat-value purple">—</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">State Keys</div>
          <div id="stat-state-count"><span class="stat-value cyan">—</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Recent Logs</div>
        <ul class="recent-log-list" id="overview-recent-logs">
          <li class="empty-state">Loading…</li>
        </ul>
      </div>
    </section>

    <!-- ── Automations ─────────────────────────────────────────────────── -->
    <section class="tab-panel" id="tab-automations">
      <div class="section-header">
        <h1 class="panel-title">Automations</h1>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Triggers</th>
                <th style="width:120px">Actions</th>
              </tr>
            </thead>
            <tbody id="automations-table-body">
              <tr><td colspan="3" class="empty-state">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ── State ──────────────────────────────────────────────────────── -->
    <section class="tab-panel" id="tab-state">
      <div class="section-header">
        <h1 class="panel-title">State</h1>
        <button class="btn primary" id="btn-new-state">+ New Key</button>
      </div>

      <div class="card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:40%">Key</th>
                <th>Value</th>
                <th style="width:160px">Actions</th>
              </tr>
            </thead>
            <tbody id="state-table-body">
              <tr><td colspan="3" class="empty-state">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- ── Logs ───────────────────────────────────────────────────────── -->
    <section class="tab-panel" id="tab-logs">
      <div class="section-header">
        <h1 class="panel-title">Logs</h1>
      </div>

      <div class="log-filters">
        <select id="log-filter-level" title="Minimum log level">
          <option value="0">All levels</option>
          <option value="10">TRACE+</option>
          <option value="20">DEBUG+</option>
          <option value="30">INFO+</option>
          <option value="40">WARN+</option>
          <option value="50">ERROR+</option>
        </select>
        <input
          type="search"
          id="log-filter-automation"
          placeholder="Filter by automation…"
          style="width:180px"
        />
        <input
          type="search"
          id="log-filter-text"
          placeholder="Filter by text…"
          style="width:180px"
        />
        <button class="btn" id="log-filter-clear">Clear filters</button>
      </div>

      <ul class="log-list" id="logs-list">
        <li class="empty-state">Loading…</li>
      </ul>
    </section>

  </main>
</div>

<!-- ── Trigger modal ──────────────────────────────────────────────────── -->
<dialog id="trigger-modal" aria-labelledby="trigger-modal-title">
  <div class="modal-header">
    <span id="trigger-modal-title">Trigger Automation</span>
    <button class="modal-close" data-close-modal="trigger-modal" aria-label="Close">&times;</button>
  </div>
  <form id="trigger-form">
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label" for="trigger-type">Trigger type</label>
        <select id="trigger-type" class="form-control">
          <option value="mqtt">mqtt</option>
          <option value="cron">cron</option>
          <option value="state">state</option>
          <option value="webhook">webhook</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="trigger-payload">Context payload (JSON)</label>
        <textarea id="trigger-payload" class="form-control" rows="8" spellcheck="false"></textarea>
      </div>
      <div style="color:var(--red);font-size:12px" id="trigger-error"></div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn" data-close-modal="trigger-modal">Cancel</button>
      <button type="submit" class="btn primary">Fire Trigger</button>
    </div>
  </form>
</dialog>

<!-- ── New State Key modal ────────────────────────────────────────────── -->
<dialog id="new-state-modal" aria-labelledby="new-state-modal-title">
  <div class="modal-header">
    <span id="new-state-modal-title">New State Key</span>
    <button class="modal-close" data-close-modal="new-state-modal" aria-label="Close">&times;</button>
  </div>
  <form id="new-state-form">
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label" for="new-state-key">Key</label>
        <input
          type="text"
          id="new-state-key"
          class="form-control"
          placeholder="my-automation:key_name"
          required
        />
      </div>
      <div class="form-group">
        <label class="form-label" for="new-state-value">Value (JSON or plain string)</label>
        <input
          type="text"
          id="new-state-value"
          class="form-control"
          placeholder='true, 42, "hello", {"key":"value"}'
        />
      </div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn" data-close-modal="new-state-modal">Cancel</button>
      <button type="submit" class="btn primary">Create</button>
    </div>
  </form>
</dialog>

<script>${JS}</script>
</body>
</html>`;
}

/**
 * Escape a string for safe use in an HTML attribute value.
 */
function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Returns the login page HTML.
 */
export function loginShell({ basePath, error }: { basePath: string; error?: string }): string {
  const errorHtml = error ? `<div class="login-error">${esc(error)}</div>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Home Automation — Login</title>
  <style>${CSS}</style>
</head>
<body>
<div class="login-wrap">
  <div class="login-card">
    <div class="login-title">ts-ha</div>
    <div class="login-subtitle">Home Automation Status Page</div>
    ${errorHtml}
    <form method="POST" action="${esc(basePath)}/login">
      <div class="form-group">
        <label class="form-label" for="token-input">Access Token</label>
        <input
          type="password"
          id="token-input"
          name="token"
          class="form-control"
          placeholder="Enter your access token"
          autofocus
          required
        />
      </div>
      <button type="submit" class="btn primary login-btn" style="margin-top:8px">Connect</button>
    </form>
  </div>
</div>
</body>
</html>`;
}
