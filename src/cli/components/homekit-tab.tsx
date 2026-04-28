import { COLORS } from "./theme.js";
import type { HomekitStatus } from "./types.js";

// ---------------------------------------------------------------------------
// HomekitTab — terminal UI
// ---------------------------------------------------------------------------

export function HomekitTab({ data }: { data: HomekitStatus | null }) {
  if (!data) {
    return (
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
        <text fg={COLORS.comment}>
          HomeKit bridge not configured — register a <span fg={COLORS.yellow}>HomekitService</span>{" "}
          in your engine's services map.
        </text>
      </box>
    );
  }

  const statusColor = data.running ? COLORS.green : COLORS.red;
  const statusLabel = data.running ? "running" : "stopped";

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
      {/* Status row */}
      <box flexDirection="row" gap={4} marginBottom={1}>
        <text>
          Bridge: <span fg={statusColor}>{statusLabel}</span>
        </text>
        <text>
          Accessories: <span fg={COLORS.cyan}>{data.accessoryCount}</span>
        </text>
      </box>

      {/* Configuration details */}
      <box flexDirection="column" marginBottom={1}>
        <text fg={COLORS.comment}>── Configuration</text>

        <box flexDirection="row" paddingLeft={2}>
          <text fg={COLORS.comment} width={18}>
            Bridge name:
          </text>
          <text fg={COLORS.fg}>{data.bridgeName}</text>
        </box>

        <box flexDirection="row" paddingLeft={2}>
          <text fg={COLORS.comment} width={18}>
            HAP port:
          </text>
          <text fg={COLORS.cyan}>{data.port}</text>
        </box>

        <box flexDirection="row" paddingLeft={2}>
          <text fg={COLORS.comment} width={18}>
            MAC (username):
          </text>
          <text fg={COLORS.fg}>{data.username}</text>
        </box>

        <box flexDirection="row" paddingLeft={2}>
          <text fg={COLORS.comment} width={18}>
            Pairing PIN:
          </text>
          <text fg={COLORS.yellow}>{data.pinCode}</text>
        </box>

        <box flexDirection="row" paddingLeft={2}>
          <text fg={COLORS.comment} width={18}>
            Persist path:
          </text>
          <text fg={COLORS.fg}>{data.persistPath}</text>
        </box>
      </box>

      {/* Warning when bridge is stopped */}
      {!data.running && (
        <box marginTop={1} paddingLeft={1}>
          <text fg={COLORS.orange}>⚠ Bridge is not running. Check logs for startup errors.</text>
        </box>
      )}
    </box>
  );
}
