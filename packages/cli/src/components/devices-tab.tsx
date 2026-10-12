import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useState } from "react";
import type { DebugClient } from "../client.js";
import {
  adjustNumeric,
  composeBooleanCommand,
  composePropertyCommand,
  cycleEnum,
  type DeviceControl,
  formatControlValue,
  projectDeviceControls,
  readControlBoolean,
} from "../device-controls.js";
import { projectDeviceRows } from "../device-rows.js";
import { COLORS, formatValue, valueColor } from "./theme.js";
import type { DevicesData } from "./types.js";

type EditMode = { type: "none" } | { type: "text"; controlIdx: number; value: string };

// ---------------------------------------------------------------------------
// DevicesTab
// ---------------------------------------------------------------------------

export function DevicesTab({
  data,
  client,
  onRefresh,
  onInputActiveChange,
}: {
  data: DevicesData;
  client: DebugClient;
  onRefresh: () => void;
  /** Notifies the dashboard that a free-text input is capturing keystrokes. */
  onInputActiveChange: (active: boolean) => void;
}) {
  const { width } = useTerminalDimensions();
  const nameWidth = Math.max(20, Math.floor(width * 0.35));

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [controlIdx, setControlIdx] = useState(0);
  const [editMode, setEditMode] = useState<EditMode>({ type: "none" });
  const [message, setMessage] = useState<string | null>(null);

  // The inline text editor captures raw keystrokes; tell the dashboard so its
  // global shortcuts stand down while it is open.
  useEffect(() => {
    onInputActiveChange(editMode.type === "text");
  }, [editMode.type, onInputActiveChange]);

  useEffect(() => () => onInputActiveChange(false), [onInputActiveChange]);

  const rows = projectDeviceRows(data.devices);
  const selected = data.devices[selectedIdx] ?? null;
  const controls = selected ? projectDeviceControls(selected) : [];
  const selectedControl = controls[controlIdx] ?? null;

  const sendCommand = useCallback(
    async (control: DeviceControl, command: Record<string, unknown>) => {
      if (!selected) return;
      try {
        await client.sendDeviceCommand(selected.qualifiedId, command);
        setMessage(`Sent ${control.property}`);
        onRefresh();
      } catch (err) {
        setMessage(`Error: ${(err as Error).message}`);
      }
    },
    [client, selected, onRefresh],
  );

  const activate = useCallback(
    (control: DeviceControl, action: "toggle" | "up" | "down") => {
      if (!control.writable) {
        setMessage(`${control.property} is read-only`);
        return;
      }
      if (!control.enabled) {
        setMessage(`${control.property} is unavailable (device unreachable)`);
        return;
      }

      if (control.control === "toggle") {
        const desired = action === "toggle" ? !readControlBoolean(control) : action === "up";
        void sendCommand(control, composeBooleanCommand(control, desired));
      } else if (control.control === "adjuster") {
        void sendCommand(
          control,
          composePropertyCommand(control, adjustNumeric(control, action === "down" ? -1 : 1)),
        );
      } else if (control.control === "cycler") {
        void sendCommand(control, composePropertyCommand(control, cycleEnum(control)));
      } else if (control.control === "editor") {
        setMessage(`${control.property}: press e to edit`);
      } else {
        setMessage(`${control.property} has no inline control`);
      }
    },
    [sendCommand],
  );

  const submitText = useCallback(
    (control: DeviceControl, value: string) => {
      void sendCommand(control, composePropertyCommand(control, value));
      setEditMode({ type: "none" });
    },
    [sendCommand],
  );

  useKeyboard((key) => {
    if (message) setMessage(null);

    // ── Text editing ───────────────────────────────────────────────────────
    if (editMode.type === "text") {
      const control = controls[editMode.controlIdx];
      if (key.name === "escape") {
        setEditMode({ type: "none" });
      } else if (key.name === "enter" || key.name === "return") {
        if (control) submitText(control, editMode.value);
      } else if (key.name === "backspace") {
        setEditMode((m) => (m.type === "text" ? { ...m, value: m.value.slice(0, -1) } : m));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setEditMode((m) => (m.type === "text" ? { ...m, value: m.value + key.sequence } : m));
      }
      return;
    }

    if (data.devices.length === 0) return;

    // ── Device navigation ──────────────────────────────────────────────────
    if (key.name === "up" || key.name === "k") {
      setSelectedIdx((i) => Math.max(0, i - 1));
      setControlIdx(0);
      return;
    }
    if (key.name === "down" || key.name === "j") {
      setSelectedIdx((i) => Math.min(data.devices.length - 1, i + 1));
      setControlIdx(0);
      return;
    }

    const isExpanded = selected !== null && selected.qualifiedId === expandedId;

    if (key.name === "escape") {
      setExpandedId(null);
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      if (!isExpanded) {
        if (selected) {
          setExpandedId(selected.qualifiedId);
          setControlIdx(0);
        }
      } else if (selectedControl) {
        activate(selectedControl, "toggle");
      }
      return;
    }

    if (!isExpanded) return;

    // ── Control selection and actuation ────────────────────────────────────
    if (key.name === "left" || key.name === "h") {
      setControlIdx((i) => Math.max(0, i - 1));
    } else if (key.name === "right" || key.name === "l") {
      setControlIdx((i) => Math.min(controls.length - 1, i + 1));
    } else if (key.name === "space" && selectedControl) {
      activate(selectedControl, "toggle");
    } else if ((key.name === "+" || key.name === "=" || key.sequence === "+") && selectedControl) {
      activate(selectedControl, "up");
    } else if ((key.name === "-" || key.name === "_" || key.sequence === "-") && selectedControl) {
      activate(selectedControl, "down");
    } else if (key.name === "e" && selectedControl) {
      if (selectedControl.control !== "editor") {
        setMessage(`${selectedControl.property} is not editable`);
      } else if (!selectedControl.enabled) {
        setMessage(`${selectedControl.property} is unavailable`);
      } else {
        setEditMode({
          type: "text",
          controlIdx,
          value: typeof selectedControl.value === "string" ? selectedControl.value : "",
        });
      }
    }
  });

  if (data.devices.length === 0) {
    return (
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
        <text fg={COLORS.comment}>No devices tracked yet.</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1}>
      {/* Sources header */}
      <box flexDirection="row" paddingX={1} marginBottom={1}>
        <text fg={COLORS.comment}>
          Sources: <span fg={COLORS.cyan}>{data.sources.join(", ") || "—"}</span>
        </text>
      </box>

      <scrollbox
        height={data.devices.length + (expandedId ? 14 : 0) + 2}
        focused={editMode.type === "none"}
      >
        {data.devices.map((device, i) => {
          const row = rows[i];
          const isSelected = i === selectedIdx;
          const isExpanded = device.qualifiedId === expandedId;
          const stateEntries = Object.entries(device.state);
          const deviceControls = projectDeviceControls(device);

          return (
            <box key={device.qualifiedId} flexDirection="column">
              {/* Collapsed row */}
              <box flexDirection="row" backgroundColor={isSelected ? COLORS.bgLight : undefined}>
                <text fg={COLORS.purple} width={2}>
                  {isSelected ? ">" : " "}
                </text>
                <text fg={COLORS.cyan} width={nameWidth}>
                  {row.displayName}
                </text>
                <text fg={COLORS.comment} width={10}>
                  {row.source}
                </text>
                <text fg={row.reachable ? COLORS.green : COLORS.red} width={10}>
                  {row.reachable ? "reachable" : "offline"}
                </text>
                <text fg={COLORS.comment} width={12}>
                  {row.stateKeyCount} keys
                </text>
                <text fg={COLORS.comment}>{row.capabilityCount} caps</text>
              </box>

              {/* Expanded detail block */}
              {isExpanded && (
                <box flexDirection="column" paddingLeft={4} marginBottom={1}>
                  <box flexDirection="row">
                    <text fg={COLORS.comment} width={18}>
                      Qualified ID:
                    </text>
                    <text fg={COLORS.fg}>{device.qualifiedId}</text>
                  </box>
                  <box flexDirection="row">
                    <text fg={COLORS.comment} width={18}>
                      Hidden:
                    </text>
                    <text fg={device.hidden ? COLORS.yellow : COLORS.fg}>
                      {String(device.hidden)}
                    </text>
                  </box>
                  <box flexDirection="row">
                    <text fg={COLORS.comment} width={18}>
                      Observed:
                    </text>
                    <text fg={COLORS.fg}>
                      {device.observation.mode} @{" "}
                      {new Date(device.observation.observedAt).toISOString().slice(11, 19)}
                    </text>
                  </box>

                  {/* Controls */}
                  <box flexDirection="column" marginTop={1}>
                    <text fg={COLORS.comment}>
                      <em>Controls:</em>
                    </text>
                    {deviceControls.length === 0 ? (
                      <text fg={COLORS.comment} paddingLeft={2}>
                        (no capabilities)
                      </text>
                    ) : (
                      deviceControls.map((control, ci) => {
                        const isControlSelected = isSelected && ci === controlIdx;
                        const unavailable = control.writable && !control.enabled;
                        return (
                          <box
                            key={control.property}
                            flexDirection="row"
                            paddingLeft={2}
                            backgroundColor={isControlSelected ? COLORS.bgLight : undefined}
                          >
                            <text fg={COLORS.purple} width={2}>
                              {isControlSelected ? ">" : " "}
                            </text>
                            <text fg={COLORS.fg} width={22}>
                              {control.property}
                            </text>
                            <text fg={COLORS.comment} width={10}>
                              {control.control}
                            </text>
                            <text
                              fg={
                                unavailable
                                  ? COLORS.red
                                  : control.control === "readout"
                                    ? COLORS.comment
                                    : COLORS.cyan
                              }
                            >
                              {formatControlValue(control)}
                            </text>
                            {unavailable && <text fg={COLORS.red}> (unavailable)</text>}
                          </box>
                        );
                      })
                    )}
                  </box>

                  {/* State */}
                  {stateEntries.length > 0 ? (
                    <box flexDirection="column" marginTop={1}>
                      <text fg={COLORS.comment}>
                        <em>State:</em>
                      </text>
                      {stateEntries.map(([key, value]) => (
                        <box key={key} flexDirection="row" paddingLeft={2}>
                          <text fg={COLORS.yellow} width={22}>
                            {key}
                          </text>
                          <text fg={valueColor(value)}>{formatValue(value)}</text>
                        </box>
                      ))}
                    </box>
                  ) : (
                    <text fg={COLORS.comment} marginTop={1}>
                      No state received yet
                    </text>
                  )}
                </box>
              )}
            </box>
          );
        })}
      </scrollbox>

      {/* Text edit mode */}
      {editMode.type === "text" && selectedControl && (
        <box border borderColor={COLORS.purple} padding={1} marginTop={1}>
          <box flexDirection="column">
            <text>
              <strong>Edit: </strong>
              <span fg={COLORS.cyan}>{selectedControl.property}</span>
            </text>
            <box flexDirection="row" marginTop={1}>
              <text fg={COLORS.yellow}>
                {editMode.value}
                <span fg={COLORS.green}>▌</span>
              </text>
            </box>
            <text fg={COLORS.comment} marginTop={1}>
              Enter submit · Esc cancel
            </text>
          </box>
        </box>
      )}

      {/* Feedback */}
      {message && (
        <box marginTop={1} paddingLeft={1}>
          <text fg={message.startsWith("Error") ? COLORS.red : COLORS.green}>{message}</text>
        </box>
      )}

      {/* Hints */}
      <box marginTop={1} paddingLeft={1}>
        <text fg={COLORS.comment}>
          {expandedId
            ? "↑↓ device · h/l control · space toggle/cycle · +/- adjust · e edit · Esc collapse"
            : "↑↓ navigate · Enter expand"}
        </text>
      </box>
    </box>
  );
}
