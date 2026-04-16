import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useState } from "react";
import { COLORS, formatValue, valueColor } from "./theme.js";
import type { DeviceInfo, DevicesData } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function interviewColor(state: string): string {
  if (state === "SUCCESSFUL") return COLORS.green;
  if (state === "FAILED") return COLORS.red;
  if (state === "IN_PROGRESS") return COLORS.orange;
  return COLORS.comment;
}

function stateKeyCount(device: DeviceInfo): string {
  if (!device.state) return "—";
  const n = Object.keys(device.state).length;
  return String(n);
}

// ---------------------------------------------------------------------------
// DevicesTab
// ---------------------------------------------------------------------------

export function DevicesTab({ data }: { data: DevicesData }) {
  const { width } = useTerminalDimensions();
  const nameWidth = Math.max(20, Math.floor(width * 0.35));

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const selected = data.devices[selectedIdx] ?? null;

  useKeyboard((key) => {
    if (!data.available || data.devices.length === 0) return;

    if (key.name === "up" || key.name === "k") {
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIdx((i) => Math.min(data.devices.length - 1, i + 1));
    } else if ((key.name === "enter" || key.name === "return") && selected) {
      setExpandedName((n) => (n === selected.friendly_name ? null : selected.friendly_name));
    }
  });

  // Registry disabled
  if (!data.available) {
    return (
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
        <text fg={COLORS.comment}>
          Device registry is disabled — set{" "}
          <span fg={COLORS.yellow}>DEVICE_REGISTRY_ENABLED=true</span> to enable
        </text>
      </box>
    );
  }

  // No devices yet
  if (data.devices.length === 0) {
    return (
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
        <text fg={COLORS.comment}>No devices tracked yet.</text>
      </box>
    );
  }

  const expandedCount = expandedName
    ? (() => {
        const dev = data.devices.find((d) => d.friendly_name === expandedName);
        if (!dev) return 0;
        const stateKeys = dev.state ? Object.keys(dev.state).length : 0;
        // rows: name diff + ieee + type + supported + interview + power + model + state header + state keys + gap
        return (
          7 +
          (dev.nice_name !== dev.friendly_name ? 1 : 0) +
          (dev.power_source ? 1 : 0) +
          (dev.definition ? 1 : 0) +
          (stateKeys > 0 ? stateKeys + 1 : 1) +
          1
        );
      })()
    : 0;

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <scrollbox height={data.devices.length + expandedCount + 2}>
        {data.devices.map((device, i) => {
          const isSelected = i === selectedIdx;
          const isExpanded = device.friendly_name === expandedName;
          const stateEntries = device.state ? Object.entries(device.state) : [];

          return (
            <box key={device.friendly_name} flexDirection="column">
              {/* Collapsed row */}
              <box flexDirection="row" backgroundColor={isSelected ? COLORS.bgLight : undefined}>
                <text fg={COLORS.purple} width={2}>
                  {isSelected ? ">" : " "}
                </text>
                <text fg={COLORS.cyan} width={nameWidth}>
                  {device.nice_name}
                </text>
                <text fg={COLORS.comment} width={12}>
                  {device.type}
                </text>
                <text fg={interviewColor(device.interview_state)} width={14}>
                  {device.interview_state}
                </text>
                <text fg={COLORS.comment}>{stateKeyCount(device)} keys</text>
              </box>

              {/* Expanded detail block */}
              {isExpanded && (
                <box flexDirection="column" paddingLeft={4} marginBottom={1}>
                  {device.nice_name !== device.friendly_name && (
                    <box flexDirection="row">
                      <text fg={COLORS.comment} width={18}>
                        Friendly:
                      </text>
                      <text fg={COLORS.fg}>{device.friendly_name}</text>
                    </box>
                  )}
                  <box flexDirection="row">
                    <text fg={COLORS.comment} width={18}>
                      IEEE:
                    </text>
                    <text fg={COLORS.fg}>{device.ieee_address}</text>
                  </box>
                  <box flexDirection="row">
                    <text fg={COLORS.comment} width={18}>
                      Supported:
                    </text>
                    <text fg={device.supported ? COLORS.green : COLORS.red}>
                      {String(device.supported)}
                    </text>
                  </box>
                  {device.power_source && (
                    <box flexDirection="row">
                      <text fg={COLORS.comment} width={18}>
                        Power:
                      </text>
                      <text fg={COLORS.fg}>{device.power_source}</text>
                    </box>
                  )}
                  {device.definition && (
                    <box flexDirection="row">
                      <text fg={COLORS.comment} width={18}>
                        Model:
                      </text>
                      <text fg={COLORS.fg}>
                        {device.definition.model}{" "}
                        <span fg={COLORS.comment}>({device.definition.vendor})</span>
                      </text>
                    </box>
                  )}

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

      {/* Hints */}
      <box marginTop={1} paddingLeft={1}>
        <text fg={COLORS.comment}>↑↓ navigate · Enter expand/collapse</text>
      </box>
    </box>
  );
}
